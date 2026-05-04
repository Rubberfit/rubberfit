//! PostgREST-backed `CreateReorderPoPort` (S3c Task 7).
//!
//! Forwards to `create_reorder_purchase_order` RPC. Error-code
//! mapping keys on SQLSTATE (P0010/P0011/P0012) — the migration
//! uses distinct codes per sentinel so the adapter doesn't have to
//! pattern-match message bodies.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{CreateReorderPoPort, ReorderPoItem, ReorderPoReceipt};
use rf_domain::{PurchaseOrderId, ReorderRuleId, SupplierId};
use serde::{Deserialize, Serialize};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";
const PG_RULE_NOT_FOUND: &str = "P0010";
const PG_RULE_INACTIVE: &str = "P0011";
const PG_SUPPLIER_NOT_FOUND: &str = "P0012";
const PG_DUPLICATE_RULE_IDS: &str = "P0013";

pub struct SupabaseCreateReorderPoRepository {
    client: PostgrestClient,
}

impl SupabaseCreateReorderPoRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct RpcBody<'a> {
    rule_ids: Vec<&'a str>,
    supplier_id: &'a str,
    items: serde_json::Value,
    user_id: &'a str,
    bulk: bool,
}

#[derive(Debug, Deserialize)]
struct RpcResponse {
    po_id: String,
    po_number: String,
    supplier_id: String,
    items_count: i32,
    subtotal: f64,
    rule_ids: Vec<String>,
    bulk: bool,
}

#[async_trait]
impl CreateReorderPoPort for SupabaseCreateReorderPoRepository {
    async fn call(
        &self,
        rule_ids: &[ReorderRuleId],
        supplier_id: &SupplierId,
        items: &[ReorderPoItem],
        user_id: &str,
        bulk: bool,
    ) -> Result<ReorderPoReceipt, AppError> {
        let body = RpcBody {
            rule_ids: rule_ids.iter().map(|r| r.0.as_str()).collect(),
            supplier_id: &supplier_id.0,
            items: serde_json::json!(items),
            user_id,
            bulk,
        };
        match self
            .client
            .post::<_, RpcResponse>("/rest/v1/rpc/create_reorder_purchase_order", &body)
            .await
        {
            Ok(resp) => Ok(ReorderPoReceipt {
                po_id: PurchaseOrderId(resp.po_id),
                po_number: resp.po_number,
                supplier_id: SupplierId(resp.supplier_id),
                items_count: resp.items_count,
                subtotal: resp.subtotal,
                rule_ids: resp.rule_ids.into_iter().map(ReorderRuleId).collect(),
                bulk: resp.bulk,
            }),
            Err(err) => Err(map_rpc_error(err)),
        }
    }
}

fn map_rpc_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_VALUE"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_PARENT_MISSING"),
        Some(PG_CHECK_VIOLATION) => AppError::conflict("CHECK_VIOLATION"),
        Some(PG_RULE_NOT_FOUND) => {
            // Echo the count suffix (`RULE_NOT_FOUND (requested=N, found=M)`)
            // so the UI can report which rules went missing between
            // the suggestion fetch and the create call.
            let suffix =
                extract_parens_suffix(&err.to_string(), "RULE_NOT_FOUND").unwrap_or_default();
            AppError::conflict(format!("RULE_NOT_FOUND{suffix}"))
        }
        Some(PG_RULE_INACTIVE) => {
            let suffix =
                extract_parens_suffix(&err.to_string(), "RULE_INACTIVE").unwrap_or_default();
            AppError::conflict(format!("RULE_INACTIVE{suffix}"))
        }
        Some(PG_SUPPLIER_NOT_FOUND) => {
            let suffix =
                extract_parens_suffix(&err.to_string(), "SUPPLIER_NOT_FOUND").unwrap_or_default();
            AppError::conflict(format!("SUPPLIER_NOT_FOUND{suffix}"))
        }
        Some(PG_DUPLICATE_RULE_IDS) => {
            let suffix =
                extract_parens_suffix(&err.to_string(), "DUPLICATE_RULE_IDS").unwrap_or_default();
            AppError::conflict(format!("DUPLICATE_RULE_IDS{suffix}"))
        }
        _ => AppError::infrastructure(err),
    }
}

/// Same helper shape as `receive.rs::extract_parens_suffix` —
/// extracts just the `(key=value)` portion from a RAISE message
/// so trailing PostgREST context doesn't leak into the stable
/// conflict code.
fn extract_parens_suffix(msg: &str, sentinel: &str) -> Option<String> {
    let tail = msg.split(sentinel).nth(1)?.trim_start();
    if !tail.starts_with('(') {
        return None;
    }
    let end = tail.find(')')?;
    Some(format!(" {}", &tail[..=end]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api_err(body: &str, code: &str) -> PostgrestError {
        PostgrestError::ApiError {
            status: reqwest::StatusCode::BAD_REQUEST,
            body: body.into(),
            pg_code: Some(code.into()),
        }
    }

    #[test]
    fn maps_rule_not_found_with_count_suffix() {
        let err = api_err(
            r#"{"message":"RULE_NOT_FOUND (requested=3, found=2)","code":"P0010"}"#,
            PG_RULE_NOT_FOUND,
        );
        match map_rpc_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "RULE_NOT_FOUND (requested=3, found=2)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn maps_rule_inactive() {
        let err = api_err(
            r#"{"message":"RULE_INACTIVE (count=1)","code":"P0011"}"#,
            PG_RULE_INACTIVE,
        );
        match map_rpc_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "RULE_INACTIVE (count=1)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn maps_supplier_not_found() {
        let err = api_err(
            r#"{"message":"SUPPLIER_NOT_FOUND (id=abc-123)","code":"P0012"}"#,
            PG_SUPPLIER_NOT_FOUND,
        );
        match map_rpc_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "SUPPLIER_NOT_FOUND (id=abc-123)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn maps_duplicate_rule_ids() {
        // RPC raises DUPLICATE_RULE_IDS (count=1) when the input
        // array has one repeated id. Adapter echoes the suffix so
        // the UI can say "you selected 1 rule twice".
        let err = api_err(
            r#"{"message":"DUPLICATE_RULE_IDS (count=1)","code":"P0013"}"#,
            PG_DUPLICATE_RULE_IDS,
        );
        match map_rpc_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "DUPLICATE_RULE_IDS (count=1)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn check_violation_takes_precedence_over_message() {
        let err = api_err(r#"{"message":"RULE_INACTIVE","code":"23514"}"#, "23514");
        match map_rpc_error(err) {
            AppError::Conflict(code) => assert_eq!(code, "CHECK_VIOLATION"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn unknown_errors_fall_through_to_infrastructure() {
        let err = PostgrestError::ApiError {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            body: r#"{"message":"weird"}"#.into(),
            pg_code: None,
        };
        assert!(matches!(map_rpc_error(err), AppError::Infrastructure(_)));
    }
}
