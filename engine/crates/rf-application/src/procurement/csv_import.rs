//! CSV inventory import (S3c Task 8).
//!
//! Two surfaces: the dedicated import page sends reviewed JSON rows
//! after the user edits them in a browser table, and the inventory
//! page quick-upload sends raw CSV bytes. Both end up calling
//! `CsvImportPort::insert_rows` — the difference is whether the
//! Rust layer does the parsing.
//!
//! CSV format follows the TS `CsvService`:
//! - Header row lowercased, whitespace → underscore.
//! - Required fields: material_type, width, length, thickness.
//! - Optional: color, location, supplier, cost_per_sqft,
//!   date_received, notes.
//! - No quoting / escaping (matches TS — simple comma split).
//!   Embedded commas break. If we ever care about real RFC-4180,
//!   swap to a `csv` crate adapter; for now the simple path keeps
//!   TS parity.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::CsvImportRow;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Per-row error surfaced in the receipt. `row_number` is 1-indexed
/// over the caller's input so the UI can highlight the offending
/// row (for CSV uploads the header sits at row 1 and data starts at
/// row 2; we report the data row number).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRowError {
    pub row_number: usize,
    pub message: String,
}

/// Response shape — matches the TS `{ success, count, skipped,
/// errors }` the UI already consumes. `imported` is the count of
/// rolls actually inserted; `skipped` is the count of rows the
/// server dropped (e.g., unknown material auto-create failed);
/// `errors` lists every failure with its row number.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportReceipt {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<ImportRowError>,
}

/// Port for the inventory import. Takes fully-validated rows and
/// inserts them into `rolls`, auto-creating missing
/// `material_types` rows by name (matches TS behavior). Partial
/// failure is permitted — the adapter continues past a single-row
/// insert error and records it in the receipt.
#[async_trait]
pub trait CsvImportPort: Send + Sync {
    async fn insert_rows(&self, rows: &[CsvImportRow]) -> Result<ImportReceipt, AppError>;
}

