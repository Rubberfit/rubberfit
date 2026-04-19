# jagua-rs 0.7.1 BPP Public API Surface

## Overview
Sparrow's `Separator` and `SeparatorWorker` operate exclusively on SPP (Strip Packing Problem). When porting to BPP (Bin Packing Problem), the API surface changes significantly due to multi-layout architecture.

## Sparrow SPP API Calls → BPP Equivalents

### SPProblem Methods

| Sparrow (SPP) | BPP Equivalent | Notes |
|---|---|---|
| `SPProblem::save() -> SPSolution` | `BPProblem::save() -> BPSolution` | ✓ Same semantics; saves all layouts |
| `SPProblem::restore(&SPSolution)` | `BPProblem::restore(&BPSolution) -> bool` | ✓ Returns `true` if layout keys changed |
| `SPProblem::layout` (field) | `BPProblem::layouts: SlotMap<LayKey, Layout>` | ⚠️ **CRITICAL CHANGE**: Multi-layout via SlotMap; no direct field access |
| `SPProblem::place_item(SPPlacement) -> PItemKey` | `BPProblem::place_item(BPPlacement) -> (LayKey, PItemKey)` | ⚠️ Returns both layout key and item key; requires `BPLayoutType` in placement |
| `SPProblem::remove_item(PItemKey) -> SPPlacement` | `BPProblem::remove_item(LayKey, PItemKey) -> BPPlacement` | ⚠️ Requires layout key; placement includes layout_id |
| `SPProblem::strip_width() -> f32` | **N/A** | ✗ No strip; BPP uses discrete bins |
| `SPProblem::change_strip_width()` | **N/A** | ✗ Not applicable; bins are fixed |

### SPSolution Methods

| Sparrow (SPP) | BPP Equivalent | Notes |
|---|---|---|
| `SPSolution::strip_width() -> f32` | **N/A** | ✗ No strip accessor in BPSolution |
| `SPSolution::density()` | `BPSolution::density(&BPInstance) -> f32` | ✓ Requires instance reference |
| `SPSolution::layout_snapshot` (field) | `BPSolution::layout_snapshots: SecondaryMap<LayKey, LayoutSnapshot>` | ⚠️ Multiple snapshots; SecondaryMap required |

### Instance & Layout Access

| Sparrow (SPP) | BPP Equivalent | Notes |
|---|---|---|
| `Instance::item(ItemId) -> &Item` | `BPInstance::item(usize) -> &Item` | ✓ Same; both implement `Instance` trait |
| `Layout::placed_items` (field) | `Layout::placed_items: SlotMap<PItemKey, PlacedItem>` | ✓ Same; public field on Layout |
| `CollisionTracker::new(&Layout)` | **N/A** | ✓ Already ported in sparrow; accepts any `&Layout` |

## Critical API Differences

### 1. **BPPlacement Structure**
```rust
pub struct BPPlacement {
    pub layout_id: BPLayoutType,  // Open(LayKey) or Closed { bin_id }
    pub item_id: usize,
    pub d_transf: DTransformation,
}
```
- Specifies **which layout** (or bin) to place in
- `BPLayoutType::Closed { bin_id }` triggers auto-creation of new layout in `place_item()`

### 2. **Multi-Layout Indexing**
```rust
pub struct BPProblem {
    pub layouts: SlotMap<LayKey, Layout>,  // Public field
    // ... other fields
}
```
- **No per-bin accessor method** like `get_layout(&mut self, LayKey) -> &mut Layout`
- Direct SlotMap access: `problem.layouts[lkey]` or `problem.layouts.get_mut(lkey)`
- Requires iterating `layouts.values()` or `layouts.iter()` to access all layouts

### 3. **Return Types**
- `BPProblem::place_item()` returns `(LayKey, PItemKey)` tuple
- Caller must track **both** keys to move/remove items later
- Contrast: SPP only needs `PItemKey`

### 4. **No Width Accessor**
- Sparrow calls `prob.strip_width()` for logging and assertions
- BPP solution has **no width metric**; use `layout_snapshots.values()` to iterate bins
- Bins are heterogeneous; no single "width"

## Gotchas & Porting Notes

1. **CollisionTracker Initialization**: Takes `&Layout`; must pass individual layout from `layouts[lkey]` after iterating

2. **Layout Mutability**: SlotMap public field allows direct `problem.layouts[lkey].placed_items` access; no encapsulation

3. **Item Move Semantics**: 
   - SPP: `remove(pk) -> SPPlacement`, then `place_item(placement) -> PItemKey`
   - BPP: `remove(lkey, pik) -> BPPlacement`, then `place_item(placement) -> (LayKey, PItemKey)`
   - Must handle **layout key reassignment** if layout auto-closes on last item removal

4. **restore() Returns bool**: Indicates layout structure changed; may require re-iterating layouts or resetting CollisionTracker state

5. **No Direct Layout Accessor Method**: Workaround is public `layouts` field; no controlled access pattern

## Types Required in Port

- `BPProblem`, `BPPlacement`, `BPSolution`, `BPInstance` from `jagua_rs::probs::bpp::entities`
- `LayKey` for layout indexing
- `BPLayoutType` enum for distinguishing open vs. closed layouts
- `Layout`, `LayoutSnapshot`, `PItemKey` from `jagua_rs::entities` (shared with SPP)

