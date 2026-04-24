import type { PackRequest, PackResult, PackProgress } from "@/src/application/packing/types"

/**
 * Task 16: optional AbortSignal for cooperative cancellation.
 * If `signal.aborted` is set before `pack()` starts, the promise
 * rejects synchronously with `PackingAbortedError`. Mid-pack aborts
 * flip the Rust engine's cancel token via stdin; the returned
 * `PackResult.wasCancelled` is `true` when that path triggered.
 */
export interface PackOptions {
  onProgress?: (progress: PackProgress) => void
  signal?: AbortSignal
}

export interface IPackingService {
  pack(
    request: PackRequest,
    options?: PackOptions | ((progress: PackProgress) => void)
  ): Promise<PackResult>

  cancel(jobId: string): Promise<void>
}

export const PACKING_TOKENS = {
  IPackingService: Symbol.for("IPackingService"),
} as const
