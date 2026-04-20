//! HTTP handlers for the procurement surface (S3c).
//!
//! Per-aggregate submodules mirror the `rf-application::procurement`
//! layout. Today: `purchase_orders`, `po_items`. Later S3c tasks
//! add status transitions (Task 3), tax proxy (Task 4), receive flow
//! (Task 5), reorder (Tasks 6–7), and CSV import (Task 8). Each
//! submodule owns its DTOs, handlers, and `utoipa::path`
//! annotations; the parent re-exports everything the router needs.

pub mod create_reorder_po;
pub mod po_items;
pub mod purchase_orders;
pub mod receive;
pub mod reorder_rules;
pub mod status;
pub mod tax;

pub use create_reorder_po::{
    create_reorder_po_batch, create_reorder_po_bulk, create_reorder_po_row,
    CreateReorderPoBatchBody, CreateReorderPoBulkBody, CreateReorderPoRowBody,
    ReorderPoBatchItemBody, ReorderPoBulkItemBody, ReorderPoReceiptDto,
};
pub use reorder_rules::{
    create_reorder_rule, delete_reorder_rule, get_reorder_rule,
    list_reorder_rules, reorder_suggestions, update_reorder_rule,
    CreateReorderRuleBody, ReorderRuleDto, ReorderSuggestionDto,
    ReorderSuggestionsQuery, UpdateReorderRuleBody,
};

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
