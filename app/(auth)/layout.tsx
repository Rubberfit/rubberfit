import type { ReactNode } from "react"

import Link from "next/link"

import { AuthDrawing } from "./_components/auth-drawing"

import "./auth-layout.css"

// Strip any prerelease (`-beta.3`) or build-metadata (`+build.42`) suffix
// from the package.json version so the mobile footer doesn't overflow on
// off-tag builds. Industrial revision stamps care only about MAJOR.MINOR.PATCH.
const rawAppVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? ""
const revisionLabel = rawAppVersion.replace(/[-+].*$/, "")

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="auth-root">
      <section className="auth-pane-left">
        <header className="auth-brand-row">
          <Link href="/" aria-label="Rubberfit home" className="auth-brand-mark">
            <img src="/rubberfit-mark.svg" alt="" width={32} height={32} aria-hidden="true" />
          </Link>
          <span className="auth-brand-caption">Rubberfit / Auth</span>
        </header>

        <div className="auth-pane-content">{children}</div>

        <footer className="auth-footer">
          <span className="auth-footer-mono auth-footer-copy">© 2026 Arc &amp; Anchor</span>
          <span className="auth-footer-lang" aria-label="Interface language">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15 15 0 0 1 0 20" />
              <path d="M12 2a15 15 0 0 0 0 20" />
            </svg>
            ENG
          </span>
          {revisionLabel && (
            <span className="auth-footer-mono auth-footer-rev" role="note">
              REV. {revisionLabel}
            </span>
          )}
        </footer>
      </section>
      <aside className="auth-pane-right" aria-hidden="true">
        <AuthDrawing />
      </aside>
    </main>
  )
}
