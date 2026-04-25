"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

/**
 * Triggers the on-demand PDF regeneration endpoint for a cut history row
 * and returns the resulting public URL on success. Used by every surface
 * that exposes a "View PDF" affordance — the cut history table and the
 * job detail drawer's cuts panel — so the fetch + toast + pending-set
 * + URL handling stays in one place.
 *
 * Per-cut pending tracking via `Set<string>` so concurrent regenerations
 * (operator clicks A then B before A finishes) don't clear each other's
 * spinners.
 *
 * The hook does NOT open the PDF or update parent state on its own —
 * callers receive the URL and decide what to do with it (typically
 * `window.open(url, "_blank")` plus a local `pdf_url` cache update).
 */
export function useRegenerateCutPdf() {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const regenerate = useCallback(async (cutId: string): Promise<string | null> => {
    setPendingIds((prev) => {
      if (prev.has(cutId)) return prev
      const next = new Set(prev)
      next.add(cutId)
      return next
    })

    try {
      const res = await fetch(`/api/cuts/history/${cutId}/pdf`, { method: "POST" })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? "Failed to generate PDF")
        return null
      }
      const { url } = (await res.json()) as { url: string }
      return url
    } catch (err) {
      console.error("View PDF error:", err)
      toast.error("Failed to generate PDF")
      return null
    } finally {
      setPendingIds((prev) => {
        if (!prev.has(cutId)) return prev
        const next = new Set(prev)
        next.delete(cutId)
        return next
      })
    }
  }, [])

  return { pendingIds, regenerate }
}
