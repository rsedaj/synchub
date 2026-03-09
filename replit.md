# SyncHub - Hauerland Integration Platform

## Overview
A modular integration platform for SEDAJ s.r.o. / Hauerland that connects their ONIX ERP system with 10+ external systems (suppliers, e-shop, CRM) via API. Features a clean black/white dashboard with real-time sync status monitoring, live data preview, sync execution engine with batch processing, Google Drive backups, and visual progress tracking.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Passport.js with session-based authentication (bcrypt hashing)
- **Google Drive**: Replit Connectors SDK for backup storage (OAuth via integration)

## Project Structure

### Backend
- `server/index.ts` - Express server setup
- `server/routes.ts` - All API routes (modules, sync-logs, sync-configs, sync-runs, sync-backups, users, audit, data-preview, test-connection)
- `server/auth.ts` - Passport authentication setup, requireAuth/requireRole middleware
- `server/storage.ts` - Database storage layer (IStorage interface + DatabaseStorage)
- `server/db.ts` - PostgreSQL connection pool + Drizzle instance
- `server/seed.ts` - Database seed data (admin user + all 11 modules with sortOrder)
- `server/data-fetcher.ts` - Real API data fetching service (XML feeds, REST APIs) with SSRF protection
- `server/sync-engine.ts` - 4-phase sync execution engine (preflight→backup→fetch→sync), real push, cancellation
- `server/target-push.ts` - Target API push (Pipedrive REST create/update, ONIX placeholder)
- `server/google-drive.ts` - Google Drive backup management on shared drive (upload, download, delete, rotate, stats)

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
- `client/src/pages/sync-dashboard.tsx` - Sync Dashboard: live progress, run history, charts, backup management
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
- `sync_runs` - Sync execution history (records processed, batch info, progress, speed, ETA, cancellation)
- `sync_backups` - Backup metadata (Google Drive file ID/URL, file size, record count, config snapshot)
- `sync_logs` - Import/export synchronization history
- `audit_logs` - User action tracking
- `user_sessions` - Session storage (auto-created by connect-pg-simple)

## Integration Modules
1. **ONIX** - Central ERP (products, prices, stock) - PRIMARY
2. **PROMOTRON** - E-shop (shop.hauerland.sk)
3. **PIPEDRIVE** - CRM system
4. **GIVING** - Supplier (Giving Europe) - Debtor API REST, Bearer token auth, sandbox/production environments
5. **MID** - Supplier (Midocean) - REST API v2.0, x-Gateway-APIKey auth, 5 active endpoints
6. **STICKER** - Supplier (Stricker Europe) - REST API v2.20, AccessKey session auth
7. **MACMA** - Supplier (JSON API v2 on macma.sk) - 3 feeds: SKU, Pricelist, Stock
8. **XDCONNECT** - Supplier (XD Connects) - 6 data feeds, auto-detect XML/CSV/JSON format
9. **ANDA** - Supplier (Anda Present) - XML/CSV feeds, 9 data sources
10. **EASYGIFTS** - Supplier (XML feeds with SKU/pricelist URLs)
11. **PFCONCEPT** - Supplier (PF Concept B.V.) - Data Feeds Gateway v3, XML format, 4 feeds

## Sync Configuration (v1.6.x)
- **Target modules**: Only ONIX and PIPEDRIVE can be sync targets
- **Source modules**: Any other module can be a data source
- **Field mapping**: Visual two-column UI with Auto-Map by name similarity
- **Scheduling**: Per-config schedule (15min/hourly/6hours/daily/weekly) with time/day selectors
- **Backup before sync**: Checkbox persisted in schedule.backupBeforeSync

