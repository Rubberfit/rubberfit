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
  const didFetch = useRef(false)

  useEffect(() => {
    if (!loadRollId || didFetch.current) return
    didFetch.current = true

    rollsSdk
      .get(loadRollId)
      .then((roll) => {
        if (!roll) {
          toast.error("Could not find that roll")
          return
        }
        onLoad(roll)
      })
      .catch(() => {
        toast.error("Could not load roll")
      })
      .finally(() => {
        router.replace("/dashboard/cutting-engine")
      })
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
