//! REMA backend binary entrypoint. Boots Axum, binds the configured
//! socket, and serves the router produced by `build_router`.
//!
//! All runtime knobs live in `ServerConfig` (`config.rs`) — this
//! file is just the async runtime + graceful-shutdown wiring.

use std::process::ExitCode;

use rema_api::{build_router, config::ServerConfig};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info};

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

    let router = build_router(&cfg);

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
