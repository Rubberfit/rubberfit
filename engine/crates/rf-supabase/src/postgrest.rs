//! Request-scoped PostgREST client.
//!
//! Security invariant (S3 spec §"Auth"): every request against
//! Supabase REST MUST carry the calling user's JWT so PostgREST +
//! RLS scope rows to that user. We deliberately expose NO
//! constructor that takes a service-role key — the application
//! should never have one to give. A compile-time-ish barrier is the
//! best we can do in Rust; we document it aggressively instead.

use std::time::Duration;

use reqwest::{Client, ClientBuilder};
use serde::{de::DeserializeOwned, Serialize};

/// A PostgREST client bound to a single user's session. Build one
/// per request — cloning is discouraged so a stale JWT can't leak
/// across user boundaries.
#[derive(Debug)]
pub struct PostgrestClient {
    http: Client,
    base_url: String,
}

/// Errors surfacing from PostgREST calls. Keeping this narrow on
/// purpose — use-case code should map these into the application
/// error vocabulary rather than bubbling them straight to handlers.
#[derive(Debug, thiserror::Error)]
pub enum PostgrestError {
    #[error("failed to build reqwest client: {0}")]
    ClientBuild(#[from] reqwest::Error),
    #[error("invalid base URL {url}: {source}")]
    InvalidUrl {
        url: String,
        source: url::ParseError,
    },
    #[error("Supabase returned non-success status {status}: {body}")]
    ApiError {
        status: reqwest::StatusCode,
        body: String,
        /// Postgres SQLSTATE parsed out of the error body if present
        /// (PostgREST echoes it as `code` on most errors). Adapters
        /// use this to discriminate unique violations (23505), FK
        /// violations (23503), etc. without re-parsing the body.
        pg_code: Option<String>,
    },
    #[error("failed to decode response body: {0}")]
    Decode(#[from] serde_json::Error),
}

impl PostgrestError {
    /// Convenience — returns the Postgres SQLSTATE when this is an
    /// `ApiError` with a parseable code.
    pub fn pg_code(&self) -> Option<&str> {
        match self {
            PostgrestError::ApiError { pg_code, .. } => pg_code.as_deref(),
            _ => None,
        }
    }
}

impl PostgrestClient {
    /// Build a fresh client scoped to a single user.
    ///
    /// - `base_url` — e.g. `https://project.supabase.co`.
    /// - `publishable_key` — the per-project anon/publishable key.
    ///   PostgREST uses this to identify the project; RLS still
    ///   applies via the JWT below.
    /// - `user_jwt` — the Bearer token the auth middleware just
    ///   verified. Forwarding it unwrapped is the whole point of the
    ///   request-scoped pattern: Postgres sees the user's
    ///   `auth.uid()` and applies row-level security.
    pub fn new(
        base_url: impl Into<String>,
        publishable_key: impl AsRef<str>,
        user_jwt: impl AsRef<str>,
    ) -> Result<Self, PostgrestError> {
        let base_url = base_url.into();

        // Validate the URL early so a bad env var blows up at boot
        // instead of at the first API call. We do NOT hold onto the
        // parsed Url — reqwest accepts strings at call time.
        let _ = url::Url::parse(&base_url).map_err(|source| PostgrestError::InvalidUrl {
            url: base_url.clone(),
            source,
        })?;

        let apikey = publishable_key.as_ref();
        let bearer = user_jwt.as_ref();

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            "apikey",
            reqwest::header::HeaderValue::from_str(apikey)
                .map_err(|_| header_build_error("apikey"))?,
        );
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {bearer}"))
                .map_err(|_| header_build_error("Authorization"))?,
        );
        headers.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static("application/json"),
        );
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        );

        let http = ClientBuilder::new()
            .default_headers(headers)
            // PostgREST is usually p99 < 200ms; a 15s cap keeps a
            // hung connection from tying up a handler for the full
            // 30s request timeout.
            .timeout(Duration::from_secs(15))
            .build()?;

        Ok(Self { http, base_url })
    }

    /// GET a PostgREST resource and deserialize the JSON body.
    ///
    /// Path should start with `/rest/v1/...` (or equivalent PostgREST
    /// mount point). Query params are concatenated on top of any `?`
    /// already present in `path`.
    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, PostgrestError> {
        let url = self.join(path);
        let mut req = self.http.get(&url);
        if !query.is_empty() {
            req = req.query(query);
        }
        let response = req.send().await?;
        self.decode(response).await
    }

    /// POST a JSON payload to a PostgREST endpoint and deserialize
    /// the response.
    ///
    /// Stamps `Prefer: return=representation` so PostgREST echoes
    /// the inserted row(s) back as JSON. Without this the endpoint
    /// returns 201 with an empty body, and callers would need a
    /// follow-up GET to read what they just wrote.
    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, PostgrestError> {
        let url = self.join(path);
        let response = self
            .http
            .post(&url)
            .header("Prefer", "return=representation")
            .json(body)
            .send()
            .await?;
        self.decode(response).await
    }

    /// PATCH rows matching `query` with the JSON body and deserialize
    /// the response. PostgREST requires a filter (e.g. `id=eq.<uuid>`)
    /// or it refuses to update — we pass the filter through as query
    /// params so adapters build their own precise targets.
    pub async fn patch<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
        body: &B,
    ) -> Result<T, PostgrestError> {
        let url = self.join(path);
        let mut req = self
            .http
            .patch(&url)
            .header("Prefer", "return=representation")
            .json(body);
        if !query.is_empty() {
            req = req.query(query);
        }
        let response = req.send().await?;
        self.decode(response).await
    }

    /// DELETE rows matching `query`. Returns the deleted rows (empty
    /// array when no row matched) so the caller can tell present
    /// vs. already-gone.
    pub async fn delete<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, PostgrestError> {
        let url = self.join(path);
        let mut req = self
            .http
            .delete(&url)
            .header("Prefer", "return=representation");
        if !query.is_empty() {
            req = req.query(query);
        }
        let response = req.send().await?;
        self.decode(response).await
    }

    fn join(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        let base = self.base_url.trim_end_matches('/');
        if let Some(stripped) = path.strip_prefix('/') {
            format!("{base}/{stripped}")
        } else {
            format!("{base}/{path}")
        }
    }

    async fn decode<T: DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, PostgrestError> {
        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|e| format!("<failed to read body: {e}>"));
            let pg_code = extract_pg_code(&body);
            return Err(PostgrestError::ApiError {
                status,
                body,
                pg_code,
            });
        }
        let text = response.text().await.map_err(PostgrestError::ClientBuild)?;
        // serde_json → better error messages than reqwest::json()
        // when the body is almost-but-not-quite the expected shape.
        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }
}

