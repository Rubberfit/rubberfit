# OWASP ASVS 5.0 — Applicability for rema-portal

**Standard:** OWASP Application Security Verification Standard 5.0 (May 2025)
**Target level:** L2 (covers L1 + L2 ≈ 70% of all ASVS requirements)
**Application:** rema-portal — Next.js 16 + Supabase Postgres internal operations app for a manufacturing business
**Date locked:** 2026-05-01
**Owner:** Arc and Anchor

This document defines the **scope** of the ASVS verification effort: which chapters apply, which sections are partial or N/A, and the rationale. Verification of individual requirements is tracked in [asvs-5.0-checklist.md](asvs-5.0-checklist.md). Documented security decisions referenced by the requirements live in [security-decisions.md](security-decisions.md).

## Why L2

ASVS levels:

- **L1 (~20% of reqs)** — critical baseline; intended floor for any production app.
- **L2 (~50% of reqs)** — standard practices; "most applications should be striving to achieve this level."
- **L3 (~30% of reqs)** — high-assurance / defense-in-depth (banks, healthcare).

rema-portal handles authenticated business operations (suppliers, purchase orders, pricing, customer-bound cut history, internal inventory) under an RBAC model with six roles. There is no consumer-grade payment data, no PHI, and no public exposure beyond the authenticated UI. **L2 is the appropriate target.** Selected L3 requirements may be adopted opportunistically when implementation cost is low (e.g. HSTS preload, request-smuggling defenses).

## Application characteristics relevant to scope

- **Stack:** Next.js 16 App Router (`^16.2.3`), Supabase (Postgres + Auth + Storage), TypeScript strict, Tailwind, Zustand, TSyringe, Rust nesting engine via `child_process`.
- **Authentication:** Supabase Auth (email+password, Google OAuth, TOTP MFA). All password storage, session token issuance, OAuth state/PKCE handling is delegated to Supabase.
- **Authorization:** App-layer RBAC (`src/application/permissions.ts`) + Postgres RLS (`src/infrastructure/supabase/migrations/`).
- **API surface:** ~56 REST route handlers under `app/api/**`. No GraphQL, no WebSocket, no WebRTC.
- **Inputs:** JSON bodies, form posts, one CSV import endpoint, no file uploads.
- **Outputs:** JSON responses, server-rendered HTML (Next.js JSX auto-escapes), cut-history PDF generation.
- **External services:** Supabase, Resend (email), Google OAuth (via Supabase), tax API, vision/OCR API.
- **Native code:** Rust `pack-cli` binary spawned as subprocess; receives JSON via stdin from `/api/v2/pack`.
- **Hosting:** Vercel (assumed) — TLS termination at edge, environment variables provided by platform.

## Chapter applicability

Legend: ✅ in scope (full) · 🟡 in scope (partial — see notes) · ❌ out of scope.

