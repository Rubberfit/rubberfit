// engine/crates/rema-layout/src/infrastructure/search/gls/mod.rs
//
// Guided Local Search machinery ported from sparrow (MIT, Jeroen Gardeyn,
// KU Leuven 2025, `ejor-snapshot` tag c95454e3).
//
// See <https://github.com/JeroenGar/sparrow/blob/ejor-snapshot/LICENSE> for
// the MIT license text reproduced in every ported file header below.
//
// Port scope:
//   Task 3 (this commit): consts, overlap_proxy, pair_matrix, quantify,
//     tracker. Keeps the tracker BPP-friendly — `Layout` is jagua-rs
//     feature-flag-free so none of the SPP-coupled coupling leaks in.
//   Task 4: sampling.
//   Task 5: separator (the inner loop workhorse).
//   Task 6: explore (penalty-weight phase).
//   Task 7: compress (polish phase).

pub mod consts;
pub mod overlap_proxy;
pub mod pair_matrix;
pub mod quantify;
pub mod tracker;
