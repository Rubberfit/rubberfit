# Phase A — OWASP ASVS 5.0 Verification Summary

**Date**: 2026-05-01
**Scope**: V2 (Validation), V4 (API), V8 (Authorization), V13 (Configuration) — at L1 + L2.
**Auditor**: Arc and Anchor (with Claude Code)
**Standard**: OWASP Application Security Verification Standard 5.0 (May 2025)

This is the closing summary for Phase A of the ASVS 5.0 verification engagement. Scope was locked in [asvs-5.0-applicability.md](asvs-5.0-applicability.md). Per-requirement evidence is in [asvs-5.0-checklist.md](asvs-5.0-checklist.md). Documented decisions live in [security-decisions.md](security-decisions.md). All findings filed as Linear issues in the **Rubberfit Web App** project.

## Headline

**rema-portal's authorization posture is significantly stronger than the early survey suggested.** Per-user RLS is enforced on all 14 public-schema data tables; the original `USING (true)` placeholder policies were dropped and replaced before this audit began. The `admin.*` schema gates with `admin.is_admin()`. Privilege escalation (`super_admin`, `roles`) is blocked at the DB layer.

The actual gaps are concentrated in three areas:

1. **Validation discipline at the Next.js API edge** — Zod is widely used in the frontend but not in the API routes; bodies are cast with `as` and trusted.
2. **Configuration hygiene** — `.env.example` documents 2 of 13 secrets the app actually reads; new deploys cannot reproduce env without out-of-band knowledge.
3. **Anti-automation** — no app-layer rate limiting on any route, including the one route (`/api/tax-rates`) that allows anonymous access and proxies a billed third-party API.

## What was audited

| Chapter | Sections | L1 reqs | L2 reqs | L3 reqs |
|---|---|---|---|---|
| V2 Validation | 2.1, 2.2, 2.3, 2.4 | 3 | 7 | 2 (skipped) |
| V4 API & Web Service | 4.1, 4.2 (V4.3 GraphQL N/A, V4.4 WebSocket N/A) | 1 | 4 | — |
| V8 Authorization | 8.1, 8.2, 8.3, 8.4 | 4 | 4 | — |
| V13 Configuration | 13.1, 13.2, 13.3, 13.4 | 1 | 14 | — |

L3 requirements were noted but not blocking for the L2 target.

## Findings — actionable (filed as Linear)