| # | Chapter | Scope | Rationale |
|---|---|---|---|
| V1 | Encoding & Sanitization | ✅ | Next.js JSX escapes by default (mitigates V1.2 XSS). V1.2 SQLi via Supabase parameterized queries. V1.3 sanitization applies to log injection + `pack-cli` command construction. **V1.4 (memory/unmanaged) — N/A in TS, but applies to Rust crates** (`engine/crates/*`). V1.5 deserialization applies to JSON parsing in API routes and CSV parsing. |
| V2 | Validation & Business Logic | ✅ | All four sections apply. Business logic includes PO state transitions, cut status transitions, RBAC threshold checks, EOQ math. Anti-automation (V2.4) currently absent — gap expected. |
| V3 | Web Frontend Security | ✅ | App is a browser-rendered web frontend. No CSP / CSRF / security headers configured in `next.config.mjs` — gaps expected across V3.3 (cookies), V3.4 (security headers), V3.5 (origin separation). |
| V4 | API & Web Service | ✅ partial | V4.1 (generic web service) and V4.2 (HTTP message structure) apply to the 56 API routes. **V4.3 GraphQL — N/A.** **V4.4 WebSocket — N/A.** |
| V5 | File Handling | 🟡 | No general file upload feature. **V5.2 partially applies** to the CSV import endpoint (`/api/v2/import/rolls/csv`) — size limit, content-type, UTF-8 handling. **V5.3 storage** applies to cut-history PDFs in Supabase Storage. **V5.4 download** applies to the PDF download route. |
| V6 | Authentication | 🟡 | Supabase Auth handles password hashing (V6.2), TOTP MFA crypto (V6.5/V6.7), OAuth tokens. The **app's responsibility** is configuration of these flows: password policy in Supabase Dashboard, MFA enforcement for admin roles, lockout policy, recovery flows (`reset-password`, `update-password`), and the OAuth callback (`app/(auth)/callback/route.ts`). |
| V7 | Session Management | 🟡 | Supabase SSR cookies. App's responsibility: cookie attributes (HttpOnly, Secure, SameSite), session timeout policy, termination on password change/logout, admin session-termination affordance. |
| V8 | Authorization | ✅ | **Highest-priority chapter.** RBAC matrix (`permissions.ts`), admin guard (`require-admin.ts`), and Postgres RLS. The early permissive policies (`USING (true)`) added in `migrations/20240217000007_enable_rls_policies.sql` were dropped and replaced by per-user `auth.uid() = user_id` policies in `migrations/20240223000001_add_user_id_and_fix_rls.sql`; new tables (jobs, cut_history, etc.) follow the same pattern. The remaining V8 work is scope-confirmation, not a re-architecture. |
| V9 | Self-contained Tokens | 🟡 | JWTs are issued, signed, and validated by Supabase. App requirement is that **any place** the app inspects JWT claims (RLS context via `auth.uid()`, custom token verification) follows V9.1/V9.2. Mostly delegated. |
| V10 | OAuth & OIDC | 🟡 | Google OAuth is brokered via Supabase. App-side responsibilities: callback handling (state/PKCE delegated to Supabase), redirect-URL allowlist, consent screen content (out of app scope). Most V10 requirements are Supabase's responsibility. |
| V11 | Cryptography | 🟡 | Most cryptographic operations are delegated (Supabase: password hashing, JWT signing, TLS termination at Vercel/Supabase). App's responsibility: any custom uses of `crypto`, `randomUUID`, hashing, signing, or encryption. Audit will grep the codebase for direct crypto API usage. |
| V12 | Secure Communication | ✅ | TLS to Supabase, Resend, Google, tax API, vision API. V12.1 (TLS versions) and V12.2 (external HTTPS) apply. V12.3 service-to-service applies to outbound HTTP clients in services. |
| V13 | Configuration | ✅ | Env var management, `.env.example` completeness, secret rotation policy, info-leakage hardening (no `.git`, no debug, no stack traces in error responses, no TRACE method). Service role key is the crown jewel. |
| V14 | Data Protection | ✅ | Sensitive business data: supplier records, PO totals, customer emails on cuts, internal pricing. V14.1 documentation, V14.2 storage protections, V14.3 client-side data exposure (no secrets in `NEXT_PUBLIC_*`). |
| V15 | Secure Coding & Architecture | ✅ | The Clean Architecture defined in `CLAUDE.md` is exactly what V15.1/V15.2 documentation requires. V15.3 defensive coding applies broadly. V15.4 safe concurrency applies to PO/cut state transitions and roll-depletion triggers. Dependency vulnerability scanning (V15.2) currently not enforced — gap expected. |
| V16 | Security Logging & Error Handling | ✅ | App uses ad-hoc `console.error` with no structured logger, no audit log table, no PII redaction. Significant gaps expected. |
| V17 | WebRTC | ❌ | No WebRTC usage in the app. Skip entirely. |

**Summary:** 11 chapters in full scope, 5 partial (V4 partial, V5/V6/V7/V9/V10/V11 partial-by-delegation), 1 N/A (V17). Total in-scope L1+L2 requirements: ≈ 200 (refined per chapter in the checklist).

## Out-of-scope items (explicit)

- **V17 WebRTC** — no peer-to-peer media in the application.
- **V4.3 GraphQL, V4.4 WebSocket** — no GraphQL or WebSocket endpoints.
- **V1.4 Memory/Unmanaged Code (TypeScript paths only)** — TS is memory-safe. **However, V1.4 still applies to the Rust crates** in `engine/crates/`; this is covered by `rustfmt`/`clippy -D warnings` + `cargo test`, with the audit confirming no `unsafe` blocks lacking justification.
- **L3 requirements** — not the target level. Tracked separately for opportunistic adoption.
- **External processes** (database backups, infrastructure provisioning, DNS, WAF rules) — out of ASVS scope per spec § "Application".

## Mapping of partially-delegated chapters (V6, V7, V9, V10, V11)

For each of these, an entry in [security-decisions.md](security-decisions.md) records:

1. Which sub-requirements are **delegated to Supabase** (out of app scope — verified once via Supabase project settings).
2. Which sub-requirements are **app-side** (in scope for code-level verification).
3. The Supabase Dashboard configuration that demonstrates compliance for delegated items.

## How verification is performed

For every in-scope requirement at L1 + L2:

1. The checklist entry is filled with **Pass / Fail / N/A / Partial** plus evidence: a file path with line range, or a Supabase Dashboard screenshot reference, or a remediation Linear ticket ID.
2. **Pass** requires positive evidence (the requirement is implemented and verifiable).
3. **N/A** requires written rationale in the entry (cannot be silently skipped).
4. **Fail / Partial** items get a Linear issue filed in the **Rubberfit Web App** project, label `security/asvs`, with the requirement ID in the title.

## Phase plan (Phase A first)

| Phase | Chapters | Status |
|---|---|---|
| A — Critical | V8, V13, V4, V2 | ✅ **Complete** — 2026-05-01 (see [phase-a-summary.md](phase-a-summary.md)) |
| B — Hardening | V3, V16, V14, V15 | ⏳ Pending — gated on Phase A High tickets ([ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134), [ARC-138](https://linear.app/arc-and-anchor/issue/ARC-138), [ARC-141](https://linear.app/arc-and-anchor/issue/ARC-141), [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142)) |
| C — Cleanup | V1, V5, V12, V6, V7, V9, V10, V11 | ⏳ Pending — runs after Phase B |

Phase A produced [phase-a-summary.md](phase-a-summary.md). The full multi-phase plan, prerequisites, and re-verification cadence live in [phases.md](phases.md).
