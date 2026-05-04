"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

interface CutLoaderProps {
  onLoad: (cut: CutHistory) => void
  /**
   * URL to navigate to after the load completes — used to strip the
   * `?loadCut=` query param so a refresh doesn't re-fire the load.
   * Defaults to the Auto-nest surface; Free-roam overrides to its
   * own route so the URL stays clean there too.
   */
  returnPath?: string
}

function CutLoaderInner({ onLoad, returnPath = "/dashboard/cutting-engine" }: CutLoaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const loadCutId = searchParams.get("loadCut")
  // Id-keyed guard: prevents re-loading the same cut on incidental parent
  // re-renders. CRITICAL: only stamp this ref AFTER the fetch successfully
  // delivers the cut to `onLoad`. Stamping it pre-fetch (the previous
  // pattern) is incompatible with React 19 StrictMode's double-invoke:
  //   1. Effect 1 stamps ref = id, starts fetch
  //   2. Cleanup aborts the fetch — `onLoad` never fires
  //   3. Effect 2 sees ref === id → early-returns → fetch never re-fires
  //   4. Result: deep-link URL renders an empty engine (issue #126 follow-up)
  // Stamping after success means StrictMode's first attempt aborts cleanly,
  // the second attempt re-fetches, and `onLoad` runs exactly once.
  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!loadCutId) {
      lastLoadedIdRef.current = null
      return
    }
    if (lastLoadedIdRef.current === loadCutId) return

    const controller = new AbortController()

    fetch(`/api/cuts/history/${encodeURIComponent(loadCutId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const json = (await res.json()) as { data?: CutHistory }
        // An unexpected 2xx body (e.g. legacy `{ ok: true }` shape) would
        // pass `undefined` into onLoad and silently break restore. Throw
        // into the shared catch so the user sees the same error toast.
        if (!json.data) throw new Error("missing payload.data")
        onLoad(json.data)
        // Stamp success — subsequent re-renders with the same id skip.
        lastLoadedIdRef.current = loadCutId
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Could not load cut record")
      })
      .finally(() => {
        if (controller.signal.aborted) return
        // CRITICAL: same-path URL cleanup must use the History API, NOT
        // `router.replace`. Next 16 App Router treats a `router.replace` to
        // the same pathname as a navigation that remounts the page tree —
        // which immediately wipes the React state we just populated via
        // `onLoad(...)` (stock + presetParts), leaving the engine on
        // `DEMO_STOCK` with no parts. `window.history.replaceState` strips
        // the `?loadCut=` query without triggering a router transition, so
        // the loaded state survives. We still fall back to `router.replace`
        // when the return path is a different pathname (e.g. Free-roam
        // bouncing between surfaces).
        const cleanUrl = new URL(returnPath, window.location.origin)
        if (cleanUrl.pathname === window.location.pathname) {
          window.history.replaceState(
            window.history.state,
            "",
            cleanUrl.pathname + cleanUrl.search
          )
        } else {
          router.replace(returnPath)
        }
      })

    return () => {
      controller.abort()
    }
  }, [loadCutId, router, onLoad, returnPath])

  return null
}

export function CutLoader(props: CutLoaderProps) {
  return (
    <Suspense fallback={null}>
      <CutLoaderInner {...props} />
    </Suspense>
  )
}
