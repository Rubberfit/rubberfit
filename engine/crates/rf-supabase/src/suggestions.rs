//! PostgREST-backed `SuggestionReadsPort` (S3c Task 6).
//!
//! One adapter struct, five methods — each is a focused query
//! against a different table. The suggestion generator orchestrates
//! them; this file is the "what to ask Postgres for" layer.
//!
//! All queries run under the caller's JWT so RLS still scopes rows
//! to the authenticated user.

use std::collections::HashMap;

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{MaterialSupplierQuote, SuggestionReadsPort};
use rf_domain::{MaterialTypeId, SupplierId};
use serde::Deserialize;

use crate::postgrest::PostgrestClient;

pub struct SupabaseSuggestionReads {
    client: PostgrestClient,
}

impl SupabaseSuggestionReads {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

/// Row shape for the stock query — just the two columns we need.
#[derive(Debug, Deserialize)]
struct RollStockRow {
    material_type_id: Option<String>,
    width: f64,
    remaining_length: f64,
}

#[derive(Debug, Deserialize)]
struct CutsUsageAggregateRow {
    // PostgREST returns aggregates under the alias name we pass
    // in the select expression. `sum_sqft_used` keeps the column
    // self-descriptive in the wire shape.
    #[serde(default)]
    sum_sqft_used: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct PendingPoItemRow {
    material_type_id: String,
    quantity_sqft: f64,
}

#[derive(Debug, Deserialize)]
struct QuoteRow {
    material_type_id: String,
    supplier_id: String,
    cost_per_sqft: f64,
    preferred_supplier: bool,
    // Embedded via `supplier:suppliers(name)`.
    supplier: Option<QuoteSupplierInline>,
}

#[derive(Debug, Deserialize)]
struct QuoteSupplierInline {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MaterialFactsRow {
    id: String,
    name: String,
    #[serde(default)]
    default_cost: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct SupplierNameRow {
    name: String,
}

fn in_list(ids: &[MaterialTypeId]) -> String {
    // PostgREST `id=in.(uuid1,uuid2,...)` filter. Quotes aren't
    // needed for UUID values; we delegate sanitisation to the
    // caller (ids come from validated domain newtypes).
    let joined = ids
        .iter()
        .map(|id| id.0.as_str())
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({})", joined)
}

#[async_trait]
impl SuggestionReadsPort for SupabaseSuggestionReads {
    async fn current_stock_sqft(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, f64>, AppError> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let filter = in_list(ids);
        let query = [
            ("select", "material_type_id,width,remaining_length"),
            ("material_type_id", filter.as_str()),
            ("status", "eq.active"),
        ];
        let rows: Vec<RollStockRow> = self
            .client
            .get("/rest/v1/rolls", &query)
            .await
            .map_err(AppError::infrastructure)?;
        let mut totals: HashMap<MaterialTypeId, f64> = HashMap::new();
        for row in rows {
            if let Some(mt_id) = row.material_type_id {
                let entry = totals
                    .entry(MaterialTypeId(mt_id))
                    .or_insert(0.0);
                // sqft = width_in × length_in / 144
                *entry += row.width * row.remaining_length / 144.0;
            }
        }
        Ok(totals)
    }

    async fn average_daily_usage_sqft(&self) -> Result<f64, AppError> {
        // 90-day window matches the TS calc. Push the aggregate
        // into Postgres via PostgREST's `sum()` so the endpoint
        // doesn't pay O(cuts-in-last-90d) rows over the wire every
        // time. Returns a single-row array with one aliased column.
        let since = (chrono::Utc::now() - chrono::Duration::days(90))
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let created_filter = format!("gte.{}", since);
        let query = [
            ("select", "sum_sqft_used:total_sqft_used.sum()"),
            ("created_at", created_filter.as_str()),
        ];
        let mut rows: Vec<CutsUsageAggregateRow> = self
            .client
            .get("/rest/v1/cuts", &query)
            .await
            .map_err(AppError::infrastructure)?;
        let total = rows
            .pop()
            .and_then(|r| r.sum_sqft_used)
            .unwrap_or(0.0);
        Ok(total / 90.0)
    }

    async fn pending_quantities_sqft(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, f64>, AppError> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        // Pull all PO items for these materials where the parent
        // PO is NOT draft. PostgREST supports nested filters via
        // the embed-resource's own `!inner` join + `eq.`:
        //
        //   /purchase_order_items
        //     ?select=material_type_id,quantity_sqft,purchase_order!inner(status)
        //     &purchase_order.status=neq.draft
        //
        // We don't care about the nested `purchase_order.status`
        // value for the math — only that the join excludes draft.
        let filter = in_list(ids);
        let query = [
            (
                "select",
                "material_type_id,quantity_sqft,purchase_order:purchase_orders!inner(status)",
            ),
            ("material_type_id", filter.as_str()),
            ("purchase_order.status", "neq.draft"),
        ];
        let rows: Vec<PendingPoItemRow> = self
            .client
            .get("/rest/v1/purchase_order_items", &query)
            .await
            .map_err(AppError::infrastructure)?;
        let mut totals: HashMap<MaterialTypeId, f64> = HashMap::new();
        for row in rows {
            let entry = totals
                .entry(MaterialTypeId(row.material_type_id))
                .or_insert(0.0);
            *entry += row.quantity_sqft;
        }
        Ok(totals)
    }

    async fn material_supplier_quotes(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, Vec<MaterialSupplierQuote>>, AppError>
    {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let filter = in_list(ids);
        let query = [
            (
                "select",
                "material_type_id,supplier_id,cost_per_sqft,preferred_supplier,supplier:suppliers(name)",
            ),
            ("material_type_id", filter.as_str()),
            ("active", "eq.true"),
        ];
        let rows: Vec<QuoteRow> = self
            .client
            .get("/rest/v1/material_suppliers", &query)
            .await
            .map_err(AppError::infrastructure)?;
        let mut out: HashMap<MaterialTypeId, Vec<MaterialSupplierQuote>> =
            HashMap::new();
        for row in rows {
            let quote = MaterialSupplierQuote {
                supplier_id: SupplierId(row.supplier_id),
                supplier_name: row.supplier.and_then(|s| s.name),
                cost_per_sqft: row.cost_per_sqft,
                preferred: row.preferred_supplier,
            };
            out.entry(MaterialTypeId(row.material_type_id))
                .or_default()
                .push(quote);
        }
        Ok(out)
    }

    async fn material_type_facts(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, (String, Option<f64>)>, AppError> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let filter = in_list(ids);
        let query = [
            ("select", "id,name,default_cost"),
            ("id", filter.as_str()),
        ];
        let rows: Vec<MaterialFactsRow> = self
            .client
            .get("/rest/v1/material_types", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows
            .into_iter()
            .map(|r| (MaterialTypeId(r.id), (r.name, r.default_cost)))
            .collect())
    }

    async fn supplier_name(
        &self,
        id: &SupplierId,
    ) -> Result<Option<String>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [
            ("select", "name"),
            ("id", id_filter.as_str()),
            ("limit", "1"),
        ];
        let mut rows: Vec<SupplierNameRow> = self
            .client
            .get("/rest/v1/suppliers", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop().map(|r| r.name))
    }
}
