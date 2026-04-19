// tests/packing/rustServiceStreaming.test.ts
//
// Task 16: integration tests for RustPackingService's --stream +
// AbortSignal wiring. These run against the real pack-cli binary and
// are skipped if the binary isn't built.

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import {
  PackingAbortedError,
  type PackProgress,
  type PackRequest,
} from "@/src/application/packing/types"

const FIXTURE_DIR = path.resolve(
  __dirname,
  "../../engine/crates/rema-layout/tests/fixtures"
)
const RUST_BINARY = path.resolve(__dirname, "../../engine/target/release/pack-cli")

const rustAvailable = fs.existsSync(RUST_BINARY)

function load(file: string): PackRequest {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")) as PackRequest
}

describe("RustPackingService streaming protocol (Task 16)", () => {
  it.skipIf(!rustAvailable)(
    "batch mode: pack(request) with no options behaves as pre-Task-16",
    async () => {
      const svc = new RustPackingService()
      const result = await svc.pack(load("single-rect.json"))
      expect(result.placements).toBeDefined()
      expect(result.placedCount).toBeGreaterThanOrEqual(0)
      expect(result.wasCancelled).toBeFalsy()
    }
  )

  it.skipIf(!rustAvailable)(
    "streaming mode: onProgress fires at least once (baseline frame)",
    async () => {
      const svc = new RustPackingService()
      const captured: PackProgress[] = []
      const result = await svc.pack(load("multi-sheet-remnant.json"), {
        onProgress: (p) => captured.push(p),
      })
      expect(captured.length).toBeGreaterThan(0)
      // First frame should be iteration=0 (baseline).
      expect(captured[0].iteration).toBe(0)
      // Each frame has the expected shape.
      for (const frame of captured) {
        expect(typeof frame.iteration).toBe("number")
        expect(typeof frame.elapsedMs).toBe("number")
        expect(typeof frame.bestPlacedCount).toBe("number")
        expect(typeof frame.bestActiveStockDensity).toBe("number")
        expect(["explore", "compress"]).toContain(frame.phase)
      }
      // Final result still lands.
      expect(result.placements).toBeDefined()
    }
  )

  it.skipIf(!rustAvailable)(
    "streaming mode: supports bare callback signature (backward compat)",
    async () => {
      const svc = new RustPackingService()
      const captured: PackProgress[] = []
      const result = await svc.pack(
        load("single-rect.json"),
        (p) => captured.push(p)
      )
      expect(captured.length).toBeGreaterThan(0)
      expect(result.placements).toBeDefined()
    }
  )

  it.skipIf(!rustAvailable)(
    "signal pre-aborted: rejects synchronously with PackingAbortedError",
    async () => {
      const svc = new RustPackingService()
      const controller = new AbortController()
      controller.abort()
      await expect(
        svc.pack(load("single-rect.json"), {
          signal: controller.signal,
        })
      ).rejects.toThrow(PackingAbortedError)
    }
  )

  it.skipIf(!rustAvailable)(
    "signal mid-pack: eventually terminates without error",
    async () => {
      // Use a fixture with sufficient work that the CLI is still
      // running when the abort lands. We don't assert cancel latency
      // here (that's covered at the Rust library level in Task 14);
      // this test just verifies the TS adapter's abort-signal wiring
      // doesn't crash or leak.
      const svc = new RustPackingService()
      const req = load("multi-sheet-remnant.json")
      req.timeBudgetMs = 5_000
      const controller = new AbortController()
      // Fire abort on next tick — child has at least one event loop
      // iteration to start reading stdin.
      setTimeout(() => controller.abort(), 30)
      const t0 = Date.now()
      try {
        const result = await svc.pack(req, {
          signal: controller.signal,
        })
        // If the CLI finished naturally before abort landed, that's
        // fine — we just assert we got a valid result back.
        expect(result.placements).toBeDefined()
      } catch (error) {
        // If abort triggered before completion, we accept either
        // PackingAbortedError or a successful return with
        // wasCancelled=true (both are valid cooperative-cancel paths).
        if (!(error instanceof PackingAbortedError)) {
          throw error
        }
      }
      const elapsed = Date.now() - t0
      expect(elapsed).toBeLessThan(2_000)
    }
  )
})
