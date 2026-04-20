//! RF backend binary entrypoint. Boots Axum, binds the configured
//! socket, and serves the router.
//!
//! If `SUPABASE_URL` is set, mounts the auth-gated `/api/v2/**`
//! subtree backed by a JWKS cache; otherwise falls back to the
//! public-only router (just `/health`) so `cargo run` works for
//! smoke tests before Supabase is wired.

use std::process::ExitCode;
use std::sync::Arc;

use rf_api::{
    build_router, build_router_with_state, config::ServerConfig, AppState, HttpJwksFetcher,
    JwksCache, JwksFetcher,
};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> ExitCode {
    // tracing_subscriber defaults to INFO and honors `RUST_LOG` for
    // fine-grained control (`RUST_LOG=rf_api=debug,tower_http=info`
    // is a common setting during local dev).
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(true)
        .init();

    let cfg = match ServerConfig::from_env() {
        Ok(c) => c,
        Err(e) => {
            error!("config error: {e}");
            return ExitCode::FAILURE;
        }
    };

    info!(
        bind = %cfg.bind_addr,
        timeout_ms = cfg.request_timeout.as_millis() as u64,
        "rf-api starting"
    );

    let listener = match TcpListener::bind(cfg.bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("failed to bind {}: {e}", cfg.bind_addr);
            return ExitCode::FAILURE;
        }
    };
    info!(local_addr = ?listener.local_addr().ok(), "listening");

    let router = match (
        std::env::var("SUPABASE_URL"),
        std::env::var("SUPABASE_PUBLISHABLE_KEY"),
    ) {
        (Ok(url), Ok(key)) if !url.trim().is_empty() && !key.trim().is_empty() => {
            info!(supabase_url = %url, "SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY set — mounting /api/v2 behind JWT middleware");
            let fetcher: Arc<dyn JwksFetcher> = Arc::new(HttpJwksFetcher::new(&url));
            let cache = JwksCache::new(fetcher);
            // S3c Task 4: optional tax-proxy base. In prod this is the
            // internal Next.js origin (e.g. `https://app.arc-and-
            // anchor.com`) on Fly; in dev it's `http://localhost:3000`.
            // Missing is a soft condition — the preview endpoint
            // returns a clear "not configured" error at call time.
            let tax_proxy_base = std::env::var("TAX_PROXY_BASE")
                .ok()
                .filter(|s| !s.trim().is_empty());
            if let Some(base) = tax_proxy_base.as_deref() {
                info!(tax_proxy_base = %base, "TAX_PROXY_BASE set — tax preview endpoint enabled");
            } else {
                warn!("TAX_PROXY_BASE not set — /api/v2/po/tax/preview will 500 until configured");
            }
            let state = Arc::new(AppState::with_supabase(cache, url, key, tax_proxy_base));
            build_router_with_state(&cfg, state)
        }
        _ => {
            warn!(
                "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY not set — serving public-only router \
                 (just /health)"
            );
            build_router(&cfg)
        }
    };

    // `axum::serve` accepts graceful-shutdown via future. Trigger on
    // SIGTERM (container orchestrator friendly) OR Ctrl-C (dev).
    if let Err(e) = axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        error!("server error: {e}");
        return ExitCode::FAILURE;
    }

    ExitCode::SUCCESS
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("install Ctrl-C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("received Ctrl-C, shutting down"),
        _ = terminate => info!("received SIGTERM, shutting down"),
    }
}
