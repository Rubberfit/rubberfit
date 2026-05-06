//! Supabase JWKS fetch + cache. Lifted from
//! `engine/crates/rf-api/src/jwks.rs` so the Vercel function bundle
//! doesn't have to depend on the full `rf-api` crate.
//!
//! If the upstream copy changes, mirror the change here. Long-term
//! these should converge into a shared `rf-supabase-auth` crate; for
//! now duplication is the lighter trade.

use std::sync::Arc;
use std::time::{Duration, Instant};

use jsonwebtoken::{jwk::JwkSet, DecodingKey};
use serde::Deserialize;
use tokio::sync::RwLock;

const DEFAULT_TTL: Duration = Duration::from_secs(10 * 60);

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

#[async_trait::async_trait]
pub trait JwksFetcher: Send + Sync + 'static {
    async fn fetch(&self) -> Result<JwkSet, JwksError>;
}

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

    pub async fn get_decoding_key(&self, kid: &str) -> Result<DecodingKey, JwksError> {
        if let Some(key) = self.lookup_cached(kid).await? {
            return Ok(key);
        }
        self.refresh().await?;
        self.lookup_cached(kid)
            .await?
            .ok_or_else(|| JwksError::UnknownKid {
                kid: kid.to_string(),
            })
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
