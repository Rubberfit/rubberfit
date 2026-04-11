# Rema Portal Database Setup

This directory contains the complete database schema and setup files for Rema Portal, a material optimization and inventory management system for rubber manufacturing.

## Quick Start for Interns

### 1. Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Docker](https://docker.com) installed and running
- Node.js 18+ installed

### 2. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd rema-portal

# Install Supabase CLI if you haven't already
npm install -g supabase

# Start local Supabase instance
cd supabase
supabase start
```

### 3. Apply Database Migrations

The migrations will create all tables, indexes, functions, and RLS policies:

```bash
# Apply all migrations in order
supabase db reset

# Or apply them individually
supabase migration up
```

### 4. Seed Test Data (Optional)

Load sample data for development and testing:

```bash
# Run the seed file
supabase db reset --with-seed
```

### 5. Get Your Local Credentials

After starting Supabase, you'll see output like:

```
API URL: http://localhost:54321
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
Inbucket URL: http://localhost:54324
JWT secret: your-jwt-secret
anon key: your-anon-key
service_role key: your-service-role-key
```

### 6. Configure Your App

Create a `.env.local` file in your app directory with:

```env
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-from-above
```

## Database Schema Overview

### Core Tables

1. **material_types** - Master list of rubber material definitions
2. **rolls** - Physical inventory of rubber rolls
3. **cuts** - Historical record of all cuts made
4. **notifications** - System alerts and messages

### Key Relationships

```
material_types (1) → (N) rolls (1) → (N) cuts
                               ↓
                        notifications
```

## Migration Files

| File | Description |
|------|-------------|
| `20240217000001_create_material_types_table.sql` | Create material types master table |
| `20240217000002_create_rolls_table.sql` | Create rolls inventory table |
| `20240217000003_create_cuts_table.sql` | Create cuts history table |
| `20240217000004_create_notifications_table.sql` | Create notifications table |
| `20240217000005_create_indexes.sql` | Create performance indexes |
| `20240217000006_create_functions_and_triggers.sql` | Create database functions and automation |
| `20240217000007_enable_rls_policies.sql` | Enable Row Level Security policies |

## Key Features

### Automatic Inventory Updates
- When cuts are recorded, roll remaining length is automatically updated
- Rolls are automatically marked as "depleted" when length reaches zero

### Low Stock Alerts
- Automatic notifications when material stock falls below threshold
- Function: `generate_low_stock_notifications()`

### Waste Tracking
- All cuts record waste calculations for optimization analysis
- Waste percentage and square footage tracked

### Data Integrity
- Check constraints on dimensions (must be positive)
- Foreign key relationships maintained
- Row Level Security enabled on all tables

## Performance Optimizations

### Specialized Indexes
- `idx_rolls_optimization` - Optimized for cut optimization algorithm
- `idx_notifications_unread` - Fast unread notification queries
- `idx_cuts_created_at_desc` - Recent cuts dashboard queries

### Functions for Complex Queries
- `calculate_material_stock()` - Efficient stock level calculations
- `update_roll_after_cut()` - Atomic inventory updates

## Security

### Row Level Security (RLS)
All tables have RLS enabled with policies for:
- **SELECT**: Allow all authenticated users
- **INSERT**: Allow all authenticated users
- **UPDATE**: Allow all (with 24hr limit on cuts for corrections)
- **DELETE**: Allow all (except cuts for historical integrity)

⚠️ **Production Note**: Current policies allow all operations. In production, implement proper user authentication and role-based access control.

## Sample Data

The `seed.sql` file contains realistic test data:
- 8 common rubber material types
- 12 sample rolls with various dimensions and statuses
- 5 historical cut records
- Sample notifications

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in `config.toml` if needed
2. **Docker not running**: Ensure Docker Desktop is running
3. **Permission errors**: Check Docker permissions on your system

### Useful Commands

```bash
# View migration status
supabase migration list

# Reset database completely
supabase db reset

# Generate TypeScript types
supabase gen types typescript --local > types/supabase.ts

# View logs
supabase logs

# Stop Supabase
supabase stop
```

## Support

For questions about the database schema or setup:
1. Check the migration files for detailed comments
2. Review this README
3. Check the Supabase logs for specific error messages
4. Ensure Docker is running and ports are available

## Next Steps

1. Start the local Supabase instance
2. Apply migrations and seed data
3. Connect your React app using the local credentials
4. Begin development with a fully functional database

The schema is designed to support the full Rema Portal application including:
- Inventory management
- Cut optimization algorithm
- Waste tracking and reporting
- Real-time notifications
- Dashboard analytics