/// Parse a CSV byte buffer into `CsvImportRow`s. Simple
/// line-split + comma-split parser matching the TS service (no
/// quoting, no escaped commas).
///
/// Errors propagate from:
/// - Missing header row (0 or 1 lines total).
/// - Missing required columns.
/// - Non-numeric width / length / thickness / cost_per_sqft.
///
/// Individual row errors surface as `ImportRowError`s — they don't
/// abort the whole parse; they're recorded and skipped. The parser
/// returns a pair: the successfully-parsed rows AND the accumulated
/// errors. The caller (use case) decides whether to proceed with
/// the partial set or fail.
pub fn parse_csv_bytes(bytes: &[u8]) -> Result<(Vec<CsvImportRow>, Vec<ImportRowError>), AppError> {
    let text = std::str::from_utf8(bytes)
        .map_err(|e| AppError::InvalidInput(format!("CSV is not valid UTF-8: {e}")))?;
    let mut lines = text.trim().lines();
    let header_line = lines.next().ok_or_else(|| {
        AppError::InvalidInput(
            "CSV file must have a header row and at least one row of data".into(),
        )
    })?;
    let headers: Vec<String> = header_line
        .split(',')
        .map(|h| h.trim().to_lowercase().replace(char::is_whitespace, "_"))
        .collect();

    // Resolve header positions once up front. Unknown columns are
    // silently ignored (matches TS — the object is indexed by name
    // and extra columns just don't map anywhere).
    let pos = |name: &str| headers.iter().position(|h| h == name);
    let material_type_col = pos("material_type").ok_or_else(|| {
        AppError::InvalidInput("CSV must include a `material_type` column".into())
    })?;
    let width_col = pos("width")
        .ok_or_else(|| AppError::InvalidInput("CSV must include a `width` column".into()))?;
    let length_col = pos("length")
        .ok_or_else(|| AppError::InvalidInput("CSV must include a `length` column".into()))?;
    let thickness_col = pos("thickness")
        .ok_or_else(|| AppError::InvalidInput("CSV must include a `thickness` column".into()))?;

    let mut rows: Vec<CsvImportRow> = Vec::new();
    let mut errors: Vec<ImportRowError> = Vec::new();

    for (idx, raw) in lines.enumerate() {
        // 1-indexed data-row count for the UI; header is row 1 so
        // first data row is row 2.
        let row_number = idx + 2;
        if raw.trim().is_empty() {
            continue;
        }
        let values: Vec<&str> = raw.split(',').map(|v| v.trim()).collect();
        if values.len() != headers.len() {
            errors.push(ImportRowError {
                row_number,
                message: format!("expected {} columns, got {}", headers.len(), values.len()),
            });
            continue;
        }

        let material_type = values[material_type_col].to_string();
        if material_type.is_empty() {
            errors.push(ImportRowError {
                row_number,
                message: "material_type is required".into(),
            });
            continue;
        }
        let width = match values[width_col].parse::<f64>() {
            Ok(v) if v.is_finite() && v > 0.0 => v,
            _ => {
                errors.push(ImportRowError {
                    row_number,
                    message: "width must be a positive number".into(),
                });
                continue;
            }
        };
        let length = match values[length_col].parse::<f64>() {
            Ok(v) if v.is_finite() && v > 0.0 => v,
            _ => {
                errors.push(ImportRowError {
                    row_number,
                    message: "length must be a positive number".into(),
                });
                continue;
            }
        };
        let thickness = match values[thickness_col].parse::<f64>() {
            Ok(v) if v.is_finite() && v > 0.0 => v,
            _ => {
                errors.push(ImportRowError {
                    row_number,
                    message: "thickness must be a positive number".into(),
                });
                continue;
            }
        };

        // Optional fields. cost_per_sqft parses as f64; others as
        // plain strings.
        let cost_per_sqft = pos("cost_per_sqft").and_then(|i| {
            let raw = values.get(i)?.trim();
            if raw.is_empty() {
                return None;
            }
            raw.parse::<f64>()
                .ok()
                .filter(|v| v.is_finite() && *v >= 0.0)
        });
        let color = optional_string(&values, pos("color"));
        let location = optional_string(&values, pos("location"));
        let supplier = optional_string(&values, pos("supplier"));
        let date_received = optional_string(&values, pos("date_received"));
        let notes = optional_string(&values, pos("notes"));

        rows.push(CsvImportRow {
            // material_type_id stays None at parse — the adapter
            // resolves / auto-creates by name.
            material_type_id: None,
            material_type,
            width,
            length,
            thickness,
            color,
            location,
            date_received,
            supplier,
            cost_per_sqft,
            notes,
        });
    }

    Ok((rows, errors))
}

