//! End-to-end tests for `/api/v2/inventory/material-types`.
//!
//! Injects a fake `InventoryPortFactory` into `AppState` so tests
//! never hit Supabase. JWT plumbing mirrors `tests/cuts.rs`.

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
use rf_application::cuts::CutHistoryPort;
use rf_application::error::AppError;
use rf_application::inventory::{
    MaterialSupplierPort, MaterialTypePort, MaterialTypeUpdate, NewMaterialType,
    RollPort, SupplierPort,
};
use rf_domain::{MaterialType, MaterialTypeId};
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

/// Fake port shared across tests — in-memory CRUD, configurable
/// behaviors (conflict on create, FK on delete) via flags.
#[derive(Default)]
struct FakeMaterialTypePort {
    rows: Mutex<Vec<MaterialType>>,
    next_id: Mutex<u32>,
    duplicate_on_create: Mutex<bool>,
    fk_violation_on_delete: Mutex<bool>,
}

#[async_trait]
impl MaterialTypePort for FakeMaterialTypePort {
    async fn list(&self) -> Result<Vec<MaterialType>, AppError> {
        Ok(self.rows.lock().unwrap().clone())
    }

    async fn get(&self, id: &MaterialTypeId) -> Result<Option<MaterialType>, AppError> {
        Ok(self
            .rows
            .lock()
            .unwrap()
            .iter()
            .find(|r| r.id == *id)
            .cloned())
    }

    async fn create(&self, new: &NewMaterialType) -> Result<MaterialType, AppError> {
        if *self.duplicate_on_create.lock().unwrap() {
            return Err(AppError::conflict("DUPLICATE_NAME"));
        }
        let mut n = self.next_id.lock().unwrap();
        *n += 1;
        let mt = MaterialType {
            id: MaterialTypeId(format!("mt-{}", *n)),
            name: new.name.clone(),
            description: new.description.clone(),
            default_cost: new.default_cost,
            min_stock_alert: new.min_stock_alert,
            created_at: Some("2026-04-19T00:00:00Z".into()),
            updated_at: Some("2026-04-19T00:00:00Z".into()),
        };
        self.rows.lock().unwrap().push(mt.clone());
        Ok(mt)
    }

    async fn update(
        &self,
        id: &MaterialTypeId,
        patch: &MaterialTypeUpdate,
    ) -> Result<Option<MaterialType>, AppError> {
        let mut guard = self.rows.lock().unwrap();
        for row in guard.iter_mut() {
            if row.id == *id {
                if let Some(name) = patch.name.clone() {
                    row.name = name;
                }
                if let Some(desc) = patch.description.clone() {
                    row.description = desc;
                }
                if let Some(c) = patch.default_cost {
                    row.default_cost = c;
                }
                if let Some(m) = patch.min_stock_alert {
                    row.min_stock_alert = m;
                }
                return Ok(Some(row.clone()));
            }
        }
        Ok(None)
    }

    async fn delete(&self, id: &MaterialTypeId) -> Result<bool, AppError> {
        if *self.fk_violation_on_delete.lock().unwrap() {
            return Err(AppError::conflict("FK_VIOLATION_ROLLS_EXIST"));
        }
        let mut guard = self.rows.lock().unwrap();
        let len = guard.len();
        guard.retain(|r| r.id != *id);
        Ok(guard.len() != len)
    }
}

struct FakeInventoryFactory {
    port: Arc<FakeMaterialTypePort>,
}

