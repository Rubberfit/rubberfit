# RubberFit Pro

A material optimization and inventory management system for USI Manufacturing, designed to track rubber roll inventory and optimize material cuts to minimize waste.

## 🚀 Overview

RubberFit Pro is a desktop application built with Electron and React that helps USI Manufacturing:
- Track rubber roll inventory with real-time updates
- Optimize material cuts using intelligent algorithms to minimize waste
- Monitor waste trends and inventory metrics
- Generate reports and export data

**Annual Savings Potential:** $138,000 - $315,000

## 📊 Key Features

### Phase 1 - Complete ✅

#### Must-Have Features
- **Inventory Management**: Full CRUD operations for rubber rolls with search and filtering
- **Cut Optimization**: Algorithm recommends top 3 rolls with lowest waste
- **Visual Cut Diagrams**: SVG representations showing where cuts will be made
- **Automatic Updates**: Inventory updates immediately when cuts are confirmed
- **Dashboard Metrics**: Real-time inventory value, waste trends, and low stock alerts
- **Cut History**: Complete audit trail with timestamps and user tracking

#### Should-Have Features
- **CSV Import/Export**: Bulk inventory management
- **Batch Cuts**: Process multiple cut requests simultaneously
- **Manual Roll Selection**: Override optimization recommendations
- **Configurable Thresholds**: Set custom low stock alerts per material type
- **Waste Comparison**: Period-over-period waste analysis
- **Reports**: Generate PDF/CSV reports for operations and finance

## 🛠 Tech Stack

- **Desktop Framework**: Electron 40.6
- **Frontend**: React 19 + TypeScript
- **UI Framework**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Database**: Supabase (PostgreSQL)
- **Charts**: Recharts
- **Build Tools**: Vite
- **Package Manager**: npm

## 📋 Prerequisites

- Node.js 18+ (v22.14.0 recommended)
- npm 9+
- Supabase account (for database)
- macOS, Windows, or Linux

## 🔧 Installation

### Prerequisites
- Node.js 18+ and npm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) installed
- A Supabase account (free tier works)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/rubberfit-pro.git
cd rubberfit-pro

# Navigate to app directory and install dependencies
cd app
npm install
```

### Step 2: Database Setup (For Interns)

#### Option A: Local Supabase (Recommended for Development)
```bash
# Go back to project root
cd ..

# Start local Supabase instance
cd supabase
supabase start

# This will output your local credentials:
# API URL: http://localhost:54321
# ANON KEY: [your-local-anon-key]
# Service Role Key: [your-local-service-key]
# DB URL: postgresql://postgres:postgres@localhost:54322/postgres
```

#### Option B: Cloud Supabase Project
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Settings > API to find your credentials
3. Run migrations on your cloud project:
   ```bash
   cd supabase
   supabase link --project-ref your-project-ref
   supabase db push
   ```

### Step 3: Configure Environment

```bash
cd app
cp .env.example .env.local
```

Update `.env.local` with your credentials:
```env
# For local Supabase (Option A)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key

# For cloud Supabase (Option B)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 4: Load Sample Data (Optional)

```bash
# From the supabase directory
cd ../supabase
supabase db seed
```

## 🚀 Development

### Web Development Mode
```bash
npm run dev
```
Opens at http://localhost:3000

### Electron Desktop Mode
```bash
npm run electron:dev
```
Launches the desktop application with hot reload

### Running Tests
```bash
npm test
```

### Linting & Type Checking
```bash
npm run lint
npm run type-check
```

## 📦 Building for Production

### Build Web Version
```bash
npm run build
```

### Build Desktop Application

#### Windows
```bash
npm run dist:win
```

#### macOS
```bash
npm run dist:mac
```

#### Linux
```bash
npm run dist:linux
```

Built applications will be in the `dist` folder.

## 🗂 Project Structure

```
rubberfit-pro/
├── app/                      # Main application directory
│   ├── src/
│   │   ├── app/             # Next.js app router pages
│   │   │   ├── (auth)/      # Authentication pages
│   │   │   └── (main)/      # Main dashboard pages
│   │   ├── components/      # React components
│   │   ├── services/        # Business logic and API calls
│   │   ├── stores/          # Zustand state management
│   │   ├── types/           # TypeScript type definitions
│   │   └── utils/           # Utility functions
│   ├── electron/            # Electron main process
│   │   ├── main.ts          # Main process entry
│   │   ├── preload.ts       # Preload scripts
│   │   └── ipc/             # IPC handlers
│   └── supabase/
│       └── migrations/      # Database migrations
├── .claude/                 # Claude AI agent configurations
│   ├── agents/              # Specialized agent definitions
│   └── commands/            # Custom slash commands
└── docs/                    # Additional documentation
```

## 💡 Core Algorithms

### Cut Optimization Algorithm

The system uses a **Greedy First-Fit-Decreasing** algorithm:

1. **Filter**: Find eligible rolls (matching material type, sufficient dimensions)
2. **Calculate**: For each roll, compute waste percentage
3. **Rank**: Sort by lowest waste percentage
4. **Recommend**: Present top 3 options

**Waste Calculation:**
```
Total Consumed = (Roll Width × Length Needed) ÷ 144
Material Used = (Requested Width × Length Needed) ÷ 144
Waste = Total Consumed - Material Used
Waste % = (Waste ÷ Total Consumed) × 100
```

## 📊 Database Schema

### Core Tables

- **material_types**: Reference table for material properties
- **rolls**: Inventory tracking with dimensions and costs
- **cuts**: Historical record of all cuts with waste metrics

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

## 🧪 Testing

The application includes:
- Unit tests for algorithms
- Integration tests for services
- E2E tests for critical workflows

Run specific test suites:
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📝 API Documentation

For detailed API documentation, see [docs/API.md](docs/API.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Known Issues

- See [GitHub Issues](https://github.com/your-org/rubberfit-pro/issues) for current bugs and feature requests

## 📄 License

This project is proprietary software for USI Manufacturing.

## 👥 Team

- **Client**: USI Manufacturing
- **Development**: Arc & Anchor LLC
- **Contact**: Daniel Martinez Julio

## 🙏 Acknowledgments

- Built with Claude AI assistance
- Design system based on shadcn/ui
- Icons from Lucide React

---

## Quick Start Commands

```bash
# Development
npm run dev                 # Start web dev server
npm run electron:dev        # Start Electron dev

# Production
npm run build              # Build web version
npm run dist               # Build all desktop versions

# Testing & Quality
npm run test               # Run all tests
npm run lint               # Run ESLint
npm run type-check         # Run TypeScript checks

# Database
npx supabase db push       # Apply migrations
npx supabase db seed       # Seed test data
```
