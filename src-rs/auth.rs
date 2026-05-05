//! Bearer-JWT extraction + verification. Mirrors the production
//! `verify()` function in `engine/crates/rf-api/src/auth.rs` but
//! standalone — no Axum middleware, no AppState.
//!
//! Uses a process-global `JwksCache` so warm function instances reuse
//! the JWKS rather than re-fetching on every invocation.

use std::env;
use std::sync::Arc;

use jsonwebtoken::{decode, decode_header, Algorithm, Validation};
use once_cell::sync::OnceCell;

use crate::jwks::{HttpJwksFetcher, JwksCache, JwksError, SupabaseClaims};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AuthError {
    #[error("missing Authorization header")]
    Missing,
    #[error("malformed Authorization header (expected `Bearer <jwt>`)")]
    Malformed,
    #[error("token uses unsupported algorithm (expected RS256)")]
    UnsupportedAlg,
    #[error("JWKS unreachable")]
    JwksUnavailable,
    #[error("token signed with unknown key id")]
    UnknownKid,
    #[error("token expired")]
    Expired,
    #[error("token issuer does not match SUPABASE_URL")]
    WrongIssuer,
    #[error("token signature/claims invalid")]
    Invalid,
    #[error("server misconfigured: SUPABASE_URL not set")]
    Misconfigured,
}

static JWKS_CACHE: OnceCell<JwksCache> = OnceCell::new();
static EXPECTED_ISSUER: OnceCell<String> = OnceCell::new();

fn jwks_cache() -> Result<&'static JwksCache, AuthError> {
    if let Some(cache) = JWKS_CACHE.get() {
        return Ok(cache);
    }
    let supabase_url = env::var("SUPABASE_URL")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL"))
        .map_err(|_| AuthError::Misconfigured)?;
    let fetcher = Arc::new(HttpJwksFetcher::new(&supabase_url));
    let cache = JwksCache::new(fetcher);
    let issuer = format!("{}/auth/v1", supabase_url.trim_end_matches('/'));
    let _ = JWKS_CACHE.set(cache);
    let _ = EXPECTED_ISSUER.set(issuer);
    Ok(JWKS_CACHE.get().expect("JWKS_CACHE just set"))
}

fn expected_issuer() -> Result<&'static str, AuthError> {
    jwks_cache()?;
    EXPECTED_ISSUER
        .get()
        .map(|s| s.as_str())
        .ok_or(AuthError::Misconfigured)
}

/// Extract `Bearer <jwt>` from an `Authorization` header value.
pub fn parse_bearer(header_value: &str) -> Result<&str, AuthError> {
    let token = header_value
        .strip_prefix("Bearer ")
        .or_else(|| header_value.strip_prefix("bearer "))
        .ok_or(AuthError::Malformed)?
        .trim();
    if token.is_empty() {
        return Err(AuthError::Malformed);
    }
    Ok(token)
}

/// Validate a Supabase-issued JWT. Returns the claims on success,
/// or a structured `AuthError` the handler can map to HTTP status.
pub async fn verify(token: &str) -> Result<SupabaseClaims, AuthError> {
    let header = decode_header(token).map_err(|_| AuthError::Malformed)?;
    if header.alg != Algorithm::RS256 {
        return Err(AuthError::UnsupportedAlg);
    }
    let kid = header.kid.ok_or(AuthError::Malformed)?;

    let cache = jwks_cache()?;
    let key = match cache.get_decoding_key(&kid).await {
        Ok(k) => k,
        Err(JwksError::UnknownKid { .. }) => return Err(AuthError::UnknownKid),
        Err(_) => return Err(AuthError::JwksUnavailable),
    };

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[expected_issuer()?]);
    validation.leeway = 30;
    validation.validate_aud = false;

    let data = decode::<SupabaseClaims>(token, &key, &validation).map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::Expired,
        jsonwebtoken::errors::ErrorKind::InvalidIssuer => AuthError::WrongIssuer,
        _ => AuthError::Invalid,
    })?;
    Ok(data.claims)
}
