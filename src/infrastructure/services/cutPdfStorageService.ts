import type { SupabaseClient } from "@supabase/supabase-js"

import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const BUCKET = "cut-history-pdfs"

/**
 * Best-effort removal of an orphaned cut-report PDF object. Used by
 * the `saveCut` server action when the cut_history INSERT fails after
 * the browser has already uploaded the PDF.
 *
 * Resolves a fresh cookie-bound client via `getDatabaseClient()` so
 * storage RLS still scopes deletion to the caller's own folder — a
 * compromised action call cannot delete another user's files.
 *
 * Failures are logged but never thrown; the caller always continues
 * with the original error so the user sees the underlying cause, not
 * a cleanup-side issue.
 */
export async function removeOrphanedCutPdf(userId: string, cutId: string): Promise<void> {
  const fileName = `${userId}/${cutId}.pdf`
  try {
    const client = await getDatabaseClient()
    const { error } = await client.storage.from(BUCKET).remove([fileName])
    if (error) {
      console.error(`Orphan PDF cleanup failed for ${fileName}:`, error)
    }
  } catch (err) {
    console.error(`Orphan PDF cleanup threw for ${fileName}:`, err)
  }
}

/**
 * Upload a generated PDF blob to the `cut-history-pdfs` bucket and
 * persist its public URL on the `cut_history` row. Uses a deterministic
 * `{userId}/{cutId}.pdf` path with upsert so repeated regeneration
 * overwrites in place rather than orphaning files.
 *
 * Returns the public URL on success, `null` on upload or persist
 * failure. Errors are logged here; callers don't need to introspect
 * Supabase error shapes.
 */
export async function uploadCutPdfBlob(
  admin: SupabaseClient,
  cutId: string,
  userId: string,
  pdf: Blob
): Promise<string | null> {
  const fileName = `${userId}/${cutId}.pdf`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(fileName, pdf, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: true,
  })

  if (uploadError) {
    console.error("PDF upload failed:", uploadError)
    return null
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(fileName)
  const publicUrl = urlData.publicUrl

  const { error: updateError } = await admin
    .from("cut_history")
    .update({ pdf_url: publicUrl })
    .eq("id", cutId)

  if (updateError) {
    // Surface the failure rather than returning the URL: callers treat
    // any non-null return as "row healed", but with `pdf_url` still null
    // in the DB the next page load would re-trigger this slow regen
    // path. Better to fail loudly so the user knows and retries (the
    // deterministic storage path means retry overwrites in place).
    console.error("Failed to persist PDF URL (storage object exists):", {
      cutId,
      publicUrl,
      updateError,
    })
    return null
  }

  return publicUrl
}
