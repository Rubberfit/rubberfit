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
  console.log("[issue-126] CutLoaderInner RENDER, loadCutId=", loadCutId, "all params=", Array.from(searchParams.entries()))
  // Id-keyed guard: the boolean flag pattern silently swallowed
  // subsequent deep links within the same mount, so consecutive
  // `?loadCut=` links appeared to do nothing after the first.
  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    console.log("[issue-126] CutLoader useEffect fired, loadCutId=", loadCutId, "lastRef=", lastLoadedIdRef.current)
    if (!loadCutId) {
      lastLoadedIdRef.current = null
      return
    }
    if (lastLoadedIdRef.current === loadCutId) return
    lastLoadedIdRef.current = loadCutId
    let isCancelled = false

    console.log("[issue-126] CutLoader fetching cut", loadCutId)
    fetch(`/api/cuts/history/${encodeURIComponent(loadCutId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const json = (await res.json()) as { data?: CutHistory }
        if (isCancelled || lastLoadedIdRef.current !== loadCutId) return
        // An unexpected 2xx body (e.g. legacy `{ ok: true }` shape) would
        // pass `undefined` into onLoad and silently break restore. Throw
        // into the shared catch so the user sees the same error toast.
        if (!json.data) throw new Error("missing payload.data")
        console.log("[issue-126] CutLoader got cut", {
          id: json.data.id,
          source: json.data.source,
          part_id: json.data.part_id,
          cut_width: json.data.cut_width,
          cut_length: json.data.cut_length,
          part_selected_size_text: json.data.part_selected_size_text,
          part_custom_dimensions: json.data.part_custom_dimensions,
          layout_json: json.data.layout_json,
        })
        onLoad(json.data)
      })
      .catch((error) => {
        if (isCancelled || lastLoadedIdRef.current !== loadCutId) return
        console.error("[issue-126] CutLoader fetch error", error)
        toast.error("Could not load cut record")
      })
      .finally(() => {
        if (isCancelled || lastLoadedIdRef.current !== loadCutId) return
        console.log("[issue-126] CutLoader cleaning up URL via", returnPath)
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
      isCancelled = true
    }
  }, [loadCutId, router, onLoad, returnPath])

  return null
}

export function CutLoader(props: CutLoaderProps) {
  console.log("[issue-126] CutLoader (wrapper) RENDER")
  return (
    <Suspense fallback={null}>
      <CutLoaderInner {...props} />
    </Suspense>
  )
}
