//! End-to-end tests for `/api/v2/inventory/suppliers`.

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
    MaterialSupplierPort, MaterialTypePort, NewSupplier, RollPort, SupplierPort,
    SupplierUpdate,
};
use rf_domain::{Supplier, SupplierFilters, SupplierId};
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
struct FakeSupplierPort {
    rows: Mutex<Vec<Supplier>>,
    next: Mutex<u32>,
    duplicate: Mutex<bool>,
    fk_on_delete: Mutex<bool>,
    observed_filters: Mutex<Option<SupplierFilters>>,
}

#[async_trait]
impl SupplierPort for FakeSupplierPort {
    async fn list(
        &self,
        filters: &SupplierFilters,
    ) -> Result<Vec<Supplier>, AppError> {
        *self.observed_filters.lock().unwrap() = Some(filters.clone());
        Ok(self.rows.lock().unwrap().clone())
    }
    async fn get(&self, id: &SupplierId) -> Result<Option<Supplier>, AppError> {
        Ok(self
            .rows
            .lock()
            .unwrap()
            .iter()
            .find(|s| s.id == *id)
            .cloned())
    }
    async fn create(&self, new: &NewSupplier) -> Result<Supplier, AppError> {
        if *self.duplicate.lock().unwrap() {
            return Err(AppError::conflict("DUPLICATE_NAME"));
        }
        let mut n = self.next.lock().unwrap();
        *n += 1;
        let s = Supplier {
            id: SupplierId(format!("sup-{}", *n)),
            name: new.name.clone(),
            contact_person: new.contact_person.clone(),
            email: new.email.clone(),
            phone: new.phone.clone(),
            address: new.address.clone(),
            city: new.city.clone(),
            state: new.state.clone(),
            zip_code: new.zip_code.clone(),
            country: new.country.clone().or_else(|| Some("USA".into())),
            website: new.website.clone(),
            tax_id: new.tax_id.clone(),
            payment_terms: new.payment_terms.clone(),
            rating: new.rating,
            preferred: new.preferred.unwrap_or(false),
            active: new.active.unwrap_or(true),
            notes: new.notes.clone(),
            created_at: Some("2026-04-19T00:00:00Z".into()),
            updated_at: Some("2026-04-19T00:00:00Z".into()),
        };
        self.rows.lock().unwrap().push(s.clone());
        Ok(s)
    }
    async fn update(
        &self,
        id: &SupplierId,
        patch: &SupplierUpdate,
    ) -> Result<Option<Supplier>, AppError> {
        let mut g = self.rows.lock().unwrap();
        for row in g.iter_mut() {
            if row.id == *id {
                if let Some(name) = patch.name.clone() {
                    row.name = name;
                }
                if let Some(r) = patch.rating {
                    row.rating = r;
                }
                if let Some(p) = patch.preferred {
                    row.preferred = p;
                }
                if let Some(a) = patch.active {
                    row.active = a;
                }
                return Ok(Some(row.clone()));
            }
        }
        Ok(None)
    }
    async fn delete(&self, id: &SupplierId) -> Result<bool, AppError> {
        if *self.fk_on_delete.lock().unwrap() {
            return Err(AppError::conflict("FK_VIOLATION_MATERIAL_SUPPLIERS_EXIST"));
        }
        let mut g = self.rows.lock().unwrap();
        let len = g.len();
        g.retain(|s| s.id != *id);
        Ok(g.len() != len)
    }
}

struct FakeInventoryFactory {
    suppliers: Arc<FakeSupplierPort>,
}

