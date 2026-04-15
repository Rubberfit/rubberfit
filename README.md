# RubberFit

<p align="center">
  <img src="app/public/archanchorlogo.png" alt="Arc & Anchor" width="120" />
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

- **Multi-Strategy Optimization**: NFP greedy placement, MaxRects bin packing (5 heuristics), guillotine cutting, shelf packing, and width-pair pairing
- **Shape Support**: Rectangles, circles, trapezoids, and annular sectors (cone developments) with per-template quantity selection
- **Genetic Algorithm**: Evolutionary rotation optimization across single and multi-sheet layouts — evaluates up to 80 candidate configurations
- **Coarse-to-Fine Rotation Search**: Three-pass hierarchical strategy reducing rotation evaluations by 21.5x vs brute force
- **Free-Space Extraction**: Polygon-aware offcut identification via Clipper boolean operations for reusable material recovery
- **FAB Score**: Composite quality metric (waste, reusability, seam complexity, packing density) for layout evaluation

### Real-Time Analytics (RubberFit Pro)

- **Waste Analytics**: Per-cut and aggregate waste metrics with trend analysis over time
- **Cost Tracking**: Material utilization, cost breakdowns, and optimization recommendations
- **Dashboard**: Usage trends, stock levels, waste comparison reports
- **Notifications**: In-app alerts and queued email/SMS for low stock, roll depletion, and system events

### Full CRM & Operations (RubberFit Max)

- **Supplier Management**: Full supplier profiles with contact details, addresses, shipping preferences, performance tracking, and linked materials
- **Purchase Orders**: Create, track, and manage POs with tax calculation, status workflows, and approval chains
- **Reorder Intelligence**: Automatic low-stock detection with configurable thresholds and reorder point calculations (EOQ)
- **People Management**: Employee information, pay rates, positions, time-off tracking, benefits
- **Payments & Invoicing**: Invoice generation, order management, automatic tax calculation, Stripe integration
- **Real-Time Inventory**: Automatic updates as cuts are recorded, with auto-depletion at zero length
- **RBAC**: Six roles (admin, manager, supervisor, cutter, member, viewer) with route-level access control

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| State | Zustand |
| Database | Supabase (PostgreSQL) with RLS |
| Charts | Recharts |
| Architecture | Clean Architecture + TSyringe DI |

## Prerequisites

- Node.js 18+ (v22.14.0+ recommended)
- npm 9+
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)

## Setup

### 1. Clone & Install

```bash
git clone <repository-url>
cd rema-portal/app
npm install
```

### 2. Database

```bash
cd ../supabase
supabase start
supabase db reset            # Apply migrations
supabase db reset --with-seed # Optional: load sample data
```

### 3. Environment

```bash
cd ../app
cp .env.example .env.local
```

Update `.env.local` with the credentials from `supabase start`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

### 4. Run

```bash
npm run dev     # http://localhost:3000
```

## Production Build

```bash
cd app
npm run build && npm start
```

## Project Structure

```text
rema-portal/
├── app/                       # Next.js App Router
│   ├── dashboard/
│   │   ├── cut-planner/       # 2D nesting engine UI
│   │   ├── inventory/         # Inventory & reorder management
│   │   ├── materials/         # Material types, pricing, suppliers
│   │   ├── procurement/       # Purchase orders
│   │   ├── reports/           # Waste & usage reports
│   │   └── ...
│   ├── stores/                # Zustand state management
│   └── lib/                   # Client utilities & RBAC
├── src/                       # Domain logic (Clean Architecture)
│   ├── application/           # Service interfaces & use-cases
│   ├── entities/              # Domain models
│   └── infrastructure/        # Supabase-backed implementations
├── nesting/                   # 2D NFP nesting engine (standalone)
├── di/                        # TSyringe dependency injection
├── config/                    # App-wide constants
└── supabase/                  # Migrations & config
```

## Database Schema

| Table | Purpose |
|-------|---------|
| `material_types` | Rubber material definitions and properties |
| `rolls` | Physical inventory with dimensions and costs |
| `cuts` | Cut history with waste calculations |
| `suppliers` | Supplier profiles and preferences |
| `purchase_orders` | PO records with line items and status |
| `notifications` | In-app alerts (low stock, depletion, system) |
| `notification_queue` | Async email/SMS dispatch |

## Security

- OAuth authentication via Supabase (Google, GitHub, Microsoft)
- Row-Level Security (RLS) on all tables
- Content Security Policy (CSP) headers
- Role-based access control (6 roles)

## License

Proprietary software — Arc & Anchor.
