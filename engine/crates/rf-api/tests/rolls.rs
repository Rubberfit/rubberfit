//! End-to-end tests for `/api/v2/inventory/rolls`.
//!
//! Rolls are the first aggregate where a handler crosses ports —
//! create/update hydrate the denormalized `material_type` name by
//! looking it up via the material-types port — so the fake
//! inventory factory backs both.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use http_body_util::BodyExt;
use jsonwebtoken::jwk::{
    AlgorithmParameters, CommonParameters, Jwk, JwkSet, KeyAlgorithm, PublicKeyUse,
    RSAKeyParameters, RSAKeyType,
};
use jsonwebtoken::{encode, EncodingKey, Header};
use rf_api::{
    build_router_with_state,
    config::{CorsMode, ServerConfig},
    jwks::JwksFetcher,
    AppState, AuthContext, CutHistoryPortFactory, InventoryPortFactory, JwksCache, JwksError,
    ProcurementPortFactory, SupabaseCutHistoryFactory, SupabaseProcurementFactory,
};
use rf_application::error::AppError;
use rf_application::inventory::{
    MaterialSupplierPort, MaterialTypePort, MaterialTypeUpdate, NewMaterialType,
    NewRoll, RollPort, RollUpdate, SupplierPort,
};
use rf_domain::{
    MaterialType, MaterialTypeId, Roll, RollFilters, RollId, RollStatus,
};
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::pkcs8::LineEnding;
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::Serialize;
use serde_json::Value;
use tower::ServiceExt;

const TEST_KID: &str = "test-kid";
const TEST_ISSUER: &str = "https://example.supabase.co/auth/v1";
const SUPABASE_URL: &str = "https://example.supabase.co";
const TEST_USER: &str = "user-abc";

#[derive(Default)]
struct FakeRollPort {
    rows: Mutex<Vec<Roll>>,
    next: Mutex<u32>,
    observed_filters: Mutex<Option<RollFilters>>,
}

#[async_trait]
impl RollPort for FakeRollPort {
    async fn list(&self, filters: &RollFilters) -> Result<Vec<Roll>, AppError> {
        *self.observed_filters.lock().unwrap() = Some(filters.clone());
        Ok(self.rows.lock().unwrap().clone())
    }
    async fn get(&self, id: &RollId) -> Result<Option<Roll>, AppError> {
        Ok(self
            .rows
            .lock()
            .unwrap()
            .iter()
            .find(|r| r.id == *id)
            .cloned())
    }
    async fn create(&self, new: &NewRoll) -> Result<Roll, AppError> {
        let mut n = self.next.lock().unwrap();
        *n += 1;
        let r = Roll {
            id: RollId(format!("roll-{}", *n)),
            material_type_id: new
                .material_type_id
                .clone()
                .map(MaterialTypeId),
            material_type: new.material_type.clone(),
            width: new.width,
            length: new.length,
            thickness: new.thickness,
            color: new.color.clone(),
            location: new.location.clone(),
            date_received: new.date_received.clone(),
            supplier: new.supplier.clone(),
            cost_per_sqft: new.cost_per_sqft,
            remaining_length: new.remaining_length,
            status: new.status.unwrap_or(RollStatus::Active),
            notes: new.notes.clone(),
            created_at: Some("2026-04-19T00:00:00Z".into()),
            updated_at: Some("2026-04-19T00:00:00Z".into()),
        };
        self.rows.lock().unwrap().push(r.clone());
        Ok(r)
    }
    async fn update(
        &self,
        id: &RollId,
        patch: &RollUpdate,
    ) -> Result<Option<Roll>, AppError> {
        let mut g = self.rows.lock().unwrap();
        for row in g.iter_mut() {
            if row.id == *id {
                if let Some(s) = patch.status {
                    row.status = s;
                }
                if let Some(rl) = patch.remaining_length {
                    row.remaining_length = rl;
                }
                if let Some(ref mt_name) = patch.material_type {
                    row.material_type = mt_name.clone();
                }
                return Ok(Some(row.clone()));
            }
        }
        Ok(None)
    }
    async fn delete(&self, id: &RollId) -> Result<bool, AppError> {
        let mut g = self.rows.lock().unwrap();
        let len = g.len();
        g.retain(|r| r.id != *id);
        Ok(g.len() != len)
    }
}

