//! End-to-end tests for the JWT middleware. Generates an RSA keypair
//! at test setup, exposes it as a JWK via a fake fetcher, signs test
//! tokens with the matching private key, and exercises the
//! /api/v2/whoami placeholder route.

use std::sync::Arc;
use std::time::Duration;

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
    AppState, JwksCache, JwksError,
};
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::pkcs8::{EncodePublicKey, LineEnding};
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::Serialize;
use serde_json::Value;
use tower::ServiceExt;

const TEST_KID: &str = "test-kid";
const TEST_ISSUER: &str = "https://example.supabase.co/auth/v1";
const SUPABASE_URL: &str = "https://example.supabase.co";

struct TestKeys {
    encoding: EncodingKey,
    jwk: Jwk,
}

fn generate_test_keys() -> TestKeys {
    // 2048 is the Supabase minimum — fine for tests, fast enough under
    // RSA's Rust crate.
    let mut rng = rand::thread_rng();
    let private = RsaPrivateKey::new(&mut rng, 2048).expect("generate RSA key");
    let public = RsaPublicKey::from(&private);

    let private_pem = private
        .to_pkcs1_pem(LineEnding::LF)
        .expect("encode private PEM");
    let encoding = EncodingKey::from_rsa_pem(private_pem.as_bytes()).expect("load encoding key");

    // Convert the public exponent + modulus to base64url for the JWK.
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
    // Self-consistency: make sure we can convert the JWK back into a
    // DecodingKey — guards against bad base64 padding during setup.
    let _ = jsonwebtoken::DecodingKey::from_jwk(&jwk).expect("jwk must convert to decoding key");
    // Touch the PEM-like encoding too (used by HS test assertions
    // that compare spki encoding stability).
    let _ = public
        .to_public_key_pem(LineEnding::LF)
        .expect("encode public PEM");

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

fn sign_token(keys: &TestKeys, claims: TestClaims<'_>) -> String {
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

fn test_state(keys: &TestKeys) -> Arc<AppState> {
    let set = JwkSet {
        keys: vec![keys.jwk.clone()],
    };
    let fetcher: Arc<dyn JwksFetcher> = Arc::new(StaticFetcher { set });
    let cache = JwksCache::with_ttl(fetcher, Duration::from_secs(60));
    Arc::new(AppState::new(cache, SUPABASE_URL))
}

fn test_cfg() -> ServerConfig {
    ServerConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        request_timeout: Duration::from_secs(5),
        cors_mode: CorsMode::Off,
    }
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

async fn status_of(router: axum::Router, token: Option<&str>) -> StatusCode {
    let mut req = Request::builder().uri("/api/v2/whoami");
    if let Some(tok) = token {
        req = req.header("authorization", format!("Bearer {tok}"));
    }
    let response = router
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    response.status()
}

#[tokio::test]
async fn valid_token_reaches_handler() {
    let keys = generate_test_keys();
    let state = test_state(&keys);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(
        &keys,
        TestClaims {
            sub: "user-123",
            iss: TEST_ISSUER,
            exp: now() + 600,
            iat: now(),
            email: "user@example.com",
            role: "authenticated",
            aud: "authenticated",
        },
    );

    let response = router
        .oneshot(
            Request::builder()
                .uri("/api/v2/whoami")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.get("sub").and_then(Value::as_str), Some("user-123"));
    assert_eq!(json.get("iss").and_then(Value::as_str), Some(TEST_ISSUER));
    assert_eq!(
        json.get("email").and_then(Value::as_str),
        Some("user@example.com")
    );
    assert_eq!(
        json.get("role").and_then(Value::as_str),
        Some("authenticated")
    );
}

#[tokio::test]
async fn missing_authorization_returns_401() {
    let keys = generate_test_keys();
    let state = test_state(&keys);
    let router = build_router_with_state(&test_cfg(), state);
    assert_eq!(status_of(router, None).await, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn expired_token_returns_401() {
    let keys = generate_test_keys();
    let state = test_state(&keys);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(
        &keys,
        TestClaims {
            sub: "user-123",
            iss: TEST_ISSUER,
            exp: now() - 600,
            iat: now() - 1200,
            email: "user@example.com",
            role: "authenticated",
            aud: "authenticated",
        },
    );
    assert_eq!(
        status_of(router, Some(&token)).await,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn wrong_issuer_returns_401() {
    let keys = generate_test_keys();
    let state = test_state(&keys);
    let router = build_router_with_state(&test_cfg(), state);
    let token = sign_token(
        &keys,
        TestClaims {
            sub: "user-123",
            iss: "https://evil.supabase.co/auth/v1",
            exp: now() + 600,
            iat: now(),
            email: "user@example.com",
            role: "authenticated",
            aud: "authenticated",
        },
    );
    assert_eq!(
        status_of(router, Some(&token)).await,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn malformed_header_returns_401() {
    let keys = generate_test_keys();
    let state = test_state(&keys);
    let router = build_router_with_state(&test_cfg(), state);
    let response = router
        .oneshot(
            Request::builder()
                .uri("/api/v2/whoami")
                .header("authorization", "NotBearer some-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn health_still_public_with_state_router() {
    let keys = generate_test_keys();
    let state = test_state(&keys);
    let router = build_router_with_state(&test_cfg(), state);
    let response = router
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
