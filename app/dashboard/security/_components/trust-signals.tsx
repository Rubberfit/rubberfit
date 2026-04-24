import { DatabaseZap, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

/**
 * Four headline trust cards that run across the top of the
 * security surface. Each one names a concrete control that
 * prospects can verify — not a vague claim. Order is fixed
 * (high-signal first): tenant isolation, encryption, audit
 * log, subprocessor list.
 *
 * Design note: the emphasis metric (`headline`) is the label
 * that's visually loudest. The elaboration underneath keeps
 * the claim honest and cite-able.
 */

interface Signal {
  icon: typeof ShieldCheck
  headline: string
  title: string
  body: string
}

const SIGNALS: ReadonlyArray<Signal> = [
  {
    icon: ShieldCheck,
    headline: "Row-Level Security",
    title: "Isolation in Postgres",
    body: "Every tenant-owned row carries a user_id. Database policies refuse reads across tenants — enforcement sits below the application, not on top of it.",
  },
  {
    icon: LockKeyhole,
    headline: "AES-256 / TLS 1.2+",
    title: "Encrypted end-to-end",
    body: "At rest via AWS-managed keys. In transit between every hop — browser, application, database, and storage.",
  },
  {
    icon: FileCheck2,
    headline: "Append-only audit",
    title: "Admin actions logged",
    body: "Every admin-portal action is written to an immutable log. SQL rules block UPDATE and DELETE — history cannot be rewritten, not even by admins.",
  },
  {
    icon: DatabaseZap,
    headline: "Four subprocessors",
    title: "Nothing else touches your data",
    body: "Supabase, Vercel, Resend, Google OAuth. All four hold SOC 2 Type 2 attestations. No analytics, no AI APIs, no trackers in the codebase.",
  },
]

export function TrustSignals({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
      aria-label="Trust signals"
    >
      {SIGNALS.map(({ icon: Icon, headline, title, body }) => (
        <Card
          key={headline}
          className="group gap-3 border-border-subtle bg-card px-5 py-5 transition-colors hover:border-border"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md border border-border-subtle bg-muted/40">
              <Icon className="size-4 text-foreground" aria-hidden="true" />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              {headline}
            </span>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              {title}
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {body}
            </p>
          </div>
        </Card>
      ))}
    </section>
  )
}