/// Fake material-types port — just enough to satisfy the roll
/// handler's name hydration step. Tests seed a lookup table with
/// known (id → name) pairs; any other id returns None, which the
/// handler maps to 400 InvalidInput (unknown material_type_id).
#[derive(Default)]
struct FakeMaterialTypePort {
    lookup: Mutex<Vec<(String, String)>>,
}

impl FakeMaterialTypePort {
    fn with_pair(id: &str, name: &str) -> Self {
        Self {
            lookup: Mutex::new(vec![(id.into(), name.into())]),
        }
    }
}

#[async_trait]
impl MaterialTypePort for FakeMaterialTypePort {
    async fn list(&self) -> Result<Vec<MaterialType>, AppError> {
        Ok(vec![])
    }
    async fn get(
        &self,
        id: &MaterialTypeId,
    ) -> Result<Option<MaterialType>, AppError> {
        Ok(self
            .lookup
            .lock()
            .unwrap()
            .iter()
            .find(|(i, _)| i == &id.0)
            .map(|(i, n)| MaterialType {
                id: MaterialTypeId(i.clone()),
                name: n.clone(),
                description: None,
                default_cost: None,
                min_stock_alert: None,
                created_at: None,
                updated_at: None,
            }))
    }
    async fn create(
        &self,
        _new: &NewMaterialType,
    ) -> Result<MaterialType, AppError> {
        Err(AppError::infrastructure("create not used in roll tests"))
    }
    async fn update(
        &self,
        _id: &MaterialTypeId,
        _patch: &MaterialTypeUpdate,
    ) -> Result<Option<MaterialType>, AppError> {
        Err(AppError::infrastructure("update not used in roll tests"))
    }
    async fn delete(&self, _id: &MaterialTypeId) -> Result<bool, AppError> {
        Err(AppError::infrastructure("delete not used in roll tests"))
    }
}

struct FakeInventoryFactory {
    rolls: Arc<FakeRollPort>,
    material_types: Arc<FakeMaterialTypePort>,
}

impl InventoryPortFactory for FakeInventoryFactory {
    fn material_types(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialTypePort>, AppError> {
        Ok(self.material_types.clone())
    }
    fn suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn SupplierPort>, AppError> {
        Err(AppError::infrastructure("suppliers not used in roll tests"))
    }
    fn material_suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialSupplierPort>, AppError> {
        Err(AppError::infrastructure("material_suppliers not used in roll tests"))
    }
    fn rolls(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn RollPort>, AppError> {
        Ok(self.rolls.clone())
    }
}

fn dummy_cut_history_factory() -> Arc<dyn CutHistoryPortFactory> {
    Arc::new(SupabaseCutHistoryFactory {
        supabase_url: Arc::from(SUPABASE_URL.to_string()),
        publishable_key: Arc::from("test-key".to_string()),
    })
}

fn dummy_procurement_factory() -> Arc<dyn ProcurementPortFactory> {
    // Roll tests never hit procurement routes — this factory is only
    // required to satisfy the AppState constructor. A production
    // factory pointed at the test URL is fine because nothing
    // downstream invokes it.
    Arc::new(SupabaseProcurementFactory {
        supabase_url: Arc::from(SUPABASE_URL.to_string()),
        publishable_key: Arc::from("test-key".to_string()),
        tax_proxy_base: None,
    })
}

struct TestKeys {
    encoding: EncodingKey,
    jwk: Jwk,
}

fn generate_test_keys() -> TestKeys {
    let mut rng = rand::thread_rng();
    let private = RsaPrivateKey::new(&mut rng, 2048).expect("generate RSA key");
    let public = RsaPublicKey::from(&private);
    let private_pem = private
        .to_pkcs1_pem(LineEnding::LF)
        .expect("encode private PEM");
    let encoding =
        EncodingKey::from_rsa_pem(private_pem.as_bytes()).expect("load encoding key");
    let n_b64 = b64url(public.n().to_bytes_be());
    let e_b64 = b64url(public.e().to_bytes_be());
    let jwk = Jwk {
        common: CommonParameters {
            public_key_use: Some(PublicKeyUse::Signature),
            key_operations: None,
            key_algorithm: Some(KeyAlgorithm::RS256),
            key_id: Some(TEST_KID.to_string()),
            x509_url: None,
            x509_chain: None,
            x509_sha1_fingerprint: None,
            x509_sha256_fingerprint: None,
        },
        algorithm: AlgorithmParameters::RSA(RSAKeyParameters {
            key_type: RSAKeyType::RSA,
            n: n_b64,
            e: e_b64,
        }),
    };
    TestKeys { encoding, jwk }
}

fn b64url(bytes: Vec<u8>) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Serialize)]
struct TestClaims<'a> {
    sub: &'a str,
    iss: &'a str,
    exp: i64,
    iat: i64,
    email: &'a str,
    role: &'a str,
    aud: &'a str,
}

