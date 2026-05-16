#!/usr/bin/env node
/**
 * Patch @swc/helpers/package.json to expose ./esm/* + ./cjs/* via the
 * exports map.
 *
 * Why: starting at @swc/helpers 0.5.17, the package's exports map only
 * exposes subpath aliases like `./_/_interop_require_default`. Vercel's
 * `@vercel/nft` tracer respects the exports map strictly and strips
 * the `esm/` directory from the lambda bundle. But the SWC compiler
 * (used by Next.js 16 to transpile our app) emits raw file paths like
 * `require('@swc/helpers/esm/_interop_require_default.js')` instead of
 * the subpath form. The two halves disagree, the helper file isn't in
 * the lambda, and every middleware request 500s with
 *   Cannot find module '/var/task/node_modules/@swc/helpers/esm/_interop_require_default.js'
 *
 * Fix: add `./esm/*` and `./cjs/*` to the exports map so both raw-path
 * styles resolve to real files, and nft includes the directories at
 * trace time.
 *
 * This patch runs as a postinstall step so every fresh `npm install`
 * (including Vercel's lambda build) picks it up. Idempotent — safe to
 * re-run after the underlying package upgrades.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const PACKAGE_PATH = resolve(process.cwd(), "node_modules/@swc/helpers/package.json")

if (!existsSync(PACKAGE_PATH)) {
  // Vercel's `npm install --omit=dev` for some pipelines may skip this
  // dep entirely; nothing to patch.
  console.log("[patch-swc-helpers-exports] @swc/helpers not installed, skipping")
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"))
const exports = pkg.exports
if (!exports || typeof exports !== "object") {
  console.error("[patch-swc-helpers-exports] unexpected exports shape, skipping")
  process.exit(0)
}

let touched = false
if (!exports["./esm/*"]) {
  exports["./esm/*"] = "./esm/*"
  touched = true
}
if (!exports["./cjs/*"]) {
  exports["./cjs/*"] = "./cjs/*"
  touched = true
}

if (touched) {
  writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + "\n")
  console.log("[patch-swc-helpers-exports] added ./esm/* and ./cjs/* to exports map")
} else {
  console.log("[patch-swc-helpers-exports] exports already include ./esm/* and ./cjs/*, no-op")
}
