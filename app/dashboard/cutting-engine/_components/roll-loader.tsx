"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll } from "@/src/infrastructure/models/supabase"

/**
 * Deep-link loader for the "open this roll in the engine" flow.
 *
 * Mirrors `CutLoader` but instead of restoring a historical cut
 * it pre-populates the stock configuration from an inventory roll.
 * There are no parts or tags to restore — the engine opens with a
 * blank sheet matching the roll's dimensions so the operator can
 * drop parts into it.
 *
 * URL contract: `/dashboard/cutting-engine?loadRoll=<id>`. After a
 * successful fetch, the query param is stripped so a refresh
 * doesn't re-apply the load.
 */

interface RollLoaderProps {
  onLoad: (roll: Roll) => void
}

function RollLoaderInner({ onLoad }: RollLoaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const loadRollId = searchParams.get("loadRoll")
  // Id-keyed guard so a second deep link in the same mount still
  // fetches. Boolean flag (earlier revision) silently ignored it.
  // Reset when the param clears so the same id can be reopened later.
  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!loadRollId) {
      lastLoadedIdRef.current = null
      return
    }
    if (lastLoadedIdRef.current === loadRollId) return
    lastLoadedIdRef.current = loadRollId
    let cancelled = false

    rollsSdk
      .get(loadRollId)
      .then((roll) => {
        // Drop stale wins: only honor the response if the param still
        // points at the id we fetched.
        if (cancelled || lastLoadedIdRef.current !== loadRollId) return
        if (!roll) {
          toast.error("Could not find that roll")
          return
        }
        onLoad(roll)
      })
      .catch(() => {
        if (cancelled || lastLoadedIdRef.current !== loadRollId) return
        toast.error("Could not load roll")
      })
      .finally(() => {
        if (cancelled || lastLoadedIdRef.current !== loadRollId) return
        router.replace("/dashboard/cutting-engine")
      })

    return () => {
      cancelled = true
    }
  }, [loadRollId, router, onLoad])

  return null
}

export function RollLoader(props: RollLoaderProps) {
  return (
    <Suspense fallback={null}>
      <RollLoaderInner {...props} />
    </Suspense>
  )
}