## Sync Execution Engine (v1.7.1)
- **4-phase pipeline**: preflight → backup → fetch → sync (tracked in run details.phase)
- **Backup default ON**: backupBeforeSync defaults to true; user must explicitly disable
- **Google Drive backups**: Stored in shared drive folder `0AJCiYKbj09exUk9PVA` → SyncHub_Backups/Data/{YYYY-MM-DD}/{ModuleName}/ for data backups, SyncHub_Backups/Config/ for config backups
- **Backup rotation**: Max 10 backups per config, auto-delete oldest when exceeded
- **Real Pipedrive push**: `server/target-push.ts` — POST (create) / PUT (update via `_pipedrive_id`) to Pipedrive API; source `id` stripped to avoid incorrect PUT
- **Dot-notation field mapping**: `getNestedValue()` in sync-engine supports nested XML/JSON paths like `price.vat` without flattening, preserving original data types
- **Created/Updated tracking**: Separate counters for new vs updated records, Pipedrive IDs captured and stored
- **Record-level detail**: Up to 200 synced records stored in run details with Pipedrive ID, status, error message
- **Early stop**: 3 consecutive 100% error batches → auto-stop with clear error message
- **Phase history**: `phaseHistory` stored in run details for step-by-step phase indicator (done/running/error/pending)
- **Real-time progress**: Progress %, created/updated/failed live counters, batch indicator, speed, ETA, 4-step phase indicator
- **Batch processing**: 50 records per batch, rate limit delays, per-record error tracking
- **Cancellation**: Cancel running sync between batches
- **Undo/Restore**: Restore from any backup with one click
- **Resilience**: 3x retry on fetch, backup failure stops sync, per-batch error details stored
- **Audit enum**: sync_run, restore_backup, delete_backup actions supported

## Sync Dashboard Features
- **Stats cards**: Today's syncs, total records, avg duration, success rate
- **Live progress ring**: SVG-based animated circular progress with ETA countdown
- **Phase indicator**: Real-time phase display (Fáza 1/4: Kontrola pripojenia, etc.) with colored background and spinning icon
- **Backup phase visible**: "Zálohovanie na Google Drive..." shown prominently with amber background during backup
- **Quick sync**: Run any config with one click, shows running state; backup badge on all configs with backup enabled (default)
- **Error visibility**: Error details shown directly in progress card; expandable error details in run history with grouped errors (×count)
- **Record viewer**: Expandable table of synced records per run — Pipedrive ID, status (Nový/Aktualizovaný/Chyba), error message; filterable + paginated (20/page)
- **Created/Updated/Failed**: Live counters during sync, breakdown in run history row
- **Step phase indicator**: Horizontal 4-step indicator showing preflight→backup→fetch→sync with green checkmarks for completed, spinner for active, gray for pending, red X for error
- **Compact styling**: Reduced font weights (semibold/medium vs bold), tighter padding (p-3/p-4), smaller gaps, professional look
- **Consolidated menu**: 3 sync items in sidebar: "Konfigurácie" (/sync), "Synchronizácia" (/sync-dashboard), "Zálohy" (/backups — opens backup management directly)
- **Multi-select batch sync**: Checkboxes on Quick Sync configs, Select All, "Run Selected (N)" button runs all sequentially with queued/done badges
- **Command Center dashboard**: Spy-film inspired design — COMMAND CENTER header, live clock, pulsing status dots, network topology map, monospace styling, timeline-style recent syncs
- **2-column test panel**: Test Connection results in 2-column grid to avoid scrolling
- **Centralized version**: `shared/version.ts` — single source for APP_VERSION used on login page and sidebar
- **Sweep-hand animation**: ProgressRing shows rotating sweep indicator during active sync (between 0-100%), visual feedback when percentage doesn't change
- **Timeline range tabs**: 1D/3D/7D/14D/28D selector above timeline chart, default 7D, smart label density for wider ranges
- **Vault blue highlights**: Connected modules show blue badge + blue card border in Vault/Trezor page
- **Config export/import**: Export all modules + sync configs as JSON, import from JSON file (Backups tab)
- **Config backup to Drive**: Full application config (modules + sync configs + users — passwords excluded) backed up to Google Drive SyncHub_Backups/Config/ with download, delete, and restore. Restore updates modules (by code), sync configs (by id/name, upsert), users (by username, no password overwrite). Backup format v2.0.
- **Manual backup**: Per-config manual backup button creates Google Drive backup without running sync
- **GitHub integration**: Repo at github.com/rsedaj/synchub (private), pushed via GitHub API connector
- **Shop View**: E-shop simulator showing product data from supplier XML/API feeds with grid/list view, categories, search, sort, pagination; route `/shop-view`
- **Donut chart**: Success vs Error vs Other breakdown
- **Timeline chart**: Sync runs over last 7 days
- **Per-config stats table**: Last run, status, total synced, backup count
- **Backup management tab**: Browse, restore, delete backups grouped by config
- **Storage overview**: Total backups, total size, retention indicator (10/config)

## Key Features
- **Connection testing**: Test API connectivity from module detail
- **Live data preview**: Fetch and display real data from configured feeds
- **Sync configuration**: Visual field mapping between modules with scheduling
- **Sync execution**: Batch processing with real-time visual progress
- **Google Drive backups**: Automatic backup/restore with 10-backup retention per config
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
- App version: v1.17.0
