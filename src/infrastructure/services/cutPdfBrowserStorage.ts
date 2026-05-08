import { supabase } from "@/src/infrastructure/models/supabase"

const BUCKET = "cut-history-pdfs"

/**
 * Browser-side direct upload for the "PDF first, INSERT second"
 * cut-save flow. Uploads the rendered cut-report blob straight to
 * `cut-history-pdfs/<userId>/<cutId>.pdf` and returns the public URL.
 *
 * The caller (`app/dashboard/cutting-engine/_components/cut-history-pdf.ts`)
 * passes the URL to `saveCut`, which lands the cut_history row with
 * `pdf_url` populated at INSERT time. cut_history is write-once
 * (migration 20260412055550 — no UPDATE policy), so the URL must
 * arrive on the original INSERT.
 *
 * Filename intentionally has no timestamp suffix: matching the
 * `<userId>/<cutId>.pdf` convention lets the periodic orphan-PDF
 * sweep (separate ticket) match storage objects to cut_history rows.
 *
 * Storage RLS (migration 20260420000001) enforces
 * `(storage.foldername(name))[1] = auth.uid()::text` on INSERT, so
 * a compromised browser cannot upload into another user's folder.
 *
 * Returns the public URL on success, `null` on any failure (network,
 * RLS reject, content-type, etc.). Errors are logged here; callers
 * treat null as "no PDF was attached" and proceed with `pdf_url = null`
 * on the cut_history row.
 */
export async function uploadCutPdfFromBrowser(
  userId: string,
  cutId: string,
  pdfBlob: Blob
): Promise<string | null> {
  const fileName = `${userId}/${cutId}.pdf`

  let uploadError: { message: string } | null = null
  try {
    const result = await supabase.storage.from(BUCKET).upload(fileName, pdfBlob, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: true,
    })
    uploadError = result.error
  } catch (err) {
    uploadError = err instanceof Error ? err : { message: String(err) }
  }
  if (uploadError) {
    console.error("PDF upload failed:", uploadError)
    return null
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
  return urlData.publicUrl
}