fn sign_token(keys: &TestKeys, sub: &str) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let claims = TestClaims {
        sub,
        iss: TEST_ISSUER,
        exp: now + 600,
        iat: now,
        email: "user@example.com",
        role: "authenticated",
        aud: "authenticated",
    };
    let mut header = Header::new(jsonwebtoken::Algorithm::RS256);
    header.kid = Some(TEST_KID.to_string());
    encode(&header, &claims, &keys.encoding).expect("sign test jwt")
}

struct StaticFetcher {
    set: JwkSet,
}

#[async_trait]
impl JwksFetcher for StaticFetcher {
    async fn fetch(&self) -> Result<JwkSet, JwksError> {
        Ok(self.set.clone())
    }
}

fn jwks_cache(keys: &TestKeys) -> JwksCache {
    let set = JwkSet {
        keys: vec![keys.jwk.clone()],
    };
    let fetcher: Arc<dyn JwksFetcher> = Arc::new(StaticFetcher { set });
    JwksCache::with_ttl(fetcher, Duration::from_secs(60))
}

fn test_cfg() -> ServerConfig {
    ServerConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        request_timeout: Duration::from_secs(5),
        cors_mode: CorsMode::Off,
    }
}

fn state(
    keys: &TestKeys,
    rolls: Arc<FakeRollPort>,
    material_types: Arc<FakeMaterialTypePort>,
) -> Arc<AppState> {
    let inv_factory: Arc<dyn InventoryPortFactory> =
        Arc::new(FakeInventoryFactory { rolls, material_types });
    Arc::new(AppState::with_factories(
        jwks_cache(keys),
        SUPABASE_URL,
        "test-publishable-key",
        dummy_cut_history_factory(),
        inv_factory,
        dummy_procurement_factory(),
    ))
}

async fn send(
    router: axum::Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Option<&str>,
) -> axum::http::Response<Body> {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(tok) = token {
        req = req.header("authorization", format!("Bearer {tok}"));
    }
    if body.is_some() {
        req = req.header("content-type", "application/json");
    }
    let body = body
        .map(|s| Body::from(s.to_string()))
        .unwrap_or_else(Body::empty);
    router.oneshot(req.body(body).unwrap()).await.unwrap()
}

fn sample_create_body() -> &'static str {
    r#"{
      "material_type_id": "mt-1",
      "width": 48.0,
      "length": 600.0,
      "thickness": 0.25,
      "remaining_length": 600.0
    }"#
}

#[tokio::test]
async fn list_requires_auth() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let resp = send(router, Method::GET, "/api/v2/inventory/rolls", None, None).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn list_parses_status_and_forwards_filters() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls.clone(), mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/rolls?status=active&material_type_id=mt-1&q=black&limit=50",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let f = rolls.observed_filters.lock().unwrap().clone().unwrap();
    assert_eq!(f.status, Some(RollStatus::Active));
    assert_eq!(
        f.material_type_id.as_ref().map(|m| m.0.as_str()),
        Some("mt-1")
    );
    assert_eq!(f.search.as_deref(), Some("black"));
    assert_eq!(f.limit, Some(50));
}

