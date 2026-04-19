//! REMA backend binary entrypoint. Boots Axum, binds the configured
//! socket, and serves the router.
//!
//! If `SUPABASE_URL` is set, mounts the auth-gated `/api/v2/**`
//! subtree backed by a JWKS cache; otherwise falls back to the
//! public-only router (just `/health`) so `cargo run` works for
//! smoke tests before Supabase is wired.

use std::process::ExitCode;
use std::sync::Arc;

use rema_api::{
    build_router, build_router_with_state, config::ServerConfig, AppState, HttpJwksFetcher,
    JwksCache, JwksFetcher,
};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> ExitCode {
    // tracing_subscriber defaults to INFO and honors `RUST_LOG` for
    // fine-grained control (`RUST_LOG=rema_api=debug,tower_http=info`
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
        "rema-api starting"
    );

    let listener = match TcpListener::bind(cfg.bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("failed to bind {}: {e}", cfg.bind_addr);
            return ExitCode::FAILURE;
        }
    };
    info!(local_addr = ?listener.local_addr().ok(), "listening");

    let router = match std::env::var("SUPABASE_URL") {
        Ok(url) if !url.trim().is_empty() => {
            info!(supabase_url = %url, "SUPABASE_URL set — mounting /api/v2 behind JWT middleware");
            let fetcher: Arc<dyn JwksFetcher> = Arc::new(HttpJwksFetcher::new(&url));
            let cache = JwksCache::new(fetcher);
            let state = Arc::new(AppState::new(cache, url));
            build_router_with_state(&cfg, state)
        }
        _ => {
            warn!("SUPABASE_URL not set — serving public-only router (just /health)");
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
