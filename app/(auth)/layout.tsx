import type { ReactNode } from "react"

import Link from "next/link"

import { AuthDrawing } from "./_components/auth-drawing"

import "./auth-layout.css"

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="auth-root">
      <section className="auth-pane-left">
        <header className="auth-brand-row">
          <Link href="/" aria-label="Rubberfit home" className="auth-brand-mark">
            <img
              src="/rubberfit-mark.svg"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
            />
          </Link>
          <span className="auth-brand-caption">Rubberfit / Auth</span>
        </header>

        <div className="auth-pane-content">{children}</div>

        <footer className="auth-footer">
          <span className="auth-footer-mono">© 2026 Arc &amp; Anchor</span>
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
        </footer>
      </section>
      <aside className="auth-pane-right" aria-hidden="true">
        <AuthDrawing />
      </aside>
    </main>
  )
}
