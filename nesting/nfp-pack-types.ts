import type {
  MultiSheetResult,
  SimplePartSpec,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"

export interface NfpPackRequest {
  type: "pack"
  jobId: string
  specs: SimplePartSpec[]
  rollWidth: number
  rollLength: number
  fallbackCutWidth: number
  fallbackCutHeight: number
  fallbackQty: number
  spacing?: number
}

export interface NfpCancelRequest {
  type: "cancel"
  jobId: string
}

export type NfpWorkerInbound = NfpPackRequest | NfpCancelRequest

export type NfpPackStage = "starting" | "solving" | "finalizing" | "done"

export interface NfpProgressMessage {
  type: "progress"
  jobId: string
  stage: NfpPackStage
  percent: number
  generation?: number
  placedSoFar?: number
}

export interface NfpDoneMessage {
  type: "done"
  jobId: string
  multiSheet: MultiSheetResult
}

export interface NfpErrorMessage {
  type: "error"
  jobId: string
  message: string
}

export type NfpWorkerOutbound = NfpProgressMessage | NfpDoneMessage | NfpErrorMessage
