import { supabase } from "@/lib/supabase"
import type { VisionExtractionResponse } from "@/app/(main)/dashboard/cut-planner/_components/upload-types"

export async function extractFromImage(file: File): Promise<VisionExtractionResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new Error("Not authenticated")

  const formData = new FormData()
  formData.append("file", file)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const response = await fetch(`${supabaseUrl}/functions/v1/extract-cut-dimensions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(errorBody.error || `Extraction failed (${response.status})`)
  }

  return response.json()
}
