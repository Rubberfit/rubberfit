# security/

Customer-facing Trust & Security surface — the answer to
"what about our data?" during procurement reviews. Visible to
every authenticated role (no `requiredPermission` on the nav
entry) so prospects' IT/legal reviewers can use a viewer
account to scan it directly.

## Files

- **page.tsx** -- Server component, assembles the surface:
  `PageHeader` + `TrustSignals` + seven `FaqSection`s driven
  by `FAQ_SECTIONS`, a sticky on-page table-of-contents, and
  a closing `ContactCard` with the `security@` inbox.

## \_components/

- **faq-data.ts** -- Source of truth for every claim on the
  page. Each bullet is tied back to a specific migration or
  code path in the header comment (`user-scoped RLS`,
  `folder-scoped storage RLS`, `append-only admin activity
  log`, `proxy.ts middleware gate`, `zero-analytics
  package.json`). Do not add aspirational copy here — gaps
  belong in the "What we can't promise yet" surface.
- **trust-signals.tsx** -- Four headline cards across the
  top (RLS, AES-256/TLS, append-only audit, four
  subprocessors). Icons from Lucide. Fixed order, high-signal
  claim first.
- **faq-section.tsx** -- One expandable category. Uses
  native `<details>`/`<summary>` instead of a custom
  accordion — zero state, accessible by default, prints
  expanded (procurement teams PDF this page for review).
- **contact-card.tsx** -- Closing card listing the three
  artifacts prospects will ask for (DPA, security
  questionnaire responses, vulnerability disclosure) behind
  one `support@rubberfit.app` inbox.

## Why no permission gate

The sidebar entry (`app/navigation/sidebar/sidebar-items.ts`)
is intentionally ungated. Every authenticated role (including
`viewer`) should be able to read this — a customer may invite
their own IT or legal reviewer with a viewer seat so they can
browse the page without being handed a login with elevated
access.

## Content audit rule

Every claim must be cite-able against code. Key evidence:

| Claim                    | Evidence                                                                                            |
|--------------------------|-----------------------------------------------------------------------------------------------------|
| User-scoped RLS          | `src/infrastructure/supabase/migrations/20240223000001_add_user_id_and_fix_rls.sql`                 |
| Storage folder RLS       | `src/infrastructure/supabase/migrations/20260420000001_cut_history_pdf_uploads.sql:39-62`           |
| Admin schema RLS         | `src/infrastructure/supabase/migrations/20260418000001_create_admin_tables.sql` (admin.is_admin)    |
| Append-only audit log    | `src/infrastructure/supabase/migrations/20260418000001_create_admin_tables.sql:319-320`             |
| Middleware auth gate     | `proxy.ts:69-101`                                                                                    |
| No analytics / AI APIs   | `package.json` — no posthog/segment/mixpanel/sentry/datadog/openai/@anthropic-ai                    |
| Transactional email only | `app/api/admin/health/run/route.ts:128` — only outbound to api.resend.com                           |

When any control in the table above changes, update the
matching entry in `_components/faq-data.ts` **in the same
commit** — the page and the code must stay in lockstep.
