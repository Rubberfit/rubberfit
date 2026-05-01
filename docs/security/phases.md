# OWASP ASVS 5.0 Verification — Phase Roadmap

**Application:** rema-portal
**Standard:** OWASP Application Security Verification Standard 5.0 (May 2025)
**Target level:** L2 (covers L1 + L2, ~70% of all ASVS requirements)
**Owner:** Arc and Anchor

This document is the canonical roadmap for verifying rema-portal against ASVS 5.0. It defines the phased approach, the chapters audited in each phase, prerequisites between phases, and the deliverable contract. Per-requirement evidence lives in [asvs-5.0-checklist.md](asvs-5.0-checklist.md). Scope decisions live in [asvs-5.0-applicability.md](asvs-5.0-applicability.md). Documented security decisions live in [security-decisions.md](security-decisions.md).

## Why phased

ASVS 5.0 has ~350 requirements across 17 chapters. Doing all in-scope L1+L2 requirements in a single pass produces a long-lived branch, an unreviewable PR, and findings that grow stale before remediation lands. Splitting the work into three phases keeps each engagement deliverable in 1–2 sessions and lets remediations from earlier phases inform decisions in later ones (e.g. you can't write the V16 logging decision until the V8 service-role audit clarifies what data flows are sensitive).

The phases are sequenced **highest-leverage first** — the chapters most likely to surface real findings come first.

## Phase A — Critical · ✅ Complete (2026-05-01)

**Chapters:** V8 (Authorization) · V13 (Configuration) · V4 (API & Web Service) · V2 (Validation & Business Logic)

**Goal:** Lock the verification scope, establish documentation conventions, and audit the four chapters most likely to contain exploitable gaps. These chapters are the primary defensive surface for an authenticated B2B Next.js application.

### Deliverables produced

- [asvs-5.0-applicability.md](asvs-5.0-applicability.md) — locked scope (12 chapters in scope, V17 N/A, V4.3/V4.4 N/A).
- [asvs-5.0-checklist.md](asvs-5.0-checklist.md) — per-requirement Pass/Fail/Partial/N/A with file:line evidence.
- [security-decisions.md](security-decisions.md) — the documented-decisions skeleton ASVS requires; partially populated.
- [phase-a-summary.md](phase-a-summary.md) — closing summary + correction of the initial RLS misread.
- 12 Linear issues filed in **Rubberfit Web App** (ARC-134 through ARC-145).

### Findings landscape

- **1 Urgent**: [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134) — `/api/tax-rates` allows anonymous access (Ziptax API key abuse).
- **5 High**: cut_history UPDATE blocked by RLS policy bug, `makeAdminClient()` ownership audit, `.env.example` 11 of 13 vars missing, missing Zod on API routes, missing rate limiting.
- **3 Medium**: BOPLA audit, error-detail leakage, SSRF posture.
- **3 Low**: housekeeping + documentation consolidation.

### Notable correction

The Phase 0 explorer agent reported permissive `USING (true)` RLS policies. **That was wrong** — migration `20240223000001_add_user_id_and_fix_rls.sql` dropped them and replaced them with proper `auth.uid() = user_id` per-user policies. The actual data-level authorization posture is solid.

## Phase B — Hardening · ⏳ Pending

**Chapters:** V3 (Web Frontend Security) · V16 (Logging & Error Handling) · V14 (Data Protection) · V15 (Secure Coding & Architecture)

**Goal:** Close the hardening gaps that turn an authenticated app from "correct" to "defended in depth." Phase A established that authorization is enforced; Phase B establishes that the app degrades safely under attack and logs what it should.

### Prerequisites (must close before starting Phase B)

- [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134) — anonymous tax-rates access. Closing this changes the V3 CORS / V16 audit-log decisions.
- [ARC-138](https://linear.app/arc-and-anchor/issue/ARC-138) — `.env.example` completeness. V13.3 docs feed Phase B's secret-handling review.
- [ARC-141](https://linear.app/arc-and-anchor/issue/ARC-141) — Zod on API routes. V14 data-protection decisions reference per-entity validation rules.
- [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142) — rate limiting. V3 security headers and V16 logging both depend on knowing how rate limiting reports failures (429 path, log shape).

The remaining Phase A tickets (ARC-135/136/137/139/140/143/144/145) can land in parallel with or after Phase B.

### Sequencing within Phase B

1. **V3 Web Frontend Security** — first because the headers it adds (CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy) frame every later audit. Largest expected delta against current state since `next.config.mjs` configures none of these.
2. **V16 Security Logging & Error Handling** — second because V3 errors (CSP violations, blocked requests) need a log target, and V14/V15 reference the structured logger introduced here. Particular focus: actually consume `admin.admin_activity_log` from app code (the table exists, with append-only INSTEAD NOTHING rules — but no app writes to it today).
3. **V14 Data Protection** — third because the sensitive-field inventory (supplier emails, customer cut emails, PO totals, pricing) leans on V16's PII-redaction decisions for log output.
4. **V15 Secure Coding & Architecture** — last because dependency scanning, defensive-coding patterns, and concurrency review all benefit from the surface clarified by V3+V16+V14.

### Expected scope per chapter

| Chapter | Sections | Likely findings |
|---|---|---|
| V3 | 3.1–3.7 (Documentation, Unintended Content Interpretation, Cookie Setup, Security Mechanism Headers, Browser Origin Separation, External Resource Integrity, Other) | Missing CSP, missing HSTS, missing X-Frame-Options, cookie attributes for Supabase SSR session not explicitly verified. SRI on third-party scripts (none currently — N/A or document-only). |
| V16 | 16.1–16.5 (Documentation, General Logging, Security Events, Log Protection, Error Handling) | Ad-hoc `console.error` everywhere, no structured logger, no PII redaction, `admin.admin_activity_log` not consumed, error responses leak detail (overlaps with ARC-139). |
| V14 | 14.1–14.3 (Documentation, General Data Protection, Client-Side Data Protection) | Sensitive-field inventory missing. `NEXT_PUBLIC_*` audit (verify no secrets there). React Query cache hygiene for sensitive entities. |
| V15 | 15.1–15.4 (Documentation, Architecture & Dependencies, Defensive Coding, Safe Concurrency) | No `npm audit` / Renovate / Dependabot enforcement in CI. **GitHub already flagged 2 moderate Dependabot alerts on `dev`** — needs triage. Concurrency: roll consumption + cut allocation race conditions (overlap with V2.3.4). |

### Deliverables

Same shape as Phase A:
- Append Phase B sections to [asvs-5.0-checklist.md](asvs-5.0-checklist.md) with Pass/Fail/Partial/N/A.
- Update [security-decisions.md](security-decisions.md) — fill cookie attributes, session timeout, logging policy, sensitive-field inventory.
- Produce `phase-b-summary.md`.
- File one Linear issue per Fail/Partial in **Rubberfit Web App**, label `security`.

## Phase C — Cleanup · ⏳ Pending

**Chapters:** V1 (Encoding & Sanitization) · V5 (File Handling) · V6 (Authentication) · V7 (Session Management) · V9 (Self-contained Tokens) · V10 (OAuth & OIDC) · V11 (Cryptography) · V12 (Secure Communication)

**Goal:** Verify the chapters that are mostly delegation-confirmation (Supabase, Vercel) plus the small remaining surface (CSV import, PDF download, JSX escape paths, Rust crate `unsafe` audit). Phase C is lighter than A or B by design — most of the work is "verify Supabase configuration matches our documented decision."

### Prerequisites

- Phase B complete. Several V6/V7 decisions (session timeout, MFA enforcement) need V16 logging in place to be testable.
- Phase A's docs ticket [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) closed — Phase C's V6/V7 audit references the documented authentication decisions.

### Sequencing within Phase C

1. **V6 Authentication + V7 Session Management** — joint pass against the Supabase Dashboard. One-time configuration audit, screenshot referenced in checklist. Most requirements will be ✅ via delegation; a handful (cookie attributes, MFA enforcement policy, recovery flows) are app-side.
2. **V10 OAuth + V9 Self-contained Tokens + V11 Cryptography** — also delegation-heavy. App-side scope: callback redirect handling (`app/(auth)/callback/route.ts`), any direct JWT claim inspection, any custom uses of `crypto`.
3. **V12 Secure Communication** — outbound TLS settings (Supabase, Resend, Ziptax, RF_API_URL, Slack). TLS termination at Vercel edge for inbound is documented as upstream-controlled.
4. **V1 Encoding & Sanitization** — JSX escape verification (default-safe), `pack-cli` command-construction audit (verify no shell interpolation), log-injection check, Rust crate `unsafe` block audit (V1.4 applies to the engine crates).
5. **V5 File Handling** — finalize CSV import limits (already drafted in security-decisions.md), PDF storage ACL verification (Supabase Storage bucket policies for cut history PDFs).

### Expected scope per chapter

| Chapter | Effort | Notes |
|---|---|---|
| V6 Authentication | Low | Mostly delegation. Config audit + MFA enforcement decision. |
| V7 Session Management | Low | Cookie attributes (overlaps V3.3 from Phase B). Session termination on password change. |
| V9 Self-contained Tokens | Light | Confirm no app-side JWT issuance/verification beyond Supabase. |
| V10 OAuth & OIDC | Light | Callback redirect-URL allowlist. |
| V11 Cryptography | Light | Grep for direct `crypto.*` usage; audit each. |
| V12 Secure Communication | Low | TLS version on outbound clients. |
| V1 Encoding & Sanitization | Medium | `pack-cli` argument construction is the highest-impact item. Plus Rust `unsafe` audit. |
| V5 File Handling | Low | CSV size + row limits; PDF storage bucket ACL. |

### Deliverables

Same shape as Phase A and B. After Phase C, the checklist has Pass/Fail/Partial/N/A for every L1+L2 in-scope requirement. The application's ASVS L2 status is then verifiable.

## Out-of-band items (not Phase A/B/C)

These don't fit cleanly in the phase structure but track here so they aren't lost:

- **Rust backend audit** — the v2 routes that forward through `app/api/v2/_lib/bridge.ts` defer validation and authorization to the Rust backend at `RF_API_URL`. The Next.js audit verifies the bridge layer; full V2/V8 verification of the Rust routes themselves is a **separate engagement** with its own scope doc.
- **Dependabot alerts** (currently 2 moderate on `dev`) — triage during Phase B V15. Don't wait for the full Phase B engagement if any are Critical or High — those should be triaged immediately.
- **Supabase platform configuration** — password policy, MFA enforcement, OAuth provider settings, RLS-bypass key rotation. One-time audit during Phase C, but the **list of decisions** lives in security-decisions.md from Phase A onward.
- **Vercel platform configuration** — TLS, headers, environment variable scoping, deploy protection. Reviewed during Phase B V13/V15 but configuration itself is out-of-band.

## Re-verification cadence

ASVS 5.0 status is not a one-time stamp. Recommended re-verification:

- **Quarterly** — re-run the per-requirement checklist evidence checks. Most pass without code change; flag anything that has drifted.
- **On every major release** — Phase A chapters (V2/V4/V8/V13) re-verified at minimum; auth/permission changes always re-trigger V8 audit.
- **On Supabase / Vercel platform updates** — Phase C delegation chapters revalidated against the new platform configuration.

A scheduled agent can run the lightweight portion of this (file existence checks, route inventory, env-var inventory, Dependabot alerts) — see `/schedule` for setup.

## Phase status at a glance

| Phase | Status | Chapters | Date |
|---|---|---|---|
| A — Critical | ✅ Complete | V8, V13, V4, V2 | 2026-05-01 |
| B — Hardening | ⏳ Pending | V3, V16, V14, V15 | TBD — gated on Phase A High tickets |
| C — Cleanup | ⏳ Pending | V1, V5, V6, V7, V9, V10, V11, V12 | TBD — gated on Phase B |
