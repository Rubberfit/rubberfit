//! PostgREST-backed `ReceivePort` (S3c Task 5).
//!
//! The `receive_purchase_order(po_id, items, user_id)` Postgres
//! function is the sole writer — this adapter posts to its RPC
//! endpoint, unpacks the JSONB result, and maps the RAISE
//! EXCEPTION messages to stable machine codes.
//!
//! Error mapping:
//!
//! | PG message             | AppError             |
//! |------------------------|----------------------|
//! | PO_NOT_FOUND           | Conflict("PO_NOT_FOUND") |
//! | PO_ALREADY_RECEIVED    | Conflict("PO_ALREADY_RECEIVED") |
//! | PO_NOT_ORDERABLE       | Conflict("PO_NOT_ORDERABLE (status=...)") |
//! | PO_ITEM_NOT_FOUND      | Conflict("PO_ITEM_NOT_FOUND (item_id=...)") |
//! | 23505 (UNIQUE)         | Conflict("DUPLICATE_VALUE") |
//! | 23514 (CHECK)          | Conflict("CHECK_VIOLATION") |
//! | 23503 (FK)             | Conflict("FK_VIOLATION_PARENT_MISSING") |
//! | anything else          | Infrastructure (opaque) |
//!
//! The HTTP boundary in rf-api turns each 409 code into
//! `{ "code": "..." }` JSON so the client can switch on the stable
//! SCREAMING_SNAKE identifier.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{ReceiveItem, ReceivePort, ReceiveReceipt};
use rf_domain::{PurchaseOrderId, RollId};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

/// Custom SQLSTATEs the receive RPC RAISEs — see the migration's
/// header comment. Matching on these instead of the error message
/// body keeps the mapping stable across PostgREST envelope changes
/// (e.g., if PostgREST starts pretty-printing `RAISE` output).
const PG_PO_NOT_FOUND: &str = "P0001";
const PG_PO_ALREADY_RECEIVED: &str = "P0002";
const PG_PO_NOT_ORDERABLE: &str = "P0003";
const PG_PO_ITEM_NOT_FOUND: &str = "P0004";

pub struct SupabaseReceiveRepository {
    client: PostgrestClient,
}

impl SupabaseReceiveRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct ReceiveRpcBody<'a> {
    po_id: &'a str,
    items: serde_json::Value,
    user_id: &'a str,
}

/// RPC return shape — matches the jsonb_build_object in
/// `receive_purchase_order`. Rust de-serializes in snake_case so
/// the DB and Rust domain stay in lockstep.
#[derive(Debug, Deserialize)]
struct ReceiveRpcResponse {
    po_id: String,
    items_received: i32,
    roll_ids: Vec<String>,
    partial_receipt: bool,
    #[serde(default)]
    completed_at: Option<String>,
}

#[async_trait]
impl ReceivePort for SupabaseReceiveRepository {
    async fn receive(
        &self,
        po_id: &PurchaseOrderId,
        items: &[ReceiveItem],
        user_id: &str,
    ) -> Result<ReceiveReceipt, AppError> {
        let body = ReceiveRpcBody {
            po_id: &po_id.0,
            items: json!(items),
            user_id,
        };
        match self
            .client
            .post::<_, ReceiveRpcResponse>(
                "/rest/v1/rpc/receive_purchase_order",
                &body,
            )
            .await
        {
            Ok(resp) => Ok(ReceiveReceipt {
                po_id: PurchaseOrderId(resp.po_id),
                items_received: resp.items_received,
                roll_ids: resp.roll_ids.into_iter().map(RollId).collect(),
                partial: resp.partial_receipt,
                completed_at: resp.completed_at,
            }),
            Err(err) => Err(map_receive_error(err)),
        }
    }
}

