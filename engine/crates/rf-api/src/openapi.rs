//! OpenAPI document assembly.
//!
//! The spec is served live at `/openapi.json` AND rendered to a
//! committed `openapi.json` by the `dump-openapi` binary. CI asserts
//! no drift between the two.
//!
//! ## Structure
//!
//! Per-domain `OpenApi` structs — `CutsDoc`, `InventoryDoc`, … — are
//! merged into one document by [`build_doc`]. This keeps each struct
//! small and review-friendly; adding 16 inventory routes to a single
//! `#[openapi(paths(...))]` block would turn it into a wall of
//! imports. The `Modify` pass that installs the `supabase_jwt`
//! security scheme runs on the merged document so it applies globally.
//!
//! ## Adding a new route
//!
//! 1. Write the handler with `#[utoipa::path(...)]` + any DTOs with
//!    `#[derive(ToSchema)]`.
//! 2. Add the handler to the per-domain `OpenApi` struct (`CutsDoc`,
//!    `InventoryDoc`, or a new one if it's a new domain).
//! 3. Add any new DTOs to the domain's `components(schemas(...))`.
//! 4. Regenerate `openapi.json` with `npm run openapi:dump`.

use axum::response::IntoResponse;
use axum::Json;
use utoipa::openapi::security::{Http, HttpAuthScheme, SecurityScheme};
use utoipa::{Modify, OpenApi};

use crate::cuts::CutHistoryDto;
use crate::health::Health;

/// Adds the `supabase_jwt` bearer scheme to the merged document.
/// Applied once by [`build_doc`] — per-domain `OpenApi` structs
/// don't need to know about it.
pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "supabase_jwt",
            SecurityScheme::Http(
                Http::builder()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .description(Some(
                        "Supabase-issued RS256 JWT. Forwarded to PostgREST so RLS \
                         scopes rows to the caller.",
                    ))
                    .build(),
            ),
        );
    }
}

/// Meta/health surface. Tiny, but kept separate so the domain docs
/// don't need to know about `Health` or the `meta` tag.
#[derive(OpenApi)]
#[openapi(
    paths(crate::health::health),
    components(schemas(Health)),
    tags((name = "meta", description = "Service metadata + health")),
)]
pub struct MetaDoc;

/// Cut-history surface (S3a). Owns the `cuts` tag + `CutHistoryDto`.
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::cuts::list_history,
        crate::cuts::get_history_item,
        crate::cuts::list_favorites,
    ),
    components(schemas(CutHistoryDto)),
    tags((name = "cuts", description = "Cut-history + favorites")),
)]
pub struct CutsDoc;

/// Inventory surface (S3b). Empty until Task 2 — the struct exists
/// now so subsequent tasks only add `paths(...)` / `schemas(...)`
/// entries, not scaffolding.
#[derive(OpenApi)]
#[openapi(
    paths(),
    components(schemas()),
    tags((name = "inventory", description = "Rolls, material types, suppliers")),
)]
pub struct InventoryDoc;

/// Merge the per-domain docs into one, install the security scheme,
/// and stamp top-level `info` fields.
pub fn build_doc() -> utoipa::openapi::OpenApi {
    use utoipa::openapi::{InfoBuilder, LicenseBuilder};

    let mut doc = MetaDoc::openapi();
    doc.merge(CutsDoc::openapi());
    doc.merge(InventoryDoc::openapi());

    // utoipa's `.merge` preserves the destination's `info`, which
    // comes from MetaDoc. Override it here so the merged document
    // has the intended title + description + version + license.
    // The license block is what utoipa's derive-macro stamps by
    // default when a crate declares one in Cargo.toml — we replicate
    // it on the merged doc so `openapi.json` stays byte-stable.
    doc.info = InfoBuilder::new()
        .title("RF backend API")
        .version(env!("CARGO_PKG_VERSION"))
        .description(Some(
            "HTTP surface for the Rust RF backend. Frontend calls go \
             via Next.js route handlers at `/api/v2/*`, which bridge \
             the Supabase session cookie to a bearer JWT before \
             forwarding here.",
        ))
        .license(Some(
            LicenseBuilder::new()
                .name("MIT")
                .identifier(Some("MIT"))
                .build(),
        ))
        .build();

    SecurityAddon.modify(&mut doc);

    doc
}

/// Legacy re-export — keeps `pub use crate::openapi::ApiDoc` working
/// for anything external that grabbed it before the split.
/// Internal code should call [`build_doc`] directly.
pub struct ApiDoc;

impl ApiDoc {
    pub fn openapi() -> utoipa::openapi::OpenApi {
        build_doc()
    }
}

/// Serve the live OpenAPI document as JSON.
pub async fn openapi_json() -> impl IntoResponse {
    Json(build_doc())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merged_spec_lists_cut_history_routes() {
        let doc = build_doc();
        let paths = doc.paths.paths.keys().collect::<Vec<_>>();
        assert!(
            paths.iter().any(|p| p.as_str() == "/api/v2/cuts/history"),
            "expected /api/v2/cuts/history in spec — got {paths:?}"
        );
        assert!(
            paths
                .iter()
                .any(|p| p.as_str() == "/api/v2/cuts/history/{id}"),
            "expected /api/v2/cuts/history/{{id}} — got {paths:?}"
        );
        assert!(
            paths.iter().any(|p| p.as_str() == "/api/v2/cuts/favorites"),
            "expected /api/v2/cuts/favorites in spec — got {paths:?}"
        );
    }

    #[test]
    fn merged_spec_lists_health_route() {
        let doc = build_doc();
        assert!(
            doc.paths.paths.keys().any(|p| p.as_str() == "/health"),
            "expected /health in merged spec"
        );
    }

    #[test]
    fn merged_spec_registers_dto_schema() {
        let doc = build_doc();
        let components = doc.components.as_ref().expect("components present");
        assert!(
            components.schemas.contains_key("CutHistoryDto"),
            "expected CutHistoryDto in schemas — got {:?}",
            components.schemas.keys().collect::<Vec<_>>()
        );
        assert!(
            components.schemas.contains_key("Health"),
            "expected Health in schemas"
        );
    }

    #[test]
    fn merged_spec_declares_supabase_jwt_security_scheme() {
        let doc = build_doc();
        let components = doc.components.as_ref().expect("components present");
        assert!(
            components.security_schemes.contains_key("supabase_jwt"),
            "supabase_jwt security scheme should be registered"
        );
    }

    #[test]
    fn merged_spec_declares_all_domain_tags() {
        let doc = build_doc();
        let tag_names: Vec<&str> = doc
            .tags
            .as_ref()
            .map(|tags| tags.iter().map(|t| t.name.as_str()).collect())
            .unwrap_or_default();
        assert!(tag_names.contains(&"meta"), "tags: {tag_names:?}");
        assert!(tag_names.contains(&"cuts"), "tags: {tag_names:?}");
        assert!(tag_names.contains(&"inventory"), "tags: {tag_names:?}");
    }

    #[test]
    fn merged_spec_preserves_top_level_info() {
        let doc = build_doc();
        assert_eq!(doc.info.title, "RF backend API");
        assert_eq!(doc.info.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn merged_spec_serialises_to_json() {
        let doc = build_doc();
        let json = serde_json::to_string_pretty(&doc).expect("serialise spec");
        assert!(json.contains("\"openapi\""));
        assert!(json.contains("/api/v2/cuts/history"));
    }
}
