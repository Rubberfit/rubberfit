"use client"

import { useEffect, useState } from "react"
import { Copy, Loader2, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Input } from "@/app/components/ui/input"
import { authService } from "@/src/infrastructure/services/authService"
import { JOB_PDF_SHARE_TTL_SECONDS, uploadJobPdf } from "@/src/infrastructure/services/jobService"
import type { JobFullDetail } from "@/src/infrastructure/models/supabase"

import { buildJobPdfBlob, jobPdfFileName } from "./job-pdf"

/**
 * "Share job PDF" action: renders the customer-facing job sheet,
 * uploads it to the private `job-pdfs` bucket, and shows the
 * operator a signed URL they can copy-paste into email.
 *
 * Generating on demand (rather than persisting every job-save) keeps
 * storage bills in check and makes it obvious when a customer is
 * getting a fresh copy with the latest parts/roster.
 *
 * The URL is valid for ~7 days. We don't surface re-sign in this
 * pass — operators can click "Share link" again to produce a new
 * signed URL against the existing object (uploads are per-click so
 * a later edit supersedes the earlier one).
 */

interface JobShareLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobFullDetail
}

function formatExpiryHint(expiresAt: string): string {
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return "expires soon"
  // Short, human: "expires Apr 27, 2026, 8:14 PM"
  return `expires ${d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`
}

export function JobShareLinkDialog({ open, onOpenChange, job }: JobShareLinkDialogProps) {
  const [status, setStatus] = useState<"idle" | "working" | "ready" | "error">("idle")
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // Reset on close so the next open starts fresh — we don't want
      // a stale link hanging around after an edit.
      setStatus("idle")
      setSignedUrl(null)
      setExpiresAt(null)
      setErrorMsg(null)
      return
    }
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const generate = async () => {
    setStatus("working")
    setErrorMsg(null)
    try {
      // Build the PDF client-side so we don't round-trip the job data
      // through a server action just to render a document the browser
      // already has all the pieces for.
      const blob = buildJobPdfBlob(job, { companyName: "Rubberfit" })
      const user = await authService.getCurrentUser()
      if (!user) {
        throw new Error("Sign in before sharing job PDFs")
      }
      const result = await uploadJobPdf(user.id, job.id, blob, jobPdfFileName(job))
      setSignedUrl(result.signedUrl)
      setExpiresAt(result.expiresAt)
      setStatus("ready")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setErrorMsg(msg)
      setStatus("error")
    }
  }

  const handleCopy = async () => {
    if (!signedUrl) return
    try {
      await navigator.clipboard.writeText(signedUrl)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy — select the link and copy manually")
    }
  }

  const ttlDays = Math.round(JOB_PDF_SHARE_TTL_SECONDS / 86400)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
            Share job PDF
          </DialogTitle>
          <DialogDescription>
            Generates a {ttlDays}-day signed link to the customer-facing job sheet. Share it in
            email or chat — the recipient doesn't need a Rubberfit login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {status === "working" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Rendering and uploading the PDF…
            </div>
          )}

          {status === "error" && (
            <div className="space-y-2">
              <p className="text-destructive text-sm">{errorMsg ?? "Failed to share"}</p>
              <Button size="sm" variant="outline" onClick={generate}>
                Try again
              </Button>
            </div>
          )}

          {status === "ready" && signedUrl && (
            <div className="space-y-2">
              <label htmlFor="job-share-url" className="font-medium text-foreground text-xs">
                Share link
              </label>
              <div className="flex gap-2">
                <Input
                  id="job-share-url"
                  value={signedUrl}
                  readOnly
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
              {expiresAt && (
                <p className="text-muted-foreground text-[11px]">
                  Link {formatExpiryHint(expiresAt)}. Click "Share job PDF" again later to issue a
                  fresh link.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
