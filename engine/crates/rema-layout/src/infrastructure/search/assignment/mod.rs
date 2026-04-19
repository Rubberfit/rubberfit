// engine/crates/rema-layout/src/infrastructure/search/assignment/mod.rs
//
// Bin-assignment heuristics. Decides which items go to which bin
// BEFORE the per-bin GLS optimize runs. Task 10 introduces FFD
// (First-Fit-Decreasing); Task 11 will add `cross_bin_swap` as a
// sibling; future variants (BFD, shelf) slot in here.

pub mod ffd;
