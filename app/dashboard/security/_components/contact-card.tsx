import { FileText, Mail, ShieldQuestion } from "lucide-react"

import { Card } from "@/app/components/ui/card"

/**
 * Closing call-to-action. Three concrete artifacts a prospect's
 * procurement or legal team will ask for during a review — we
 * list them up front with a single contact address so nothing
 * gets lost in a support thread.
 */

const ARTIFACTS = [
  {
    icon: FileText,
    title: "Data Processing Agreement",
    body: "Signed DPA with subprocessor addendum and SCCs, returned within two business days.",
  },
  {
    icon: ShieldQuestion,
    title: "Security questionnaires",
    body: "Pre-filled SIG-lite and CAIQ-Lite responses. Larger questionnaires answered in 3–5 business days.",
  },
  {
    icon: Mail,
    title: "Vulnerability disclosure",
    body: "Report findings to support@rubberfit.app — 48-hour response target with coordinated disclosure.",
  },
] as const

export function ContactCard() {
  return (
    <Card className="gap-5 px-6 py-6">
      <header className="space-y-1">
        <h2 className="font-semibold text-foreground text-base tracking-tight">
          Need the paperwork?
        </h2>
        <p className="text-muted-foreground text-xs">
          One inbox for every trust and compliance request.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ARTIFACTS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-muted/20 p-4"
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium text-foreground text-sm leading-tight">{title}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="font-medium text-foreground text-sm">
            support@rubberfit.app
          </p>
          <p className="text-muted-foreground text-xs">
            DPA, questionnaires, audit reports, and vulnerability disclosures.
          </p>
        </div>
        <a
          href="mailto:support@rubberfit.app?subject=Trust%20%26%20Security%20inquiry"
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90"
        >
          Get in touch
        </a>
      </div>
    </Card>
  )
}
