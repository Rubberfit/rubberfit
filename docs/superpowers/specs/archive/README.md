# Archived design specs

Pre-migration design documents preserved for historical context. These
specs guided the S1–S3 work that landed by the time the DDD migration
wrapped on 2026-05-16. They predate decisions that were later revised
(notably the Tauri-shell direction, which was abandoned in favour of
keeping Next.js + the Vercel Rust runtime).

Treat these as **historical record only** — they describe what the team
intended to build, not the current shape of the codebase. For the
current packing pipeline see [`engine/`](../../../../engine/) and
[`CLAUDE.md`](../../../../CLAUDE.md). For the current DDD architecture
see the catalogs under [`src/application/services/README.md`](../../../../src/application/services/README.md)
and [`src/entities/README.md`](../../../../src/entities/README.md).

## Files

| File                                              | Era    | What it covered                                                            |
| ------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| `2026-04-17-migration-overview-design.md`         | S0     | Top-level Tauri + Rust roadmap. Tauri direction later abandoned.           |
| `2026-04-17-s1-canonical-pipeline-design.md`      | S1     | Canonical TS packing pipeline refactor. Implemented; later superseded by Rust. |
| `2026-04-17-s2-rust-engine-design.md`             | S2     | First Rust nesting engine design. Implemented.                             |
| `2026-04-18-s2.5-rust-engine-design.md`           | S2.5   | Sparrow LNS+SA + time-budget modes + progress streaming. Implemented; streaming protocol later removed. |
| `2026-04-19-s3-rust-backend-design.md`            | S3     | Axum backend + Rust use-case ports + Supabase repositories. Implemented in `engine/crates/rf-*`. |