/// Maps a PostgREST error to a stable application-layer conflict
/// code. Every sentinel the RPC raises has its own SQLSTATE (P0001
/// through P0004), which the adapter matches on — unlike the
/// earlier substring-matching approach, this is robust to
/// PostgREST envelope reshapes.
///
/// SQLSTATE precedence matters: unique / FK / CHECK violations come
/// first because they represent a distinct class of failure (schema
/// constraint) from the domain sentinels, even if a RAISE message
/// happens to include one of their keywords in context.
fn map_receive_error(err: PostgrestError) -> AppError {
    let code = err.pg_code();
    match code {
        Some(PG_UNIQUE_VIOLATION) => return AppError::conflict("DUPLICATE_VALUE"),
        Some(PG_FK_VIOLATION) => {
            return AppError::conflict("FK_VIOLATION_PARENT_MISSING")
        }
        Some(PG_CHECK_VIOLATION) => return AppError::conflict("CHECK_VIOLATION"),
        Some(PG_PO_NOT_FOUND) => return AppError::conflict("PO_NOT_FOUND"),
        Some(PG_PO_ALREADY_RECEIVED) => {
            return AppError::conflict("PO_ALREADY_RECEIVED")
        }
        Some(PG_PO_NOT_ORDERABLE) => {
            // Echo the source status back to the UI so the dialog
            // can say "move the PO to ordered first" rather than
            // just "not orderable". The RAISE message format is
            // `PO_NOT_ORDERABLE (status=<src>)` — extract the
            // parenthesized suffix only to avoid trailing
            // PostgREST context.
            let suffix = extract_parens_suffix(&err.to_string(), "PO_NOT_ORDERABLE")
                .unwrap_or_default();
            return AppError::conflict(format!("PO_NOT_ORDERABLE{suffix}"));
        }
        Some(PG_PO_ITEM_NOT_FOUND) => {
            // Same pattern: scope the suffix to just the
            // parenthesized item_id so a client switch on
            // `code.startsWith("PO_ITEM_NOT_FOUND")` can read out
            // the id with a cheap regex.
            let suffix = extract_parens_suffix(&err.to_string(), "PO_ITEM_NOT_FOUND")
                .unwrap_or_default();
            return AppError::conflict(format!("PO_ITEM_NOT_FOUND{suffix}"));
        }
        _ => {}
    }

    AppError::infrastructure(err)
}

/// Given an error string like
/// `... PO_ITEM_NOT_FOUND (item_id=abc-123) additional context ...`
/// returns `" (item_id=abc-123)"` (including the leading space).
/// Only scans from the first occurrence of `sentinel`; bounds on
/// `(` → matching `)` so trailing context doesn't leak into the
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
    fn maps_po_already_received_from_sqlstate() {
        let err = api_err(
            r#"{"message":"PO_ALREADY_RECEIVED","code":"P0002"}"#,
            PG_PO_ALREADY_RECEIVED,
        );
        match map_receive_error(err) {
            AppError::Conflict(code) => assert_eq!(code, "PO_ALREADY_RECEIVED"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn maps_po_not_found_from_sqlstate() {
        let err = api_err(
            r#"{"message":"PO_NOT_FOUND","code":"P0001"}"#,
            PG_PO_NOT_FOUND,
        );
        match map_receive_error(err) {
            AppError::Conflict(code) => assert_eq!(code, "PO_NOT_FOUND"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn maps_po_not_orderable_with_status_suffix() {
        // Message embeds the source status; adapter extracts the
        // parenthesized portion only.
        let err = api_err(
            r#"{"message":"PO_NOT_ORDERABLE (status=draft)","code":"P0003"}"#,
            PG_PO_NOT_ORDERABLE,
        );
        match map_receive_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "PO_NOT_ORDERABLE (status=draft)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn maps_po_item_not_found_with_item_id_suffix() {
        let err = api_err(
            r#"{"message":"PO_ITEM_NOT_FOUND (item_id=abc-123)","code":"P0004"}"#,
            PG_PO_ITEM_NOT_FOUND,
        );
        match map_receive_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "PO_ITEM_NOT_FOUND (item_id=abc-123)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn po_item_not_found_suffix_bounds_to_parens() {
        // Simulate a PostgREST envelope that stuffs additional
        // context after the RAISE message. The suffix extractor
        // must cut at the closing `)` so trailing text doesn't leak
        // into the stable code.
        let err = api_err(
            r#"{"message":"PO_ITEM_NOT_FOUND (item_id=abc-123) in function receive_purchase_order","code":"P0004"}"#,
            PG_PO_ITEM_NOT_FOUND,
        );
        match map_receive_error(err) {
            AppError::Conflict(code) => {
                assert_eq!(code, "PO_ITEM_NOT_FOUND (item_id=abc-123)")
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn check_violation_wins_over_sentinel_match() {
        // 23514 should take precedence even if the message body
        // mentions another sentinel (defensive against PG error
        // details that include keywords from surrounding context).
        let err = api_err(
            r#"{"message":"PO_ALREADY_RECEIVED","code":"23514"}"#,
            "23514",
        );
        match map_receive_error(err) {
            AppError::Conflict(code) => assert_eq!(code, "CHECK_VIOLATION"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[test]
    fn unknown_errors_fall_through_to_infrastructure() {
        let err = PostgrestError::ApiError {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            body: r#"{"message":"something weird"}"#.into(),
            pg_code: None,
        };
        assert!(matches!(
            map_receive_error(err),
            AppError::Infrastructure(_)
        ));
    }
}
