import "reflect-metadata"
import { injectable } from "tsyringe"
import { spawn } from "node:child_process"
import path from "node:path"
import type {
  IPackingService,
  PackOptions,
} from "@/src/application/services/packing.service.interface"
import {
  PackingAbortedError,
} from "@/src/application/packing/types"
import type {
  PackRequest,
  PackResult,
  PackProgress,
} from "@/src/application/packing/types"

const DEFAULT_BINARY = path.resolve(
  process.cwd(),
  "engine/target/release/pack-cli"
)

/**
 * Task 16: RustPackingService wires pack-cli's `--stream` protocol
 * (Task 15) + AbortSignal cancellation (Task 14) into the TypeScript
 * service layer.
 *
 * Behavior matrix:
 *   - `options.onProgress` absent + `options.signal` absent
 *       → batch mode. Single stdout JSON line parsed as PackResult.
 *       Matches pre-Task-16 behavior for backward compat.
 *   - `options.onProgress` present OR `options.signal` present
 *       → streaming mode. Spawn with `--stream`, parse NDJSON line by
 *       line, invoke onProgress for each progress frame, resolve the
 *       final `PackResult` line. AbortSignal writes `{"cancel":true}`
 *       to child stdin.
 *
 * The method also accepts a bare callback (pre-Task-16 signature) for
 * backward compatibility with tests + LegacyPackingService call sites.
 */
@injectable()
export class RustPackingService implements IPackingService {
  private readonly binary: string

  constructor(binaryPath?: string) {
    this.binary = binaryPath ?? DEFAULT_BINARY
  }

  async pack(
    request: PackRequest,
    optionsOrCallback?:
      | PackOptions
      | ((progress: PackProgress) => void)
  ): Promise<PackResult> {
    const options = normalizeOptions(optionsOrCallback)

    if (options.signal?.aborted) {
      throw new PackingAbortedError(
        "signal already aborted before pack() started"
      )
    }

    const streaming =
      options.onProgress !== undefined || options.signal !== undefined
    return streaming
      ? this.packStreaming(request, options)
      : this.packBatch(request)
  }

  private async packBatch(request: PackRequest): Promise<PackResult> {
    return new Promise<PackResult>((resolve, reject) => {
      const child = spawn(this.binary, [], {
        stdio: ["pipe", "pipe", "pipe"],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk))
      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk))
      child.on("error", (error) => reject(error))
      child.stdin.on("error", (error) => reject(error))
      child.on("close", (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf8")
        const stderr = Buffer.concat(stderrChunks).toString("utf8")
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout) as PackResult)
          } catch (error) {
            const context = stderr.trim()
              ? ` | stderr: ${stderr.trim()}`
              : ""
            reject(
              new Error(
                `pack-cli stdout parse error: ${(error as Error).message}${context}`
              )
            )
          }
        } else {
          reject(new Error(`pack-cli exited ${code}: ${stderr.trim()}`))
        }
      })

      child.stdin.write(JSON.stringify(request))
      child.stdin.end()
    })
  }

  private async packStreaming(
    request: PackRequest,
    options: PackOptions
  ): Promise<PackResult> {
    return new Promise<PackResult>((resolve, reject) => {
      const child = spawn(this.binary, ["--stream"], {
        stdio: ["pipe", "pipe", "pipe"],
      })

      let finalResult: PackResult | null = null
      let lineBuffer = ""
      const stderrChunks: Buffer[] = []
      let abortRegistered = false

      const cleanup = () => {
        if (abortRegistered && options.signal) {
          options.signal.removeEventListener("abort", onAbort)
        }
      }

      const onAbort = () => {
        // Flip the Rust engine's cancel token via stdin. Swallow
        // write errors — the child may have already exited.
        try {
          if (!child.stdin.destroyed) {
            child.stdin.write('{"cancel":true}\n')
          }
        } catch {
          /* intentionally ignored */
        }
      }

      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true })
        abortRegistered = true
      }

      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk))

      child.stdout.on("data", (chunk: Buffer) => {
        lineBuffer += chunk.toString("utf8")
        // Drain every complete line in the buffer.
        let newlineIdx: number
        while ((newlineIdx = lineBuffer.indexOf("\n")) !== -1) {
          const line = lineBuffer.slice(0, newlineIdx).trim()
          lineBuffer = lineBuffer.slice(newlineIdx + 1)
          if (!line) continue
          try {
            const parsed = JSON.parse(line) as
              | PackProgress
              | PackResult
            if (isPackResult(parsed)) {
              finalResult = parsed
            } else if (options.onProgress && isPackProgress(parsed)) {
              // Never let a user callback throw out of the stream
              // loop — the child is still running.
              try {
                options.onProgress(parsed)
              } catch {
                /* intentionally ignored */
              }
            }
          } catch {
            // A malformed line likely indicates a corrupt pack-cli build.
            // Log once to stderr and continue reading — may still receive
            // a valid final PackResult.
            console.error(
              `RustPackingService: failed to parse NDJSON line: ${line}`
            )
          }
        }
      })

      child.on("error", (error) => {
        cleanup()
        reject(error)
      })
      child.stdin.on("error", (error) => {
        cleanup()
        reject(error)
      })

      child.on("close", (code) => {
        cleanup()
        const stderr = Buffer.concat(stderrChunks).toString("utf8")
        if (options.signal?.aborted && !finalResult) {
          reject(new PackingAbortedError())
          return
        }
        if (code === 0 && finalResult) {
          resolve(finalResult)
          return
        }
        if (code !== 0) {
          reject(new Error(`pack-cli exited ${code}: ${stderr.trim()}`))
          return
        }
        reject(
          new Error(
            "pack-cli --stream produced no PackResult line before exit"
          )
        )
      })

      child.stdin.write(JSON.stringify(request))
      child.stdin.write("\n")
      // NOTE: do NOT close stdin here — the cancel reader thread in
      // pack-cli needs stdin open to receive `{"cancel":true}` lines.
      // stdin closes implicitly when the child exits.
    })
  }

  async cancel(_jobId: string): Promise<void> {
    // Task 16 wires AbortSignal through `pack(request, {signal})`.
    // The `cancel(jobId)` method stays as a no-op for interface
    // compatibility with LegacyPackingService; S4 (Tauri) may wire a
    // registry of in-flight signals keyed by jobId.
  }
}

// ---------- helpers ----------

function normalizeOptions(
  input?: PackOptions | ((progress: PackProgress) => void)
): PackOptions {
  if (!input) return {}
  if (typeof input === "function") return { onProgress: input }
  return input
}

function isPackResult(v: unknown): v is PackResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "placements" in v &&
    Array.isArray((v as { placements: unknown }).placements)
  )
}

function isPackProgress(v: unknown): v is PackProgress {
  return (
    typeof v === "object" &&
    v !== null &&
    "iteration" in v &&
    "phase" in v &&
    !("placements" in v)
  )
}
