//! OpenAPI document assembly.
//!
//! `ApiDoc` is the single place where we list every path + component
//! the Rust backend exposes. The spec is served live at
//! `/openapi.json` (so the frontend can refresh types mid-dev) AND
//! rendered to a committed `openapi.json` by the `dump-openapi`
//! binary (so CI can diff the committed copy against the generated
//! one and fail on drift).
//!
//! When you add a new handler, two edits land here:
//! 1. Import the handler into `paths(...)`.
//! 2. Import any new DTO into `schemas(...)`.
//!
//! utoipa picks up the `#[utoipa::path]` attributes at compile time.

use axum::response::IntoResponse;
use axum::Json;
use utoipa::openapi::security::{Http, HttpAuthScheme, SecurityScheme};
use utoipa::{Modify, OpenApi};

use crate::cuts::CutHistoryDto;
use crate::health::Health;

/// Adds the `supabase_jwt` bearer scheme to the document. utoipa has
/// no attribute-level way to declare a global security scheme, so it
/// goes through a `Modify` impl applied at derive time.
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

#[derive(OpenApi)]
#[openapi(
    info(
        title = "RF backend API",
        version = env!("CARGO_PKG_VERSION"),
        description = "HTTP surface for the Rust RF backend. Frontend calls go \
                       via Next.js route handlers at `/api/v2/*`, which bridge \
                       the Supabase session cookie to a bearer JWT before \
                       forwarding here.",
    ),
    paths(
        crate::health::health,
        crate::cuts::list_history,
        crate::cuts::get_history_item,
        crate::cuts::list_favorites,
    ),
    components(
        schemas(Health, CutHistoryDto)
    ),
    tags(
        (name = "meta", description = "Service metadata + health"),
        (name = "cuts", description = "Cut-history + favorites"),
    ),
    modifiers(&SecurityAddon),
)]
pub struct ApiDoc;

/// Serve the live OpenAPI document as JSON. Returning a pre-built
/// `serde_json::Value` keeps the handler trivially cloneable and
/// side-steps the need to regenerate the struct per request.
pub async fn openapi_json() -> impl IntoResponse {
    Json(ApiDoc::openapi())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_lists_cut_history_routes() {
        let doc = ApiDoc::openapi();
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
    fn spec_registers_dto_schema() {
        let doc = ApiDoc::openapi();
        let components = doc.components.as_ref().expect("components present");
        assert!(
            components.schemas.contains_key("CutHistoryDto"),
            "expected CutHistoryDto in schemas — got {:?}",
            components.schemas.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn spec_declares_supabase_jwt_security_scheme() {
        let doc = ApiDoc::openapi();
        let components = doc.components.as_ref().expect("components present");
        assert!(
            components.security_schemes.contains_key("supabase_jwt"),
            "supabase_jwt security scheme should be registered"
        );
    }

    #[test]
    fn spec_serialises_to_json() {
        let doc = ApiDoc::openapi();
        let json = serde_json::to_string_pretty(&doc).expect("serialise spec");
        assert!(json.contains("\"openapi\""));
        assert!(json.contains("/api/v2/cuts/history"));
    }
}
