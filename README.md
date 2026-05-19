# RubberFit

<p align="center">
  <img src="public/rubberfit-mark.svg" alt="RubberFit" width="120" />
</p>

<p align="center">
  <strong>Industrial Nesting Engine & Manufacturing CRM</strong><br/>
  Cut optimization, supplier management, procurement, and real-time analytics — built for the shop floor.
</p>

---

## Product Tiers

| Tier | What You Get |
|------|-------------|
| **RubberFit** | 2D nesting engine — smart cut optimization for rubber sheet materials |
| **RubberFit Pro** | Nesting + real-time analytics, waste tracking, and cost reporting |
| **RubberFit Max** | Full platform — nesting, analytics, CRM, procurement, people management, payments & invoicing |

This repository is the **RubberFit Max** codebase.

---

## What It Does

RubberFit is a purpose-built nesting engine and CRM for rubber manufacturing. It manages the full lifecycle — from material cut optimization and waste reduction through supplier relationships, procurement, people management, and invoicing.

### Smart Nesting Engine (RubberFit)

The nesting engine is a Rust workspace (`engine/`) exposed in the app via `IPackingService`. Every AutoNest pack — preview-grade or production — routes through the same pipeline:

- **In-process on Vercel** — `POST /api/v2/pack` lands on `api/v2/pack.rs`, which runs the packer via the `rf-layout` crate without spawning a child process
- **`pack-cli` in local dev** — the Next.js route handler at `app/api/v2/pack/route.ts` spawns the prebuilt `pack-cli` binary with JSON over stdin/stdout

The S2.5 pipeline is FFD bin-assignment + 2D grid warm-start + sparrow-style Guided Local Search + a cross-bin swap orchestrator. The TS-side packers (NFP greedy, MaxRects, shelf, guillotine, FAB score, GA rotation search) have all been retired — Rust is the single source of truth. The legacy `nesting/` directory remains only for the cutting-engine UI's NFP-based shape previews; removal is tracked as Task #16.

### Real-Time Analytics (RubberFit Pro)

- **Waste Analytics**: per-cut and aggregate waste metrics with trend analysis over time
- **Cost Tracking**: material utilization, cost breakdowns, and optimization recommendations
- **Dashboard**: usage trends, stock levels, waste comparison reports
- **Notifications**: in-app alerts and queued email/SMS for low stock, roll depletion, and system events

### Full CRM & Operations (RubberFit Max)

- **Multi-tenant** — tenants, memberships, and invitations; RLS enforces tenant boundaries on every table
- **Supplier Management** — full supplier profiles with contacts, addresses, shipping prefs, performance tracking, linked materials
- **Purchase Orders** — create, track, approve, receive, and reconcile POs with tax calculation, status workflows, and approval chains
- **Reorder Intelligence** — automatic low-stock detection with configurable thresholds and reorder-point calculations (EOQ)
- **Projects & Jobs** — project ownership, job assignment, roll allocation, project-cut-history linking
- **Payments & Invoicing** — invoice generation, order management, automatic tax calculation, Stripe integration
- **Real-Time Inventory** — automatic updates as cuts are recorded, with auto-depletion at zero length and offcut lineage tracking
- **RBAC** — six roles (admin, manager, supervisor, cutter, member, viewer) with route-level access control

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui + Radix |
| Canvas | Konva (cutting-engine visualizer) |
| State | Zustand + React Query patterns |
| Database | Supabase (PostgreSQL) with RLS |
| Nesting | Rust (`rf-geom`, `rf-layout`, `pack-cli` workspace) |
| Charts | Recharts |
| Architecture | Clean Architecture (DDD) + TSyringe DI |

## Prerequisites

- Node.js 18+ (v22.14.0+ recommended)
- npm 9+
- Rust (`rustup` — `rust-toolchain.toml` pins the version)
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)

## Setup

### 1. Clone & Install

```bash
git clone <repository-url>
cd rema-portal
npm install
```

### 2. Build the Rust engine (once)

```bash
npm run build:engine        # cargo build --release; ~2 min cold, seconds after
```

The dev server does NOT auto-build the engine, so do this once on a fresh clone. (`npm run build` has a `prebuild` hook that builds it for you.) Without the binary, the first POST to `/api/v2/pack` returns a 500.

### 3. Database

```bash
npm run supabase:start                          # boots local Postgres + Studio
npm run supabase:reset                          # applies all migrations
# or, with seed data:
cd src/infrastructure/supabase && supabase db reset --with-seed
```

The Supabase config and migrations live in [`src/infrastructure/supabase/`](src/infrastructure/supabase/). See that directory's [`README.md`](src/infrastructure/supabase/README.md) for the schema map and RLS model.

