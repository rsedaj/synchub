# SyncHub - Hauerland Integration Platform

## Overview
A modular integration platform for Hauerland s.r.o. that connects their ONIX ERP system with 10+ external systems (suppliers, e-shop, CRM) via API. Features a clean black/white dashboard with real-time sync status monitoring.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Passport.js with session-based authentication (bcrypt hashing)

## Project Structure

### Backend
- `server/index.ts` - Express server setup
- `server/routes.ts` - All API routes
- `server/auth.ts` - Passport authentication setup, requireAuth/requireRole middleware
- `server/storage.ts` - Database storage layer (IStorage interface + DatabaseStorage)
- `server/db.ts` - PostgreSQL connection pool + Drizzle instance
- `server/seed.ts` - Database seed data (admin user + all 11 modules)

### Frontend
- `client/src/App.tsx` - Main app with routing, auth guard, sidebar layout
- `client/src/lib/auth.tsx` - AuthProvider context with login/logout
- `client/src/components/theme-provider.tsx` - Dark/light theme toggle
- `client/src/components/app-sidebar.tsx` - Navigation sidebar

### Pages
- `client/src/pages/login.tsx` - Login page
- `client/src/pages/dashboard.tsx` - Main dashboard with stats and module status
- `client/src/pages/modules.tsx` - Module grid view
- `client/src/pages/module-detail.tsx` - Module configuration + sync history
- `client/src/pages/sync-logs.tsx` - Sync log viewer with filters
- `client/src/pages/users.tsx` - User management (admin only)
- `client/src/pages/audit-log.tsx` - Audit trail (admin only)

### Shared
- `shared/schema.ts` - All database schemas, Zod validators, TypeScript types

## Database Tables
- `users` - User accounts with roles (admin/operator/viewer)
- `api_modules` - Module configurations (ONIX, PROMOTRON, PIPEDRIVE, etc.)
- `sync_logs` - Import/export synchronization history
- `audit_logs` - User action tracking
- `user_sessions` - Session storage (auto-created by connect-pg-simple)

## Integration Modules (from PDF spec)
1. **ONIX** - Central ERP (products, prices, stock) - PRIMARY
2. **PROMOTRON** - E-shop (shop.hauerland.sk)
3. **PIPEDRIVE** - CRM system
4. **GIVING** - Supplier (Giving Europe)
5. **MID** - Supplier (Midocean)
6. **STICKER** - Supplier
7. **MACMA** - Supplier (pending docs)
8. **XD CONNECT** - Supplier
9. **ANDA** - Supplier (XML/CSV feeds)
10. **EASY GIFTS** - Supplier (XML feeds)
11. **PF CONCEPT** - Supplier (data feeds)

## Default Login
- Username: `admin`
- Password: `admin123`

## User Preferences
- Clean black/white design, no unnecessary colors
- Modular architecture (each module in separate files)
- Responsive and modern UI
- Security-first approach with audit logging
- Slovak-speaking user
