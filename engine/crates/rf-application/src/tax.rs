//! Tax calculation port.
//!
//! S3c keeps tax as a proxy to the existing TS service rather than
//! a full Rust port. This preserves supplier override / tax-exempt
//! flag / ZIPTAX lookup / `upsert_cached_tax_rate` cache behavior
//! without doubling scope. The full port lives in S3d (see S3c
//! plan §"Tax calculation — proxy for S3c, full port in S3d").
//!
//! The port is defined here, at the application layer, so the PO
//! create/update use cases can call it without knowing whether the
//! adapter proxies HTTP to Next.js or hits Postgres directly.
//! That keeps the S3c → S3d transition a single adapter swap.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use rf_domain::SupplierId;

use crate::error::AppError;

/// Tax calculation result for a PO or PO-tax preview.
///
/// `tax_level` is one of `"state"`, `"city"`, `"zip_code"`,
/// `"default"`, `"api"`, `"exempt"`, or `"override"` — the same
/// tier strings the TS service emits. Treated as opaque at this
/// layer; the UI renders it alongside `tax_name` (e.g.
/// `"Texas State"`, `"Tax Exempt"`, `"Supplier Override Rate"`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxCalculation {
    pub tax_amount: f64,
    pub tax_rate: f64,
    pub tax_level: String,
    /// Human-readable label — rendered verbatim by the PO dialog's
    /// tax helper (`po-tax-helpers.ts`). Examples:
    /// `"Texas State"`, `"Tax Exempt"`, `"Supplier Override Rate"`.
    pub tax_name: String,
}

#[async_trait]
pub trait TaxPort: Send + Sync {
    /// Calculate tax for a PO from `supplier_id` + pre-tax subtotal.
    ///
    /// The proxy adapter (S3c) forwards to the TS `/api/tax/...`
    /// surface. The future full port (S3d) reads `tax_rates` +
    /// `suppliers` directly.
    async fn calculate_po_tax(
        &self,
        supplier_id: &SupplierId,
        subtotal: f64,
    ) -> Result<TaxCalculation, AppError>;
}
