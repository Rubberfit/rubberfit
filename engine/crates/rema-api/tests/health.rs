//! Integration test — `/health` must return 200 + the expected JSON
//! shape without binding a TCP socket. Uses `tower::ServiceExt::oneshot`
//! to drive the router directly.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use rema_api::{build_router, config::ServerConfig};
use serde_json::Value;
use tower::ServiceExt;

fn test_config() -> ServerConfig {
    // SAFETY: config parsing is fallible and requires a SocketAddr
    // string. This never fails for a literal-string bind.
    ServerConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        request_timeout: std::time::Duration::from_secs(5),
        cors_mode: rema_api::config::CorsMode::Off,
    }
}

#[tokio::test]
async fn health_returns_200_with_status_and_version() {
    let router = build_router(&test_config());

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

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();

    assert_eq!(body.get("status").and_then(Value::as_str), Some("ok"));
    let version = body.get("version").and_then(Value::as_str);
    assert!(
        version.is_some_and(|v| !v.is_empty()),
        "version should be the rema-api crate version, got {body:?}"
    );
}

#[tokio::test]
async fn health_carries_request_id_header() {
    let router = build_router(&test_config());

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
    assert!(
        response.headers().contains_key("x-request-id"),
        "SetRequestIdLayer should inject x-request-id on every response, headers={:?}",
        response.headers()
    );
}

#[tokio::test]
async fn unknown_route_returns_404() {
    let router = build_router(&test_config());

    let response = router
        .oneshot(
            Request::builder()
                .uri("/does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