fn optional_string(values: &[&str], idx: Option<usize>) -> Option<String> {
    idx.and_then(|i| values.get(i))
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Use case for JSON-reviewed rows (the dedicated import page).
/// Validates each row, rejects empty input, hands off to the port.
#[derive(Clone)]
pub struct ImportReviewedRowsUseCase {
    port: Arc<dyn CsvImportPort>,
}

impl ImportReviewedRowsUseCase {
    pub fn new(port: Arc<dyn CsvImportPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, rows: Vec<CsvImportRow>) -> Result<ImportReceipt, AppError> {
        if rows.is_empty() {
            return Err(AppError::InvalidInput(
                "rows must include at least one entry".into(),
            ));
        }
        for (idx, row) in rows.iter().enumerate() {
            validate_row(row, idx + 1)?;
        }
        self.port.insert_rows(&rows).await
    }
}

/// Use case for raw CSV bytes (the inventory page quick upload).
/// Parses up front, records per-row parse errors in the receipt,
/// sends the successfully-parsed rows through the same port.
#[derive(Clone)]
pub struct ImportCsvBytesUseCase {
    port: Arc<dyn CsvImportPort>,
}

impl ImportCsvBytesUseCase {
    pub fn new(port: Arc<dyn CsvImportPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, bytes: &[u8]) -> Result<ImportReceipt, AppError> {
        let (rows, parse_errors) = parse_csv_bytes(bytes)?;
        if rows.is_empty() {
            // All rows failed to parse — surface that as a
            // receipt with no inserts rather than a 500. UI can
            // show the per-row errors.
            return Ok(ImportReceipt {
                imported: 0,
                skipped: parse_errors.len(),
                errors: parse_errors,
            });
        }
        // Merge parse errors with insert errors so the receipt
        // gives the operator one unified list.
        let mut receipt = self.port.insert_rows(&rows).await?;
        receipt.errors.extend(parse_errors.iter().cloned());
        receipt.skipped += parse_errors.len();
        Ok(receipt)
    }
}

fn validate_row(row: &CsvImportRow, row_number: usize) -> Result<(), AppError> {
    if row.material_type.trim().is_empty() {
        return Err(AppError::InvalidInput(format!(
            "row {row_number}: material_type is required"
        )));
    }
    if !row.width.is_finite() || row.width <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "row {row_number}: width must be a positive finite number"
        )));
    }
    if !row.length.is_finite() || row.length <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "row {row_number}: length must be a positive finite number"
        )));
    }
    if !row.thickness.is_finite() || row.thickness <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "row {row_number}: thickness must be a positive finite number"
        )));
    }
    if let Some(c) = row.cost_per_sqft {
        if !c.is_finite() || c < 0.0 {
            return Err(AppError::InvalidInput(format!(
                "row {row_number}: cost_per_sqft must be non-negative"
            )));
        }
    }
    // material_type_id may come through pre-resolved from the
    // review page. If present, just sanity-check the newtype isn't
    // a blank string; UUID format is enforced by Postgres.
    if let Some(id) = &row.material_type_id {
        if id.0.trim().is_empty() {
            return Err(AppError::InvalidInput(format!(
                "row {row_number}: material_type_id must be a UUID or omitted"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn sample_row(name: &str) -> CsvImportRow {
        CsvImportRow {
            material_type_id: None,
            material_type: name.into(),
            width: 48.0,
            length: 600.0,
            thickness: 0.25,
            color: None,
            location: None,
            date_received: None,
            supplier: None,
            cost_per_sqft: None,
            notes: None,
        }
    }

    #[derive(Default)]
    struct FakePort {
        seen: Mutex<Vec<Vec<CsvImportRow>>>,
        next: Mutex<Option<ImportReceipt>>,
    }

    #[async_trait]
    impl CsvImportPort for FakePort {
        async fn insert_rows(&self, rows: &[CsvImportRow]) -> Result<ImportReceipt, AppError> {
            self.seen.lock().unwrap().push(rows.to_vec());
            Ok(self.next.lock().unwrap().take().unwrap_or(ImportReceipt {
                imported: rows.len(),
                skipped: 0,
                errors: Vec::new(),
            }))
        }
    }

    #[test]
    fn parse_rejects_empty_input() {
        let err = parse_csv_bytes(b"").unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[test]
    fn parse_rejects_missing_required_column() {
        let err = parse_csv_bytes(b"material_type,width\nNeoprene,48").unwrap_err();
        assert!(
            matches!(err, AppError::InvalidInput(ref msg) if msg.contains("length")),
            "expected message to mention the missing length column, got {err:?}"
        );
    }

    #[test]
    fn parse_ok_with_all_required_columns() {
        let csv = b"material_type,width,length,thickness,color\n\
                    Neoprene,48,600,0.25,Black";
        let (rows, errors) = parse_csv_bytes(csv).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(errors.is_empty());
        let row = &rows[0];
        assert_eq!(row.material_type, "Neoprene");
        assert_eq!(row.width, 48.0);
        assert_eq!(row.length, 600.0);
        assert_eq!(row.thickness, 0.25);
        assert_eq!(row.color.as_deref(), Some("Black"));
    }

    #[test]
    fn parse_records_per_row_errors_without_aborting() {
        let csv = b"material_type,width,length,thickness\n\
                    Neoprene,48,600,0.25\n\
                    BrokenRow,notanumber,600,0.25\n\
                    EPDM,36,400,0.125";
        let (rows, errors) = parse_csv_bytes(csv).unwrap();
        // Row 3 (data row 2) failed; rows 2 and 4 succeeded.
        assert_eq!(rows.len(), 2);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].row_number, 3);
        assert!(
            errors[0].message.contains("width"),
            "expected error to cite width, got {:?}",
            errors[0].message
        );
    }

    #[test]
    fn parse_skips_blank_lines() {
        let csv = b"material_type,width,length,thickness\n\n\
                    Neoprene,48,600,0.25\n";
        let (rows, errors) = parse_csv_bytes(csv).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(errors.is_empty());
    }

    #[test]
    fn parse_normalizes_header_whitespace() {
        // "Material Type" → "material_type", "Cost Per Sqft" →
        // "cost_per_sqft". The TS service does the same.
        let csv = b"Material Type,Width,Length,Thickness,Cost Per Sqft\n\
                    Neoprene,48,600,0.25,3.50";
        let (rows, _) = parse_csv_bytes(csv).unwrap();
        assert_eq!(rows[0].cost_per_sqft, Some(3.50));
    }

    #[test]
    fn parse_rejects_non_positive_numeric() {
        let csv = b"material_type,width,length,thickness\n\
                    Neoprene,0,600,0.25\n";
        let (rows, errors) = parse_csv_bytes(csv).unwrap();
        assert!(rows.is_empty());
        assert_eq!(errors[0].row_number, 2);
    }

    #[tokio::test]
    async fn reviewed_rows_rejects_empty_input() {
        let uc = ImportReviewedRowsUseCase::new(Arc::new(FakePort::default()));
        let err = uc.execute(Vec::new()).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn reviewed_rows_rejects_blank_material_type() {
        let uc = ImportReviewedRowsUseCase::new(Arc::new(FakePort::default()));
        let mut row = sample_row("");
        row.width = 48.0; // required positive; blank material only.
        let err = uc.execute(vec![row]).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn reviewed_rows_rejects_negative_width() {
        let uc = ImportReviewedRowsUseCase::new(Arc::new(FakePort::default()));
        let mut row = sample_row("Neoprene");
        row.width = -1.0;
        let err = uc.execute(vec![row]).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn reviewed_rows_happy_path_hits_port() {
        let port = Arc::new(FakePort::default());
        let uc = ImportReviewedRowsUseCase::new(port.clone());
        let r = uc.execute(vec![sample_row("Neoprene")]).await.unwrap();
        assert_eq!(r.imported, 1);
        let seen = port.seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].len(), 1);
    }

    #[tokio::test]
    async fn csv_bytes_merges_parse_errors_into_receipt() {
        let port = Arc::new(FakePort::default());
        *port.next.lock().unwrap() = Some(ImportReceipt {
            imported: 2,
            skipped: 0,
            errors: Vec::new(),
        });
        let uc = ImportCsvBytesUseCase::new(port);
        let csv = b"material_type,width,length,thickness\n\
                    Neoprene,48,600,0.25\n\
                    BadRow,nope,100,0.25\n\
                    EPDM,36,400,0.125";
        let receipt = uc.execute(csv).await.unwrap();
        assert_eq!(receipt.imported, 2);
        assert_eq!(receipt.skipped, 1);
        assert_eq!(receipt.errors.len(), 1);
        assert_eq!(receipt.errors[0].row_number, 3);
    }

    #[tokio::test]
    async fn csv_bytes_all_rows_bad_returns_zero_receipt() {
        let port = Arc::new(FakePort::default());
        let uc = ImportCsvBytesUseCase::new(port);
        let csv = b"material_type,width,length,thickness\n\
                    OnlyRow,nope,100,0.25";
        let r = uc.execute(csv).await.unwrap();
        assert_eq!(r.imported, 0);
        assert_eq!(r.skipped, 1);
        assert_eq!(r.errors.len(), 1);
    }
}
