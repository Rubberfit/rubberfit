//! POST /api/v2/pack — Vercel Rust serverless function.
//!
//! Replaces the legacy `app/api/v2/pack/route.ts` Next.js handler that
//! spawned `pack-cli` as a child process. Now runs the packer in-process
//! via the `rf-layout` path-dep crate.
//!
//! Auth: validates `Authorization: Bearer <jwt>` against Supabase JWKS
//! (RS256 + issuer check). The browser-side `ApiPackingService` reads
//! `session.access_token` from supabase-js and sets the header.
//!
//! CPU bound: jagua-rs's LNS+SA metaheuristic blocks the calling thread.
//! Wrapped in `tokio::task::spawn_blocking` so the tokio reactor stays
//! responsive. A small semaphore caps concurrent packs per warm Fluid
//! Compute instance — without it two big packs landing on one instance
//! starve each other.

use std::sync::Arc;

use http::{header::AUTHORIZATION, StatusCode};
use http_body_util::BodyExt;
use once_cell::sync::Lazy;
use serde_json::json;
use tokio::sync::Semaphore;
use vercel_runtime::{run, service_fn, AppState, Error, Request, Response, ResponseBody};

use rema_portal_functions::auth::{self, AuthError};
use rf_layout::application::strategy::strategy_for;
use rf_layout::domain::{PackEngine, PackRequest};

// 2 concurrent packs per warm instance. Tune from telemetry once we
// have real traffic. Lower = serialise jobs (predictable latency,
// underutilised CPU); higher = oversubscribe + cache thrash.
static PACK_PERMITS: Lazy<Arc<Semaphore>> = Lazy::new(|| Arc::new(Semaphore::new(2)));

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(handler)).await
}

async fn handler(req: Request, _state: AppState) -> Result<Response<ResponseBody>, Error> {
    if req.method() != http::Method::POST {
        return error_response(StatusCode::METHOD_NOT_ALLOWED, "only POST is allowed");
    }

    let auth_header = match req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        Some(h) => h.to_string(),
        None => return error_response(StatusCode::UNAUTHORIZED, "missing Authorization header"),
    };
    let token = match auth::parse_bearer(&auth_header) {
        Ok(t) => t.to_string(),
        Err(_) => {
            return error_response(
                StatusCode::UNAUTHORIZED,
                "malformed Authorization header (expected `Bearer <jwt>`)",
            )
        }
    };
    if let Err(e) = auth::verify(&token).await {
        return auth_error_response(&e);
    }

    let body_bytes = match req.into_body().collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(e) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                &format!("failed to read request body: {e}"),
            )
        }
    };

    let pack_req: PackRequest = match serde_json::from_slice(&body_bytes) {
        Ok(r) => r,
        Err(e) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                &format!("invalid PackRequest JSON: {e}"),
            )
        }
    };
    if pack_req.bins.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "request must include at least one bin");
    }
    if pack_req.items.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "request must include at least one item",
        );
    }

    let engine = resolve_engine(&pack_req);
    let permit = match PACK_PERMITS.clone().acquire_owned().await {
        Ok(p) => p,
        Err(_) => {
            return error_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "pack semaphore closed (function shutting down)",
            )
        }
    };
    let pack_result = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        strategy_for(engine).pack(pack_req)
    })
    .await;

    match pack_result {
        Ok(Ok(result)) => json_response(StatusCode::OK, &result),
        Ok(Err(e)) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("pack failed: {e}"),
        ),
        Err(join_err) => {
            eprintln!("pack worker panicked: {join_err}");
            error_response(StatusCode::INTERNAL_SERVER_ERROR, "pack worker panicked")
        }
    }
}

fn resolve_engine(request: &PackRequest) -> Option<PackEngine> {
    if let Some(e) = request.engine {
        return Some(e);
    }
    match std::env::var("RF_ENGINE").as_deref() {
        Ok("legacy") => Some(PackEngine::Legacy),
        Ok("lbf") => Some(PackEngine::Lbf),
        _ => None,
    }
}

fn auth_error_response(e: &AuthError) -> Result<Response<ResponseBody>, Error> {
    let (status, msg) = match e {
        AuthError::Missing | AuthError::Malformed => (StatusCode::UNAUTHORIZED, e.to_string()),
        AuthError::UnsupportedAlg
        | AuthError::UnknownKid
        | AuthError::Expired
        | AuthError::WrongIssuer
        | AuthError::Invalid => (StatusCode::UNAUTHORIZED, e.to_string()),
        AuthError::JwksUnavailable => (
            StatusCode::SERVICE_UNAVAILABLE,
            "auth provider temporarily unavailable".to_string(),
        ),
        AuthError::Misconfigured => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "server auth misconfigured".to_string(),
        ),
    };
    error_response(status, &msg)
}

fn error_response(status: StatusCode, message: &str) -> Result<Response<ResponseBody>, Error> {
    let body = serde_json::to_vec(&json!({ "error": message }))?;
    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(body.into())?)
}

fn json_response<T: serde::Serialize>(
    status: StatusCode,
    payload: &T,
) -> Result<Response<ResponseBody>, Error> {
    let body = serde_json::to_vec(payload)?;
    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(body.into())?)
}
