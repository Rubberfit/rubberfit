//! End-to-end tests for the cut-history HTTP routes under `/api/v2/cuts/*`.
//!
//! Injects a `FakeCutHistoryPortFactory` into `AppState` so the tests
//! never touch Supabase. JWT plumbing mirrors `tests/auth.rs` —
//! generate an RSA key, publish it via a static JWKS fetcher, and
//! sign a short-lived test token for each request.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use axum::body::Body;
use axum::http::{Request, StatusCode};
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
    AppState, AuthContext, CutHistoryPortFactory, JwksCache, JwksError,
};
use rf_application::cuts::CutHistoryPort;
use rf_application::error::AppError;
use rf_domain::{CutHistoryEntry, CutHistoryFilters, CutHistoryId, UserId};
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

/// In-memory `CutHistoryPort` — each test configures the canned data
/// and then asserts on the observed filters / arguments after the
/// handler ran.
#[derive(Default)]
struct FakePort {
    history: Vec<CutHistoryEntry>,
    item: Option<CutHistoryEntry>,
    favorites: Vec<CutHistoryEntry>,
    observed_filters: Mutex<Option<CutHistoryFilters>>,
    observed_user: Mutex<Option<UserId>>,
}

#[async_trait]
impl CutHistoryPort for FakePort {
    async fn list_history(
        &self,
        user_id: &UserId,
        filters: &CutHistoryFilters,
    ) -> Result<Vec<CutHistoryEntry>, AppError> {
        *self.observed_filters.lock().unwrap() = Some(filters.clone());
        *self.observed_user.lock().unwrap() = Some(user_id.clone());
        Ok(self.history.clone())
    }

    async fn get_history_item(
        &self,
        user_id: &UserId,
        _cut_id: CutHistoryId,
    ) -> Result<Option<CutHistoryEntry>, AppError> {
        *self.observed_user.lock().unwrap() = Some(user_id.clone());
        Ok(self.item.clone())
    }

    async fn list_favorites(&self, user_id: &UserId) -> Result<Vec<CutHistoryEntry>, AppError> {
        *self.observed_user.lock().unwrap() = Some(user_id.clone());
        Ok(self.favorites.clone())
    }
}

/// Factory that hands out the same `Arc<FakePort>` every request, so
/// each test can reach in and assert on the shared state after the
/// handler runs.
struct FakeFactory {
    port: Arc<FakePort>,
}

impl CutHistoryPortFactory for FakeFactory {
    fn build(&self, _auth: &AuthContext) -> Result<Arc<dyn CutHistoryPort>, AppError> {
        Ok(self.port.clone())
    }
}

/// Factory that always fails with an infrastructure error — exercises
/// the 500 branch of `ApiError::App(AppError::Infrastructure)`.
struct FailingFactory;

impl CutHistoryPortFactory for FailingFactory {
    fn build(&self, _auth: &AuthContext) -> Result<Arc<dyn CutHistoryPort>, AppError> {
        Err(AppError::infrastructure("simulated downstream failure"))
    }
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
    let encoding = EncodingKey::from_rsa_pem(private_pem.as_bytes()).expect("load encoding key");

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

#[async_trait::async_trait]
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

fn state_with_factory(keys: &TestKeys, factory: Arc<dyn CutHistoryPortFactory>) -> Arc<AppState> {
    Arc::new(AppState::with_cut_history_factory(
        jwks_cache(keys),
        SUPABASE_URL,
        "test-publishable-key",
        factory,
    ))
}

fn sample_entry(id: i64) -> CutHistoryEntry {
    CutHistoryEntry {
        id: CutHistoryId(id),
        user_id: Some(UserId(TEST_USER.into())),
        material_id: 1,
        part_id: 2,
        cut_length: 10.0,
        cut_width: 20.0,
        cut_thickness: 1.0,
        part_custom_width: None,
        part_custom_height: None,
        part_selected_size: None,
        part_selected_size_text: None,
        part_selected_label: None,
        cut_amount: 1,
        parts_completed: 1,
        material_used_sqft: 1.0,
        reusable_offset_sqft: 0.0,
        scrap_sqft: 0.1,
        fab_score: 0.95,
        cut_pieces: 1,
        cut_date: Some("2026-04-01T00:00:00Z".into()),
        created_at: None,
        updated_at: None,
    }
}

async fn send(router: axum::Router, uri: &str, token: Option<&str>) -> axum::http::Response<Body> {
    let mut req = Request::builder().uri(uri);
    if let Some(tok) = token {
        req = req.header("authorization", format!("Bearer {tok}"));
    }
    router
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn list_history_returns_entries_and_forwards_user_id() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort {
        history: vec![sample_entry(1), sample_entry(2)],
        ..Default::default()
    });
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port: port.clone() });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(router, "/api/v2/cuts/history", Some(&token)).await;
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0].get("id").and_then(Value::as_i64), Some(1));
    assert_eq!(arr[1].get("id").and_then(Value::as_i64), Some(2));

    let observed_user = port.observed_user.lock().unwrap().clone().unwrap();
    assert_eq!(observed_user.0, TEST_USER);
}

#[tokio::test]
async fn list_history_parses_query_params_and_clamps_limit() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort::default());
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port: port.clone() });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(
        router,
        "/api/v2/cuts/history?limit=9999&offset=25&since=2026-01-01&until=2026-02-01",
        Some(&token),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let observed = port.observed_filters.lock().unwrap().clone().unwrap();
    assert_eq!(observed.limit, Some(200), "limit must be clamped to 200");
    assert_eq!(observed.offset, Some(25));
    assert_eq!(observed.since.as_deref(), Some("2026-01-01"));
    assert_eq!(observed.until.as_deref(), Some("2026-02-01"));
}

#[tokio::test]
async fn list_history_without_limit_gets_default_50() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort::default());
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port: port.clone() });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(router, "/api/v2/cuts/history", Some(&token)).await;
    assert_eq!(response.status(), StatusCode::OK);

    let observed = port.observed_filters.lock().unwrap().clone().unwrap();
    assert_eq!(observed.limit, Some(50));
}

#[tokio::test]
async fn list_history_requires_auth() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort::default());
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);

    let response = send(router, "/api/v2/cuts/history", None).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn get_history_item_returns_entry_by_id() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort {
        item: Some(sample_entry(42)),
        ..Default::default()
    });
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(router, "/api/v2/cuts/history/42", Some(&token)).await;
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("id").and_then(Value::as_i64), Some(42));
}

#[tokio::test]
async fn get_history_item_returns_404_when_port_has_nothing() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort::default());
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(router, "/api/v2/cuts/history/9999", Some(&token)).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_favorites_returns_entries() {
    let keys = generate_test_keys();
    let port = Arc::new(FakePort {
        favorites: vec![sample_entry(7), sample_entry(8), sample_entry(9)],
        ..Default::default()
    });
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FakeFactory { port });
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(router, "/api/v2/cuts/favorites", Some(&token)).await;
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.as_array().map(|a| a.len()), Some(3));
}

#[tokio::test]
async fn infrastructure_failure_returns_500_without_leaking_details() {
    let keys = generate_test_keys();
    let factory: Arc<dyn CutHistoryPortFactory> = Arc::new(FailingFactory);
    let state = state_with_factory(&keys, factory);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(&keys, TEST_USER);

    let response = send(router, "/api/v2/cuts/history", Some(&token)).await;
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_str = std::str::from_utf8(&body).unwrap();
    assert!(
        !body_str.contains("simulated downstream failure"),
        "500 body must not leak the underlying error: {body_str:?}"
    );
}
