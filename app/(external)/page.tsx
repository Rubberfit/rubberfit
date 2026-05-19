import type { Metadata } from "next"
import { HubClient, type EntryPoint } from "./_components/hub-client"

const entryPoints: EntryPoint[] = [
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
    description: "CRM, inventory, procurement, and 2D nesting for rubber manufacturing teams.",
    url: "https://rubberfit.app",
    siteName: "RubberFit",
    type: "website",
  },
}

export default function Home() {
  return <HubClient entryPoints={entryPoints} />
}
