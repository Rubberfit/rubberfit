//! HTTP handlers for the inventory surface (S3b).
//!
//! Per-aggregate submodules mirror the `rf-application::inventory`
//! layout. Each submodule owns its DTOs, handlers, and `utoipa::path`
//! annotations; the parent re-exports everything the router needs.

pub mod material_suppliers;
pub mod material_types;
pub mod rolls;
pub mod suppliers;

pub use material_suppliers::{
    create_material_supplier, delete_material_supplier, get_material_supplier,
    list_material_suppliers, update_material_supplier, CreateMaterialSupplierBody,
    ListMaterialSuppliersQuery, MaterialSupplierDto, UpdateMaterialSupplierBody,
};
pub use material_types::{
    create_material_type, delete_material_type, get_material_type,
    list_material_types, update_material_type, CreateMaterialTypeBody,
    MaterialTypeDto, UpdateMaterialTypeBody,
};
pub use rolls::{
    create_roll, delete_roll, get_roll, list_rolls, update_roll, CreateRollBody,
    ListRollsQuery, RollDto, UpdateRollBody,
};
pub use suppliers::{
    create_supplier, delete_supplier, get_supplier, list_suppliers,
    update_supplier, CreateSupplierBody, ListSuppliersQuery, SupplierDto,
    UpdateSupplierBody,
};
