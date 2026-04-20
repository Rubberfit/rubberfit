//! Router factory — assembles the Axum router with the middleware
//! stack configured from `ServerConfig`.
//!
//! Split out from `main.rs` so integration tests can exercise the
//! router directly without binding a TCP socket.

use std::sync::Arc;

use axum::{middleware, routing::get, Router};
use http::HeaderValue;
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    request_id::{MakeRequestId, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::auth::{jwt_middleware, AppState};
use crate::config::{CorsMode, ServerConfig};
use crate::cuts;
use crate::health;
use crate::inventory;
use crate::openapi;
use crate::procurement;

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

/// Build the router without auth — just public routes like `/health`.
/// Kept as a separate constructor so integration tests can exercise
/// the middleware stack without an `AppState`.
///
/// Top-to-bottom the middleware stack is: tracing → request-id → CORS
/// → timeout → routes. Errors from inner layers bubble up as 500 via
/// Axum's default handling.
pub fn build_router(cfg: &ServerConfig) -> Router {
    apply_middleware(build_public_router(), cfg)
}

/// Build the router with auth middleware applied to the `/api/v2`
/// subtree. `/health` remains public. This is what `main.rs` wires
/// at startup; tests can also call it with a fake `AppState`.
pub fn build_router_with_state(cfg: &ServerConfig, state: Arc<AppState>) -> Router {
    // Protected subtree — everything under /api/v2 requires a valid
    // Supabase JWT. `/whoami` stays as a cheap sanity check that the
    // middleware forwards claims correctly; the cut-history routes are
    // the first real delivery surface.
    let protected = Router::new()
        .route("/whoami", get(whoami_placeholder))
        .route("/cuts/history", get(cuts::list_history))
        .route("/cuts/history/{id}", get(cuts::get_history_item))
        .route("/cuts/favorites", get(cuts::list_favorites))
        .route(
            "/inventory/material-types",
            get(inventory::list_material_types)
                .post(inventory::create_material_type),
        )
        .route(
            "/inventory/material-types/{id}",
            get(inventory::get_material_type)
                .put(inventory::update_material_type)
                .delete(inventory::delete_material_type),
        )
        .route(
            "/inventory/suppliers",
            get(inventory::list_suppliers).post(inventory::create_supplier),
        )
        .route(
            "/inventory/suppliers/{id}",
            get(inventory::get_supplier)
                .put(inventory::update_supplier)
                .delete(inventory::delete_supplier),
        )
        .route(
            "/inventory/material-suppliers",
            get(inventory::list_material_suppliers)
                .post(inventory::create_material_supplier),
        )
        .route(
            "/inventory/material-suppliers/{id}",
            get(inventory::get_material_supplier)
                .put(inventory::update_material_supplier)
                .delete(inventory::delete_material_supplier),
        )
        // Stats routes BEFORE the generic /{id} pattern so
        // /rolls/stats/... doesn't get captured as an id.
        .route(
            "/inventory/rolls/stats/inventory-value",
            get(inventory::inventory_value),
        )
        .route(
            "/inventory/rolls/stats/low-stock-count",
            get(inventory::low_stock_count),
        )
        .route(
            "/inventory/rolls/stats/growth-percentage",
            get(inventory::inventory_growth),
        )
        .route("/inventory/rolls/recent", get(inventory::recent_rolls))
        .route(
            "/inventory/rolls",
            get(inventory::list_rolls).post(inventory::create_roll),
        )
        .route(
            "/inventory/rolls/{id}",
            get(inventory::get_roll)
                .put(inventory::update_roll)
                .delete(inventory::delete_roll),
        )
        // Procurement — S3c. PO CRUD + line items in Task 2; status,
        // receive flow, tax preview, reorder, CSV import follow.
        .route(
            "/po",
            get(procurement::list_purchase_orders)
                .post(procurement::create_purchase_order),
        )
        .route(
            "/po/{id}",
            get(procurement::get_purchase_order)
                .put(procurement::update_purchase_order)
                .delete(procurement::delete_purchase_order),
        )
        .route(
            "/po/{id}/status",
            axum::routing::put(procurement::update_purchase_order_status),
        )
        .route(
            "/po/{po_id}/items",
            get(procurement::list_po_items).post(procurement::add_po_item),
        )
        .route(
            "/po/{po_id}/items/{item_id}",
            axum::routing::put(procurement::update_po_item)
                .delete(procurement::delete_po_item),
        )
        .route_layer(middleware::from_fn_with_state(state.clone(), jwt_middleware))
        .with_state(state);

    let public = build_public_router();
    let combined = public.nest("/api/v2", protected);
    apply_middleware(combined, cfg)
}

/// Public router — no auth, no state. `/health` + `/openapi.json`.
/// The OpenAPI document is unauthenticated so the frontend build can
/// pull it without a JWT and regenerate TypeScript types at CI time.
pub fn build_public_router() -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/openapi.json", get(openapi::openapi_json))
}

async fn whoami_placeholder(
    request: axum::extract::Request,
) -> axum::Json<serde_json::Value> {
    // Handlers use `crate::require_auth` to reach the AuthContext;
    // this route exists so the test suite can confirm the middleware
    // forwards a valid JWT's claims into the request extensions.
    match crate::auth::require_auth(&request) {
        Ok(auth) => axum::Json(serde_json::json!({
            "sub": auth.claims.sub,
            "iss": auth.claims.iss,
            "email": auth.claims.email,
            "role": auth.claims.role,
        })),
        Err(_) => axum::Json(serde_json::json!({ "error": "no auth context" })),
    }
}

fn apply_middleware(router: Router, cfg: &ServerConfig) -> Router {
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

    let with_cors = if let Some(layer) = cors {
        router.layer(layer)
    } else {
        router
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
