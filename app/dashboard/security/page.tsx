import { PageHeader, PageShell } from "@/app/components/patterns"

import { ContactCard } from "./_components/contact-card"
import { FAQ_SECTIONS } from "./_components/faq-data"
import { FaqSection } from "./_components/faq-section"
import { TrustSignals } from "./_components/trust-signals"

/**
 * Trust & Security surface — the answer to "what about our data?"
 * Every claim on this page is grounded in the codebase; see
 * `_components/faq-data.ts` for the evidence map.
 *
 * Accessible to every authenticated role (no `requiredPermission`
 * on the sidebar entry) so a customer's IT or procurement reviewer
 * can be handed a viewer account and read this directly.
 */

export default function SecurityPage() {
  return (
    <PageShell variant="overview" spacing="default">
      <PageHeader
        title="Trust & Security"
        subtitle="How your data is stored, protected, and kept apart from everyone else's — grounded in the code, not marketing."
      />
      <TrustSignals />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-8 min-w-0">
          {FAQ_SECTIONS.map((section) => (
            <FaqSection key={section.id} data={section} />
          ))}
        </div>
        <nav
          aria-label="On this page"
          className="hidden lg:block"
        >
          <div className="sticky top-16 space-y-3">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              On this page
            </p>
            <ul className="space-y-1.5 text-sm">
              {FAQ_SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
      <ContactCard />
    </PageShell>
  )
}
