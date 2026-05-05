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
    #[error("token uses unsupported algorithm (expected RS256 or ES256)")]
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

/// Process-global auth configuration. Stored as a single `OnceCell`
/// so the cache and issuer are always populated together — the
/// previous two-cell setup had a small window where `JWKS_CACHE.get()`
/// returned `Some` but `EXPECTED_ISSUER.get()` returned `None` for a
/// concurrent caller, causing a spurious `Misconfigured` error.
struct AuthConfig {
    jwks: JwksCache,
    /// Expected `iss` claim — `${SUPABASE_URL}/auth/v1`.
    issuer: String,
}

static AUTH_CONFIG: OnceCell<AuthConfig> = OnceCell::new();

fn auth_config() -> Result<&'static AuthConfig, AuthError> {
    if let Some(cfg) = AUTH_CONFIG.get() {
        return Ok(cfg);
    }
    let supabase_url = env::var("SUPABASE_URL")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL"))
        .map_err(|_| AuthError::Misconfigured)?;
    let fetcher = Arc::new(HttpJwksFetcher::new(&supabase_url));
    let cfg = AuthConfig {
        jwks: JwksCache::new(fetcher),
        issuer: format!("{}/auth/v1", supabase_url.trim_end_matches('/')),
    };
    // Race-safe: if a concurrent caller initialized AUTH_CONFIG
    // between our `.get()` above and `.set()` here, our value is
    // dropped and we read the winner via the trailing `.get()`.
    let _ = AUTH_CONFIG.set(cfg);
    Ok(AUTH_CONFIG.get().expect("AUTH_CONFIG just set"))
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
    // Supabase asymmetric JWTs sign with either RSA (RS256) or
    // ECDSA P-256 (ES256). Accept both — the project's chosen
    // algorithm is the one carried by the JWT header.
    if !matches!(header.alg, Algorithm::RS256 | Algorithm::ES256) {
        return Err(AuthError::UnsupportedAlg);
    }
    let kid = header.kid.ok_or(AuthError::Malformed)?;

    let cfg = auth_config()?;
    let key = match cfg.jwks.get_decoding_key(&kid).await {
        Ok(k) => k,
        Err(JwksError::UnknownKid { .. }) => return Err(AuthError::UnknownKid),
        Err(_) => return Err(AuthError::JwksUnavailable),
    };

    let mut validation = Validation::new(header.alg);
    validation.set_issuer(&[cfg.issuer.as_str()]);
    validation.leeway = 30;
    validation.validate_aud = false;

    let data = decode::<SupabaseClaims>(token, &key, &validation).map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::Expired,
        jsonwebtoken::errors::ErrorKind::InvalidIssuer => AuthError::WrongIssuer,
        _ => AuthError::Invalid,
    })?;
    Ok(data.claims)
}
