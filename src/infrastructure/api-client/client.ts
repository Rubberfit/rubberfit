/**
 * Shared openapi-fetch instance for the Rust backend.
 *
 * The client talks to the same origin the browser is on — Vercel
 * routes `/api/v2/**` through the Next.js cookie→bearer bridge,
 * which forwards to the Rust API at `RF_API_URL`. Callers never
 * hit the Fly host directly from the browser (keeps CORS simple
 * and lets us flip `NEXT_PUBLIC_USE_RUST_INVENTORY` without
 * redeploying the backend).
 *
 * Per-aggregate wrappers live in `./rf/inventory.ts` etc. Consumers
 * should import those, not this client directly — the wrappers
 * normalise DTO shapes + give terse method names.
 */
import createClient from "openapi-fetch"

import type { paths } from "./types"

export type RfClient = ReturnType<typeof createClient<paths>>

/**
 * Build the shared client. Exported as a function (not a module-
 * level const) so that:
 *
 *   - Unit tests can build an isolated instance per describe block.
 *   - Server-side rendering works — `baseUrl = ""` means "same
 *     origin as the running request," which is what we want in
 *     both browser and Next.js server contexts.
 */
export function buildRfClient(baseUrl: string = ""): RfClient {
  return createClient<paths>({ baseUrl })
}

export const rfClient: RfClient = buildRfClient()