| ID | Priority | ASVS | Title |
|---|---|---|---|
| [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134) | **Urgent** | 8.2.1 | `/api/tax-rates` allows anonymous access — Ziptax API key abuse |
| [ARC-138](https://linear.app/arc-and-anchor/issue/ARC-138) | **High** | 13.3.1 | `.env.example` missing 11 of ~13 server-side env vars |
| [ARC-141](https://linear.app/arc-and-anchor/issue/ARC-141) | **High** | 2.2.1 | Add Zod validation to API routes that accept JSON bodies |
| [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142) | **High** | 2.4.1 | Add rate limiting to costly + sensitive API endpoints |
| [ARC-135](https://linear.app/arc-and-anchor/issue/ARC-135) | **High** | 8.2.2 | `cut_history` UPDATE blocked — RLS policy declared FOR INSERT instead of UPDATE |
| [ARC-136](https://linear.app/arc-and-anchor/issue/ARC-136) | **High** | 8.2.2 | Audit `makeAdminClient()` callsites — RLS bypass requires in-route ownership filtering |
| [ARC-137](https://linear.app/arc-and-anchor/issue/ARC-137) | Medium | 8.2.3 | Audit PATCH/PUT routes for mass-assignment (BOPLA) |
| [ARC-139](https://linear.app/arc-and-anchor/issue/ARC-139) | Medium | 13.4 | Sanitize internal error detail in API 500 responses |
| [ARC-140](https://linear.app/arc-and-anchor/issue/ARC-140) | Medium | 13.2.4 | Document SSRF posture; add allowlist before any user-controlled outbound URL |
| [ARC-143](https://linear.app/arc-and-anchor/issue/ARC-143) | Low | 8.1.1 | Remove duplicate `cut_history` DELETE policies |
| [ARC-144](https://linear.app/arc-and-anchor/issue/ARC-144) | Low | 13.1.1 | `cut_history` initial migration enables RLS without creating policies |
| [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) | Low | various | Populate documented security decisions per ASVS 5.0 |

**12 issues total. 1 urgent, 5 high, 3 medium, 3 low.**

## Findings — passes (recorded in checklist)

Areas that audited cleanly:

- **V8.2.2** Data-level access (RLS) — all 14 tables enforce `auth.uid() = user_id` per-user policies; new tables (jobs, job_parts, etc.) follow the pattern; admin schema gates with `admin.is_admin()`.
- **V8.3.1** Trusted service layer enforcement — RLS at DB + route checks at API layer; UI gating is convenience only.
- **V4.1.1** Content-Type with charset — `NextResponse.json()` everywhere; the one `new Response(...)` (in the v2 bridge) preserves upstream Content-Type and strips problematic encoding headers.
- **V4.1.2** No HTTP→HTTPS redirect for APIs — Vercel terminates TLS at edge.
- **V4.1.3** Intermediary headers not consumed — no code reads `x-forwarded-*`, `x-real-ip`, or `x-user-id`.
- **V13.4.1–V13.4.4** Information leakage hardening — no `.git`, debug off in production, no directory listings, TRACE not handled.
- **V13.2.3** No default credentials.

## Findings — out of Phase A scope

Areas observed during the audit but deferred to Phase B / C:

- **Rate limiting on auth flows** (login, OAuth callback, password reset) — V6/V2.4 hybrid; Phase B with V6 audit.
- **Outbound HTTP timeout/retry policy** (V13.1.3 L3) — deferred.
- **Cookie attributes** for Supabase SSR session (V3.3) — Phase B with V3.
- **Audit logging** (V16.3) — `admin.admin_activity_log` table exists with append-only rules but is not consistently written to from app code; full V16 audit in Phase B.
- **Rust-side validation** for v2 routes that forward through the bridge — out of Next.js scope, requires separate Rust audit pass.

## Notable corrections to initial assumptions

- The Phase 0 explorer-agent reported "permissive RLS policies on rolls/notifications/material_types" based on the original Phase 1 + Phase 2 migrations. **That was wrong.** Migration `20240223000001_add_user_id_and_fix_rls.sql` drops every `USING (true)` policy and replaces them with proper `auth.uid() = user_id` per-user policies. The applicability doc and checklist reflect the corrected state.
- The bridge layer at `app/api/v2/_lib/bridge.ts` is well-built — it fails closed on env, token, and upstream errors, and never echoes the upstream response on auth failure. This is better hygiene than typical proxy implementations.
- The `super_admin` flag is properly DBA-only — application UI cannot toggle it, and RLS policies prevent self-elevation. Role escalation through the application is blocked.

## Next phase recommendation

Phases B and C remain. Recommended sequencing:

**Phase B — Hardening** (V3, V14, V15, V16):
- V3 cookies + security headers (CSP, HSTS, frame-ancestors)
- V16 logging + error handling (consume `admin.admin_activity_log` from app code)
- V14 sensitive data inventory
- V15 dependency vulnerability scanning (Renovate / `npm audit` in CI)

**Phase C — Cleanup** (V1, V5, V6, V7, V9, V10, V11, V12):
- V6/V7 Supabase Auth configuration verification (one-time pass against the Dashboard)
- V5 file-handling decisions (CSV + PDF storage)
- V12 outbound TLS settings
- V1 / V9-V11 light passes (mostly delegation confirmation)

Recommended start: Phase B after the **High** Phase A tickets land (ARC-134, 135, 136, 138, 141, 142). Doing Phase B before fixing rate limiting would force redoing the V3 CORS + V16 audit-log surface decisions.

## Verification of this engagement

This Phase A produced four artifacts:

1. [asvs-5.0-applicability.md](asvs-5.0-applicability.md) — locked scope.
2. [asvs-5.0-checklist.md](asvs-5.0-checklist.md) — per-requirement Pass/Fail/Partial/N/A with evidence.
3. [security-decisions.md](security-decisions.md) — skeleton populated with confirmed decisions, with TBDs tracked in ARC-145.
4. This summary.

Plus 12 Linear issues against the **Rubberfit Web App** project. No code changes were made during this audit — remediations land as separate PRs that close their respective Linear tickets.
