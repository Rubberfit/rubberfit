//! Router factory — assembles the Axum router with the middleware
//! stack configured from `ServerConfig`.
//!
//! Split out from `main.rs` so integration tests can exercise the
//! router directly without binding a TCP socket.

use axum::{routing::get, Router};
use http::HeaderValue;
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    request_id::{MakeRequestId, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::config::{CorsMode, ServerConfig};
use crate::health;

const REQUEST_ID_HEADER: &str = "x-request-id";

/// Opaque request-id generator — UUIDv4 per request. The header
/// name stays lowercase to match tower-http's wire convention.
#[derive(Clone, Copy, Default)]
pub struct UuidRequestId;

impl MakeRequestId for UuidRequestId {
    fn make_request_id<B>(&mut self, _request: &http::Request<B>) -> Option<RequestId> {
        let id = Uuid::new_v4().to_string();
        HeaderValue::from_str(&id).ok().map(RequestId::new)
    }
}

/// Build the full router with every middleware layer applied.
/// Top-to-bottom the stack is: tracing → request-id → CORS → timeout
/// → routes. Errors from inner layers bubble up as 500 via Axum's
/// default handling.
pub fn build_router(cfg: &ServerConfig) -> Router {
    let cors = cors_layer(&cfg.cors_mode);

    // Order matters. ServiceBuilder applies layers outside-in, so the
    // first `.layer()` is OUTERMOST (sees the request first, the
    // response last). We need Set BEFORE Propagate so the request
    // carries the id header by the time Propagate reads it — Propagate
    // captures that id on the request path and writes it back on the
    // response path.
    let request_id_header = http::HeaderName::from_static(REQUEST_ID_HEADER);
    let middleware = ServiceBuilder::new()
        .layer(SetRequestIdLayer::new(request_id_header.clone(), UuidRequestId))
        .layer(PropagateRequestIdLayer::new(request_id_header))
        .layer(TraceLayer::new_for_http());

    let routes = Router::new().route("/health", get(health::health));

    let with_cors = if let Some(layer) = cors {
        routes.layer(layer)
    } else {
        routes
    };

    with_cors
        .layer(middleware)
        // Timeout is the outermost layer so a slow inner handler
        // gets a 408 response no matter what it was doing. The
        // 30s default is generous for Supabase round-trips that
        // may cross regions on Fly. `tower_http::TimeoutLayer`
        // emits a direct HTTP response instead of surfacing a
        // BoxError that Axum would reject with Infallible bounds.
        .layer(TimeoutLayer::with_status_code(
            http::StatusCode::REQUEST_TIMEOUT,
            cfg.request_timeout,
        ))
        .fallback(fallback_404)
}

fn cors_layer(mode: &CorsMode) -> Option<CorsLayer> {
    match mode {
        CorsMode::Off => None,
        CorsMode::Permissive => Some(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        ),
        CorsMode::AllowList(origins) => {
            let mut layer = CorsLayer::new().allow_methods(Any).allow_headers(Any);
            let mut any_ok = false;
            for origin in origins {
                if let Ok(val) = HeaderValue::from_str(origin) {
                    layer = layer.allow_origin(val);
                    any_ok = true;
                }
            }
            if any_ok {
                Some(layer)
            } else {
                None
            }
        }
    }
}

async fn fallback_404() -> (http::StatusCode, &'static str) {
    (http::StatusCode::NOT_FOUND, "not found")
}
