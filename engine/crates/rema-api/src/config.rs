//! Startup configuration loaded from environment variables.
//!
//! Why env-only: the backend is meant to run in three environments
//! (dev on localhost, desktop via Tauri, Fly.io for the hosted CRM)
//! and env vars are the common denominator for all three. A config
//! file layer can be added later if needed.

use std::net::SocketAddr;
use std::time::Duration;

/// Server runtime configuration.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// Address to bind the HTTP listener on. `REMA_API_BIND`
    /// (defaults to `127.0.0.1:8080`).
    pub bind_addr: SocketAddr,
    /// Per-request wall-clock timeout. `REMA_API_TIMEOUT_MS`
    /// (defaults to 30_000 ms).
    pub request_timeout: Duration,
    /// CORS allow-list mode. `REMA_API_CORS` — `"permissive"`
    /// (default; suitable for local dev) mirrors the request origin;
    /// `"off"` disables CORS entirely; any other value is treated as
    /// a comma-separated list of allowed origins (production pattern).
    pub cors_mode: CorsMode,
}

/// How the CORS middleware should be configured at startup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsMode {
    /// Mirror the `Origin` header back (the "allow any" dev default).
    Permissive,
    /// No CORS layer installed.
    Off,
    /// Allow exactly these origins.
    AllowList(Vec<String>),
}

impl ServerConfig {
    /// Load from process env. Thin wrapper over `from_lookup` so the
    /// real entrypoint and the unit tests exercise exactly the same
    /// parsing logic without racing on the shared env.
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    /// Pure-function parser: build a `ServerConfig` from any
    /// `lookup(key) -> Option<String>` source. Unit tests drive this
    /// directly so they never touch `std::env`, which Rust tests share
    /// and which mutates non-atomically across threads.
    pub fn from_lookup<F>(lookup: F) -> Result<Self, ConfigError>
    where
        F: Fn(&str) -> Option<String>,
    {
        let bind_str = lookup("REMA_API_BIND").unwrap_or_else(|| "127.0.0.1:8080".to_string());
        let bind_addr = bind_str
            .parse::<SocketAddr>()
            .map_err(|source| ConfigError::InvalidBind { value: bind_str, source })?;

        let timeout_ms = lookup("REMA_API_TIMEOUT_MS")
            .map(|v| v.parse::<u64>())
            .transpose()
            .map_err(ConfigError::InvalidTimeout)?
            .unwrap_or(30_000);
        let request_timeout = Duration::from_millis(timeout_ms);

        let cors_mode = match lookup("REMA_API_CORS").as_deref() {
            None => CorsMode::Permissive,
            Some("permissive") => CorsMode::Permissive,
            Some("off") => CorsMode::Off,
            Some(list) => {
                let origins: Vec<String> = list
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if origins.is_empty() {
                    CorsMode::Permissive
                } else {
                    CorsMode::AllowList(origins)
                }
            }
        };

        Ok(Self {
            bind_addr,
            request_timeout,
            cors_mode,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("REMA_API_BIND is not a valid SocketAddr ({value}): {source}")]
    InvalidBind {
        value: String,
        source: std::net::AddrParseError,
    },
    #[error("REMA_API_TIMEOUT_MS must be a u64 of milliseconds: {0}")]
    InvalidTimeout(std::num::ParseIntError),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn lookup_from(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect();
        move |key: &str| map.get(key).cloned()
    }

    #[test]
    fn defaults_are_sensible() {
        let cfg = ServerConfig::from_lookup(lookup_from(&[])).expect("defaults load");
        assert_eq!(cfg.bind_addr.to_string(), "127.0.0.1:8080");
        assert_eq!(cfg.request_timeout, Duration::from_millis(30_000));
        assert_eq!(cfg.cors_mode, CorsMode::Permissive);
    }

    #[test]
    fn invalid_bind_errors() {
        let err = ServerConfig::from_lookup(lookup_from(&[("REMA_API_BIND", "not-a-socket")]))
            .expect_err("should reject bad bind");
        assert!(matches!(err, ConfigError::InvalidBind { .. }));
    }

    #[test]
    fn invalid_timeout_errors() {
        let err = ServerConfig::from_lookup(lookup_from(&[(
            "REMA_API_TIMEOUT_MS",
            "not-a-number",
        )]))
        .expect_err("should reject non-numeric timeout");
        assert!(matches!(err, ConfigError::InvalidTimeout(_)));
    }

    #[test]
    fn cors_allowlist_parses() {
        let cfg = ServerConfig::from_lookup(lookup_from(&[(
            "REMA_API_CORS",
            "https://rema.app, https://staging.rema.app",
        )]))
        .unwrap();
        match cfg.cors_mode {
            CorsMode::AllowList(origins) => {
                assert_eq!(origins, vec!["https://rema.app", "https://staging.rema.app"]);
            }
            other => panic!("expected AllowList, got {other:?}"),
        }
    }

    #[test]
    fn cors_off_explicit() {
        let cfg = ServerConfig::from_lookup(lookup_from(&[("REMA_API_CORS", "off")])).unwrap();
        assert_eq!(cfg.cors_mode, CorsMode::Off);
    }

    #[test]
    fn cors_whitespace_only_list_falls_back_to_permissive() {
        let cfg =
            ServerConfig::from_lookup(lookup_from(&[("REMA_API_CORS", "  ,  ,  ")])).unwrap();
        assert_eq!(cfg.cors_mode, CorsMode::Permissive);
    }

    #[test]
    fn custom_bind_and_timeout() {
        let cfg = ServerConfig::from_lookup(lookup_from(&[
            ("REMA_API_BIND", "0.0.0.0:9001"),
            ("REMA_API_TIMEOUT_MS", "5000"),
        ]))
        .unwrap();
        assert_eq!(cfg.bind_addr.to_string(), "0.0.0.0:9001");
        assert_eq!(cfg.request_timeout, Duration::from_millis(5_000));
    }
}
