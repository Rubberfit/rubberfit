//! HTTP handlers for the procurement surface (S3c).
//!
//! Per-aggregate submodules mirror the `rf-application::procurement`
//! layout. Today: `purchase_orders`, `po_items`. Later S3c tasks
//! add status transitions (Task 3), tax proxy (Task 4), receive flow
//! (Task 5), reorder (Tasks 6–7), and CSV import (Task 8). Each
//! submodule owns its DTOs, handlers, and `utoipa::path`
//! annotations; the parent re-exports everything the router needs.

pub mod po_items;
pub mod purchase_orders;
pub mod receive;
pub mod status;
pub mod tax;

pub use po_items::{
    add_po_item, delete_po_item, list_po_items, update_po_item,
    CreatePurchaseOrderItemBody, PurchaseOrderItemDto, UpdatePurchaseOrderItemBody,
};
pub use purchase_orders::{
    create_purchase_order, delete_purchase_order, get_purchase_order,
    list_purchase_orders, update_purchase_order, CreatePurchaseOrderBody,
    ListPurchaseOrdersQuery, PurchaseOrderDto, UpdatePurchaseOrderBody,
};
pub use receive::{
    receive_purchase_order, ReceiveItemBody, ReceivePurchaseOrderBody,
    ReceiveReceiptDto, ReceiveRollDataBody,
};
pub use status::{update_purchase_order_status, UpdatePurchaseOrderStatusBody};
pub use tax::{tax_preview, TaxPreviewDto, TaxPreviewQuery};
