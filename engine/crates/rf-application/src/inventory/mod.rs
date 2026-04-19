//! Inventory ports + use cases (S3b).
//!
//! One module per aggregate — `material_types`, `suppliers`,
//! `material_suppliers`, `rolls`. Each module owns:
//!
//! - a Port trait (the abstract repository) that `rf-supabase`
//!   implements against PostgREST,
//! - use-case orchestrators that handlers in `rf-api` instantiate
//!   per request.
//!
//! Aggregates are introduced one at a time by their respective
//! S3b tasks; the module is added here as each lands.

pub mod material_suppliers;
pub mod material_types;
pub mod suppliers;

pub use material_suppliers::{
    CreateMaterialSupplierUseCase, DeleteMaterialSupplierUseCase,
    GetMaterialSupplierUseCase, ListMaterialSuppliersUseCase,
    MaterialSupplierFilters, MaterialSupplierPort, MaterialSupplierUpdate,
    NewMaterialSupplier, UpdateMaterialSupplierUseCase,
};
pub use material_types::{
    CreateMaterialTypeUseCase, DeleteMaterialTypeUseCase, GetMaterialTypeUseCase,
    ListMaterialTypesUseCase, MaterialTypePort, MaterialTypeUpdate, NewMaterialType,
    UpdateMaterialTypeUseCase,
};
pub use suppliers::{
    CreateSupplierUseCase, DeleteSupplierUseCase, GetSupplierUseCase,
    ListSuppliersUseCase, NewSupplier, SupplierPort, SupplierUpdate,
    UpdateSupplierUseCase,
};
