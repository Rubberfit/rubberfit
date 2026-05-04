import * as React from "react"

// Analytics sub-pages own their own PageShell + PageHeader. No shared
// tab strip lives here — sidebar navigation is the entry point to each
// surface, and the extra chrome was muddying the pages (user request).

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
