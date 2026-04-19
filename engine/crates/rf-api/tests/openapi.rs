//! `/openapi.json` integration — verifies the spec is served publicly
//! (no JWT required) and that it contains the routes the frontend
//! type-generation pipeline depends on.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use rf_api::{build_router, config::ServerConfig};
use serde_json::Value;
use tower::ServiceExt;

fn test_config() -> ServerConfig {
    ServerConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        request_timeout: std::time::Duration::from_secs(5),
        cors_mode: rf_api::config::CorsMode::Off,
    }
}

#[tokio::test]
async fn openapi_json_is_public_and_well_formed() {
    let router = build_router(&test_config());

    let response = router
        .oneshot(
            Request::builder()
                .uri("/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert!(
        json.get("openapi").and_then(Value::as_str).is_some(),
        "expected a top-level `openapi` field: {json:?}"
    );

    let paths = json.get("paths").and_then(Value::as_object).unwrap();
    assert!(
        paths.contains_key("/api/v2/cuts/history"),
        "expected /api/v2/cuts/history in spec"
    );
    assert!(
        paths.contains_key("/api/v2/cuts/history/{id}"),
        "expected /api/v2/cuts/history/{{id}} in spec"
    );
    assert!(
        paths.contains_key("/api/v2/cuts/favorites"),
        "expected /api/v2/cuts/favorites in spec"
    );
    assert!(paths.contains_key("/health"), "expected /health in spec");
}

/// The committed `openapi.json` is the source of truth used by
/// `openapi-typescript` to generate frontend types. Drift means
/// stale TS types — fail the build loudly so the author re-runs
/// `npm run openapi:dump`. Executes the same check npm's
/// `openapi:check` script runs in CI, but hermetically.
#[test]
fn committed_spec_matches_generated_spec() {
    use rf_api::ApiDoc;
    use utoipa::OpenApi;

    let committed = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/openapi.json"
    ))
    .expect(
        "committed openapi.json should exist next to Cargo.toml — \
         did you run `npm run openapi:dump`?",
    );
    let generated = serde_json::to_string_pretty(&ApiDoc::openapi())
        .expect("serialize generated spec");

    // Normalise trailing whitespace — `println!` in the dump bin adds
    // a newline, `to_string_pretty` does not. Accept both.
    let c = committed.trim_end();
    let g = generated.trim_end();

    assert_eq!(
        c, g,
        "committed openapi.json is stale — regenerate with `npm run openapi:dump`"
    );
}
