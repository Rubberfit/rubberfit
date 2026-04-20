//! PostgREST-backed `CsvImportPort` (S3c Task 8).
//!
//! Two responsibilities in order:
//!
//! 1. Resolve / auto-create `material_types` rows by name. Any name
//!    already in the table gets reused; unknown names are inserted
//!    in a single batch so the subsequent rolls insert can point at
//!    real UUIDs. Matches the TS `uploadRolls` behavior.
//! 2. Batch-insert the roll rows. Partial failure is tolerated at
//!    the row level: we submit all rows in one call, and if the
//!    batch errors (e.g. CHECK constraint), we fall through to
//!    per-row inserts so successful rows still land and the
//!    receipt lists the offenders.
//!
//! `user_id` on rolls is NOT stamped here — the table's RLS + the
//! forwarded JWT handle scoping; S3b left `rolls.user_id` nullable
//! so matches the same shape as the roll CRUD endpoints.

use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{
    CsvImportPort, ImportReceipt, ImportRowError,
};
use rf_domain::CsvImportRow;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

pub struct SupabaseCsvImportRepository {
    client: PostgrestClient,
}

impl SupabaseCsvImportRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }

    /// Resolve `name → id` for the materials referenced by the
    /// import. Any missing names are inserted in one batch, and
    /// the returned map covers both pre-existing and newly
    /// created rows.
    async fn resolve_material_types(
        &self,
        names: &[&str],
    ) -> Result<HashMap<String, String>, AppError> {
        if names.is_empty() {
            return Ok(HashMap::new());
        }

        #[derive(Deserialize)]
        struct Row {
            id: String,
            name: String,
        }

        // Existing rows.
        let joined = names
            .iter()
            .map(|n| format!("\"{}\"", n.replace('\"', "")))
            .collect::<Vec<_>>()
            .join(",");
        let filter = format!("in.({})", joined);
        let query = [
            ("select", "id,name"),
            ("name", filter.as_str()),
        ];
        let existing: Vec<Row> = self
            .client
            .get("/rest/v1/material_types", &query)
            .await
            .map_err(AppError::infrastructure)?;
        let mut map: HashMap<String, String> =
            existing.into_iter().map(|r| (r.name, r.id)).collect();

        let missing: Vec<&str> = names
            .iter()
            .copied()
            .filter(|n| !map.contains_key(*n))
            .collect();
        if missing.is_empty() {
            return Ok(map);
        }

        // Batch-insert the new names. Rows we already created in a
        // prior iteration aren't re-inserted because the filter
        // `in.(...)` above already surfaced them. A rare race is
        // possible (another client inserts the same name between
        // our read and our write); the unique-name constraint
        // catches it and we re-resolve.
        #[derive(Serialize)]
        struct NewRow<'a> {
            name: &'a str,
        }
        let new_rows: Vec<NewRow<'_>> =
            missing.iter().map(|n| NewRow { name: n }).collect();
        match self
            .client
            .post::<_, Vec<Row>>("/rest/v1/material_types", &new_rows)
            .await
        {
            Ok(inserted) => {
                for row in inserted {
                    map.insert(row.name, row.id);
                }
            }
            Err(err) => {
                // If the error is a unique violation, a race
                // happened — re-read the table once and let the
                // final resolution win.
                if err.pg_code() == Some(PG_UNIQUE_VIOLATION) {
                    let retry: Vec<Row> = self
                        .client
                        .get("/rest/v1/material_types", &query)
                        .await
                        .map_err(AppError::infrastructure)?;
                    for row in retry {
                        map.insert(row.name, row.id);
                    }
                } else {
                    return Err(AppError::infrastructure(err));
                }
            }
        }

        Ok(map)
    }
}

#[derive(Serialize)]
struct RollInsertRow<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    material_type_id: Option<&'a str>,
    material_type: &'a str,
    width: f64,
    length: f64,
    thickness: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date_received: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    supplier: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cost_per_sqft: Option<f64>,
    remaining_length: f64,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
}

