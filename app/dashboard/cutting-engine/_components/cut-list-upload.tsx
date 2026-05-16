"use client"

import React, { useState, useRef, useCallback } from "react"
import { Upload, FileSpreadsheet, Image, Loader2 } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"
import type { ExtractedPart } from "@/src/application/vision/types"
import type { UploadStatus } from "./upload-types"
import {
  isImageFile,
  isSpreadsheetFile,
  isCadFile,
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE,
} from "./upload-types"
import { parseSpreadsheet } from "./spreadsheet-parser"
import { extractFromImage } from "@/src/infrastructure/services/visionExtractionService"
import UploadReviewDialog from "./upload-review-dialog"
import DxfReviewDialog from "./dxf-review-dialog"
import { readDxfFile } from "./dxf/read-dxf-file"
import { connectLoops, pickDefaultLayer } from "@/src/application/cad/connect-loops"
import { detectUnits } from "@/src/application/cad/detect-units"
import type {
  DxfImportedPart,
  Point2D,
  RejectedEntity,
  UnitSystem,
} from "@/src/application/cad/dxf-types"
import { DxfParseError } from "@/src/application/cad/parse-dxf"

const MAX_IMAGE_DIMENSION = 4096
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024 // 3.5MB target → ~4.7MB after base64 (under Anthropic 5MB limit)

function compressImage(file: File): Promise<File> {
  if (file.type === "application/pdf") return Promise.resolve(file)
  if (file.size <= MAX_IMAGE_BYTES) return Promise.resolve(file)

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
      width = Math.round(width * scale)
      height = Math.round(height * scale)

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("Canvas not supported"))
      ctx.drawImage(img, 0, 0, width, height)

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Compression failed"))
            if (blob.size > MAX_IMAGE_BYTES && quality > 0.4) {
              tryCompress(quality - 0.1)
              return
            }
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }))
          },
          "image/jpeg",
          quality
        )
      }
      tryCompress(0.92)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to load image for compression"))
    }
    img.src = objectUrl
  })
}

interface DxfReviewState {
  loop: Point2D[]
  detectedUnits: UnitSystem | undefined
  rejected: RejectedEntity[]
  ignoredLayers: string[]
  sourceFile: string
}

interface CutListUploadProps {
  onPartsConfirmed: (parts: ExtractedPart[], stockWidth?: number) => void
  onDxfPartConfirmed?: (part: DxfImportedPart) => void
}

