/**
 * Source of truth for the Trust & Security surface. Copy here
 * is grounded in what the codebase actually does — each claim
 * maps to a specific migration, middleware rule, or dependency.
 * Do not add aspirational language; if a control isn't shipped,
 * put it under "What we can't promise yet" in the footer card.
 *
 * Audit evidence:
 *   - User-scoped RLS:     supabase/migrations/20240223000001_add_user_id_and_fix_rls.sql
 *   - Storage folder RLS:  supabase/migrations/20260420000001_cut_history_pdf_uploads.sql:39-62
 *   - Admin schema RLS:    supabase/migrations/20260418000001_create_admin_tables.sql
 *   - Append-only audit:   20260418000001_create_admin_tables.sql:319-320
 *   - Middleware gate:     proxy.ts:69-101
 *   - Dependencies:        package.json (no analytics, no AI APIs)
 */

export interface FaqItem {
  q: string
  a: string
}

export interface FaqSectionData {
  id: string
  title: string
  subtitle: string
  items: ReadonlyArray<FaqItem>
}

export const FAQ_SECTIONS: ReadonlyArray<FaqSectionData> = [
  {
    id: "data-location",
    title: "Where your data lives",
    subtitle:
      "Storage, residency, and tenant isolation — enforced at the database, not the app.",
    items: [
      {
        q: "Where is our operational data stored?",
        a: "In a Supabase-managed PostgreSQL database running on AWS (us-east-1). PDF cut reports live in Supabase Storage, which is AWS S3 under the hood. Supabase holds a SOC 2 Type 2 attestation covering this infrastructure.",
      },
      {
        q: "How is our data isolated from other customers?",
        a: "Every table that holds customer data carries a `user_id` column, and every row-access policy requires `auth.uid() = user_id`. The enforcement happens in Postgres itself, not in application code — so even an app-level bug cannot surface another customer's rows. This applies to cuts, rolls, cut history, materials, suppliers, purchase orders, pricing, notifications, and preferences.",
      },
      {
        q: "What about generated PDFs and cut reports?",
        a: "Stored in the `cut-history-pdfs` bucket with folder-scoped Row-Level Security. A user can only write to, update, or delete files under a folder whose name matches their auth UID. Cross-user reads or writes are rejected by the storage layer before any handler runs.",
      },
      {
        q: "Do you have EU data residency?",
        a: "Not today — everything currently resides in AWS us-east-1. EU-region Supabase projects are available on the Enterprise plan; contact us if this is required for your deployment.",
      },
    ],
  },
  {
    id: "access-control",
    title: "Who can access your data",
    subtitle:
      "RBAC on the app side, RLS on the database side, and an immutable audit trail for admin actions.",
    items: [
      {
        q: "Can Arc & Anchor staff see our data?",
        a: "Only staff with the `super_admin` flag set in the profiles table. The flag is checked at the edge (middleware) on every request to /admin/*, and every table in the internal admin schema is RLS-gated by a database function (admin.is_admin()). There's no way to bypass either layer from the application.",
      },
      {
        q: "How granular is team-level access control?",
        a: "Six roles: admin, manager, supervisor, cutter, member, viewer. Permissions are defined in code, enforced by middleware on every authenticated route, and checked again by Postgres RLS when data is fetched. Role assignments are visible to your own admins in the Users panel.",
      },
      {
        q: "Is there an audit trail of admin actions?",
        a: "Yes. The admin_activity_log table captures every admin-portal action with actor, resource, IP, user agent, and a metadata payload. Rows in that table are physically append-only — SQL rules rewrite UPDATE and DELETE into NO-OPs, so admin history cannot be tampered with, even by admins themselves.",
      },
      {
        q: "Are unauthenticated API routes possible?",
        a: "No. The Next.js middleware (proxy.ts) gates every /dashboard/* and /admin/* request. Unauthenticated requests are redirected to /login; permission-gated routes reject users whose roles don't match. All authenticated responses ship with `Cache-Control: private, no-store` so nothing caches a logged-in response.",
      },
    ],
  },
  {
    id: "authentication",
    title: "Authentication & sessions",
    subtitle:
      "Delegated to Supabase GoTrue — we never touch raw passwords.",
    items: [
      {
        q: "How do users sign in?",
        a: "Email + password or Google OAuth, both brokered by Supabase GoTrue. Your password never passes through our code or storage — Supabase hashes it, manages sessions, and handles password reset flows. If you prefer SSO-only, we can disable password sign-in on your account.",
      },
      {
        q: "Do you support multi-factor authentication?",
        a: "Yes. TOTP-based MFA is available via Settings → Profile & account. Any RFC 6238 authenticator works — 1Password, Authy, Google Authenticator, Microsoft Authenticator. The session is upgraded to assurance level 2 after a successful code challenge, and the challenge is enforced on every sign-in once a factor is enrolled. You can also enforce MFA at the identity-provider level via Google Workspace SSO.",
      },
      {
        q: "How are sessions managed?",
        a: "HttpOnly session cookies set by Supabase's SSR client. Every authenticated response includes `Cache-Control: private, no-store`. Sessions can be revoked instantly by signing out or by resetting the password from the profile page.",
      },
      {
        q: "What happens to deleted accounts?",
        a: "A user flagged as deleted is signed out on their next request and redirected to the sign-in screen. Full account deletion (including row-level data) is currently support-initiated; a self-serve flow is planned for Q3 2026.",
      },
    ],
  },
  {
    id: "data-egress",
    title: "What leaves the stack",
    subtitle:
      "An exhaustive list of every third-party service the code touches.",
    items: [
      {
        q: "Which third-party services receive our data?",
        a: "Four, each for a single specific purpose. Supabase holds everything (database, storage, auth). Vercel hosts the Next.js app — no customer data at rest, just request routing. Resend sends transactional email (low-stock alerts, POs) — only recipient address and message body transit. Google OAuth sees your email and OAuth token at sign-in, if you use it. All four hold SOC 2 Type 2 attestations.",
      },
      {
        q: "Do you use analytics or behavioral tracking?",
        a: "No. The codebase contains no PostHog, Segment, Mixpanel, Amplitude, Sentry, Datadog, Vercel Analytics, Google Analytics, Meta pixel, or any similar SDK. You can verify this yourself by inspecting package.json in your contract deliverables.",
      },
      {
        q: "Do you send our data to AI APIs?",
        a: "No. No OpenAI, Anthropic, Cohere, or Replicate clients exist in the codebase. The cut-nesting engine is a compiled Rust binary that runs on the application server — all computation is local, no cloud inference.",
      },
      {
        q: "What about webhooks or outbound HTTP calls?",
        a: "The only outbound HTTP calls in the code are: (1) Resend email dispatch, (2) a Stripe billing-provider health probe that sends no customer data, and (3) internal Supabase calls. No customer-data webhooks.",
      },
    ],
  },
  {
    id: "encryption",
    title: "Encryption",
    subtitle:
      "At rest via AWS / Supabase managed encryption; in transit via TLS 1.2+.",
    items: [
      {
        q: "Is data encrypted at rest?",
        a: "Yes. Supabase encrypts Postgres volumes with AES-256 via AWS RDS-managed keys, and Storage buckets with AES-256 via S3-managed encryption. Backups are encrypted at the block level. Key rotation is handled by AWS KMS.",
      },
      {
        q: "Is data encrypted in transit?",
        a: "Yes. TLS 1.2+ between the browser and Vercel's edge, between Vercel and Supabase, and between Supabase and its backing AWS services. HSTS is enforced by Vercel's default configuration for all production domains.",
      },
      {
        q: "Are any fields additionally encrypted at the column level?",
        a: "Not today — standard disk-level encryption covers the current data classification. Column-level encryption for specific sensitive fields is available on Enterprise plans if your compliance team requires it.",
      },
    ],
  },
  {
    id: "ownership",
    title: "Data ownership & portability",
    subtitle:
      "You're the controller. We're the processor. Your data, your rules.",
    items: [
      {
        q: "Who owns our data?",
        a: "You do. Arc & Anchor is a data processor, not a controller. Every cut plan, material record, supplier, PO, and price point you capture is yours. We use it only to operate the service on your behalf.",
      },
      {
        q: "Can we export everything?",
        a: "Cut history and purchase orders have CSV export built into the UI. A full multi-table JSON dump is available via support request — typically delivered within one business day. Enterprise plans can request read-only direct database access.",
      },
      {
        q: "What happens if we cancel?",
        a: "You keep access for 30 days to export any remaining data. After the grace period, primary-database rows are hard-deleted. Encrypted backups roll off per Supabase's retention schedule (up to 30 days). Billing records are retained only as required by US tax law.",
      },
      {
        q: "Can we get a deletion confirmation?",
        a: "Yes. On request, we provide written confirmation with the deletion timestamp and verification that backup rotation has completed.",
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance & subprocessors",
    subtitle:
      "Where we are on SOC 2, GDPR, and how to get the paperwork procurement needs.",
    items: [
      {
        q: "Is Arc & Anchor SOC 2 certified?",
        a: "Not yet — but the entire platform runs on SOC 2 Type 2 attested infrastructure (Supabase, Vercel, Resend). Our own Type 1 engagement with Vanta begins Q3 2026; Type 2 attestation is targeted for Q1 2027. Our existing controls — tenant isolation, encryption, append-only audit log, RBAC — are already aligned with SOC 2 Common Criteria CC6 (Logical Access) and CC7 (System Operations).",
      },
      {
        q: "What's the full subprocessor list?",
        a: "Supabase Inc. (database, storage, auth; AWS us-east-1). Vercel Inc. (application hosting). Resend Inc. (transactional email). Google LLC (OAuth sign-in, optional). Each holds SOC 2 Type 2 attestation. Subprocessor additions are notified 30 days in advance per our DPA.",
      },
      {
        q: "How do you handle GDPR / CCPA?",
        a: "We honor data subject access, export, and deletion requests within 30 days. EU-region hosting is available on Enterprise plans. Standard Contractual Clauses can be appended to the DPA on request.",
      },
      {
        q: "Can we get a DPA?",
        a: "Yes. Our processor DPA template (covering GDPR, UK GDPR, and CCPA, with EU Standard Contractual Clauses and a subprocessor addendum) is maintained at docs/legal/data-processing-agreement-template.md in the repo. Contact support@rubberfit.app with the name of the contracting entity and we'll return a counter-signed copy within two business days.",
      },
      {
        q: "Do you fill out security questionnaires (SIG-lite, CAIQ)?",
        a: "Yes. We maintain pre-filled SIG-lite and CAIQ-Lite responses that we can send on request. Larger questionnaires typically take 3–5 business days.",
      },
    ],
  },
  {
    id: "incident-response",
    title: "Incident response",
    subtitle: "How we escalate, how fast you hear, and how to report a finding.",
    items: [
      {
        q: "If you were breached, when would we hear?",
        a: "Within 72 hours of a confirmed incident. Admin-role users receive direct email notifications, and material incidents are posted to the status page with ongoing updates until resolution.",
      },
      {
        q: "What's your incident history?",
        a: "Zero reportable security incidents to date. Detailed status history is available on request for active customers.",
      },
      {
        q: "How do I report a vulnerability?",
        a: "Email support@rubberfit.app. We respond within 48 hours, coordinate disclosure with you, and publicly credit researchers with their consent. We do not pursue legal action against good-faith security research.",
      },
    ],
  },
] as const
