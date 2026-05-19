import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Covers every settings sub-tab (general, profile, notifications,
 * materials). The settings root (`settings/page.tsx`) is a redirect
 * to general, so navigation INTO settings always lands on a real
 * sub-route — this skeleton paints during that transition.
 *
 * Sub-tab clicks within settings use `router.push`, not `<Link>`, so
 * they don't trigger this loading.tsx. That's a separate fix queued
 * for a follow-up (settings tab pending state).
 *
 * TODO(phase6-pr2): `settings/materials/page.tsx` uses variant="dense"
 * (a table-shaped surface), so navigating there flashes the form
 * skeleton briefly before hydrating to a table. Add a per-leaf
 * override `settings/materials/loading.tsx` in the follow-up.
 */
export default function SettingsLoading() {
  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[{ label: "Settings" }]}
        title="Settings"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-96 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="mx-auto w-full max-w-2xl space-y-10 pb-20">
        {Array.from({ length: 3 }).map((_, sectionIdx) => (
          <div key={sectionIdx} className="space-y-6 rounded-lg border p-6">
            <Skeleton className="h-5 w-32" />
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 4 }).map((__, fieldIdx) => (
                <div key={fieldIdx} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