export default function CutListUpload({
  onPartsConfirmed,
  onDxfPartConfirmed,
}: CutListUploadProps) {
  const [status, setStatus] = useState<UploadStatus>("idle")
  const [extractedParts, setExtractedParts] = useState<ExtractedPart[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [stockWidth, setStockWidth] = useState<number | undefined>()
  const [dxfReview, setDxfReview] = useState<DxfReviewState | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
      return
    }

    setStatus("processing")
    try {
      if (isCadFile(file)) {
        const review = await processDxfFile(file)
        if (review) {
          setDxfReview(review)
          setStatus("review-dxf")
        } else {
          setStatus("idle")
        }
        return
      }
      if (isSpreadsheetFile(file)) {
        const parts = await parseSpreadsheet(file)
        if (parts.length === 0) {
          toast.error("No valid dimensions found in spreadsheet.")
          setStatus("idle")
          return
        }
        setExtractedParts(parts)
        setWarnings([])
        setStockWidth(undefined)
        setStatus("review")
      } else if (isImageFile(file)) {
        const compressed = await compressImage(file)
        const result = await extractFromImage(compressed)
        if (!result.parts || result.parts.length === 0) {
          toast.error("No dimensions could be extracted from the image.")
          setStatus("idle")
          return
        }
        setExtractedParts(result.parts)
        setWarnings(result.warnings || [])
        setStockWidth(result.stockWidth)
        setStatus("review")
      } else {
        toast.error(
          "Unsupported file type. Use images (JPG, PNG, PDF), spreadsheets (XLSX, CSV), or DXF."
        )
        setStatus("idle")
      }
    } catch (err) {
      const message =
        err instanceof DxfParseError
          ? "Could not read this DXF - export as ASCII (not binary) and try again."
          : err instanceof Error
            ? err.message
            : "Failed to process file"
      toast.error(message)
      setStatus("error")
      setTimeout(() => setStatus("idle"), 2000)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleConfirm = (parts: ExtractedPart[]) => {
    onPartsConfirmed(parts, stockWidth)
    setStatus("idle")
    setExtractedParts([])
    toast.success(`${parts.length} part${parts.length !== 1 ? "s" : ""} added to cut planner.`)
  }

  const handleCancel = () => {
    setStatus("idle")
    setExtractedParts([])
  }

  const handleDxfConfirm = (part: DxfImportedPart) => {
    onDxfPartConfirmed?.(part)
    setStatus("idle")
    setDxfReview(null)
    toast.success(`Added ${part.partNumber} to cut planner.`)
  }

  const handleDxfCancel = () => {
    setStatus("idle")
    setDxfReview(null)
  }

  const isProcessing = status === "processing"

  return (
    <>
      <div
        data-testid="upload-dropzone"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50 dark:bg-blue-900/10"
            : "border-border hover:border-slate-400 dark:hover:border-slate-600"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="sr-only"
          id="cut-list-upload"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="text-sm text-muted-foreground">Extracting dimensions...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Image className="h-5 w-5" />
              <Upload className="h-5 w-5" />
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">
              Drop a cut list image, spreadsheet, or DXF here
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              className="mt-1"
            >
              Browse Files
            </Button>
            <p className="text-[11px] text-muted-foreground/70">
              JPG, PNG, PDF, XLSX, CSV, DXF - Max 10MB
            </p>
          </div>
        )}
      </div>

      <UploadReviewDialog
        open={status === "review"}
        parts={extractedParts}
        warnings={warnings}
        stockWidth={stockWidth}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {dxfReview && (
        <DxfReviewDialog
          key={dxfReview.sourceFile}
          open={status === "review-dxf"}
          loop={dxfReview.loop}
          detectedUnits={dxfReview.detectedUnits}
          rejected={dxfReview.rejected}
          ignoredLayers={dxfReview.ignoredLayers}
          sourceFile={dxfReview.sourceFile}
          onConfirm={handleDxfConfirm}
          onCancel={handleDxfCancel}
        />
      )}
    </>
  )
}

function collectIgnoredLayers(
  entities: { layer: string; kind: string }[],
  activeLayer: string
): string[] {
  const layers = new Set<string>()
  for (const e of entities) {
    if (e.kind !== "unsupported" && e.layer !== activeLayer) {
      layers.add(e.layer)
    }
  }
  return Array.from(layers)
}

/**
 * Returns a `DxfReviewState` ready for the dialog, or `null` after
 * surfacing the appropriate operator-facing toast (DWG, no-loop,
 * multi-loop, bulge, curves). Caller transitions UploadStatus.
 */
async function processDxfFile(file: File): Promise<DxfReviewState | null> {
  if (/\.dwg$/i.test(file.name)) {
    toast.error("DWG not supported - please Save As DXF (R2018 ASCII).")
    return null
  }
  const doc = await readDxfFile(file)
  const layer = pickDefaultLayer(doc)
  const { loops, rejected } = connectLoops(doc, layer)

  if (loops.length === 0) {
    surfaceNoLoopToast(rejected)
    return null
  }

  if (loops.length > 1) {
    toast.error(`DXF contains ${loops.length} closed parts - multi-part import coming in PR2.`)
    return null
  }

  return {
    loop: loops[0],
    detectedUnits: detectUnits(doc),
    rejected,
    ignoredLayers: collectIgnoredLayers(doc.entities, layer),
    sourceFile: file.name,
  }
}

function surfaceNoLoopToast(rejected: RejectedEntity[]): void {
  if (rejected.some((r) => r.reason === "polyline-contains-bulge")) {
    toast.error("DXF contains arc-bulged polylines - flatten in CAD before importing.")
    return
  }
  if (rejected.some((r) => r.reason === "curves-deferred-to-pr2")) {
    toast.error(
      "DXF contains curves (ARC / CIRCLE / SPLINE / ELLIPSE) - curve support coming in PR2."
    )
    return
  }
  toast.error("No closed-loop part found in this DXF.")
}
