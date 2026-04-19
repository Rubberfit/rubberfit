//! Write the OpenAPI spec to stdout.
//!
//! Used two ways:
//!
//! 1. Local regeneration:
//!    `cargo run -p rf-api --bin dump-openapi > engine/crates/rf-api/openapi.json`
//! 2. CI drift check: regenerate to a temp file and `diff` against the
//!    committed copy; any diff fails the build (see the `test:openapi`
//!    npm script).
//!
//! Kept deliberately tiny so it stays fast in CI. No tokio, no tracing.

use rf_api::openapi::build_doc;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let doc = build_doc();
    let json = serde_json::to_string_pretty(&doc)?;
    println!("{json}");
    Ok(())
}
