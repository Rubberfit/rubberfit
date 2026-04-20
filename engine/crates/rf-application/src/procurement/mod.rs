//! Procurement ports + use cases (S3c).
//!
//! One module per aggregate. Today: `purchase_orders`, `po_items`.
//! Later S3c tasks add `reorder` (Tasks 6–7), `csv_import` (Task 8),
//! and the receive-flow use case (Task 5). Each module owns:
//!
//! - a Port trait (abstract repository / RPC client) that
//!   `rf-supabase` implements against PostgREST,
//! - use-case orchestrators that handlers in `rf-api` instantiate
//!   per request.
//!
//! Task 1 scaffolded the module with no bodies. Tasks 2–8 fill them
//! in as each vertical slice lands.

pub mod po_items;
pub mod purchase_orders;
pub mod receive;

pub use receive::{
    ReceiveItem, ReceivePort, ReceivePurchaseOrderUseCase, ReceiveReceipt,
    ReceiveRollData,
};

pub use po_items::{
    AddPurchaseOrderItemUseCase, DeletePurchaseOrderItemUseCase,
    ListPurchaseOrderItemsUseCase, NewPurchaseOrderItem, PurchaseOrderItemPort,
    PurchaseOrderItemUpdate, UpdatePurchaseOrderItemUseCase,
};
pub use purchase_orders::{
    CreatePurchaseOrderUseCase, DeletePurchaseOrderUseCase, GetPurchaseOrderUseCase,
    ListPurchaseOrdersUseCase, NewPurchaseOrder, PurchaseOrderPort, PurchaseOrderUpdate,
    UpdatePurchaseOrderStatusUseCase, UpdatePurchaseOrderUseCase,
};