impl InventoryPortFactory for FakeInventoryFactory {
    fn material_types(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialTypePort>, AppError> {
        Err(AppError::infrastructure(
            "material_types not used in supplier tests",
        ))
    }
    fn suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn SupplierPort>, AppError> {
        Ok(self.suppliers.clone())
    }
    fn material_suppliers(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialSupplierPort>, AppError> {
        Err(AppError::infrastructure(
            "material_suppliers not used in supplier tests",
        ))
    }
    fn rolls(
        &self,
        _auth: &AuthContext,
    ) -> Result<Arc<dyn RollPort>, AppError> {
        Err(AppError::infrastructure("rolls not used in supplier tests"))
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

fn state_with_supplier_port(
    keys: &TestKeys,
    port: Arc<FakeSupplierPort>,
) -> Arc<AppState> {
    let inv_factory: Arc<dyn InventoryPortFactory> =
        Arc::new(FakeInventoryFactory { suppliers: port });
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

#[tokio::test]
async fn list_requires_auth() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    let state = state_with_supplier_port(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let resp = send(router, Method::GET, "/api/v2/inventory/suppliers", None, None).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn list_forwards_filters_from_query_params() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    let state = state_with_supplier_port(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/suppliers?active=true&preferred=true&q=acme&limit=50",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let f = port.observed_filters.lock().unwrap().clone().unwrap();
    assert_eq!(f.active, Some(true));
    assert_eq!(f.preferred, Some(true));
    assert_eq!(f.search.as_deref(), Some("acme"));
    assert_eq!(f.limit, Some(50));
}

#[tokio::test]
async fn list_clamps_limit_at_200() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    let state = state_with_supplier_port(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/suppliers?limit=9999",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let f = port.observed_filters.lock().unwrap().clone().unwrap();
    assert_eq!(f.limit, Some(200));
}

#[tokio::test]
async fn create_returns_201() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    let state = state_with_supplier_port(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/suppliers",
        Some(&token),
        Some(r#"{"name":"Acme","rating":4.5,"preferred":true}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("name").and_then(Value::as_str), Some("Acme"));
    assert_eq!(json.get("preferred").and_then(Value::as_bool), Some(true));
    assert_eq!(json.get("active").and_then(Value::as_bool), Some(true));
    assert_eq!(port.rows.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn create_rejects_rating_out_of_range() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    let state = state_with_supplier_port(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/suppliers",
        Some(&token),
        Some(r#"{"name":"Acme","rating":6}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_duplicate_name_maps_to_409() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    *port.duplicate.lock().unwrap() = true;
    let state = state_with_supplier_port(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::POST,
        "/api/v2/inventory/suppliers",
        Some(&token),
        Some(r#"{"name":"Acme"}"#),
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
async fn get_returns_entity() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    port.rows.lock().unwrap().push(Supplier {
        id: SupplierId("sup-9".into()),
        name: "Acme".into(),
        contact_person: None,
        email: None,
        phone: None,
        address: None,
        city: None,
        state: None,
        zip_code: None,
        country: Some("USA".into()),
        website: None,
        tax_id: None,
        payment_terms: None,
        rating: Some(4.0),
        preferred: true,
        active: true,
        notes: None,
        created_at: None,
        updated_at: None,
    });
    let state = state_with_supplier_port(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/suppliers/sup-9",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn get_missing_returns_404() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    let state = state_with_supplier_port(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::GET,
        "/api/v2/inventory/suppliers/nope",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn update_modifies_row() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    port.rows.lock().unwrap().push(Supplier {
        id: SupplierId("sup-1".into()),
        name: "Acme".into(),
        contact_person: None,
        email: None,
        phone: None,
        address: None,
        city: None,
        state: None,
        zip_code: None,
        country: Some("USA".into()),
        website: None,
        tax_id: None,
        payment_terms: None,
        rating: Some(3.0),
        preferred: false,
        active: true,
        notes: None,
        created_at: None,
        updated_at: None,
    });
    let state = state_with_supplier_port(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::PUT,
        "/api/v2/inventory/suppliers/sup-1",
        Some(&token),
        Some(r#"{"rating":4.5,"preferred":true}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    let snap = &port.rows.lock().unwrap()[0];
    assert_eq!(snap.rating, Some(4.5));
    assert!(snap.preferred);
}

#[tokio::test]
async fn delete_204_on_success() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    port.rows.lock().unwrap().push(Supplier {
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
    });
    let state = state_with_supplier_port(&keys, port.clone());
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::DELETE,
        "/api/v2/inventory/suppliers/sup-1",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert_eq!(port.rows.lock().unwrap().len(), 0);
}

#[tokio::test]
async fn delete_fk_maps_to_409() {
    let keys = generate_test_keys();
    let port = Arc::new(FakeSupplierPort::default());
    port.rows.lock().unwrap().push(Supplier {
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
    });
    *port.fk_on_delete.lock().unwrap() = true;
    let state = state_with_supplier_port(&keys, port);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let resp = send(
        router,
        Method::DELETE,
        "/api/v2/inventory/suppliers/sup-1",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CONFLICT);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        json.get("code").and_then(Value::as_str),
        Some("FK_VIOLATION_MATERIAL_SUPPLIERS_EXIST")
    );
}
