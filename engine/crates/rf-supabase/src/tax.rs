//! HTTP-proxy-backed `TaxPort` (S3c Task 4).
//!
//! S3c keeps the existing TS tax calculation as the source of truth
//! — supplier exempt flag, supplier override rate, ZIPTAX lookup,
//! the `tax_rates` cache. Re-porting all of that to Rust is S3d
//! territory.
//!
//! The adapter is a thin reqwest client that:
//!
//! 1. Forwards the caller's user JWT (received from the Axum auth
//!    middleware upstream) so the TS route can verify the same
//!    way Next.js would on any other authenticated call.
//! 2. Hits `GET <base>/api/internal/tax/po-preview?supplier_id=&subtotal=`.
//! 3. Maps the response body into `rf_application::tax::TaxCalculation`.
//!
//! Base URL comes from the `TAX_PROXY_BASE` env var (e.g.
//! `http://localhost:3000` in dev, an internal URL on Fly in prod).
//! No fallback — an unconfigured base is a fatal startup error at
//! the caller layer, matching how `SUPABASE_URL` is handled.

use async_trait::async_trait;
use reqwest::{Client, StatusCode, Url};
use rf_application::error::AppError;
use rf_application::tax::{TaxCalculation, TaxPort};
use rf_domain::SupplierId;
use serde::Deserialize;
use std::time::Duration;

/// TS-side response shape (matches
/// `src/application/services/tax.service.interface.ts::TaxCalculation`).
/// Rust's DTO projects out `tax_amount`, `tax_rate`, `tax_level`,
/// and `tax_name`; the TS shape also carries `subtotal` and `total`
/// which the client already has, so we drop them at the boundary.
#[derive(Debug, Deserialize)]
struct TsTaxCalculation {
    #[serde(rename = "taxAmount")]
    tax_amount: f64,
    #[serde(rename = "taxRate")]
    tax_rate: f64,
    #[serde(rename = "taxLevel")]
    tax_level: String,
    #[serde(rename = "taxName")]
    tax_name: String,
}

/// HTTP adapter. One per request — cheap to construct because
/// `reqwest::Client` uses an internal connection pool.
pub struct HttpTaxProxy {
    http: Client,
    base_url: String,
    user_jwt: String,
}

impl HttpTaxProxy {
    /// `base_url` must NOT carry a trailing slash; we stamp one
    /// via the path literal. `user_jwt` is the bearer token the
    /// auth middleware accepted upstream — we forward it verbatim
    /// to the TS route so the user-facing auth story is unchanged.
    pub fn new(base_url: impl Into<String>, user_jwt: impl Into<String>) -> Result<Self, AppError> {
        let http = Client::builder()
            // Tax lookup is synchronous on the PO write path — a
            // hung TS process would block every POST /api/v2/po.
            // 5s is generous for a DB read + in-process calc.
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(AppError::infrastructure)?;
        let base_url = base_url.into();
        if base_url.trim().is_empty() {
            return Err(AppError::Infrastructure(
                "TAX_PROXY_BASE must not be empty".into(),
            ));
        }
        // Strip trailing slashes so `{base}/api/internal/...`
        // joins correctly.
        let base_url = base_url.trim_end_matches('/').to_string();
        Ok(Self {
            http,
            base_url,
            user_jwt: user_jwt.into(),
        })
    }
}

#[async_trait]
impl TaxPort for HttpTaxProxy {
    async fn calculate_po_tax(
        &self,
        supplier_id: &SupplierId,
        subtotal: f64,
    ) -> Result<TaxCalculation, AppError> {
        if !subtotal.is_finite() || subtotal < 0.0 {
            return Err(AppError::InvalidInput(
                "subtotal must be a finite non-negative number".into(),
            ));
        }
        // Build the URL via `Url::parse_with_params` so `supplier_id`
        // is percent-encoded correctly — UUIDs are always URL-safe
        // today, but `SupplierId` is a `pub String` wrapper with no
        // UUID validation, so a future rogue value (dev fixture,
        // mis-typed column, corrupt import) can't silently corrupt
        // the upstream query. `f64` also round-trips through
        // `ToString` without locale surprises here (Rust uses `.`
        // regardless of locale) but goes through the same encoder
        // for consistency.
        let url = Url::parse_with_params(
            &format!("{}/api/internal/tax/po-preview", self.base_url),
            &[
                ("supplier_id", supplier_id.0.as_str()),
                ("subtotal", &subtotal.to_string()),
            ],
        )
        .map_err(AppError::infrastructure)?;
        let resp = self
            .http
            .get(url)
            .bearer_auth(&self.user_jwt)
            .send()
            .await
            .map_err(AppError::infrastructure)?;

        match resp.status() {
            s if s.is_success() => {
                let body: TsTaxCalculation = resp.json().await.map_err(AppError::infrastructure)?;
                Ok(TaxCalculation {
                    tax_amount: body.tax_amount,
                    tax_rate: body.tax_rate,
                    tax_level: body.tax_level,
                    tax_name: body.tax_name,
                })
            }
            StatusCode::UNAUTHORIZED => Err(AppError::Forbidden),
            StatusCode::BAD_REQUEST => {
                // Pull the error message if present so the caller
                // gets an actionable reason (e.g. "subtotal must be
                // a finite non-negative number" when we somehow
                // slipped past the is_finite check above).
                let body = resp.text().await.unwrap_or_default();
                Err(AppError::InvalidInput(body))
            }
            other => {
                // Bad gateway / upstream failure / unexpected 5xx
                // collapses to infrastructure; the caller renders
                // a generic 500 (or 502 at the handler boundary).
                let body = resp.text().await.unwrap_or_default();
                Err(AppError::Infrastructure(format!(
                    "tax proxy returned {other}: {body}"
                )))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_nan_subtotal_before_http() {
        let proxy = HttpTaxProxy::new("http://invalid.local", "jwt").unwrap();
        let err = proxy
            .calculate_po_tax(&SupplierId("sup-1".into()), f64::NAN)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn rejects_negative_subtotal_before_http() {
        let proxy = HttpTaxProxy::new("http://invalid.local", "jwt").unwrap();
        let err = proxy
            .calculate_po_tax(&SupplierId("sup-1".into()), -5.0)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn rejects_empty_base_url() {
        match HttpTaxProxy::new("", "jwt") {
            Ok(_) => panic!("expected error for empty base URL"),
            Err(err) => assert!(matches!(err, AppError::Infrastructure(_))),
        }
    }
}
