"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, Copy, Loader2, Share2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { getBrandedPdfCompanyName } from "@/app/actions/branding"
import { DEFAULT_PDF_COMPANY_NAME } from "@/src/application/billing/pdf-branding"
import { authService } from "@/src/infrastructure/services/authService"
import { JOB_PDF_SHARE_TTL_SECONDS, uploadJobPdf } from "@/src/infrastructure/services/jobService"
import type { JobFullDetail } from "@/src/infrastructure/models/supabase"

import { buildJobPdfBlob, jobPdfFileName } from "./job-pdf"

/**
 * "Share job PDF" action — Phase 4.
 *
 * Right-docked `<Sheet>` replacement for the previous centered
 * `JobShareLinkDialog`. Status machine: `idle → working → ready
 * → error`. Renders the customer-facing job sheet client-side,
 * uploads to the private `job-pdfs` bucket, and surfaces a signed
 * URL the operator can copy. URL is valid for ~7 days. Generating
 * on demand (rather than persisting every job-save) keeps storage
 * bills in check and makes it obvious when a customer is getting
 * a fresh copy with the latest parts/roster.
 *
 * Width `sm:max-w-2xl` matches the locked simple-form drawer
 * pattern (PRs 3a–3j + #206 notifications).
 */

interface JobShareLinkSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobFullDetail
}

function formatExpiryHint(expiresAt: string): string {
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return "expires soon"
  return `expires ${d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`
}

export function JobShareLinkSheet({ open, onOpenChange, job }: JobShareLinkSheetProps) {
  const [status, setStatus] = useState<"idle" | "working" | "ready" | "error">("idle")
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Generation counter — `generate()` can take several seconds
  // (PDF build + storage upload). If the user closes and reopens
  // the sheet (or hits Generate again on error), an in-flight call
  // from the previous open could resolve and overwrite the fresh
  // state. The ref-bumped counter lets the callback bail out if
  // it's no longer the current generation.
  const genIdRef = useRef(0)

  const generate = async () => {
    const myGen = ++genIdRef.current
    setStatus("working")
    setErrorMsg(null)
    try {
      // Branding is Pro+ — Standard tier silently falls back to the
      // default product name. The action returns a discriminated
      // result (Next.js strips custom error properties on the
      // server-action serialization boundary, so a thrown
      // FeatureLockedError isn't reliably detectable client-side).
      let companyName = DEFAULT_PDF_COMPANY_NAME
      try {
        const branding = await getBrandedPdfCompanyName()
        if (branding.ok) {
          companyName = branding.companyName
        }
      } catch (err) {
        console.error("[JobShareLinkSheet] branded-name fetch failed:", err)
      }
      // Build the PDF client-side so we don't round-trip the job
      // data through a server action just to render a document the
      // browser already has all the pieces for.
      const blob = buildJobPdfBlob(job, { companyName })
      const user = await authService.getCurrentUser()
      if (!user) {
        throw new Error("Sign in before sharing job PDFs")
      }
      const result = await uploadJobPdf(user.id, job.id, blob, jobPdfFileName(job))
      if (genIdRef.current !== myGen) return
      setSignedUrl(result.signedUrl)
      setExpiresAt(result.expiresAt)
      setStatus("ready")
    } catch (err) {
      if (genIdRef.current !== myGen) return
      const msg = err instanceof Error ? err.message : "Unknown error"
      setErrorMsg(msg)
      setStatus("error")
    }
  }

  useEffect(() => {
    if (!open) {
      // Bump genId on close so any in-flight generate() bails. Then
      // reset state so the next open starts fresh — we don't want a
      // stale link hanging around after an edit.
      genIdRef.current++
      setStatus("idle")
      setSignedUrl(null)
      setExpiresAt(null)
      setErrorMsg(null)
      return
    }
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleCopy = async () => {
    if (!signedUrl) return
    try {
      await navigator.clipboard.writeText(signedUrl)
      toast.success("Link copied")
    } catch (_error) {
      toast.error("Couldn't copy — select the link and copy manually")
    }
  }

  const ttlDays = Math.round(JOB_PDF_SHARE_TTL_SECONDS / 86400)

  const primaryAction = (() => {
    if (status === "ready" && signedUrl) {
      return (
        <Button onClick={() => void handleCopy()}>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy link
        </Button>
      )
    }
    if (status === "error") {
      return <Button onClick={() => void generate()}>Generate link</Button>
    }
    return null
  })()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <SheetTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
                <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
                Share job PDF
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Generates a {ttlDays}-day signed link to the customer-facing job sheet. Share it in
                email or chat — the recipient doesn't need a Rubberfit login.
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {status === "working" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Rendering and uploading the PDF…
            </div>
          )}

          {status === "error" && (
            <div className="space-y-2 rounded-lg border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/5 p-3 text-sm">
              <p className="font-medium text-[color:var(--danger)]">
                {errorMsg ?? "Failed to share"}
              </p>
              <p className="text-xs text-muted-foreground">
                Try again from the footer below, or close this sheet and re-open.
              </p>
            </div>
          )}

          {status === "ready" && signedUrl && (
            <div className="space-y-2">
              <Label htmlFor="job-share-url" className="text-xs font-medium text-foreground">
                Share link
              </Label>
              <div className="flex gap-2">
                <Input
                  id="job-share-url"
                  value={signedUrl}
                  readOnly
                  className="font-mono text-xs tabular-nums"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy()}
                  className="shrink-0"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  Copy
                </Button>
              </div>
              {expiresAt && (
                <p className="text-[11px] text-muted-foreground">
                  Link {formatExpiryHint(expiresAt)}. Click &quot;Share PDF&quot; again later to
                  issue a fresh link.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {primaryAction}
        </div>
      </SheetContent>
    </Sheet>
  )
}
