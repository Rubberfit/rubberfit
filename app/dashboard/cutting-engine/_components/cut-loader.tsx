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
  // Id-keyed guard: the boolean flag pattern silently swallowed
  // subsequent deep links within the same mount, so consecutive
  // `?loadCut=` links appeared to do nothing after the first.
  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!loadCutId || lastLoadedIdRef.current === loadCutId) return
    lastLoadedIdRef.current = loadCutId

    fetch(`/api/cuts/history/${encodeURIComponent(loadCutId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const json = (await res.json()) as { data: CutHistory }
        onLoad(json.data)
      })
      .catch(() => {
        toast.error("Could not load cut record")
      })
      .finally(() => {
        router.replace(returnPath)
      })
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
