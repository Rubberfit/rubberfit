import { supabase } from "@/src/infrastructure/models/supabase"
 
// Get current user's cut history
export const getCutHistory = async () => {
  const { data, error } = await supabase
    .from('cut_history')
    .select('*')
    .order('cut_date', { ascending: false })

  if (error) throw error
  return data
}

// Add a new cut history entry
export const addCutHistory = async (cut: {
  material_id: number
  cut_length: number
  cut_width: number
  cut_thickness: number
  cut_amount: number
  part_id?: number
  part_custom_width?: number
  part_custom_height?: number
  part_selected_size?: number[]
  part_selected_size_text?: string[]
  part_selected_label?: string[]
}) => {
  const { data, error } = await supabase
    .from('cut_history')
    .insert(cut)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete a cut history entry
export const deleteCutHistory = async (id: number) => {
  const { error } = await supabase
    .from('cut_history')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Upload a PDF blob for a cut history entry to Supabase Storage
export async function uploadCutPdf(
  cutId: number,
  userId: string,
  pdfBlob: Blob
): Promise<string | null> {
  const fileName = `${userId}/${cutId}-${Date.now()}.pdf`
  const { error: uploadError } = await supabase.storage
    .from("cut-history-pdfs")
    .upload(fileName, pdfBlob, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: true,
    })
  if (uploadError) {
    console.error("PDF upload failed:", uploadError)
    return null
  }

  const { data: urlData } = supabase.storage
    .from("cut-history-pdfs")
    .getPublicUrl(fileName)

  const { error: updateError } = await supabase
    .from("cut_history")
    .update({ pdf_url: urlData.publicUrl })
    .eq("id", cutId)

  if (updateError) {
    console.error("Failed to save PDF URL:", updateError)
    return null
  }

  return urlData.publicUrl
}

// Get all cut history (admin/manager/supervisor only)
export const getAllCutHistory = async () => {
  const { data, error } = await supabase
    .from('cut_history')
    .select('*, profiles(full_name, roles)')
    .order('cut_date', { ascending: false })

  if (error) throw error
  return data
}