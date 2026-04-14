# Rema Portal

A material optimization and inventory management system for USI Manufacturing, designed to track rubber roll inventory and optimize material cuts to minimize waste.

## ✨ Current Features

- **Real-Time Inventory Tracking**: Automatic inventory updates as cuts are recorded. Rolls are automatically marked depleted when length hits zero.
- **Material Cut Optimization**: 2D nesting engine with multiple packing strategies (MaxRects bin packing, NFP-based greedy placement, guillotine-fit, shelf packing) to minimize material waste across single and multi-sheet layouts. Supports rectangles, cylinders, cones, and trapezoids with per-template quantity selection.
- **Waste Tracking**: Calculates and records waste metrics to analyze optimization performance over time.
- **Low Stock Alerts**: Automatic system notifications when material stock falls below designated thresholds.
- **Dashboard Analytics**: Visualize usage trends and current stock across different materials.
- **Web-Based Access**: Accessible via any modern browser with responsive layout.

## 🛠 Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **UI & Styling**: Tailwind CSS v4 + shadcn/ui
- **State Management**: Zustand
- **Database**: Supabase (PostgreSQL) with Row-Level Security (RLS)
- **Charts**: Recharts
- **Build Tools**: Vite / TypeScript Compiler

## 📋 Prerequisites

- Node.js 18+ (v22.14.0+ recommended)
- npm 9+
- Docker (Required for running a local Supabase instance)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) installed globally

## 🔧 Setup Instructions

### 1. Clone & Install Dependencies

```bash
git clone <repository-url>
cd rema-portal

# Navigate to app directory and install all dependencies
cd app
npm install
```

### 2. Local Database Setup (Supabase)

A local Supabase instance using Docker is highly recommended for development.

```bash
# Go back to project root
cd ..

# Start local Supabase instance
cd supabase

# Start local Supabase instance (Docker must be running)
supabase start

# Apply all database migrations to setup the schema
supabase db reset

# (Optional) Seed the database with realistic test materials, rolls, and cuts
supabase db reset --with-seed
```

### 3. Configure Environment Variables

```bash
cd app
cp .env.example .env.local
```

Update your `.env.local` to match your local Supabase credentials outputted during `supabase start`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```
### Step 4: Load Sample Data (Optional)

```bash
# From the supabase directory
cd ../supabase
supabase db seed
```

## 🚀 Development Mode

We provide multiple ways to run the application depending on your focus. In your terminal, make sure you are inside the `app/` directory:

### Web Development
Starts the Next.js frontend with hot-module reloading.
```bash
npm run dev
# Opens at http://localhost:3000
```

## 📦 Building for Production

Make sure you are inside the `app/` directory.

```bash
npm run build
npm start
```

## 🗂 Project Structure

```
rema-portal/
├── app/                       # Next.js App Router pages & components
│   ├── dashboard/
│   │   ├── cut-planner/       # Cut planner with 2D nesting engine
│   │   ├── inventory/         # Inventory, POs, reorder management
│   │   ├── materials/         # Material types & pricing
│   │   └── ...
│   ├── components/ui/         # shadcn/ui primitives
│   ├── stores/                # Zustand state management
│   └── lib/                   # Client utilities
├── src/                       # Domain logic (Clean Architecture)
│   ├── application/           # Service interfaces & use-cases
│   ├── entities/              # Domain models
│   └── infrastructure/        # Supabase-backed implementations
├── nesting/                   # 2D NFP nesting engine (standalone)
├── di/                        # TSyringe dependency injection
├── config/                    # App-wide constants
├── supabase/
│   ├── migrations/            # SQL migrations
│   └── config.toml            # Supabase config
├── .github/
│   ├── scripts/               # Project board sync automation
│   └── workflows/             # CI workflows
└── README.md
```

## 📊 Database Schema

### Core Tables

- **material_types**: Master list of rubber material definitions and properties.
- **rolls**: Physical inventory of rubber rolls with dimensions and costs.
- **cuts**: Historical records of all cuts made, with waste calculations.
- **notifications**: System alerts, primarily for low-stock warnings.

## 🔒 Security

- OAuth authentication via Supabase (Google, GitHub, Microsoft)
- Row-Level Security (RLS) policies on all tables
- Content Security Policy (CSP) headers configured

## 📈 Performance Targets

- Startup time: < 2.5 seconds
- Memory usage: < 180MB idle
- Cut optimization: < 100ms for 1000 rolls
- Dashboard refresh: < 500ms

## 📄 License

This project is proprietary software for USI Manufacturing.