impl InventoryPortFactory for FakeInventoryFactory {
    fn material_types(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialTypePort>, AppError> {
        Ok(self.port.clone())
    }

    fn suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn SupplierPort>, AppError> {
        Err(AppError::infrastructure("suppliers not used in this test"))
    }
    fn material_suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialSupplierPort>, AppError> {
        Err(AppError::infrastructure(
            "material_suppliers not used in this test",
        ))
    }
    fn rolls(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn RollPort>, AppError> {
        Err(AppError::infrastructure("rolls not used in this test"))
    }
}

/// Dummy cut-history factory — the inventory tests never touch cuts,
/// but `AppState` needs one. Production impl is fine because the
/// routes under test don't call it.
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

fn state_with_factory(
    keys: &TestKeys,
    port: Arc<FakeMaterialTypePort>,
) -> Arc<AppState> {
    let inv_factory: Arc<dyn InventoryPortFactory> =
        Arc::new(FakeInventoryFactory { port });
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

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

#[tokio::test]
async fn list_requires_auth() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-types",
        None,
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn create_returns_201_with_created_entity() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    let state = state_with_factory(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-types",
        Some(&token),
        Some(r#"{"name":"Neoprene","default_cost":4.5}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("name").and_then(Value::as_str), Some("Neoprene"));
    assert_eq!(json.get("default_cost").and_then(Value::as_f64), Some(4.5));
    assert!(json.get("id").is_some());
    assert_eq!(port.rows.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn create_rejects_blank_name_with_400() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-types",
        Some(&token),
        Some(r#"{"name":"   "}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_maps_duplicate_name_to_409_with_machine_code() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    *port.duplicate_on_create.lock().unwrap() = true;
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/material-types",
        Some(&token),
        Some(r#"{"name":"Neoprene"}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CONFLICT);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        json.get("code").and_then(Value::as_str),
        Some("DUPLICATE_NAME")
    );
}

#[tokio::test]
async fn list_returns_rows() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    // Seed two rows directly.
    port.rows.lock().unwrap().extend([
        MaterialType {
            id: MaterialTypeId("mt-1".into()),
            name: "Neoprene".into(),
            description: None,
            default_cost: None,
            min_stock_alert: None,
            created_at: None,
            updated_at: None,
        },
        MaterialType {
            id: MaterialTypeId("mt-2".into()),
            name: "EPDM".into(),
            description: None,
            default_cost: None,
            min_stock_alert: None,
            created_at: None,
            updated_at: None,
        },
    ]);
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-types",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let arr = serde_json::from_slice::<Value>(&body).unwrap();
    assert_eq!(arr.as_array().map(|a| a.len()), Some(2));
}

#[tokio::test]
async fn get_returns_entity() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    port.rows.lock().unwrap().push(MaterialType {
        id: MaterialTypeId("mt-42".into()),
        name: "Silicone".into(),
        description: Some("High-temp".into()),
        default_cost: Some(6.75),
        min_stock_alert: Some(50.0),
        created_at: None,
        updated_at: None,
    });
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-types/mt-42",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("name").and_then(Value::as_str), Some("Silicone"));
}

#[tokio::test]
async fn get_missing_returns_404() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/material-types/nope",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn update_modifies_and_returns_row() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    port.rows.lock().unwrap().push(MaterialType {
        id: MaterialTypeId("mt-1".into()),
        name: "Neoprene".into(),
        description: None,
        default_cost: Some(4.5),
        min_stock_alert: None,
        created_at: None,
        updated_at: None,
    });
    let state = state_with_factory(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::PUT,
        "/api/v2/inventory/material-types/mt-1",
        Some(&token),
        Some(r#"{"default_cost":5.25}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("default_cost").and_then(Value::as_f64), Some(5.25));
    // The row in the fake reflects the change too.
    assert_eq!(
        port.rows.lock().unwrap()[0].default_cost,
        Some(5.25)
    );
}

#[tokio::test]
async fn update_missing_returns_404() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::PUT,
        "/api/v2/inventory/material-types/nope",
        Some(&token),
        Some(r#"{"default_cost":1.0}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn delete_204_on_success() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    port.rows.lock().unwrap().push(MaterialType {
        id: MaterialTypeId("mt-1".into()),
        name: "Neoprene".into(),
        description: None,
        default_cost: None,
        min_stock_alert: None,
        created_at: None,
        updated_at: None,
    });
    let state = state_with_factory(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::DELETE,
        "/api/v2/inventory/material-types/mt-1",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert_eq!(port.rows.lock().unwrap().len(), 0);
}

#[tokio::test]
async fn delete_maps_fk_violation_to_409() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeMaterialTypePort::default());
    port.rows.lock().unwrap().push(MaterialType {
        id: MaterialTypeId("mt-1".into()),
        name: "Neoprene".into(),
        description: None,
        default_cost: None,
        min_stock_alert: None,
        created_at: None,
        updated_at: None,
    });
    *port.fk_violation_on_delete.lock().unwrap() = true;
    let state = state_with_factory(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::DELETE,
        "/api/v2/inventory/material-types/mt-1",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CONFLICT);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        json.get("code").and_then(Value::as_str),
        Some("FK_VIOLATION_ROLLS_EXIST")
    );
}

// Keep a stub reference to `CutHistoryPort` so the trait import
// isn't flagged as unused — the dummy factory uses it implicitly.
#[allow(dead_code)]
fn _touch(_: Box<dyn CutHistoryPort>) {}
