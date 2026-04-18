import "reflect-metadata"
import { injectable } from "tsyringe"
import { spawn } from "node:child_process"
import path from "node:path"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type {
  PackRequest,
  PackResult,
  PackProgress,
} from "@/src/application/packing/types"

const DEFAULT_BINARY = path.resolve(
  process.cwd(),
  "engine/target/release/pack-cli"
)

@injectable()
export class RustPackingService implements IPackingService {
  private readonly binary: string

  constructor(binaryPath?: string) {
    this.binary = binaryPath ?? DEFAULT_BINARY
  }

  async pack(
    request: PackRequest,
    _onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    return new Promise<PackResult>((resolve, reject) => {
      const child = spawn(this.binary, [], {
        stdio: ["pipe", "pipe", "pipe"],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk)
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk)
      })
      child.on("error", (error) => reject(error))
      // Guard against EPIPE when the child dies before stdin is drained —
      // without this listener, Node terminates the process on an
      // unhandled stream error.
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

  async cancel(_jobId: string): Promise<void> {
    // S2: single-shot CLI, no cancellation. S4 adds it via Tauri abort handles.
  }
}
