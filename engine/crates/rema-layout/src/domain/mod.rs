// engine/crates/rema-layout/src/domain/mod.rs
pub mod request;
pub mod result;

pub use request::{Bin, BinKind, GrainAxis, OperatorProfile, PackMode, PackRequest, Part, ShapeSpec, UnitSystem};
pub use request::{FAST_MS, BALANCED_MS, THOROUGH_MS};
pub use result::{BinResult, PackResult, Placement};
