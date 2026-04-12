import { supabase } from "@/src/infrastructure/models/supabase"
import type { VisionExtractionResponse } from "@/app/dashboard/cut-planner/_components/upload-types"
import type { IVisionExtractionService } from "@/src/application/services/vision-extraction.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

@injectable()
export class VisionExtractionService implements IVisionExtractionService {
  async extractFromImage(file: File): Promise<VisionExtractionResponse> {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error("Not authenticated")

    const formData = new FormData()
    formData.append("file", file)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    let response: Response
    try {
      response = await fetch(`${supabaseUrl}/functions/v1/extract-cut-dimensions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: formData,
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Extraction timed out. Try a smaller or clearer image.")
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(errorBody.error || `Extraction failed (${response.status})`)
    }

    return response.json()
  }
}

export const visionExtractionService = new VisionExtractionService()

// Legacy function export for backward compatibility
export async function extractFromImage(file: File): Promise<VisionExtractionResponse> {
  return visionExtractionService.extractFromImage(file)
}
