# vision/

Canonical types for the vision-extraction boundary. The infrastructure-side `VisionExtractionService` implementation and the `IVisionExtractionService` interface both speak these types, as do the app-side cut-planner upload components that render the extracted results.

Keeping the shapes here preserves the Clean Architecture dependency direction: `src/infrastructure/` and `src/application/services/` never import from `app/`.

## Files

- **types.ts** -- Canonical type definitions. Exports `ExtractedPart` (a single extracted cut spec with `width`, `length`, `quantity`, optional `partNumber`/`stockWidth`, and a `confidence` score) and `VisionExtractionResponse` (the full service response: `parts`, `warnings`, optional `stockWidth`).
