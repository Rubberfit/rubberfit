# Tier 6: Tail-remnant preservation — research (Codex)

## Context

Task 19d just landed (`d0c0ecf`): we swapped `rectangle-pack` for
`bin-packing` v0.3.0 with `MaxRectsBestShortSideFit`. Verified results
on `/Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv`:

### Single-bin bench (`--bins 1`) — Rust now BEATS legacy

| Metric | Rust | Legacy |
|---|---:|---:|
| Placed | 13/37 | 33/37 |
| Fab Score | 71 | 57 |
| Reusable (sq in) | 4941 | 4063 |

### 2-bin bench (default) — Rust still LOSES to legacy

| Metric | Rust | Legacy |
|---|---:|---:|
| Placed | 37/37 | 37/37 |
| Fab Score | 46 | 52 |
| Reusable | 14292 | 16704 |
| Tail remnant (roll-2) | 0.01" | **125.63"** |
| Per-bin split | 12 / 25 | 33 / 4 |

The 2-bin loss is fully explained by **tail-remnant collapse**. Legacy
concentrates 33 parts onto roll-1 (using 388.5" of the 396" height,
leaving a 7.5" tail) and only puts 4 parts on roll-2 (using 270.38",
preserving a **125.63" full-width tail**). Rust spreads: 12 on roll-1,
25 on roll-2, both rolls used to ~396" height. Zero preserved tail.

## Your earlier Tier 6 recommendation

You wrote (`.claude/research/tiers-1-5/codex-report.md:1456`):

> **Tier 6 — Tail-remnant preservation.** Highest ROI. Optimize the
> least-loaded roll for minimal `occupiedHeight` and maximal full-width
> tail remnant. Scope: 250-500 LOC.

And (`:1459`):

> Tier 5 width-pair and Tier 3 targeted `0/90` rotation are both
> sub-techniques for last-bin compaction, not standalone business
> tiers.

I'm asking you to now write the actual spec + algorithm for Tier 6,
informed by the Task 19d numbers above. The naive "move items from
the last bin to earlier bins" doesn't work on this fixture because
**roll-1 is already at 396/396"** after bin-packing places its 12
big parts — no slack to accept migrants.

## Your job

Write `.claude/research/tier6-tail-remnant/codex-report.md`. ~2000-3500
words. Include:

### 1. Algorithm choice

The diagnosis above (roll-1 full at 12 parts) means simple "migrate
items from last bin to earlier bins via `bin_fits` probe" will fail —
the probe says "no, doesn't fit" because bin-packing's layout already
can't admit more.

Possible algorithms:

**A. Multi-candidate seed at FFD routing time.** Let FFD try multiple
routing strategies (e.g., stuff-first-bin-maximally vs spread vs
balanced) and pick the one with best tail-remnant metric. Expensive
but honest.

**B. Post-pack re-seed of last bin.** After FFD materializes, take
the last bin's items, remove them from the solution, try to re-add
them to earlier bins using a stronger multi-algorithm search (e.g.,
bin-packing's `Auto` mode instead of `MaxRectsBestShortSideFit`).
If more fit, commit.

**C. Dual-packer fallback.** Run bin-packing with BSSF as the primary.
If the result has a non-trivial last-bin height, re-run the ENTIRE
job with `MaxRectsBottomLeft` or `Skyline` on bin-1 specifically.
Keep whichever distribution minimizes last-bin height.

**D. Explicit consolidation operator.** Add a new move operator
alongside `swap_two`, `migrate`, `unload_lightest_bin` that tries to
take the K last-bin items with lowest area and force them onto
earlier bins by re-packing the WHOLE bin with the accepted items +
new ones. Expensive but thorough.

**E. Next-fit-decreasing re-seeding.** Scrap FFD per-item-probe for
heterogeneous bins. Instead: sort items area-desc, pack all into bin-1
using `bin-packing Auto` with `multistart_runs=N`, spill overflow
to bin-2. Much less routing logic; more compute per seed.

Pick the best, argue why. Be concrete about the complexity trade-offs
against the FFD architecture in
`engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`.

### 2. Integration point

Where does this hook?

- `warm_start.rs::greedy_rectangle_pack` (per-bin call, too granular)?
- `ffd.rs::ffd_assign` (FFD routing, where bins are chosen)?
- `multi.rs::optimize_multi_with_hooks` (multi-bin orchestrator, post-FFD)?
- `cross_bin_swap.rs` (new operator alongside existing three)?

Answer with file paths + line numbers.

### 3. Scoring / acceptance

The current lex score is `(closed_bins, concentration)` in
`cross_bin_swap.rs:36`. Does this reward tail preservation? Probably
not — "concentration" already tends toward one, but the specific
shape matters. Propose the minimal score extension (if any) to get
the compaction to accept preserving a tail.

### 4. Runtime implications

bin-packing's BSSF on a 37-part fixture takes ~300ms via FFD's many
probes. If Tier 6 adds a multi-start or re-pack pass, wall-clock could
balloon. Propose a runtime bound (e.g., 1000ms for 2-bin jobs) and
argue feasibility.

### 5. Parity risk

`tests/packing/parity/parity.test.ts` enforces
`rust.placedCount >= legacy.placedCount` and per-bin efficiency
within 1%. Any risk the consolidation pass could DROP a placement
(e.g., by re-packing and having items not re-fit)? How do we guard?

### 6. Scope + commit strategy

How many LOC realistically? One commit or split? What's the first
tractable sub-step so we can bench as we go?

### Files to read first

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — current
  bin-packing integration (Task 19d).
- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`
  — FFD routing.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
  — existing operator ladder + lex score.
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs` —
  orchestrator.
- `tools/bench-production/bench.ts` — bench harness (already extended
  in Task 19d with reusable / tail-remnant / Fab Score metrics).
- `.claude/research/tiers-1-5/codex-report.md` — your original report.
- `.claude/research/19d-packer-choice/decision.md` — Task 19d decision
  + actual measured results.

No code modifications.
