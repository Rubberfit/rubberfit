//! REMA application layer — Port trait definitions and use-case
//! orchestration for the Rust backend (S3).
//!
//! This crate sits between `rema-domain` (pure types, no I/O) and the
//! infrastructure / delivery layers (`rema-supabase`, `rema-api`).
//! Ports here are the abstractions the application depends on
//! ("here's what a PO repository looks like from the app's view");
//! `rema-supabase` will provide the concrete implementations.
//!
//! Use cases coordinate multiple Ports to fulfill a single business
//! intent (e.g. `ApprovePurchaseOrder` reads the PO, validates state
//! transitions, writes the update, fires notification events).
//!
//! Populating this crate with real Ports + use cases lands in S3a-S3d
//! as each aggregate migrates off the TS-side Supabase client.
//! See `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`.
