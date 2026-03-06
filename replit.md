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
- `server/routes.ts` - All API routes (modules, sync-logs, sync-configs, users, audit, data-preview, test-connection)
- `server/auth.ts` - Passport authentication setup, requireAuth/requireRole middleware
- `server/storage.ts` - Database storage layer (IStorage interface + DatabaseStorage)
- `server/db.ts` - PostgreSQL connection pool + Drizzle instance
- `server/seed.ts` - Database seed data (admin user + all 11 modules with sortOrder)
- `server/data-fetcher.ts` - Real API data fetching service (XML feeds, REST APIs) with SSRF protection

### Frontend
- `client/src/App.tsx` - Main app with routing, auth guard, sidebar layout
- `client/src/lib/auth.tsx` - AuthProvider context with login/logout
- `client/src/components/theme-provider.tsx` - Dark/light theme toggle
- `client/src/components/language-provider.tsx` - SK/EN language switching with localStorage persistence
- `client/src/lib/i18n.ts` - Translation strings for SK and EN languages
- `client/src/components/app-sidebar.tsx` - Navigation sidebar with language toggle

### Pages
- `client/src/pages/login.tsx` - Login page
- `client/src/pages/dashboard.tsx` - Main dashboard with stats and module status
- `client/src/pages/modules.tsx` - Module grid view (sorted by sortOrder with prefix numbers)
- `client/src/pages/module-detail.tsx` - Module detail with tabs: Overview, Data Preview, Configuration, Sync History, Help
- `client/src/pages/sync-config.tsx` - Sync Configuration page (field mapping, scheduling)
- `client/src/pages/sync-logs.tsx` - Sync log viewer with filters
- `client/src/pages/vault.tsx` - Credentials vault (admin only)
- `client/src/pages/users.tsx` - User management (admin only)
- `client/src/pages/audit-log.tsx` - Audit trail (admin only)

### Shared
- `shared/schema.ts` - All database schemas, Zod validators, TypeScript types

## Database Tables
- `users` - User accounts with roles (admin/operator/viewer)
- `api_modules` - Module configurations with sortOrder, dataFields, docsUrl
- `sync_configs` - Sync configuration pairs (target ↔ source modules, field mappings, schedule)
- `sync_runs` - Sync execution history (records processed, backup data, progress)
- `sync_logs` - Import/export synchronization history
- `audit_logs` - User action tracking
- `user_sessions` - Session storage (auto-created by connect-pg-simple)

## Integration Modules
1. **ONIX** - Central ERP (products, prices, stock) - PRIMARY
2. **PROMOTRON** - E-shop (shop.hauerland.sk)
3. **PIPEDRIVE** - CRM system
4. **GIVING** - Supplier (Giving Europe) - Debtor API REST, Bearer token auth, sandbox/production environments
5. **MID** - Supplier (Midocean) - REST API v2.0, x-Gateway-APIKey auth, 5 active endpoints (Products/Stock/Pricelist/PrintData/PrintPricelist) + Order v2.1/Proof v1.0 (inactive), API key configured
6. **STICKER** - Supplier (Stricker Europe) - REST API v2.20, AccessKey session auth
7. **MACMA** - Supplier (JSON API v2 on macma.sk, same platform as EASYGIFTS) - 3 feeds: SKU (3,169), Pricelist (3,103), Stock (2,806)
8. **XDCONNECT** - Supplier (XD Connects) - 6 data feeds on feeds.xindao.com, auto-detect XML/CSV/JSON format, customer-specific feed URLs
9. **ANDA** - Supplier (Anda Present) - XML/CSV feeds, 9 data sources, Feed ID + IP whitelist auth
10. **EASYGIFTS** - Supplier (XML feeds with SKU/pricelist URLs)
11. **PFCONCEPT** - Supplier (PF Concept B.V.) - Data Feeds Gateway v3, XML format, 4 feeds: Product (CZ), Price, Print Price, Stock

## Sync Configuration (v1.6.0)
- **Target modules**: Only ONIX and PIPEDRIVE can be sync targets (import to)
- **Source modules**: Any other module can be a data source (sync from)
- **Field mapping**: Visual two-column UI with Auto-Map by name similarity
- **Scheduling**: Per-config schedule (15min/hourly/6hours/daily/weekly) with time/day selectors
- **CRUD**: Create, edit, delete sync configurations with validation
- **API validation**: Zod schemas for POST/PATCH with whitelisted fields
- **Phase 2 planned**: Actual sync execution with progress bars, statistics, charts, daily reports, data backup

## Key Features
- **Connection testing**: Test API connectivity from module detail
- **Live data preview**: Fetch and display real data from configured feeds
- **Sync configuration**: Visual field mapping between modules with scheduling
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
- SK/EN language switching (default: SK, persisted in localStorage)
- Copyright: SEDAJ s.r.o.
- App version: v1.6.0