/// Parse PostgREST's JSON error body and pull out the Postgres
/// SQLSTATE `code` field when present. Other fields (`message`,
/// `details`, `hint`) stay in the raw body for logging; the code
/// is the discriminator adapters branch on.
fn extract_pg_code(body: &str) -> Option<String> {
    #[derive(serde::Deserialize)]
    struct PgrstError<'a> {
        code: Option<&'a str>,
    }
    let parsed: Option<PgrstError<'_>> = serde_json::from_str(body).ok();
    parsed
        .and_then(|e| e.code)
        .filter(|c| !c.is_empty())
        .map(|c| c.to_string())
}

fn header_build_error(header: &'static str) -> PostgrestError {
    PostgrestError::ApiError {
        status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
        body: format!("invalid characters in {header} header"),
        pg_code: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_base_url() {
        let err = PostgrestClient::new("not a url", "apikey", "token").unwrap_err();
        assert!(matches!(err, PostgrestError::InvalidUrl { .. }));
    }

    #[test]
    fn accepts_https_base_url() {
        let client = PostgrestClient::new("https://project.supabase.co", "key", "token").unwrap();
        assert_eq!(client.base_url, "https://project.supabase.co");
    }

    #[test]
    fn join_handles_absolute_paths() {
        let client = PostgrestClient::new("https://project.supabase.co", "key", "token").unwrap();
        assert_eq!(
            client.join("/rest/v1/cuts?select=*"),
            "https://project.supabase.co/rest/v1/cuts?select=*"
        );
    }

    #[test]
    fn join_handles_relative_paths() {
        let client = PostgrestClient::new("https://project.supabase.co/", "key", "token").unwrap();
        assert_eq!(
            client.join("rest/v1/cuts"),
            "https://project.supabase.co/rest/v1/cuts"
        );
    }

    #[test]
    fn join_passes_through_absolute_urls() {
        let client = PostgrestClient::new("https://project.supabase.co", "key", "token").unwrap();
        assert_eq!(
            client.join("https://other.supabase.co/rest/v1/cuts"),
            "https://other.supabase.co/rest/v1/cuts"
        );
    }

    #[test]
    fn rejects_header_unsafe_apikey() {
        // HTTP forbids CR/LF in header values. reqwest's HeaderValue
        // parser rejects them; we surface that as our own error.
        let err = PostgrestClient::new("https://project.supabase.co", "key\nwith-newline", "token");
        assert!(matches!(err, Err(PostgrestError::ApiError { .. })));
    }

    #[test]
    fn extracts_pg_code_from_typical_error_body() {
        // Shape PostgREST actually returns — verified against Supabase
        // on a unique-constraint violation.
        let body = r#"{"code":"23505","details":"Key (name)=(X) already exists.","hint":null,"message":"duplicate key"}"#;
        assert_eq!(extract_pg_code(body), Some("23505".to_string()));
    }

    #[test]
    fn extracts_pg_code_returns_none_for_non_json() {
        assert_eq!(extract_pg_code("not json at all"), None);
    }

    #[test]
    fn extracts_pg_code_returns_none_when_absent() {
        assert_eq!(extract_pg_code(r#"{"message":"oops"}"#), None);
    }
}
