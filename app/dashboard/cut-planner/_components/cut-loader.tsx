"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import type { CutHistory } from "@/src/entities"

interface CutLoaderProps {
  onLoad: (cut: CutHistory) => void
}

function CutLoaderInner({ onLoad }: CutLoaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const loadCutId = searchParams.get("loadCut")
  const didFetch = useRef(false)

  useEffect(() => {
    if (!loadCutId || didFetch.current) return
    didFetch.current = true

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
        router.replace("/dashboard/cut-planner")
      })
  }, [loadCutId, router, onLoad])

  return null
}

export function CutLoader(props: CutLoaderProps) {
  return (
    <Suspense fallback={null}>
      <CutLoaderInner {...props} />
    </Suspense>
  )
}
