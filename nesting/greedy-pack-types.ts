import type {
  MultiSheetResult,
  SimplePartSpec,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"

export interface GreedyPackRequest {
  type: "pack"
  jobId: string
  specs: SimplePartSpec[]
  rollWidth: number
  rollLength: number
  fallbackCutWidth: number
  fallbackCutHeight: number
  fallbackQty: number
}

export interface GreedyCancelRequest {
  type: "cancel"
  jobId: string
}

export type GreedyWorkerInbound = GreedyPackRequest | GreedyCancelRequest

export type GreedyPackStage = "starting" | "packing" | "done"

export interface GreedyProgressMessage {
  type: "progress"
  jobId: string
  stage: GreedyPackStage
}

export interface GreedyDoneMessage {
  type: "done"
  jobId: string
  multiSheet: MultiSheetResult
}

export interface GreedyErrorMessage {
  type: "error"
  jobId: string
  message: string
}

export type GreedyWorkerOutbound =
  | GreedyProgressMessage
  | GreedyDoneMessage
  | GreedyErrorMessage
