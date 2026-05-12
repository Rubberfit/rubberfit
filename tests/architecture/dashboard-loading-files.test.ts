/**
 * Phase 6 PR 3.5 — pins the existence of every dashboard
 * `loading.tsx` shipped by PR 1 (#231) and PR 2 (#232).
 *
 * Why a static existence test instead of a Playwright behavior test:
 *
 *   The founder's "click tab → freeze" complaint was resolved by
 *   adding `loading.tsx` files at every dashboard section boundary,
 *   so a route transition paints a Suspense fallback the moment a
 *   sidebar link is clicked. We tried to lock the behavior in with
 *   a Playwright spec that throttled the destination's RSC fetch
 *   and asserted the skeleton paints, but the runtime fallback
 *   isn't guaranteed visible: most of this app's `page.tsx`
 *   components are `"use client"` and do their data-fetching in
 *   `useEffect`, so the React tree never actually suspends on the
 *   server. Next.js streams the rendered page directly without
 *   showing the loading boundary. The PR 1 fix DOES help (the
 *   fallback is prefetched and rendered when the RSC stream is
 *   slow), but it's not reliably observable from Playwright.
 *
 *   Per the Next.js docs (https://nextjs.org/docs/app/api-reference/file-conventions/loading),
 *   `loading.js` wraps the segment in Suspense and streams while
 *   content loads, but it doesn't promise a visible frame for
 *   non-suspending client pages.
 *
 *   So the actual regression we want to catch is "someone deleted
 *   one of these files." A static existence check is deterministic,
 *   fast, and fails loudly the moment any of the section-boundary
 *   skeletons goes missing.
 *
 * When to update this list:
 *
 *   - Add a path here whenever a new section-boundary `loading.tsx`
 *     ships (e.g., Phase 7 might add `app/dashboard/jobs/[id]/loading.tsx`).
 *   - Remove a path ONLY when the corresponding `page.tsx` is also
 *     removed; otherwise the founder's complaint comes back.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"

const expectedDashboardLoadingFiles = [
  "app/dashboard/loading.tsx",
  "app/dashboard/admin/security/loading.tsx",
  "app/dashboard/analytics/loading.tsx",
  "app/dashboard/cutting-engine/loading.tsx",
  "app/dashboard/cutting-engine/free-roam/loading.tsx",
  "app/dashboard/history/loading.tsx",
  "app/dashboard/inventory/loading.tsx",
  "app/dashboard/inventory/materials/loading.tsx",
  "app/dashboard/inventory/materials/types/loading.tsx",
  "app/dashboard/inventory/purchase-orders/new/loading.tsx",
  "app/dashboard/inventory/purchase-orders/[id]/edit/loading.tsx",
  "app/dashboard/jobs/loading.tsx",
  "app/dashboard/notifications/loading.tsx",
  "app/dashboard/security/loading.tsx",
  "app/dashboard/settings/loading.tsx",
  "app/dashboard/settings/materials/loading.tsx",
  "app/dashboard/users/loading.tsx",
] as const

describe("dashboard loading.tsx boundary files", () => {
  it.each(expectedDashboardLoadingFiles)("keeps %s", (relativePath) => {
    expect(existsSync(join(process.cwd(), relativePath))).toBe(true)
  })
})
