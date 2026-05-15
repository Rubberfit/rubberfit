// engine/crates/rf-layout/src/domain/request.rs
use rf_geom::domain::{Point2D, Polygon};
use rf_geom::PolygonWithHoles;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BinKind {
    Fresh,
    Remnant,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum UnitSystem {
    #[default]
    #[serde(alias = "in", alias = "inches")]
    Inch,
    #[serde(alias = "millimeter", alias = "millimeters")]
    Mm,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bin {
    pub bin_id: String,
    pub width: f64,
    pub height: f64,
    pub kind: BinKind,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ShapeSpec {
    pub kind: String,
    pub params: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GrainAxis {
    Width,
    Length,
    None,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    pub shape_id: String,
    #[serde(alias = "demand")]
    pub quantity: u32,
    /// Polygon-with-holes in part-local coords (CCW outer, holes per
    /// PR 0b sanitation). Optional — when absent, the pack pipeline
    /// materializes the polygon from `shape_spec`.
    ///
    /// Backward-compat: requests built before PR 0a send `polygon: [...]`
    /// (flat point array). `deserialize_polygon_with_holes_compat`
    /// accepts both shapes and lifts the flat form to
    /// `PolygonWithHoles::simple(...)`.
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_polygon_with_holes_compat"
    )]
    pub polygon: Option<PolygonWithHoles>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub shape_spec: Option<ShapeSpec>,
    pub allow_rotation: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub grain_axis: Option<GrainAxis>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub difficulty: Option<f64>,
    /// Caller-owned opaque label echoed verbatim onto every
    /// `Placement` produced for this shape. Rubberfit-Desktop's
    /// AutoNest UI uses it to tag placements with a part number
    /// ("G2") or a generated letter ("A", "B", "C…"). Rust never
    /// inspects, mutates, or generates the value — it is held by
    /// reference and round-tripped to keep the TypeScript layer in
    /// sole ownership of the labelling scheme.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
}

/// Deserialize `Part.polygon` accepting either the legacy single-loop
/// flat array `[{x,y},...]` or the new structured form
/// `{ outer: [...], holes: [[...],...] }`. Returns `None` for `null`
/// or a missing field.
fn deserialize_polygon_with_holes_compat<'de, D>(
    deserializer: D,
) -> Result<Option<PolygonWithHoles>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Either {
        Structured(PolygonWithHoles),
        Flat(Vec<Point2D>),
    }
    let opt: Option<Either> = Option::deserialize(deserializer)?;
    match opt {
        None => Ok(None),
        Some(Either::Structured(p)) => Ok(Some(p)),
        Some(Either::Flat(points)) => {
            let polygon = Polygon::new(points).map_err(serde::de::Error::custom)?;
            Ok(Some(PolygonWithHoles::simple(polygon)))
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OperatorProfile {
    pub skills: Vec<String>,
    pub max_difficulty: f64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PackMode {
    Fast,
    Balanced,
    Thorough,
}

/// Which backend engine pack-cli should dispatch to.
///
/// - `Default` → `pack_lbf_lns`: polygon-aware LBF + LNS refinement.
/// - `Lbf`     → constructive LBF only.
/// - `Legacy`  → pre-Phase-3 `pack()` path; benches / debug only.
///
/// Request-level takes priority; when absent, pack-cli reads the
/// `RF_ENGINE` environment variable, then falls back to `Default`.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PackEngine {
    Default,
    Lbf,
    Legacy,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackRequest {
    pub bins: Vec<Bin>,
    #[serde(alias = "kerf", alias = "spacing")]
    pub clearance: f64,
    pub items: Vec<Part>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub operator_profile: Option<OperatorProfile>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mode: Option<PackMode>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub engine: Option<PackEngine>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub time_budget_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub improvement_budget_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seed: Option<u64>,
    #[serde(default)]
    pub units: UnitSystem,
    /// Strategy for cone (sector) polygon shape. None defaults to
    /// `ConeStrategyKind::AnnularSector` (high-fidelity render). Lets
    /// the caller A/B `convexWedge` vs `annularSector` without
    /// rebuilding — see `application::cone_strategy`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cone_strategy: Option<crate::application::cone_strategy::ConeStrategyKind>,
    /// Collision polygon for cone (sector) shapes. None defaults to
    /// `ConePackingMode::AnnularSector` so jagua collides on the
    /// actual cone outline and cones may nest into each other's
    /// concavities. Set `ConvexHull` to opt into the conservative
    /// hull-based packing.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cone_packing_mode: Option<crate::application::cone_strategy::ConePackingMode>,
    /// Which scrap-extraction pipeline runs post-pack. None defaults
    /// to `ScrapStrategyKind::TwoSignal` (Free Roam parity — emits
    /// per-part bbox-minus-polygon shape-trapped crescents in
    /// addition to the bin-level diff). Set `Legacy` for A/B
    /// comparison or rollback. See `application::scrap_strategy`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub scrap_strategy: Option<crate::application::scrap_strategy::ScrapStrategyKind>,
    /// Which offcut-extraction algorithm the active scrap pipeline
    /// uses to inscribe reusable rectangles in the bin's free space.
    /// None defaults to `OffcutExtractionStrategyKind::GreedyMaxRect`
    /// (current production behaviour: iterative greedy
    /// maximal-inscribed-rect, no merge or backtrack). Future variants
    /// (post-loop pairwise merge, stripe partition, all-maximal-rect
    /// enumeration) tracked in issue #14. See
    /// `application::offcut_extraction_strategy`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offcut_extraction_strategy:
        Option<crate::application::offcut_extraction_strategy::OffcutExtractionStrategyKind>,
    /// Option C toggle: when true (default), `pack_lbf_with_config`
    /// runs a deterministic rectangle warm-start before LBF samples,
    /// pre-placing every rect-shaped item via `BPProblem::place_item`
    /// so jagua's probabilistic sampler only has to find positions for
    /// non-rect items. Closes #18 (LBF tight-fit failures) and helps
    /// #17 (perf — rectangles skip LBF sampling).
    ///
    /// Set to false from the AutoNest UI for speed-comparison testing
    /// against the legacy probabilistic-only pipeline. None defaults to
    /// true (warm-start enabled).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub use_warm_start: Option<bool>,
}

pub const FAST_MS: u64 = 2_000;
pub const BALANCED_MS: u64 = 10_000;
pub const THOROUGH_MS: u64 = 30_000;

impl Part {
    /// Borrow the outer boundary of the materialized polygon. Panics
    /// if `polygon` is `None` — pack pipelines call
    /// `application::shape_builder::materialise_request_polygons` at
    /// entry, after which every part is guaranteed to have a polygon.
    pub fn outer_slice(&self) -> &[Point2D] {
        self.polygon
            .as_ref()
            .expect(
                "Part.polygon was None — orchestrator must call materialise_request_polygons \
                 before passing parts to search/jagua code",
            )
            .outer()
            .points()
    }

    /// Iterate hole boundaries. Empty for parts with no holes (rings,
    /// gaskets, full-face with bolts have holes; rectangles and discs
    /// do not).
    pub fn holes_iter(&self) -> impl Iterator<Item = &[Point2D]> {
        self.polygon
            .as_ref()
            .expect(
                "Part.polygon was None — orchestrator must call materialise_request_polygons \
                 before passing parts to search/jagua code",
            )
            .holes()
            .iter()
            .map(|h| h.points())
    }

    /// Back-compat alias for `outer_slice`. Existing callsites can
    /// migrate incrementally; new code should use `outer_slice` or
    /// `holes_iter`. Removed in Task 3 once all callers are migrated.
    #[deprecated(since = "0.0.0-pr-0a", note = "use outer_slice() or holes_iter()")]
    pub fn polygon_slice(&self) -> &[Point2D] {
        self.outer_slice()
    }
}

impl PackRequest {
    pub fn resolved_time_budget_ms(&self) -> u64 {
        if let Some(ms) = self.time_budget_ms {
            return ms;
        }
        match self.mode {
            Some(PackMode::Fast) => FAST_MS,
            Some(PackMode::Thorough) => THOROUGH_MS,
            Some(PackMode::Balanced) | None => BALANCED_MS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
        "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
        "clearance":0.125,
        "items":[{"shapeId":"rect-a","quantity":1,"polygon":[{"x":0,"y":0},{"x":24,"y":0},{"x":24,"y":12},{"x":0,"y":12}],"allowRotation":true}],
        "mode":"fast",
        "seed":42
    }"#;

    #[test]
    fn deserializes_s1_fixture() {
        let req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(req.bins.len(), 1);
        assert_eq!(req.bins[0].bin_id, "b1");
        assert_eq!(req.items.len(), 1);
        assert_eq!(req.items[0].shape_id, "rect-a");
        let pwh = req.items[0].polygon.as_ref().unwrap();
        assert_eq!(pwh.outer().points().len(), 4);
        assert_eq!(req.mode, Some(PackMode::Fast));
        assert_eq!(req.units, UnitSystem::Inch); // default
    }

    #[test]
    fn accepts_legacy_single_loop_polygon_array() {
        // Backward-compat: requests built before PR 0a ship `polygon: [...]`
        // (flat array of points). These must continue to parse and lift to
        // `PolygonWithHoles { outer: <array>, holes: [] }`.
        let req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        let part = &req.items[0];
        let pwh = part.polygon.as_ref().expect("legacy fixture has polygon");
        assert!(pwh.is_simple(), "no holes in legacy fixture");
        assert_eq!(pwh.outer().points().len(), 4);
    }

    #[test]
    fn accepts_new_polygon_with_holes_shape() {
        let json = r#"{
            "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
            "clearance":0.125,
            "items":[{
                "shapeId":"ring",
                "quantity":1,
                "polygon":{
                    "outer":[{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":10},{"x":0,"y":10}],
                    "holes":[[{"x":3,"y":3},{"x":7,"y":3},{"x":7,"y":7},{"x":3,"y":7}]]
                },
                "allowRotation":true
            }]
        }"#;
        let req: PackRequest = serde_json::from_str(json).unwrap();
        let part = &req.items[0];
        let pwh = part.polygon.as_ref().expect("new shape has polygon");
        assert!(!pwh.is_simple());
        assert_eq!(pwh.holes().len(), 1);
        assert_eq!(pwh.holes()[0].points().len(), 4);
    }

    #[test]
    fn fast_mode_resolves_to_fast_budget() {
        let req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(req.resolved_time_budget_ms(), FAST_MS);
    }

    #[test]
    fn default_mode_falls_back_to_balanced_budget() {
        let json = r#"{
            "bins":[{"binId":"b","width":1,"height":1,"kind":"fresh"}],
            "clearance":0,
            "items":[{"shapeId":"a","quantity":1,"polygon":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"allowRotation":true}]
        }"#;
        let req: PackRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.mode, None);
        assert_eq!(req.resolved_time_budget_ms(), BALANCED_MS);
    }

    #[test]
    fn explicit_budget_overrides_mode() {
        let mut req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        req.time_budget_ms = Some(7_500);
        assert_eq!(req.resolved_time_budget_ms(), 7_500);
    }

    #[test]
    fn bin_kind_serializes_as_lowercase() {
        let b = Bin {
            bin_id: "x".into(),
            width: 1.0,
            height: 1.0,
            kind: BinKind::Remnant,
            priority: None,
        };
        let json = serde_json::to_string(&b).unwrap();
        assert!(json.contains("\"kind\":\"remnant\""));
    }

    // Industry alias tests

    #[test]
    fn accepts_demand_alias_for_quantity() {
        let json = r#"{
            "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
            "clearance":0.125,
            "items":[{"shapeId":"a","demand":7,"polygon":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"allowRotation":true}]
        }"#;
        let req: PackRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.items[0].quantity, 7);
    }

    #[test]
    fn accepts_kerf_alias_for_clearance() {
        let json = r#"{
            "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
            "kerf":0.25,
            "items":[{"shapeId":"a","quantity":1,"polygon":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"allowRotation":true}]
        }"#;
        let req: PackRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.clearance, 0.25);
    }

    #[test]
    fn accepts_spacing_alias_for_clearance() {
        let json = r#"{
            "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
            "spacing":0.1,
            "items":[{"shapeId":"a","quantity":1,"polygon":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"allowRotation":true}]
        }"#;
        let req: PackRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.clearance, 0.1);
    }

    #[test]
    fn units_defaults_to_inch_and_accepts_alias() {
        let json_in = r#"{"bins":[{"binId":"b","width":1,"height":1,"kind":"fresh"}],"clearance":0,"items":[{"shapeId":"a","quantity":1,"polygon":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"allowRotation":true}],"units":"in"}"#;
        let req: PackRequest = serde_json::from_str(json_in).unwrap();
        assert_eq!(req.units, UnitSystem::Inch);

        let json_mm = r#"{"bins":[{"binId":"b","width":1,"height":1,"kind":"fresh"}],"clearance":0,"items":[{"shapeId":"a","quantity":1,"polygon":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"allowRotation":true}],"units":"mm"}"#;
        let req: PackRequest = serde_json::from_str(json_mm).unwrap();
        assert_eq!(req.units, UnitSystem::Mm);
    }
}
