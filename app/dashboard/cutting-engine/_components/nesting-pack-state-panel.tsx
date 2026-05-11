import type { JSX } from "react"
import { Layers, Loader2, RotateCcw, TriangleAlert } from "lucide-react"

/**
 * Phase 5 PR 7 — empty / loading / error state for the auto-nest
 * visualizer. Replaces the canvas when there's no rendered layout.
 *
 *   empty   — operator hasn't pressed Pack yet, OR an input changed
 *             and the gate reset. Stylized dashed empty sheet with
 *             a "Ready to nest" overlay card.
 *   loading — pack is in flight. Same dashed sheet plus an animated
 *             band-scan that sweeps top-to-bottom while the Rust
 *             packer runs.
 *   error   — pack-cli or HTTP failure. Replaces the sheet with an
 *             inline error banner: title, message, Retry button.
 *             aria-live="assertive" so SR users hear the failure.
 *
 * No `data-sheet-svg` on the inner SVG — PDF capture queries that
 * attribute to find detail SVGs and must not pick up state panels.
 */

type NestingPackStateKind = "empty" | "loading" | "error"

interface NestingPackStatePanelProps {
  kind: NestingPackStateKind
  rollWidth: number
  rollLength: number
  /** Only used when kind === "error". Trimmed server message. */
  errorMessage?: string
  /** Called when the operator clicks Retry inside the error banner. */
  onRetry?: () => void
  /** True while a pack is in flight — disables the Retry button. */
  isPacking?: boolean
}

export default function NestingPackStatePanel(props: NestingPackStatePanelProps): JSX.Element {
  const { kind, rollWidth, rollLength, errorMessage = "", onRetry, isPacking = false } = props

  const vw = rollWidth * 10
  const vh = rollLength * 10
  const sx = vw * 0.05
  const sy = vh * 0.05
  const sw = vw * 0.9
  const sh = vh * 0.9

  return (
    <div className="relative flex items-center justify-center px-4 py-12 sm:px-8">
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full max-w-3xl"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={vw} height={vh} fill="var(--svg-page-bg)" />
        {kind !== "error" && (
          <rect
            x={sx}
            y={sy}
            width={sw}
            height={sh}
            fill="var(--svg-sheet-base)"
            fillOpacity="0.5"
            stroke="var(--svg-grid)"
            strokeDasharray="4 4"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {kind === "loading" && (
          <>
            <style>{`
              @keyframes nesting-band-scan {
                0%, 100% { transform: translateY(0); opacity: 0; }
                10% { opacity: 1; }
                50% { transform: translateY(${vh - 4}px); opacity: 1; }
                90% { opacity: 1; }
              }
            `}</style>
            <rect
              x={0}
              y={0}
              width={vw}
              height={4}
              fill="var(--svg-part-selected-stroke)"
              fillOpacity="0.4"
              className="origin-top animate-[nesting-band-scan_1.6s_ease-in-out_infinite] motion-reduce:hidden"
            />
          </>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {kind === "empty" && (
          <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-lg border border-border bg-card/80 px-6 py-5 shadow-sm backdrop-blur-sm">
            <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-base font-semibold text-foreground">Ready to nest</h3>
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Configure parts and stock above, then press Pack.
            </p>
          </div>
        )}

        {kind === "loading" && (
          <div
            className="pointer-events-auto flex flex-col items-center gap-2 rounded-lg border border-border bg-card/80 px-6 py-5 shadow-sm backdrop-blur-sm"
            aria-live="polite"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-foreground">Optimizing layout…</p>
          </div>
        )}

        {kind === "error" && (
          <div role="alert" aria-live="assertive">
            <div className="pointer-events-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-[var(--svg-error-stroke)] bg-[var(--svg-error-fill)] px-6 py-5 shadow-sm">
              <TriangleAlert
                className="h-6 w-6 text-[var(--svg-error-stroke)]"
                aria-hidden="true"
              />
              <h3 className="text-base font-semibold text-foreground">Nest failed</h3>
              {errorMessage.trim() && (
                <p
                  className="line-clamp-3 max-w-md text-center text-sm text-muted-foreground"
                  title={errorMessage}
                >
                  {errorMessage}
                </p>
              )}
              <button
                type="button"
                onClick={onRetry}
                disabled={isPacking}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {isPacking ? "Retrying…" : "Retry"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
