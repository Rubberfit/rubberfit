//! PostgREST-backed implementation of `SupplierPort`.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::inventory::{NewSupplier, SupplierPort, SupplierUpdate};
use rf_domain::{Supplier, SupplierFilters, SupplierId};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";

pub struct SupabaseSupplierRepository {
    client: PostgrestClient,
}

impl SupabaseSupplierRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct NewSupplierRow<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    contact_person: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    address: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    city: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    zip_code: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    country: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    website: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tax_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payment_terms: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preferred: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
}

#[async_trait]
impl SupplierPort for SupabaseSupplierRepository {
    async fn list(
        &self,
        filters: &SupplierFilters,
    ) -> Result<Vec<Supplier>, AppError> {
        let mut query: Vec<(String, String)> = vec![
            ("select".into(), "*".into()),
            // Preferred first, then alphabetical — matches the
            // TS getAllSuppliersOrdered default + the suppliers page
            // ordering.
            ("order".into(), "preferred.desc,name.asc".into()),
        ];
        if let Some(active) = filters.active {
            query.push(("active".into(), format!("eq.{active}")));
        }
        if let Some(preferred) = filters.preferred {
            query.push(("preferred".into(), format!("eq.{preferred}")));
        }
        if let Some(search) = filters.search.as_deref() {
            let term = escape_ilike(search);
            query.push((
                "or".into(),
                format!(
                    "(name.ilike.*{term}*,contact_person.ilike.*{term}*,\
                     email.ilike.*{term}*,city.ilike.*{term}*)"
                ),
            ));
        }
        if let Some(limit) = filters.limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(offset) = filters.offset {
            query.push(("offset".into(), offset.to_string()));
        }
        let pairs: Vec<(&str, &str)> = query
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        self.client
            .get::<Vec<Supplier>>("/rest/v1/suppliers", &pairs)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(&self, id: &SupplierId) -> Result<Option<Supplier>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("select", "*"), ("id", id_filter.as_str()), ("limit", "1")];
        let mut rows: Vec<Supplier> = self
            .client
            .get::<Vec<Supplier>>("/rest/v1/suppliers", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn create(&self, new: &NewSupplier) -> Result<Supplier, AppError> {
        let row = NewSupplierRow {
            name: &new.name,
            contact_person: new.contact_person.as_deref(),
            email: new.email.as_deref(),
            phone: new.phone.as_deref(),
            address: new.address.as_deref(),
            city: new.city.as_deref(),
            state: new.state.as_deref(),
            zip_code: new.zip_code.as_deref(),
            country: new.country.as_deref(),
            website: new.website.as_deref(),
            tax_id: new.tax_id.as_deref(),
            payment_terms: new.payment_terms.as_deref(),
            rating: new.rating,
            preferred: new.preferred,
            active: new.active,
            notes: new.notes.as_deref(),
        };
        match self
            .client
            .post::<_, Vec<Supplier>>("/rest/v1/suppliers", &row)
            .await
        {
            Ok(mut rows) => rows
                .pop()
                .ok_or_else(|| AppError::infrastructure("insert returned empty array")),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn update(
        &self,
        id: &SupplierId,
        patch: &SupplierUpdate,
    ) -> Result<Option<Supplier>, AppError> {
        let mut body = Map::new();
        set_str(&mut body, "name", patch.name.clone().map(Some));
        set_str(&mut body, "contact_person", patch.contact_person.clone());
        set_str(&mut body, "email", patch.email.clone());
        set_str(&mut body, "phone", patch.phone.clone());
        set_str(&mut body, "address", patch.address.clone());
        set_str(&mut body, "city", patch.city.clone());
        set_str(&mut body, "state", patch.state.clone());
        set_str(&mut body, "zip_code", patch.zip_code.clone());
        set_str(&mut body, "country", patch.country.clone());
        set_str(&mut body, "website", patch.website.clone());
        set_str(&mut body, "tax_id", patch.tax_id.clone());
        set_str(&mut body, "payment_terms", patch.payment_terms.clone());
        set_f64(&mut body, "rating", patch.rating);
        set_str(&mut body, "notes", patch.notes.clone());
        if let Some(b) = patch.preferred {
            body.insert("preferred".into(), Value::Bool(b));
        }
        if let Some(b) = patch.active {
            body.insert("active".into(), Value::Bool(b));
        }

        if body.is_empty() {
            return self.get(id).await;
        }

        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .patch::<_, Vec<Supplier>>("/rest/v1/suppliers", &query, &Value::Object(body))
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn delete(&self, id: &SupplierId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<Supplier>>("/rest/v1/suppliers", &query)
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err)),
        }
    }
}

fn set_str(body: &mut Map<String, Value>, key: &str, field: Option<Option<String>>) {
    if let Some(v) = field {
        body.insert(
            key.into(),
            v.map(Value::String).unwrap_or(Value::Null),
        );
    }
}

fn set_f64(body: &mut Map<String, Value>, key: &str, field: Option<Option<f64>>) {
    if let Some(v) = field {
        body.insert(
            key.into(),
            v.and_then(serde_json::Number::from_f64)
                .map(Value::Number)
                .unwrap_or(Value::Null),
        );
    }
}

/// PostgREST's `or=` filter uses comma as a separator and `*` as a
/// wildcard — tokens in the search string that contain either would
/// break the parser. Strip both; the UI doesn't use them as literal
/// search characters today.
fn escape_ilike(search: &str) -> String {
    search.replace([',', '*'], "")
}

fn map_write_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_NAME"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_MATERIAL_SUPPLIERS_EXIST"),
        _ => AppError::infrastructure(err),
    }
}