#[async_trait]
impl CsvImportPort for SupabaseCsvImportRepository {
    async fn insert_rows(
        &self,
        rows: &[CsvImportRow],
    ) -> Result<ImportReceipt, AppError> {
        if rows.is_empty() {
            return Ok(ImportReceipt {
                imported: 0,
                skipped: 0,
                errors: Vec::new(),
            });
        }

        // 1. Collect unique material names for the resolve step.
        //    Prefer the explicit `material_type_id` from the
        //    reviewed-rows path when present; only go to name
        //    resolution for the ones without an id.
        let mut names: HashSet<&str> = HashSet::new();
        for row in rows {
            if row.material_type_id.is_none() {
                names.insert(row.material_type.as_str());
            }
        }
        let names_vec: Vec<&str> = names.into_iter().collect();
        let name_to_id =
            self.resolve_material_types(&names_vec).await?;

        // 2. Build the batch insert payload. Rows whose material
        //    still doesn't resolve (e.g. empty name that slipped
        //    past validation) get dropped with a per-row error.
        let mut payload: Vec<RollInsertRow<'_>> = Vec::with_capacity(rows.len());
        let mut row_index_to_input: Vec<usize> = Vec::with_capacity(rows.len());
        let mut errors: Vec<ImportRowError> = Vec::new();

        for (idx, row) in rows.iter().enumerate() {
            let mt_id_ref: Option<&str> = match &row.material_type_id {
                Some(id) => Some(id.0.as_str()),
                None => match name_to_id.get(row.material_type.as_str()) {
                    Some(id) => Some(id.as_str()),
                    None => {
                        errors.push(ImportRowError {
                            row_number: idx + 1,
                            message: format!(
                                "could not resolve material_type `{}`",
                                row.material_type
                            ),
                        });
                        continue;
                    }
                },
            };
            payload.push(RollInsertRow {
                material_type_id: mt_id_ref,
                material_type: row.material_type.as_str(),
                width: row.width,
                length: row.length,
                thickness: row.thickness,
                color: row.color.as_deref(),
                location: row.location.as_deref(),
                date_received: row.date_received.as_deref(),
                supplier: row.supplier.as_deref(),
                cost_per_sqft: row.cost_per_sqft,
                // Matches TS: remaining_length seeded to length on
                // the fresh roll.
                remaining_length: row.length,
                status: "active",
                notes: row.notes.as_deref(),
            });
            row_index_to_input.push(idx);
        }

        if payload.is_empty() {
            return Ok(ImportReceipt {
                imported: 0,
                skipped: errors.len(),
                errors,
            });
        }

        // 3. Try the batch insert. On success the return
        //    representation gives us the count; on failure we fall
        //    through to per-row retries so partial success isn't
        //    lost.
        match self
            .client
            .post::<_, Vec<Value>>("/rest/v1/rolls", &payload)
            .await
        {
            Ok(rows_out) => Ok(ImportReceipt {
                imported: rows_out.len(),
                skipped: errors.len(),
                errors,
            }),
            Err(batch_err) => {
                // Per-row fallback — this keeps the batch from
                // being all-or-nothing when a single CHECK
                // violation would otherwise abort everything.
                let mut imported = 0usize;
                for (payload_idx, row) in payload.into_iter().enumerate() {
                    let input_idx = row_index_to_input[payload_idx];
                    match self
                        .client
                        .post::<_, Vec<Value>>("/rest/v1/rolls", &[row])
                        .await
                    {
                        Ok(_) => imported += 1,
                        Err(row_err) => errors.push(ImportRowError {
                            row_number: input_idx + 1,
                            message: map_row_error(&row_err),
                        }),
                    }
                }
                // If nothing succeeded AND the batch error isn't a
                // constraint violation (i.e. an infra failure),
                // surface it — otherwise return the receipt even
                // when imported == 0 so the UI can present the
                // per-row errors.
                if imported == 0 && !is_constraint_error(&batch_err) {
                    return Err(AppError::infrastructure(batch_err));
                }
                Ok(ImportReceipt {
                    imported,
                    skipped: errors.len(),
                    errors,
                })
            }
        }
    }
}

fn map_row_error(err: &PostgrestError) -> String {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => "duplicate value violates unique constraint".into(),
        Some(PG_FK_VIOLATION) => "referenced row is missing".into(),
        Some(PG_CHECK_VIOLATION) => "value violates check constraint".into(),
        _ => err.to_string(),
    }
}

fn is_constraint_error(err: &PostgrestError) -> bool {
    matches!(
        err.pg_code(),
        Some(PG_UNIQUE_VIOLATION) | Some(PG_FK_VIOLATION) | Some(PG_CHECK_VIOLATION)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_row_error_by_sqlstate() {
        let err = PostgrestError::ApiError {
            status: reqwest::StatusCode::BAD_REQUEST,
            body: "".into(),
            pg_code: Some(PG_CHECK_VIOLATION.into()),
        };
        assert_eq!(map_row_error(&err), "value violates check constraint");
        assert!(is_constraint_error(&err));
    }

    #[test]
    fn classifies_unknown_error_by_display() {
        let err = PostgrestError::ApiError {
            status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            body: "boom".into(),
            pg_code: None,
        };
        assert!(!is_constraint_error(&err));
        // Just make sure the fallback doesn't panic.
        let _ = map_row_error(&err);
    }
}
