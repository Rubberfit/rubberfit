import type { SupabaseClient } from "@supabase/supabase-js"

import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const BUCKET = "cut-history-pdfs"

/**
 * Construct the deterministic public URL for a user's cut-report PDF.
 * The browser uploads to `cut-history-pdfs/<userId>/<cutId>.pdf` (storage
 * RLS scopes the folder to `auth.uid()`); this helper reproduces that
 * URL on the server so the action can write the authoritative value to
 * `cut_history.pdf_url` instead of trusting whatever URL the client
 * sent. Sigilix flagged client-supplied URLs on PR #197 as a stored
 * phishing / SSRF vector — bypassed by constructing here.
 *
 * `getPublicUrl` is sync on the client side (URL composition only —
 * no storage roundtrip); the wrapper keeps the architecture test happy
 * by quarantining the `.storage.` call in `src/infrastructure/`.
 */
export async function getCutPdfPublicUrl(userId: string, cutId: string): Promise<string> {
  const client = await getDatabaseClient()
  const fileName = `${userId}/${cutId}.pdf`
  return client.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl
}

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
 * Safe orphan-PDF cleanup. Verifies no `cut_history` row exists for
 * `cutId` before removing the storage object — otherwise a
 * duplicate-submit race could delete the file that an
 * already-persisted row points to.
 *
 * Scenario: browser POSTs to `saveCut` twice (network retry, double
 * click). First call succeeds, the row is persisted. Second call hits
 * the unique-id conflict on insert and returns `ok: false`. The naive
 * cleanup deletes the storage object that the FIRST row's `pdf_url`
 * still references.
 *
 * This wrapper short-circuits when a row exists for `cutId`. Lookup
 * uses the cookie-bound client so RLS scopes the SELECT to the
 * caller's own rows (matches the `cut_history_select_own` policy).
 *
 * Coderabbit follow-up on PR #197.
 */
export async function safeRemoveOrphanedCutPdf(userId: string, cutId: string): Promise<void> {
  try {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("cut_history")
      .select("id")
      .eq("id", cutId)
      .maybeSingle()

    if (error) {
      // Don't delete on uncertain DB state — a transient read error
      // shouldn't be allowed to drop a possibly-referenced file.
      console.error(`Skipping orphan PDF cleanup — row-existence check failed for ${cutId}:`, error)
      return
    }
    if (data) {
      // A cut_history row already references this storage object.
      // Cleanup is unsafe; the file belongs to the persisted row.
      return
    }
  } catch (err) {
    console.error(`Skipping orphan PDF cleanup — row-existence check threw for ${cutId}:`, err)
    return
  }

  await removeOrphanedCutPdf(userId, cutId)
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
