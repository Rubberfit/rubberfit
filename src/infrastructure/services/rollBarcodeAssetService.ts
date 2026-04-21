import bwipjs from "bwip-js/browser"

import type { Roll } from "@/src/infrastructure/models/supabase"
import { supabase } from "@/src/infrastructure/models/supabase"

import { getCurrentUserId } from "./getCurrentUserId"

export const ROLL_BARCODE_BUCKET = "roll-barcodes"

type RollBarcodeTarget = Pick<Roll, "id" | "part_number" | "barcode_asset_path">

function barcodePayload(roll: RollBarcodeTarget): string {
  const text = roll.part_number?.trim() || roll.id
  if (!text) throw new Error("Roll barcode payload is empty")
  return text
}

function barcodeStoragePath(userId: string, rollId: string): string {
  return `${userId}/${rollId}/code128.png`
}

async function renderCode128Blob(text: string): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Barcode rendering requires a browser environment")
  }

  const canvas = document.createElement("canvas")
  bwipjs.toCanvas(canvas, {
    bcid: "code128",
    text,
    scale: 3,
    height: 10,
    includetext: false,
    backgroundcolor: "FFFFFF",
  })

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error("Failed to convert barcode canvas to PNG"))
    }, "image/png")
  })
}

async function uploadStoredRollBarcode(
  roll: RollBarcodeTarget,
  userId: string
): Promise<{ path: string; generatedAt: string }> {
  const path = barcodeStoragePath(userId, roll.id)
  const pngBlob = await renderCode128Blob(barcodePayload(roll))

  const { error: uploadError } = await supabase.storage
    .from(ROLL_BARCODE_BUCKET)
    .upload(path, pngBlob, {
      cacheControl: "3600",
      contentType: "image/png",
      upsert: true,
    })
  if (uploadError) {
    throw new Error(`Failed to upload roll barcode: ${uploadError.message}`)
  }

  const generatedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from("rolls")
    .update({
      barcode_asset_path: path,
      barcode_generated_at: generatedAt,
    })
    .eq("id", roll.id)
  if (updateError) {
    throw new Error(`Failed to save roll barcode metadata: ${updateError.message}`)
  }

  return { path, generatedAt }
}

export async function ensureStoredRollBarcode(
  roll: RollBarcodeTarget
): Promise<{ path: string; generatedAt: string }> {
  // Skip regeneration if the barcode is already stored for this roll.
  // The stored path is keyed to roll.id so it won't collide across rolls;
  // if part_number ever changes the caller should pass barcode_asset_path: null
  // to force a fresh render.
  if (roll.barcode_asset_path) {
    return { path: roll.barcode_asset_path, generatedAt: "" }
  }
  const userId = await getCurrentUserId()
  return uploadStoredRollBarcode(roll, userId)
}

export async function ensureStoredRollBarcodes(
  rolls: RollBarcodeTarget[]
): Promise<{ failedRollIds: string[] }> {
  const uniqueRolls = Array.from(new Map(rolls.map((roll) => [roll.id, roll])).values())
  const userId = await getCurrentUserId()
  const results = await Promise.allSettled(
    uniqueRolls.map((roll) => uploadStoredRollBarcode(roll, userId))
  )

  const failedRollIds: string[] = []
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failedRollIds.push(uniqueRolls[index].id)
    }
  })

  return { failedRollIds }
}