#[tokio::test]
async fn list_rejects_unknown_status() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/rolls?status=archived",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_hydrates_material_type_name_from_id() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::with_pair("mt-1", "Neoprene"));
    let st = state(&keys, rolls.clone(), mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/rolls",
        Some(&token),
        Some(sample_create_body()),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    // Server-side name stamp trumped whatever would-be drift.
    assert_eq!(
        json.get("material_type").and_then(Value::as_str),
        Some("Neoprene")
    );
    assert_eq!(rolls.rows.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn create_rejects_unknown_material_type_id_with_400() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/rolls",
        Some(&token),
        Some(sample_create_body()),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_rejects_nonpositive_width() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::with_pair("mt-1", "Neoprene"));
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/rolls",
        Some(&token),
        Some(
            r#"{
              "material_type_id": "mt-1",
              "width": 0,
              "length": 10,
              "thickness": 0.25,
              "remaining_length": 10
            }"#,
        ),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_rejects_depleted_with_nonzero_length() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::with_pair("mt-1", "Neoprene"));
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/rolls",
        Some(&token),
        Some(
            r#"{
              "material_type_id": "mt-1",
              "width": 48, "length": 600, "thickness": 0.25,
              "remaining_length": 600,
              "status": "depleted"
            }"#,
        ),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let body_str = std::str::from_utf8(&body).unwrap();
    assert!(body_str.contains("INVALID_DEPLETION_STATE"));
}

#[tokio::test]
async fn update_depletion_with_zero_length_succeeds() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    rolls.rows.lock().unwrap().push(Roll {
        id: RollId("roll-1".into()),
        material_type_id: Some(MaterialTypeId("mt-1".into())),
        material_type: "Neoprene".into(),
        width: 48.0,
        length: 600.0,
        thickness: 0.25,
        color: None,
        location: None,
        date_received: None,
        supplier: None,
        cost_per_sqft: None,
        remaining_length: 50.0,
        status: RollStatus::Active,
        notes: None,
        created_at: None,
        updated_at: None,
    });
    let mts = Arc::new(FakeMaterialTypePort::with_pair("mt-1", "Neoprene"));
    let st = state(&keys, rolls.clone(), mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::PUT,
        "/api/v2/inventory/rolls/roll-1",
        Some(&token),
        Some(r#"{"status":"depleted","remaining_length":0}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let snap = &rolls.rows.lock().unwrap()[0];
    assert_eq!(snap.status, RollStatus::Depleted);
    assert_eq!(snap.remaining_length, 0.0);
}

#[tokio::test]
async fn get_returns_entity() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    rolls.rows.lock().unwrap().push(Roll {
        id: RollId("roll-9".into()),
        material_type_id: Some(MaterialTypeId("mt-1".into())),
        material_type: "Neoprene".into(),
        width: 48.0,
        length: 600.0,
        thickness: 0.25,
        color: None,
        location: None,
        date_received: None,
        supplier: None,
        cost_per_sqft: None,
        remaining_length: 500.0,
        status: RollStatus::Active,
        notes: None,
        created_at: None,
        updated_at: None,
    });
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/rolls/roll-9",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("status").and_then(Value::as_str), Some("active"));
}

#[tokio::test]
async fn get_missing_returns_404() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls, mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/rolls/nope",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn delete_204_on_success() {
    let keys = generate_test_keys();
    let rolls = Arc::new(FakeRollPort::default());
    rolls.rows.lock().unwrap().push(Roll {
        id: RollId("roll-x".into()),
        material_type_id: None,
        material_type: "Neoprene".into(),
        width: 1.0,
        length: 1.0,
        thickness: 0.1,
        color: None,
        location: None,
        date_received: None,
        supplier: None,
        cost_per_sqft: None,
        remaining_length: 1.0,
        status: RollStatus::Active,
        notes: None,
        created_at: None,
        updated_at: None,
    });
    let mts = Arc::new(FakeMaterialTypePort::default());
    let st = state(&keys, rolls.clone(), mts);
    let router = build_router_with_state(&test_cfg(), st);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::DELETE,
        "/api/v2/inventory/rolls/roll-x",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert_eq!(rolls.rows.lock().unwrap().len(), 0);
}
