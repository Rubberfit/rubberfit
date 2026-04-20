//! End-to-end tests for `/api/v2/inventory/material-suppliers`.

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
    MaterialSupplierFilters, MaterialSupplierPort, MaterialSupplierUpdate,
    MaterialTypePort, NewMaterialSupplier, RollPort, SupplierPort,
};
use rf_domain::{
    MaterialSupplier, MaterialSupplierId, MaterialType, MaterialTypeId, Supplier, SupplierId,
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
struct FakeMaterialSupplierPort {
    rows: Mutex<Vec<MaterialSupplier>>,
    duplicate: Mutex<bool>,
    observed_filters: Mutex<Option<MaterialSupplierFilters>>,
}

#[async_trait]
impl MaterialSupplierPort for FakeMaterialSupplierPort {
    async fn list(
        &self,
        filters: &MaterialSupplierFilters,
    ) -> Result<Vec<MaterialSupplier>, AppError> {
        *self.observed_filters.lock().unwrap() = Some(filters.clone());
        Ok(self.rows.lock().unwrap().clone())
    }
    async fn get(
        &self,
        id: &MaterialSupplierId,
    ) -> Result<Option<MaterialSupplier>, AppError> {
        Ok(self
            .rows
            .lock()
            .unwrap()
            .iter()
            .find(|r| r.id == *id)
            .cloned())
    }
    async fn create(
        &self,
        new: &NewMaterialSupplier,
    ) -> Result<MaterialSupplier, AppError> {
        if *self.duplicate.lock().unwrap() {
            return Err(AppError::conflict("DUPLICATE_PAIR"));
        }
        let ms = MaterialSupplier {
            id: MaterialSupplierId("ms-1".into()),
            material_type_id: new.material_type_id.clone(),
            supplier_id: new.supplier_id.clone(),
            supplier_material_code: new.supplier_material_code.clone(),
            cost_per_sqft: new.cost_per_sqft,
            minimum_order_sqft: new.minimum_order_sqft,
            lead_time_days: new.lead_time_days,
            preferred_supplier: new.preferred_supplier.unwrap_or(false),
            active: new.active.unwrap_or(true),
            notes: new.notes.clone(),
            effective_date: new.effective_date.clone(),
            expiration_date: new.expiration_date.clone(),
            created_at: Some("2026-04-19T00:00:00Z".into()),
            updated_at: Some("2026-04-19T00:00:00Z".into()),
            material_type: None,
            supplier: None,
        };
        self.rows.lock().unwrap().push(ms.clone());
        Ok(ms)
    }
    async fn update(
        &self,
        id: &MaterialSupplierId,
        patch: &MaterialSupplierUpdate,
    ) -> Result<Option<MaterialSupplier>, AppError> {
        let mut g = self.rows.lock().unwrap();
        for row in g.iter_mut() {
            if row.id == *id {
                if let Some(c) = patch.cost_per_sqft {
                    row.cost_per_sqft = c;
                }
                if let Some(b) = patch.preferred_supplier {
                    row.preferred_supplier = b;
                }
                if let Some(b) = patch.active {
                    row.active = b;
                }
                return Ok(Some(row.clone()));
            }
        }
        Ok(None)
    }
    async fn delete(&self, id: &MaterialSupplierId) -> Result<bool, AppError> {
        let mut g = self.rows.lock().unwrap();
        let len = g.len();
        g.retain(|r| r.id != *id);
        Ok(g.len() != len)
    }
}

struct FakeInventoryFactory {
    ms_port: Arc<FakeMaterialSupplierPort>,
}

impl InventoryPortFactory for FakeInventoryFactory {
    fn material_types(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialTypePort>, AppError> {
        Err(AppError::infrastructure(
            "material_types not used in ms tests",
        ))
    }
    fn suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn SupplierPort>, AppError> {
        Err(AppError::infrastructure("suppliers not used in ms tests"))
    }
    fn material_suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialSupplierPort>, AppError> {
        Ok(self.ms_port.clone())
    }
    fn rolls(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn RollPort>, AppError> {
        Err(AppError::infrastructure("rolls not used in ms tests"))
    }
}

fn dummy_cut_history_factory() -> Arc<dyn CutHistoryPortFactory> {
    Arc::new(SupabaseCutHistoryFactory {
        supabase_url: Arc::from(SUPABASE_URL.to_string()),
        publishable_key: Arc::from("test-key".to_string()),
    })
}

fn dummy_procurement_factory() -> Arc<dyn ProcurementPortFactory> {
    Arc::new(SupabaseProcurementFactory {
        supabase_url: Arc::from(SUPABASE_URL.to_string()),
        publishable_key: Arc::from("test-key".to_string()),
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

fn state(keys: &TestKeys, port: Arc<FakeMaterialSupplierPort>) -> Arc<AppState> {
    let inv_factory: Arc<dyn InventoryPortFactory> =
        Arc::new(FakeInventoryFactory { ms_port: port });
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
      "supplier_id": "sup-1",
      "cost_per_sqft": 3.15,
      "minimum_order_sqft": 500,
      "lead_time_days": 14
    }"#
}

#[tokio::test]
async fn list_requires_auth() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    let state = state(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-suppliers",
        None,
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn list_forwards_filters() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    let state = state(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-suppliers?material_type_id=mt-9&supplier_id=sup-3&active=true&limit=50",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let f = port.observed_filters.lock().unwrap().clone().unwrap();
    assert_eq!(f.material_type_id.as_ref().map(|m| m.0.as_str()), Some("mt-9"));
    assert_eq!(f.supplier_id.as_ref().map(|s| s.0.as_str()), Some("sup-3"));
    assert_eq!(f.active, Some(true));
    assert_eq!(f.limit, Some(50));
}

#[tokio::test]
async fn create_rejects_zero_cost() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    let state = state(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-suppliers",
        Some(&token),
        Some(r#"{"material_type_id":"mt-1","supplier_id":"sup-1","cost_per_sqft":0}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_rejects_bad_date_range() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    let state = state(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-suppliers",
        Some(&token),
        Some(
            r#"{
              "material_type_id": "mt-1",
              "supplier_id": "sup-1",
              "cost_per_sqft": 1,
              "effective_date": "2026-06-01",
              "expiration_date": "2026-05-01"
            }"#,
        ),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_returns_201() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    let state = state(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-suppliers",
        Some(&token),
        Some(sample_create_body()),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("cost_per_sqft").and_then(Value::as_f64), Some(3.15));
    assert_eq!(port.rows.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn create_duplicate_maps_to_409() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    *port.duplicate.lock().unwrap() = true;
    let state = state(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-suppliers",
        Some(&token),
        Some(sample_create_body()),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CONFLICT);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        json.get("code").and_then(Value::as_str),
        Some("DUPLICATE_PAIR")
    );
}

#[tokio::test]
async fn get_returns_entity_with_embedded_parents() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    port.rows.lock().unwrap().push(MaterialSupplier {
        id: MaterialSupplierId("ms-1".into()),
        material_type_id: MaterialTypeId("mt-1".into()),
        supplier_id: SupplierId("sup-1".into()),
        supplier_material_code: None,
        cost_per_sqft: 3.15,
        minimum_order_sqft: None,
        lead_time_days: None,
        preferred_supplier: false,
        active: true,
        notes: None,
        effective_date: None,
        expiration_date: None,
        created_at: None,
        updated_at: None,
        material_type: Some(MaterialType {
            id: MaterialTypeId("mt-1".into()),
            name: "Neoprene".into(),
            description: None,
            default_cost: None,
            min_stock_alert: None,
            created_at: None,
            updated_at: None,
        }),
        supplier: Some(Supplier {
            id: SupplierId("sup-1".into()),
            name: "Acme".into(),
            contact_person: None,
            email: None,
            phone: None,
            address: None,
            city: None,
            state: None,
            zip_code: None,
            country: None,
            website: None,
            tax_id: None,
            payment_terms: None,
            rating: None,
            preferred: false,
            active: true,
            notes: None,
            created_at: None,
            updated_at: None,
        }),
    });
    let state = state(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-suppliers/ms-1",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        json.get("material_type")
            .and_then(|v| v.get("name"))
            .and_then(Value::as_str),
        Some("Neoprene")
    );
    assert_eq!(
        json.get("supplier")
            .and_then(|v| v.get("name"))
            .and_then(Value::as_str),
        Some("Acme")
    );
}

#[tokio::test]
async fn get_missing_404() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    let state = state(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-suppliers/nope",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn update_modifies_row() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    port.rows.lock().unwrap().push(MaterialSupplier {
        id: MaterialSupplierId("ms-1".into()),
        material_type_id: MaterialTypeId("mt-1".into()),
        supplier_id: SupplierId("sup-1".into()),
        supplier_material_code: None,
        cost_per_sqft: 3.15,
        minimum_order_sqft: None,
        lead_time_days: None,
        preferred_supplier: false,
        active: true,
        notes: None,
        effective_date: None,
        expiration_date: None,
        created_at: None,
        updated_at: None,
        material_type: None,
        supplier: None,
    });
    let state = state(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::PUT,
        "/api/v2/inventory/material-suppliers/ms-1",
        Some(&token),
        Some(r#"{"cost_per_sqft":4.0,"preferred_supplier":true}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let snap = &port.rows.lock().unwrap()[0];
    assert_eq!(snap.cost_per_sqft, 4.0);
    assert!(snap.preferred_supplier);
}

#[tokio::test]
async fn delete_204_on_success() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialSupplierPort::default());
    port.rows.lock().unwrap().push(MaterialSupplier {
        id: MaterialSupplierId("ms-1".into()),
        material_type_id: MaterialTypeId("mt-1".into()),
        supplier_id: SupplierId("sup-1".into()),
        supplier_material_code: None,
        cost_per_sqft: 1.0,
        minimum_order_sqft: None,
        lead_time_days: None,
        preferred_supplier: false,
        active: true,
        notes: None,
        effective_date: None,
        expiration_date: None,
        created_at: None,
        updated_at: None,
        material_type: None,
        supplier: None,
    });
    let state = state(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::DELETE,
        "/api/v2/inventory/material-suppliers/ms-1",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert_eq!(port.rows.lock().unwrap().len(), 0);
}
