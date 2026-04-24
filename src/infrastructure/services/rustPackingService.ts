import "reflect-metadata"
import { injectable } from "tsyringe"
// node: imports happen lazily inside the methods that need them.
// This module is referenced from di-registration, which reaches
// client chunks through the cut-planner hook's TSyringe resolve —
// and Turbopack refuses to bundle `node:child_process` / `node:path`
// for the browser even under runtime guards. Moving the import to
// the call site keeps the module body browser-safe (no spawn on the
// client means no spawn import on the client).
//
// `loadChildProcess` is memoized so repeated pack calls don't pay
// the import resolution cost more than once.
//
// Next 16 + Turbopack started *statically* analysing even the
// `await import("node:…")` form below — tripping the runtime with
// `__turbopack_context__.x is not a function` when the module is
// reached from a client chunk. We hide the specifier behind
// `new Function("s", "return import(s)")` so the bundler can't
// pattern-match it; the actual import only fires when a real Node
// runtime calls into the service.
let cachedChildProcess: typeof import("node:child_process") | null = null
const nodeImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>

/**
 * Thrown when `pack()` is invoked from a browser context. The NFP
 * optimizer hook catches this and surfaces "NFP Error" on the
 * visualizer so the sync preview keeps rendering — the Rust
 * refinement simply doesn't run. No console noise, no unhandled
 * rejection from `node:child_process` failing to resolve.
 */
class PackingServerOnlyError extends Error {
  constructor() {
    super("RustPackingService is server-only — browser callers skip the Rust refinement.")
    this.name = "PackingServerOnlyError"
  }
}

async function loadChildProcess(): Promise<typeof import("node:child_process")> {
  if (cachedChildProcess) return cachedChildProcess
  // Browser short-circuit. Keeps the Function() wrapper past
  // Turbopack's static analysis above, but rejects cleanly before
  // attempting the `node:` import — the browser has no scheme for
  // it and the previous behaviour was a cryptic
  // `error loading dynamically imported module: node:child_process`
  // landing in the user's dev overlay every keystroke.
  if (typeof window !== "undefined") {
    throw new PackingServerOnlyError()
  }
  cachedChildProcess = (await nodeImport(
    "node:child_process"
  )) as typeof import("node:child_process")
  return cachedChildProcess
}
import type {
  IPackingService,
  PackOptions,
} from "@/src/application/services/packing.service.interface"
import { PackingAbortedError } from "@/src/application/packing/types"
import type { PackRequest, PackResult, PackProgress } from "@/src/application/packing/types"

// Default binary location — the build writes `pack-cli` to
// `engine/target/release` under the cwd. String concat is safe on
// Linux/macOS (both Fly and Vercel); if Windows support ever matters
// we'd need node:path, which would pull us back into the bundler-
// escape-hatch territory we just left.
const DEFAULT_BINARY =
  (typeof process !== "undefined" ? process.cwd?.() : "") + "/engine/target/release/pack-cli"

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
    optionsOrCallback?: PackOptions | ((progress: PackProgress) => void)
  ): Promise<PackResult> {
    const options = normalizeOptions(optionsOrCallback)

    if (options.signal?.aborted) {
      throw new PackingAbortedError("signal already aborted before pack() started")
    }

    const streaming = options.onProgress !== undefined || options.signal !== undefined
    return streaming ? this.packStreaming(request, options) : this.packBatch(request)
  }

  private async packBatch(request: PackRequest): Promise<PackResult> {
    const { spawn } = await loadChildProcess()
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
            const context = stderr.trim() ? ` | stderr: ${stderr.trim()}` : ""
            reject(new Error(`pack-cli stdout parse error: ${(error as Error).message}${context}`))
          }
        } else {
          reject(new Error(`pack-cli exited ${code}: ${stderr.trim()}`))
        }
      })

      child.stdin.write(JSON.stringify(request))
      child.stdin.end()
    })
  }

  private async packStreaming(request: PackRequest, options: PackOptions): Promise<PackResult> {
    const { spawn } = await loadChildProcess()
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
            const parsed = JSON.parse(line) as PackProgress | PackResult
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
            console.error(`RustPackingService: failed to parse NDJSON line: ${line}`)
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
        reject(new Error("pack-cli --stream produced no PackResult line before exit"))
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

function normalizeOptions(input?: PackOptions | ((progress: PackProgress) => void)): PackOptions {
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
    typeof v === "object" && v !== null && "iteration" in v && "phase" in v && !("placements" in v)
  )
}
