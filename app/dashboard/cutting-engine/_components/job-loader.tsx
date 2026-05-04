"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { jobService } from "@/src/infrastructure/services/jobService"
import type { JobFullDetail } from "@/src/infrastructure/models/supabase"

/**
 * Deep-link handler for the "run this job in the engine" flow
 * — mirrors `RollLoader` / `CutLoader` but for jobs. Fires the
 * `onLoad` callback with the full job payload so the engine page
 * can stash the job id (stamped onto each cut's `job_id` column)
 * and surface a banner showing which job the operator is cutting
 * for. URL is stripped after load so a refresh doesn't re-fire.
 *
 * URL contract: `/dashboard/cutting-engine?loadJob=<id>`.
 */

interface JobLoaderProps {
  onLoad: (job: JobFullDetail) => void
}

function JobLoaderInner({ onLoad }: JobLoaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const loadJobId = searchParams.get("loadJob")
  // Track which id we've already fetched so a second `?loadJob=`
  // deep link within the same mount still fires. Using a boolean
  // flag (earlier revision) silently dropped subsequent loads.
  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!loadJobId) {
      lastLoadedIdRef.current = null
      return
    }
    if (lastLoadedIdRef.current === loadJobId) return
    lastLoadedIdRef.current = loadJobId
    let isCancelled = false

    jobService
      .getFull(loadJobId)
      .then((job) => {
        // Stale-response guard — a previous id's resolve shouldn't
        // land after the user navigated or switched job deep links.
        if (isCancelled || lastLoadedIdRef.current !== loadJobId) return
        if (!job) {
          toast.error("Could not find that job")
          return
        }
        onLoad(job)
      })
      .catch((_error) => {
        if (isCancelled || lastLoadedIdRef.current !== loadJobId) return
        toast.error("Could not load job")
      })
      .finally(() => {
        if (isCancelled || lastLoadedIdRef.current !== loadJobId) return
        router.replace("/dashboard/cutting-engine")
      })

    return () => {
      isCancelled = true
    }
  }, [loadJobId, router, onLoad])

  return null
}

export function JobLoader(props: JobLoaderProps) {
  return (
    <Suspense fallback={null}>
      <JobLoaderInner {...props} />
    </Suspense>
  )
}
