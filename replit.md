# SyncHub - Hauerland Integration Platform

## Overview
A modular integration platform for SEDAJ s.r.o. / Hauerland that connects their ONIX ERP system with 10+ external systems (suppliers, e-shop, CRM) via API. Features a clean black/white dashboard with real-time sync status monitoring and live data preview.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Passport.js with session-based authentication (bcrypt hashing)

## Project Structure

### Backend
- `server/index.ts` - Express server setup
- `server/routes.ts` - All API routes (modules, sync-logs, users, audit, data-preview, test-connection)
- `server/auth.ts` - Passport authentication setup, requireAuth/requireRole middleware
- `server/storage.ts` - Database storage layer (IStorage interface + DatabaseStorage)
- `server/db.ts` - PostgreSQL connection pool + Drizzle instance
- `server/seed.ts` - Database seed data (admin user + all 11 modules with sortOrder)
- `server/data-fetcher.ts` - Real API data fetching service (XML feeds, REST APIs) with SSRF protection

### Frontend
- `client/src/App.tsx` - Main app with routing, auth guard, sidebar layout
- `client/src/lib/auth.tsx` - AuthProvider context with login/logout
- `client/src/components/theme-provider.tsx` - Dark/light theme toggle
- `client/src/components/app-sidebar.tsx` - Navigation sidebar

### Pages
- `client/src/pages/login.tsx` - Login page
- `client/src/pages/dashboard.tsx` - Main dashboard with stats and module status
- `client/src/pages/modules.tsx` - Module grid view (sorted by sortOrder with prefix numbers)
- `client/src/pages/module-detail.tsx` - Module detail with tabs: Overview, Data Preview, Configuration, Sync History
- `client/src/pages/sync-logs.tsx` - Sync log viewer with filters
- `client/src/pages/users.tsx` - User management (admin only)
- `client/src/pages/audit-log.tsx` - Audit trail (admin only)

### Shared
- `shared/schema.ts` - All database schemas, Zod validators, TypeScript types

## Database Tables
- `users` - User accounts with roles (admin/operator/viewer)
- `api_modules` - Module configurations with sortOrder, dataFields, docsUrl
- `sync_logs` - Import/export synchronization history
- `audit_logs` - User action tracking
- `user_sessions` - Session storage (auto-created by connect-pg-simple)

## Integration Modules
1. **ONIX** - Central ERP (products, prices, stock) - PRIMARY
2. **PROMOTRON** - E-shop (shop.hauerland.sk)
3. **PIPEDRIVE** - CRM system
4. **GIVING** - Supplier (Giving Europe) - Debtor API REST, Bearer token auth, sandbox/production environments
5. **MID** - Supplier (Midocean)
6. **STICKER** - Supplier
7. **MACMA** - Supplier (pending docs)
8. **XDCONNECT** - Supplier (XD Connect)
9. **ANDA** - Supplier (XML/CSV feeds)
10. **EASYGIFTS** - Supplier (XML feeds with SKU/pricelist URLs)
11. **PFCONCEPT** - Supplier (data feeds)

## Key Features
- **Connection testing**: Test API connectivity from module detail (POST /api/modules/:id/test-connection)
- **Live data preview**: Fetch and display real data from configured feeds (GET /api/modules/:id/data-preview)
- **SSRF protection**: URL allowlist in data-fetcher.ts prevents server-side request forgery
- **No mock data**: All sync logs and data are real; empty states shown when no real data exists

## Default Login
- Username: `admin`
- Password: `admin123`

## User Preferences
- Clean black/white design, no unnecessary colors
- Modular architecture (each module in separate files)
- Responsive and modern UI
- Security-first approach with audit logging
- Slovak-speaking user
- Copyright: SEDAJ s.r.o.
