import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest, PackResult } from "@/src/application/packing/types"

// Server-only: spawns the `pack-cli` binary via `node:child_process`.
// Wrapped behind an opaque require so this module body stays free of
// `node:` specifiers — Turbopack refuses to bundle them for client
// chunks even under guards.
let cachedChildProcess: typeof import("node:child_process") | null = null

async function loadChildProcess(): Promise<typeof import("node:child_process")> {
  if (cachedChildProcess) return cachedChildProcess
  try {
    const nodeRequire = eval("require") as (
      specifier: string
    ) => typeof import("node:child_process")
    cachedChildProcess = nodeRequire("node:child_process")
  } catch (error) {
    throw new Error(
      "Failed to load node:child_process — RustPackingService can only run on the Node.js runtime.",
      { cause: error }
    )
  }
  return cachedChildProcess
}

const BINARY_EXT = typeof process !== "undefined" && process.platform === "win32" ? ".exe" : ""
const DEFAULT_BINARY =
  (typeof process !== "undefined" ? process.cwd?.() : "") +
  `/engine/target/release/pack-cli${BINARY_EXT}`

@injectable()
export class RustPackingService implements IPackingService {
  private readonly binary: string

  constructor(binaryPath?: string) {
    this.binary = binaryPath ?? DEFAULT_BINARY
  }

  async pack(request: PackRequest): Promise<PackResult> {
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
}
