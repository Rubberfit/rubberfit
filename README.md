# RubberFit Pro

A material optimization and inventory management system for USI Manufacturing, designed to track rubber roll inventory and optimize material cuts to minimize waste.

## ✨ Current Features

- **Real-Time Inventory Tracking**: Automatic inventory updates as cuts are recorded. Rolls are automatically marked depleted when length hits zero.
- **Material Cut Optimization**: Uses a **Greedy First-Fit-Decreasing** algorithm to recommend the best cuts with the lowest waste percentage.
- **Waste Tracking**: Calculates and records waste metrics to analyze optimization performance over time.
- **Low Stock Alerts**: Automatic system notifications when material stock falls below designated thresholds.
- **Dashboard Analytics**: Visualize usage trends and current stock across different materials.
- **Cross-Platform Access**: Usable as both a high-performance Web App and as a packaged desktop Electron App.

## 🛠 Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **Desktop Environment**: Electron 40.6
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
cd rubberfit-pro

# Navigate to app directory and install all dependencies
cd app
npm install
```

### 2. Local Database Setup (Supabase)

A local Supabase instance using Docker is highly recommended for development.

```bash
# Go from the app directory to the database directory
cd ../supabase

# Start local Supabase instance (Docker must be running)
supabase start

# Apply all database migrations to setup the schema
supabase db reset

# (Optional) Seed the database with realistic test materials, rolls, and cuts
supabase db reset --with-seed
```

### 3. Configure Environment Variables

```bash
cd ../app
cp .env.example .env.local
```

Update your `.env.local` to match your local Supabase credentials outputted during `supabase start`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

## 🚀 Development Mode

We provide multiple ways to run the application depending on your focus. In your terminal, make sure you are inside the `app/` directory:

### Web Development
Starts the Next.js frontend with hot-module reloading.
```bash
npm run dev
# Opens at http://localhost:3000
```

### Electron Desktop Development
Starts Next.js and the Electron desktop application concurrently.
```bash
npm run electron:dev
```

## 📦 Building for Production

Make sure you are inside the `app/` directory.

### Web Version
```bash
npm run build
npm start
```

### Desktop Application
Built applications will be placed in `app/dist`.
```bash
npm run electron:dist:mac   # macOS (.dmg / .app)
npm run electron:dist:win   # Windows (.exe)
npm run electron:dist:linux # Linux (.AppImage / .deb)
npm run electron:dist:all   # Build for all platforms
```

## 🗂 Project Structure

```
rubberfit-pro/
├── app/
│   ├── .next/               # Next.js build output
│   ├── electron/            # Electron main process & IPC handlers
│   ├── electron-dist/       # Compiled Electron output
│   ├── public/              # Static web assets
│   ├── src/                 # Next.js Main Application source
│   │   ├── app/             # App router pages (dashboard, auth, api)
│   │   ├── components/      # Reusable React components (UI, common)
│   │   ├── config/          # Application configuration
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Third-party library integrations
│   │   ├── navigation/      # Navigation configurations
│   │   ├── scripts/         # Builder & utility scripts
│   │   ├── server/          # Server side logic and API
│   │   ├── services/        # Business logic fetching and API wrappers
│   │   ├── stores/          # Zustand state management
│   │   ├── styles/          # Tailwind setup and globals
│   │   ├── templates/       # Document templates (e.g. PDF generation)
│   │   └── types/           # TypeScript definitions
│   ├── .env.local           # Environment variables
│   └── package.json         # Javascript dependencies and build scripts
├── supabase/
│   ├── migrations/          # SQL migrations defining the schema
│   ├── config.toml          # Supabase Local Server configuration
│   └── README.md            # Database specific documentation
├── README.md                # System documentation (This file)
└── LICENSE                  # Proprietary software license
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
- Secure IPC communication in Electron
- Content Security Policy (CSP) headers configured

## 📈 Performance Targets

- Startup time: < 2.5 seconds
- Memory usage: < 180MB idle
- Cut optimization: < 100ms for 1000 rolls
- Dashboard refresh: < 500ms

## 📄 License

This project is proprietary software for USI Manufacturing.