### 4. Environment

```bash
cp .env.example .env.local      # if present; otherwise create one
```

Add the credentials surfaced by `supabase start`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

### 5. Run

```bash
npm run dev     # http://localhost:3000
```

## Commands

```bash
# Development
npm run dev              # Next.js dev server
npm run build            # Production build (prebuild hook rebuilds the engine)
npm run start            # Production server

# Code quality (run before committing)
npm run typecheck        # tsc --noEmit — must be zero errors
npm run lint             # ESLint — must be zero errors, zero warnings
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier format
npm run format:check     # Check formatting without writing

# Tests (pretest hook auto-rebuilds the engine)
npm run test             # Vitest — TS unit + integration
npm run test:integration # Vitest, integration config only
npm run test:parity      # Packing parity snapshots (Rust baselines)
npm run test:e2e         # Playwright E2E
npm run test:rust        # cargo test for the Rust workspace

# Rust engine (standalone)
npm run build:engine     # cargo build --release → engine/target/release/pack-cli
npm run fmt:rust         # cargo fmt --all
npm run clippy:rust      # cargo clippy (-D warnings)

# OpenAPI (Rust API surface → TS client)
npm run openapi:dump     # regenerate engine/crates/rf-api/openapi.json
npm run openapi:types    # regenerate src/infrastructure/api-client/types.ts
npm run openapi:check    # CI-style drift check

# Supabase
npm run supabase:start
npm run supabase:stop
npm run supabase:reset
```

## Project Structure

```text
rema-portal/
├── app/                              # Next.js App Router
│   ├── actions/                      # Server actions — orchestration boundary
│   ├── api/                          # Route handlers (Node + Rust)
│   ├── dashboard/
│   │   ├── cutting-engine/           # Rust-backed 2D nesting UI
│   │   ├── inventory/                # Rolls, suppliers, purchase orders
│   │   ├── materials/                # Material types, pricing
│   │   ├── jobs/                     # Projects + jobs
│   │   ├── analytics/                # Waste & usage reports
│   │   └── admin/                    # Members, health, reconciliation
│   ├── stores/                       # Zustand stores
│   ├── server/                       # Server-only helpers (auth, DB factory)
│   └── lib/                          # Client utilities & RBAC
├── src/                              # Domain logic (Clean Architecture / DDD)
│   ├── application/                  # Service & repo interfaces, use-cases
│   ├── entities/                     # Domain models, value objects, errors
│   └── infrastructure/               # Supabase-backed implementations
│       └── supabase/                 # Migrations, config, client resolver
├── engine/                           # Rust nesting workspace
│   └── crates/
│       ├── rf-geom/                  # Geometry primitives
│       ├── rf-layout/                # Packing engine (depends on jagua-rs)
│       ├── pack-cli/                 # stdin/stdout JSON CLI
│       └── rf-api/                   # OpenAPI surface for the Vercel function
├── api/                              # Vercel serverless (Rust)
├── nesting/                          # Legacy TS NFP utilities (Task #16 — preview-only)
├── di/                               # TSyringe registration & tokens
├── config/                           # App-wide constants (APP_CONFIG)
├── docs/                             # Architecture, security, specs
├── tests/                            # Vitest (unit, integration, parity, architecture)
├── e2e/                              # Playwright suites
└── work_summary/                     # Dated session records
```

## Architecture

This project uses **Clean Architecture / DDD** with TSyringe DI. The layer boundary is strictly enforced — never skip layers.

- **Infrastructure services** are the only code allowed to call Supabase
- **Server actions** in `app/actions/` are the orchestration boundary (auth + permission + use-case dispatch)
- **Use-cases** orchestrate multi-service writes; pure CRUD goes hook → service direct
- **Repositories** are the only path for raw SQL row access; services expose entities

See [`CLAUDE.md`](CLAUDE.md) for the full architecture rules, data-flow contract, and naming conventions.

## Database

Schema and RLS policies live in [`src/infrastructure/supabase/migrations/`](src/infrastructure/supabase/migrations/), grouped by domain (core, inventory, operations, commerce, notifications, reference) with RPCs for invitations, PO reconciliation, and health checks layered on top. See the [supabase README](src/infrastructure/supabase/README.md) for the schema map.

## Security

- OAuth authentication via Supabase (Google, GitHub, Microsoft)
- Multi-tenant Row-Level Security (RLS) on every table — tenant + membership scoped
- Content Security Policy (CSP) headers
- Role-based access control (6 roles)
- Architectural guard ([`tests/architecture/no-direct-supabase.test.ts`](tests/architecture/no-direct-supabase.test.ts)) fails CI if app-layer code reaches Supabase directly

## License

Proprietary software — Arc & Anchor.
