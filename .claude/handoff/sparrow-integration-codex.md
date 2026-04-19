# Sparrow integration scoping — Codex

## Context

Tier 6 just landed (`d4378c7`). Measured the 2-bin production gap vs
legacy:

| Metric | Rust (post-Tier 6) | Legacy |
|---|---:|---:|
| Placed (roll-1 / roll-2) | 13 / 24 | 33 / 4 |
| Fab Score | 46 | 52 |
| Tail remnant roll-2 | 0.01" | 125.63" |
| Reusable area | 14293 | 16704 |

The bench proved the remaining gap is NOT control-flow (Tier 6 fixed
that) but a hard capacity ceiling: `bin-packing` 0.3.0's MaxRects
heuristic family can fit at most ~13 parts on a single 78×396 roll
with this multiset, regardless of strategy (BSSF, BottomLeft, Auto,
or Multistart). Legacy's NFP engine fits 33. Different algorithm
family.

Your Tier 6 report mentioned sparrow as an option but deferred it.
Gemini's Task 19d report called sparrow "the endgame" packer for
REMA. Time to scope whether it's actually the right move.

## Your job

Don't write code. Write a decision memo:
`.claude/research/sparrow-integration/codex-report.md`, 1500-2500 words.

### Required sections

1. **Is sparrow applicable to REMA's BPP problem?** Sparrow is an SPP
   solver (strip packing — single container, minimize length used).
   REMA is BPP (multiple bins, minimize bin count / preserve remnants).
   Can we adapt sparrow as a warm-start for our 2-bin fixture, or
   does its architecture fundamentally not fit?
2. **Sparrow + jagua-rs API surface.** jagua-rs 0.7.1 is already a dep
   (feature `bpp`). We already use its internals indirectly via our
   Tasks 5-13 sparrow GLS port. Is sparrow directly callable as a
   library, or is it a binary tool? What's the Rust API look like?
3. **Algorithm family.** Sparrow uses LNS (Large Neighborhood Search)
   + continuous rotation + NFP collision detection. Concretely, what
   does a sparrow pass look like from outside? Cost function,
   destroy-repair cycle, termination?
4. **Expected placement quality.** bin-packing fits 13/37 on a single
   78×396 roll; legacy fits 33. What should we reasonably expect
   sparrow to fit? Is closing the full 13→33 gap realistic with
   sparrow alone, or will it fit (say) 25-28 and still leave a gap?
5. **Integration scope.** Be concrete: LOC estimate for replacing
   the heterogeneous branch of `greedy_bottom_left`. What changes
   in the FFD probe flow (can sparrow be called as a probe, or is
   it too slow)? Does it play nice with the existing GLS search?
6. **Risks and blockers.**
   - Determinism: can sparrow produce bit-identical output under a
     fixed seed? Parity suite depends on this.
   - Runtime: sparrow's LNS is iterative; needs a budget. How does
     it degrade if budget is tight?
   - Rotation integration: we currently disable rotation in bin-packing
     for v1. Sparrow does continuous rotation natively. Does this
     break our `SeedPlacement.polygon` / `rotation_rad` contract with
     jagua downstream?
7. **Recommendation.** Go / no-go. If go, what's the minimum viable
   integration that proves value before committing to full replacement?

### Files to read first

- `engine/crates/rema-layout/Cargo.toml` — jagua-rs dep.
- `engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs` — how
  we currently interact with jagua.
- `engine/crates/rema-layout/src/infrastructure/search/gls/` — our
  earlier sparrow GLS port (separator.rs, compress.rs, explore.rs).
  We've already ported chunks of sparrow for SPP; know what's there.
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — current
  bin-packing integration (the replacement target).
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs` —
  multi-bin orchestrator.
- `.claude/research/tier6-tail-remnant/decision.md` — Tier 6 findings +
  why we can't close the gap in the current packer family.
- https://github.com/JeroenGar/sparrow — upstream source.
- https://github.com/JeroenGar/jagua-rs — already our dep.

### Sharpness I want

Be strict. The user is ready to invest in this if it's the right move,
but don't hand-wave. Specifically:

- If sparrow can't actually be called as a Rust library (e.g., it's a
  binary-only tool), say so up front.
- If sparrow fundamentally doesn't solve BPP (only SPP), say so.
- If the integration is more like 1500 LOC than 300, say so.
- If you'd recommend porting legacy's NFP instead of integrating
  sparrow, say that too.

Be the reviewer who caught that rectangle-pack 0.4.2 didn't implement
rotation despite claiming to. Same level of skepticism here.
