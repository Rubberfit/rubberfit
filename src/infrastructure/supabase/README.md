# `src/infrastructure/supabase/`

Supabase wiring for the Rema Portal application. This directory owns the
runtime-aware database-client resolver, the SQL migration set, and the
local-dev `config.toml`. The canonical schema lives in
[`./migrations/`](./migrations/) — read those files for the source of truth.

## Layout

| Path                                                 | Purpose                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`get-database-client.ts`](./get-database-client.ts) | Runtime-aware client resolver. Infrastructure services call `await getDatabaseClient()` instead of importing the browser singleton directly — the helper returns a cookie-bound server client on Node and the browser singleton in the bundle. |
| [`server-clients.ts`](./server-clients.ts)           | API-route helpers: `makeAuthClient(request)` (anon, cookie-borne JWT) and `makeAdminClient()` (service-role, RLS-bypassing). Service-role escapes are reserved for explicitly-authorized admin route handlers.                                 |
| [`config.toml`](./config.toml)                       | Local Supabase CLI config (ports, project ref, feature toggles). Edited locally; not deployed.                                                                                                                                                 |
| [`migrations/`](./migrations/)                       | 15 SQL files. The first 10 (`20260421000001` … `20260421000010`) are the post-redesign canonical schema; everything after that is incremental. See **Migration order** below.                                                                  |
| [`seed.sql`](./seed.sql)                             | Local dev seed data — applied by `supabase db reset --with-seed`.                                                                                                                                                                              |
| `.branches/`, `.temp/`                               | Supabase CLI scratch dirs. Git-ignored.                                                                                                                                                                                                        |

## Client resolution rule

Infrastructure services do **not** import the browser singleton from
`@/src/infrastructure/models/supabase` directly. Instead:

```ts
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const supabase = await getDatabaseClient()
const { data, error } = await supabase.from("rolls").select("*")
```

`getDatabaseClient()` returns the right client for the runtime:

- **Server (Node)** — cookie-bound `createServerClient` produced by the
  factory registered at server-action entry. Reads `auth.uid()` from the
  request JWT so Postgres RLS enforces the policy.
- **Browser** — the existing lazy-init `createBrowserClient` singleton.

Server actions and route handlers must call
`ensureDatabaseFactoryRegistered()` from
[`@/app/server/database/register-factory`](../../../app/server/database/register-factory.ts)
as the first line of every entry point that may touch the database. The
call is idempotent. Layout-based registration was rejected because
Next.js does not contractually guarantee `app/layout.tsx` module
evaluation before a server-action POST in serverless workers.

The architectural guard
[`tests/architecture/no-direct-supabase.test.ts`](../../../tests/architecture/no-direct-supabase.test.ts)
fails CI if any non-allowlisted file under `app/` (or `proxy.ts`) calls
`.from(...)`, `.rpc(...)`, `.storage.*`, or constructs its own client.
The allowlist contains only auth-flow files where Next.js cookie binding
is unavoidable.

## RLS is the security model

The anon key + cookie-borne JWT pattern preserves RLS. Postgres sees
`auth.uid()` from the request and enforces tenant + membership policies
exactly as it would from the browser. **Never** use the service-role
key for normal CRUD; `makeAdminClient()` exists only for explicitly
authorized admin route handlers (it bypasses RLS entirely).

For new-user flows where the caller has no membership yet (e.g. the
invitation-accept landing page), use `getOptionalUser()` from
`app/server/auth/require-authenticated-user.ts` and the SECURITY DEFINER
RPCs `accept_invitation` / `get_invitation_by_token` rather than
escalating to service-role.

## Migration order

Migrations are applied lexically by filename. The current set is grouped
by domain rather than by change date — earlier per-feature migrations
were consolidated into the post-redesign schema files below.

