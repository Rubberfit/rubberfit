//! Bearer-JWT auth middleware. Extracts `Authorization: Bearer <jwt>`,
//! verifies against the Supabase JWKS cache, and stores a
//! `AuthContext` on the request extensions so downstream handlers can
//! pull it out via `require_auth(req)`.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{decode, decode_header, Algorithm, Validation};

use rema_supabase::{PostgrestClient, PostgrestError};

use crate::jwks::{JwksCache, JwksError, SupabaseClaims};

/// Shared HTTP-layer state — passed into the auth middleware via
/// `Router::with_state`. Cloning is cheap (`Arc` under the hood).
#[derive(Clone)]
pub struct AppState {
    pub jwks: JwksCache,
    /// Expected `iss` claim: `<SUPABASE_URL>/auth/v1`. Verified with
    /// an exact match after stripping trailing slashes.
    pub expected_issuer: String,
    /// Base URL for Supabase REST calls. e.g. `https://project.supabase.co`.
    pub supabase_url: String,
    /// Publishable / anon key for the project. Goes onto the `apikey`
    /// header of every PostgREST call. Does NOT grant privileges on
    /// its own — RLS enforces scoping via the user JWT.
    pub supabase_publishable_key: String,
}

impl AppState {
    /// Minimal constructor used by most of the tests — supplies a
    /// placeholder publishable key that's only valid for mocked
    /// transports. Use `with_supabase` to pass a real key.
    pub fn new(jwks: JwksCache, supabase_url: impl Into<String>) -> Self {
        Self::with_supabase(jwks, supabase_url, "test-publishable-key")
    }

    /// Full constructor — callers provide the project's publishable
    /// key so `user_postgrest` can stamp it on outgoing requests.
    pub fn with_supabase(
        jwks: JwksCache,
        supabase_url: impl Into<String>,
        supabase_publishable_key: impl Into<String>,
    ) -> Self {
        let base = supabase_url.into();
        let expected_issuer = format!("{}/auth/v1", base.trim_end_matches('/'));
        Self {
            jwks,
            expected_issuer,
            supabase_url: base,
            supabase_publishable_key: supabase_publishable_key.into(),
        }
    }
}

/// Build a fresh PostgREST client scoped to a single verified user.
/// This is the canonical path for handlers to talk to Supabase. The
/// alternative — sharing a long-lived client across requests — would
/// require the service role key and bypass RLS, which the S3 spec
/// explicitly disallows.
pub fn user_postgrest(
    state: &AppState,
    auth: &AuthContext,
) -> Result<PostgrestClient, PostgrestError> {
    PostgrestClient::new(
        state.supabase_url.clone(),
        &state.supabase_publishable_key,
        &auth.raw_jwt,
    )
}

/// Everything the verification step proved true about the caller. Lives
/// on the request extensions after the middleware runs; handlers read
/// it with the `require_auth` helper.
#[derive(Debug, Clone)]
pub struct AuthContext {
    pub claims: SupabaseClaims,
    /// The verbatim Bearer token, preserved because downstream
    /// Supabase PostgREST calls need to forward it (RLS scoping).
    pub raw_jwt: String,
}

/// Pull the [`AuthContext`] inserted by the middleware. Handlers
/// should call this instead of reaching into extensions directly.
pub fn require_auth(req: &Request) -> Result<&AuthContext, AuthError> {
    req.extensions()
        .get::<AuthContext>()
        .ok_or(AuthError::Missing)
}

/// Axum `from_fn_with_state` middleware. Runs on every route it
/// wraps; 401s anything missing or malformed, 503s if JWKS is
/// unreachable. Success installs `AuthContext` on the request.
pub async fn jwt_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Response {
    let token = match extract_bearer(&req) {
        Ok(t) => t,
        Err(err) => return err.into_response(),
    };

    let claims = match verify(&state, &token).await {
        Ok(c) => c,
        Err(err) => return err.into_response(),
    };

    req.extensions_mut().insert(AuthContext {
        claims,
        raw_jwt: token,
    });
    next.run(req).await
}

fn extract_bearer(req: &Request) -> Result<String, AuthError> {
    let header = req
        .headers()
        .get(header::AUTHORIZATION)
        .ok_or(AuthError::Missing)?
        .to_str()
        .map_err(|_| AuthError::Malformed)?;
    let stripped = header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))
        .ok_or(AuthError::Malformed)?;
    Ok(stripped.trim().to_string())
}

async fn verify(state: &AppState, token: &str) -> Result<SupabaseClaims, AuthError> {
    let header = decode_header(token).map_err(|_| AuthError::Malformed)?;
    if header.alg != Algorithm::RS256 {
        return Err(AuthError::UnsupportedAlg);
    }
    let kid = header.kid.ok_or(AuthError::Malformed)?;

    let key = match state.jwks.get_decoding_key(&kid).await {
        Ok(k) => k,
        Err(JwksError::UnknownKid { .. }) => return Err(AuthError::UnknownKid),
        Err(_) => return Err(AuthError::JwksUnavailable),
    };

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[state.expected_issuer.as_str()]);
    validation.leeway = 30;
    // Supabase tokens carry `aud = "authenticated"`; we defer audience
    // enforcement to downstream (Postgres RLS already scopes via JWT
    // sub + role), so disable it here to keep the middleware permissive
    // across session types (authenticated vs anon mobile clients).
    validation.validate_aud = false;

    let data = decode::<SupabaseClaims>(token, &key, &validation)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::Expired,
            jsonwebtoken::errors::ErrorKind::InvalidIssuer => AuthError::WrongIssuer,
            _ => AuthError::Invalid,
        })?;
    Ok(data.claims)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    /// No Authorization header at all.
    Missing,
    /// Header present but wrong shape (no "Bearer" prefix, non-ASCII).
    Malformed,
    /// Token's `alg` is not RS256.
    UnsupportedAlg,
    /// Token references a `kid` we've never seen even after a refresh.
    UnknownKid,
    /// JWKS endpoint unreachable. Transient — return 503.
    JwksUnavailable,
    /// Signature does not verify or the claim set is invalid.
    Invalid,
    /// Valid signature but `exp` has passed.
    Expired,
    /// Valid signature but `iss` is not our Supabase project.
    WrongIssuer,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            AuthError::Missing => (StatusCode::UNAUTHORIZED, "missing Authorization"),
            AuthError::Malformed => (StatusCode::UNAUTHORIZED, "malformed Authorization"),
            AuthError::UnsupportedAlg => (StatusCode::UNAUTHORIZED, "unsupported token alg"),
            AuthError::UnknownKid => (StatusCode::UNAUTHORIZED, "unknown kid"),
            AuthError::JwksUnavailable => {
                (StatusCode::SERVICE_UNAVAILABLE, "auth service unavailable")
            }
            AuthError::Invalid => (StatusCode::UNAUTHORIZED, "invalid token"),
            AuthError::Expired => (StatusCode::UNAUTHORIZED, "expired token"),
            AuthError::WrongIssuer => (StatusCode::UNAUTHORIZED, "wrong token issuer"),
        };
        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(body))
            .unwrap_or_else(|_| StatusCode::UNAUTHORIZED.into_response())
    }
}
