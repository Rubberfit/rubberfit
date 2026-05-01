import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "cut-history-pdfs"

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
