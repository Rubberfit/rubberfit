import { supabase } from "@/src/infrastructure/models/supabase"

/**
 * Job PDF share service.
 *
 * Uploads a rendered job-sheet PDF to the private `job-pdfs` bucket
 * and returns a signed URL the operator can hand to their customer.
 * The bucket is private (unlike `cut-history-pdfs`, which is public
 * for in-app viewing) because job sheets carry customer contact and
 * PO details — a guessable URL would be a needless data exposure.
 *
 * Object keys are `<userId>/<jobId>-<timestamp>.pdf` so storage RLS
 * can enforce "only the uploader can SELECT through the REST API"
 * while signed URLs continue to work for external recipients until
 * they expire.
 */

/** Seven days — matches our standard "you have a week" share window. */
export const JOB_PDF_SHARE_TTL_SECONDS = 60 * 60 * 24 * 7

const BUCKET = "job-pdfs"

export interface JobPdfShareResult {
  /** Signed URL the operator should hand to the customer. */
  signedUrl: string
  /** Storage object path — useful for logging and admin cleanup. */
  path: string
  /** ISO-8601 expiry timestamp; caller can show "expires on …". */
  expiresAt: string
}

/**
 * Upload the given PDF blob and return a time-limited signed URL.
 * Rejects (rather than returns null) so callers can surface a toast
 * with the exact failure reason instead of a silent "it didn't work".
 */
export async function uploadJobPdf(
  userId: string,
  jobId: string,
  pdfBlob: Blob,
  fileName: string
): Promise<JobPdfShareResult> {
  // Keep the human-readable base name (job number + customer) so a
  // recipient who downloads the file sees something meaningful, but
  // prefix with the storage path so RLS lines up.
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_")
  const path = `${userId}/${jobId}-${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBlob, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`Failed to upload job PDF: ${uploadError.message}`)
  }

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, JOB_PDF_SHARE_TTL_SECONDS)
  if (signError || !data?.signedUrl) {
    // Upload succeeded but signing failed — surface both so the
    // operator knows the object exists even if the link doesn't.
    throw new Error(
      `Uploaded but failed to sign URL: ${signError?.message ?? "unknown error"}`
    )
  }

  const expiresAt = new Date(
    Date.now() + JOB_PDF_SHARE_TTL_SECONDS * 1000
  ).toISOString()

  return {
    signedUrl: data.signedUrl,
    path,
    expiresAt,
  }
}
