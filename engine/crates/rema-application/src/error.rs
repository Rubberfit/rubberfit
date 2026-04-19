//! Application-layer error vocabulary. Wraps domain errors + adds
//! cross-cutting concerns (not-found, not-authorized, infra failure).
//! Handlers map these to HTTP status codes at the delivery layer.

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Requested resource doesn't exist or RLS filtered it out. The
    /// handler returns a 404 either way — we never leak "exists but
    /// hidden" vs "doesn't exist" to the caller.
    #[error("resource not found")]
    NotFound,

    /// The caller is authenticated but not authorized for this
    /// action. Lands as 403 at the HTTP boundary.
    #[error("forbidden")]
    Forbidden,

    /// Bad input — validation failure. Lands as 400.
    #[error("invalid input: {0}")]
    InvalidInput(String),

    /// Anything the underlying infrastructure surfaces. We keep the
    /// source opaque via `anyhow::Error` so specific adapter errors
    /// don't leak types up to the delivery layer. Lands as 500.
    #[error("infrastructure error: {0}")]
    Infrastructure(String),
}

impl AppError {
    pub fn infrastructure<E: std::fmt::Display>(err: E) -> Self {
        AppError::Infrastructure(err.to_string())
    }
}