| File                                            | Purpose                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260421000001_schema_core.sql`                | `tenants`, `profiles`, `memberships`, `tenant_settings`, base auth wiring.                                                                 |
| `20260421000002_schema_inventory.sql`           | `material_types`, `rolls`, `cuts`, `cut_history`, `cut_history_selections`, offcut lineage.                                                |
| `20260421000003_schema_operations.sql`          | `projects`, `jobs`, `job_parts`, `job_assignees`, `job_roll_allocations`, project-cut-history join.                                        |
| `20260421000004_schema_commerce.sql`            | `suppliers`, `material_suppliers`, `price_history`, `reorder_rules`, `purchase_orders`, `purchase_order_items`, PO number sequence.        |
| `20260421000005_schema_notifications.sql`       | `notifications` (UI feed) + `notification_queue` (async dispatch) + `notification_preferences`. See "Notifications gotcha" in `CLAUDE.md`. |
| `20260421000006_schema_reference.sql`           | Tax configuration + city tax rates + tax API cache.                                                                                        |
| `20260421000007_indexes.sql`                    | All performance indexes (roll optimization, notifications-unread, cuts-recent, PO lookups).                                                |
| `20260421000008_functions_and_triggers.sql`     | Auto-deplete trigger, low-stock notification trigger, `updated_at` triggers, helper functions.                                             |
| `20260421000009_rls_policies.sql`               | Tenant-scoped RLS on every table.                                                                                                          |
| `20260421000010_storage_buckets.sql`            | Storage buckets for cut-history PDFs and job/roll-scan PDFs.                                                                               |
| `20260509000001_invitations.sql`                | `invitations` table + `accept_invitation` SECURITY DEFINER RPC scaffold.                                                                   |
| `20260509000002_admin_schema.sql`               | Cross-schema admin views + health-check RPCs (`admin_*`).                                                                                  |
| `20260513000001_po_receipts_reconciliation.sql` | PO-receipt idempotency + reconcile RPCs (7c-2 admin reconcile flow).                                                                       |
| `20260515000001_accept_invitation_rpc.sql`      | Atomic invitation-accept RPC (memberships INSERT + invitation flip in one txn). SQLSTATEs P0001–P0006.                                     |
| `20260515000002_invitation_lookup_rpc.sql`      | `get_invitation_by_token` — public-safe lookup, granted to anon + authenticated.                                                           |

## Local dev quick start

```bash
# Prereqs: Docker Desktop running, Node 18+, Supabase CLI installed
supabase start                                # boots local Postgres + Studio + Inbucket
supabase db reset                             # applies all migrations
supabase db reset --with-seed                 # ... plus seed.sql

# Configure the Next.js app
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase start` output>
EOF

# Iterate on the schema locally before pushing
supabase migration new <slug>                 # creates a new dated file
supabase db reset                             # re-applies the full set
```

Cloud projects (staging, prod) are deployed via `supabase db push` from
this directory. Prefer local-first iteration: get migrations green
against `supabase db reset` before pushing anywhere.

## Row types

Database row types live in
[`src/infrastructure/models/supabase.ts`](../models/supabase.ts) alongside
the lazy-init browser client. They are hand-curated `interface`
definitions today — they drift behind the schema if not updated when
migrations land. When you change a table shape, update the matching
interface in that file in the same PR.

(A migration to fully auto-generated types via `supabase gen types
typescript` is a future cleanup; until then, treat the hand-written
types as authoritative for application code and the SQL in
[`./migrations/`](./migrations/) as authoritative for the database.)

## Troubleshooting

- **Port conflicts** — edit `config.toml`.
- **RLS denials (`42501`) from a server action** — confirm
  `ensureDatabaseFactoryRegistered()` is the first line of the action,
  and that infra services call `await getDatabaseClient()` rather than
  importing the browser singleton.
- **`auth.uid()` is null on the server** — same root cause; cookies
  aren't reaching Postgres. Check the factory registration and the
  request's `Cookie` header.
- **Stale Docker volume** — `supabase stop --no-backup && supabase start`.
