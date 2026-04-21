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
use crate::inventory::{
    CreateMaterialSupplierBody, CreateMaterialTypeBody, CreateRollBody, CreateSupplierBody,
    InventoryGrowthDto, InventoryValueDto, LowStockCountDto, MaterialSupplierDto, MaterialTypeDto,
    RollDto, SupplierDto, UpdateMaterialSupplierBody, UpdateMaterialTypeBody, UpdateRollBody,
    UpdateSupplierBody,
};
use crate::procurement::{
    CreatePurchaseOrderBody, CreatePurchaseOrderItemBody, CreateReorderPoBatchBody,
    CreateReorderPoBulkBody, CreateReorderPoRowBody, CreateReorderRuleBody, ImportReceiptDto,
    ImportRollRowBody, ImportRollsBody, ImportRowErrorDto, PurchaseOrderDto, PurchaseOrderItemDto,
    ReceiveItemBody, ReceivePurchaseOrderBody, ReceiveReceiptDto, ReceiveRollDataBody,
    ReorderPoBatchItemBody, ReorderPoBulkItemBody, ReorderPoReceiptDto, ReorderRuleDto,
    ReorderSuggestionDto, TaxPreviewDto, UpdatePurchaseOrderBody, UpdatePurchaseOrderItemBody,
    UpdatePurchaseOrderStatusBody, UpdateReorderRuleBody,
};

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

/// Procurement surface (S3c). Task 2 adds PO + line-item CRUD; later
/// tasks add status transitions, tax proxy, receive flow, reorder
/// rules + suggestions, reorder→PO (3 paths), and CSV import.
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::procurement::purchase_orders::list_purchase_orders,
        crate::procurement::purchase_orders::get_purchase_order,
        crate::procurement::purchase_orders::create_purchase_order,
        crate::procurement::purchase_orders::update_purchase_order,
        crate::procurement::purchase_orders::delete_purchase_order,
        crate::procurement::status::update_purchase_order_status,
        crate::procurement::receive::receive_purchase_order,
        crate::procurement::tax::tax_preview,
        crate::procurement::reorder_rules::list_reorder_rules,
        crate::procurement::reorder_rules::get_reorder_rule,
        crate::procurement::reorder_rules::create_reorder_rule,
        crate::procurement::reorder_rules::update_reorder_rule,
        crate::procurement::reorder_rules::delete_reorder_rule,
        crate::procurement::reorder_rules::reorder_suggestions,
        crate::procurement::create_reorder_po::create_reorder_po_row,
        crate::procurement::create_reorder_po::create_reorder_po_batch,
        crate::procurement::create_reorder_po::create_reorder_po_bulk,
        crate::procurement::import::import_rolls_json,
        crate::procurement::import::import_rolls_csv,
        crate::procurement::po_items::list_po_items,
        crate::procurement::po_items::add_po_item,
        crate::procurement::po_items::update_po_item,
        crate::procurement::po_items::delete_po_item,
    ),
    components(schemas(
        PurchaseOrderDto,
        CreatePurchaseOrderBody,
        UpdatePurchaseOrderBody,
        UpdatePurchaseOrderStatusBody,
        TaxPreviewDto,
        ReceivePurchaseOrderBody,
        ReceiveItemBody,
        ReceiveRollDataBody,
        ReceiveReceiptDto,
        ReorderRuleDto,
        CreateReorderRuleBody,
        UpdateReorderRuleBody,
        ReorderSuggestionDto,
        CreateReorderPoRowBody,
        CreateReorderPoBatchBody,
        CreateReorderPoBulkBody,
        ReorderPoBatchItemBody,
        ReorderPoBulkItemBody,
        ReorderPoReceiptDto,
        ImportRollsBody,
        ImportRollRowBody,
        ImportReceiptDto,
        ImportRowErrorDto,
        PurchaseOrderItemDto,
        CreatePurchaseOrderItemBody,
        UpdatePurchaseOrderItemBody,
    )),
    tags((
        name = "procurement",
        description = "Purchase orders, reorder rules + suggestions, CSV import"
    )),
)]
pub struct ProcurementDoc;

/// Inventory surface (S3b). Material types land in Task 2;
/// suppliers, material-supplier links, and rolls join in Tasks 3-6.
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::inventory::material_types::list_material_types,
        crate::inventory::material_types::get_material_type,
        crate::inventory::material_types::create_material_type,
        crate::inventory::material_types::update_material_type,
        crate::inventory::material_types::delete_material_type,
        crate::inventory::suppliers::list_suppliers,
        crate::inventory::suppliers::get_supplier,
        crate::inventory::suppliers::create_supplier,
        crate::inventory::suppliers::update_supplier,
        crate::inventory::suppliers::delete_supplier,
        crate::inventory::material_suppliers::list_material_suppliers,
        crate::inventory::material_suppliers::get_material_supplier,
        crate::inventory::material_suppliers::create_material_supplier,
        crate::inventory::material_suppliers::update_material_supplier,
        crate::inventory::material_suppliers::delete_material_supplier,
        crate::inventory::rolls::list_rolls,
        crate::inventory::rolls::get_roll,
        crate::inventory::rolls::create_roll,
        crate::inventory::rolls::update_roll,
        crate::inventory::rolls::delete_roll,
        crate::inventory::stats::inventory_value,
        crate::inventory::stats::low_stock_count,
        crate::inventory::stats::inventory_growth,
        crate::inventory::stats::recent_rolls,
    ),
    components(schemas(
        MaterialTypeDto,
        CreateMaterialTypeBody,
        UpdateMaterialTypeBody,
        SupplierDto,
        CreateSupplierBody,
        UpdateSupplierBody,
        MaterialSupplierDto,
        CreateMaterialSupplierBody,
        UpdateMaterialSupplierBody,
        RollDto,
        CreateRollBody,
        UpdateRollBody,
        InventoryValueDto,
        LowStockCountDto,
        InventoryGrowthDto,
    )),
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
    doc.merge(ProcurementDoc::openapi());

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
    fn merged_spec_lists_procurement_routes() {
        let doc = build_doc();
        let paths = doc.paths.paths.keys().collect::<Vec<_>>();
        for expected in [
            "/api/v2/po",
            "/api/v2/po/{id}",
            "/api/v2/po/{po_id}/items",
            "/api/v2/po/{po_id}/items/{item_id}",
        ] {
            assert!(
                paths.iter().any(|p| p.as_str() == expected),
                "expected {expected} in procurement surface — got {paths:?}"
            );
        }
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
        assert!(tag_names.contains(&"procurement"), "tags: {tag_names:?}");
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
