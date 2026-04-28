// Shape-specific preview generators for NestingVisualizer
// Re-exports from split modules for backwards compatibility

export { generateRectanglePreview, generateCirclePreview } from "./nesting-shape-previews-basic"

export {
  generateCylinderPreview,
  generateConePreview,
  generateTrapezoidPreview,
} from "./nesting-shape-previews-advanced"

export {
  generateMultiPartPreview,
  generateMultiPartPreviewAsync,
  generateSimplePartPreview,
  generateSimplePartPreviewAsync,
  computeMultiSheetPreviews,
} from "./nesting-shape-previews-dispatch"

// `globalMultiSheetPack` is the issue-#119 wrapper: it calls the raw global
// packer then attempts the Plan A and v1 re-pack strategies. Lives in its
// own module so the dispatch file stays focused on per-shape preview routing.
export { globalMultiSheetPack } from "./repack-strategies"
