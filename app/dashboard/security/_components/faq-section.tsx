import { Plus } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

import type { FaqSectionData } from "./faq-data"

/**
 * One topical FAQ section — header + expandable Q/A rows.
 *
 * Deliberately uses native <details>/<summary> rather than a
 * custom accordion. Zero client state, accessible by default,
 * keyboard-navigable without JS, and prints expanded — which
 * matters when procurement teams PDF this page for review.
 *
 * The `group` + `open:` variant pattern on <details> is what
 * rotates the chevron and swaps the hover border without ever
 * reaching for React state.
 */

export function FaqSection({ data, className }: { data: FaqSectionData; className?: string }) {
  return (
    <section
      id={data.id}
      className={cn("space-y-3 scroll-mt-16", className)}
      aria-labelledby={`${data.id}-title`}
    >
      <header className="space-y-1">
        <h2
          id={`${data.id}-title`}
          className="font-semibold text-foreground text-base tracking-tight"
        >
          {data.title}
        </h2>
        <p className="text-muted-foreground text-xs">{data.subtitle}</p>
      </header>
      <Card className="divide-y divide-border-subtle gap-0 py-0">
        {data.items.map((item) => (
          <details
            key={item.q}
            className="group px-5 py-4 open:bg-muted/30 transition-colors"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
              <span className="flex-1 font-medium text-foreground text-sm leading-snug">
                {item.q}
              </span>
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border-subtle text-muted-foreground transition-transform group-open:rotate-45">
                <Plus className="size-3" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-3 pr-8 text-muted-foreground text-sm leading-relaxed">
              {item.a}
            </p>
          </details>
        ))}
      </Card>
    </section>
  )
}
