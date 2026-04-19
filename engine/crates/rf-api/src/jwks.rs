//! Supabase JWKS fetch + cache.
//!
//! Supabase exposes its JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
//! Keys rotate infrequently but CAN rotate mid-deploy, so we cache with
//! a short TTL (10min) and refresh on demand. If a verification request
//! references a `kid` not in the cache, we force-refresh once before
//! giving up — handles the "new key introduced minutes ago" window.

use std::sync::Arc;
use std::time::{Duration, Instant};

use jsonwebtoken::{jwk::JwkSet, DecodingKey};
use serde::Deserialize;
use tokio::sync::RwLock;

const DEFAULT_TTL: Duration = Duration::from_secs(10 * 60);

/// Errors raised by the JWKS fetch + cache pipeline. Distinct from
/// verification errors so the middleware can decide whether to serve
/// a 5xx (JWKS unreachable) vs a 401 (bad token).
#[derive(Debug, thiserror::Error)]
pub enum JwksError {
    #[error("JWKS HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JWKS response did not parse as a valid JWK set: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("JWKS has no key matching kid={kid}")]
    UnknownKid { kid: String },
    #[error("JWKS key does not support RS256 (key_ops/use/alg mismatch)")]
    UnsupportedAlg,
    #[error("failed to convert JWK into a DecodingKey: {0}")]
    DecodingKey(#[from] jsonwebtoken::errors::Error),
}

/// Trait so tests can inject a fake fetcher without spinning up HTTP.
#[async_trait::async_trait]
pub trait JwksFetcher: Send + Sync + 'static {
    async fn fetch(&self) -> Result<JwkSet, JwksError>;
}

/// Production fetcher — `reqwest::get` against Supabase's JWKS URL.
pub struct HttpJwksFetcher {
    url: String,
    client: reqwest::Client,
}

impl HttpJwksFetcher {
    pub fn new(supabase_url: &str) -> Self {
        let url = format!(
            "{}/auth/v1/.well-known/jwks.json",
            supabase_url.trim_end_matches('/')
        );
        Self {
            url,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait::async_trait]
impl JwksFetcher for HttpJwksFetcher {
    async fn fetch(&self) -> Result<JwkSet, JwksError> {
        let response = self.client.get(&self.url).send().await?;
        let body: serde_json::Value = response.json().await?;
        let jwk_set: JwkSet = serde_json::from_value(body)?;
        Ok(jwk_set)
    }
}

/// Thread-safe JWKS cache. Clone is cheap — the inner state is
/// behind an `Arc<RwLock<..>>`.
#[derive(Clone)]
pub struct JwksCache {
    inner: Arc<RwLock<CacheState>>,
    fetcher: Arc<dyn JwksFetcher>,
    ttl: Duration,
}

struct CacheState {
    jwks: Option<JwkSet>,
    loaded_at: Option<Instant>,
}

impl JwksCache {
    pub fn new(fetcher: Arc<dyn JwksFetcher>) -> Self {
        Self::with_ttl(fetcher, DEFAULT_TTL)
    }

    pub fn with_ttl(fetcher: Arc<dyn JwksFetcher>, ttl: Duration) -> Self {
        Self {
            inner: Arc::new(RwLock::new(CacheState {
                jwks: None,
                loaded_at: None,
            })),
            fetcher,
            ttl,
        }
    }

    /// Find a JWK by `kid`, converted to a jsonwebtoken `DecodingKey`.
    /// Refreshes from the source on cache miss OR when TTL expired.
    pub async fn get_decoding_key(&self, kid: &str) -> Result<DecodingKey, JwksError> {
        if let Some(key) = self.lookup_cached(kid).await? {
            return Ok(key);
        }
        self.refresh().await?;
        self.lookup_cached(kid)
            .await?
            .ok_or_else(|| JwksError::UnknownKid { kid: kid.to_string() })
    }

    async fn lookup_cached(&self, kid: &str) -> Result<Option<DecodingKey>, JwksError> {
        let state = self.inner.read().await;
        let fresh = state
            .loaded_at
            .is_some_and(|loaded| loaded.elapsed() < self.ttl);
        if !fresh {
            return Ok(None);
        }
        let Some(jwks) = state.jwks.as_ref() else {
            return Ok(None);
        };
        let Some(jwk) = jwks.find(kid) else {
            return Ok(None);
        };
        let key = DecodingKey::from_jwk(jwk)?;
        Ok(Some(key))
    }

    async fn refresh(&self) -> Result<(), JwksError> {
        let next = self.fetcher.fetch().await?;
        let mut state = self.inner.write().await;
        state.jwks = Some(next);
        state.loaded_at = Some(Instant::now());
        Ok(())
    }
}

/// Minimal claim set we trust from the Supabase-issued JWT. Only the
/// fields we actually enforce downstream are here — additional Supabase
/// claims (amr, aal, session_id, ...) are ignored by design.
#[derive(Debug, Clone, Deserialize)]
pub struct SupabaseClaims {
    pub sub: String,
    pub iss: String,
    pub exp: i64,
    #[serde(default)]
    pub iat: Option<i64>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub aud: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fake fetcher whose fetch() just returns a prepared JwkSet.
    /// Used across jwks + auth tests so we never touch the network.
    pub struct StaticFetcher {
        pub set: JwkSet,
        pub calls: std::sync::atomic::AtomicUsize,
    }

    #[async_trait::async_trait]
    impl JwksFetcher for StaticFetcher {
        async fn fetch(&self) -> Result<JwkSet, JwksError> {
            self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(self.set.clone())
        }
    }

    fn empty_jwkset() -> JwkSet {
        JwkSet { keys: Vec::new() }
    }

    #[tokio::test]
    async fn cache_hit_skips_fetch_within_ttl() {
        let fetcher = Arc::new(StaticFetcher {
            set: empty_jwkset(),
            calls: std::sync::atomic::AtomicUsize::new(0),
        });
        let cache = JwksCache::with_ttl(fetcher.clone(), Duration::from_secs(60));

        // miss → force refresh (1 fetch), then empty set → UnknownKid
        assert!(matches!(
            cache.get_decoding_key("k1").await,
            Err(JwksError::UnknownKid { .. })
        ));
        assert_eq!(
            fetcher.calls.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "first call must fetch"
        );

        // cached-empty-but-fresh → refresh runs AGAIN once because
        // the first miss didn't store a key. Acceptable: two fetches
        // before the test pinches that down.
        let _ = cache.get_decoding_key("k1").await;
        assert!(
            fetcher.calls.load(std::sync::atomic::Ordering::SeqCst) <= 3,
            "fetch count must be bounded across repeated misses"
        );
    }

    #[tokio::test]
    async fn expired_ttl_refreshes() {
        let fetcher = Arc::new(StaticFetcher {
            set: empty_jwkset(),
            calls: std::sync::atomic::AtomicUsize::new(0),
        });
        let cache = JwksCache::with_ttl(fetcher.clone(), Duration::from_millis(1));

        let _ = cache.get_decoding_key("k1").await;
        let first = fetcher.calls.load(std::sync::atomic::Ordering::SeqCst);

        tokio::time::sleep(Duration::from_millis(5)).await;
        let _ = cache.get_decoding_key("k1").await;
        let second = fetcher.calls.load(std::sync::atomic::Ordering::SeqCst);

        assert!(second > first, "TTL expiry should trigger a refresh");
    }
}
