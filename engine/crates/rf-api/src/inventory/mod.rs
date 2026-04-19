//! HTTP handlers for the inventory surface (S3b).
//!
//! Per-aggregate submodules mirror the `rf-application::inventory`
//! layout. Each submodule owns its DTOs, handlers, and `utoipa::path`
//! annotations; the parent re-exports everything the router needs.

pub mod material_types;
pub mod suppliers;

pub use material_types::{
    create_material_type, delete_material_type, get_material_type,
    list_material_types, update_material_type, CreateMaterialTypeBody,
    MaterialTypeDto, UpdateMaterialTypeBody,
};
pub use suppliers::{
    create_supplier, delete_supplier, get_supplier, list_suppliers,
    update_supplier, CreateSupplierBody, ListSuppliersQuery, SupplierDto,
    UpdateSupplierBody,
};
