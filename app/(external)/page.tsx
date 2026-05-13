import type { Metadata } from "next"
import Link from "next/link"

const entryPoints = [
  {
    label: "Get RubberFit",
    href: "https://get.rubberfit.app",
    kicker: "Marketing site",
    description: "Product overview, pricing, security posture, and trial flow for RubberFit.",
  },
  {
    label: "RubberFit Docs",
    href: "https://docs.rubberfit.app",
    kicker: "Documentation",
    description: "Setup guides, operator workflows, security details, and troubleshooting.",
  },
  {
    label: "Sign in",
    href: "/login",
    kicker: "Application",
    description: "Open the RubberFit dashboard for inventory, jobs, procurement, and nesting.",
  },
]

export const metadata: Metadata = {
  title: "RubberFit",
  description:
    "RubberFit is a CRM and 2D nesting engine for rubber manufacturers. Explore the product, read the docs, or sign in to the application.",
  alternates: {
    canonical: "https://rubberfit.app",
  },
  openGraph: {
    title: "RubberFit",
    description:
      "CRM, inventory, procurement, and 2D nesting for rubber manufacturing teams.",
    url: "https://rubberfit.app",
    siteName: "RubberFit",
    type: "website",
  },
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <Link href="/" className="flex items-center gap-3" aria-label="RubberFit home">
            <img src="/rubberfit-mark.svg" alt="" className="size-9" aria-hidden="true" />
            <span className="font-display text-lg font-semibold tracking-normal">RubberFit</span>
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-secondary"
          >
            Sign in
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Rubber manufacturing operations
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[0.95] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
              CRM, inventory, procurement, and nesting in one workflow.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              RubberFit gives rubber-roll fabricators one system for suppliers, stock,
              jobs, cut planning, audit history, and customer-ready output.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="https://get.rubberfit.app"
                className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Explore RubberFit
              </Link>
            </div>
          </div>

          <nav aria-label="RubberFit destinations" className="grid gap-3">
            {entryPoints.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="group rounded-lg border border-border bg-card p-5 transition hover:border-border-strong hover:bg-secondary"
              >
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {entry.kicker}
                </span>
                <span className="mt-3 flex items-center justify-between gap-4 font-display text-2xl font-semibold tracking-normal">
                  {entry.label}
                  <span
                    className="text-primary transition group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    -&gt;
                  </span>
                </span>
                <span className="mt-3 block text-sm leading-6 text-muted-foreground">
                  {entry.description}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </main>
  )
}
