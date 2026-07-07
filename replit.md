# SyncHub — Hauerland Integration Platform

## Overview
SyncHub is a modular integration platform developed for SEDAJ s.r.o. / Hauerland. Its primary purpose is to connect the internal ONIX ERP system with 12 external systems (suppliers, e-shop, CRM) using REST API, XML feeds, and JSON feeds. The platform provides capabilities for configuration, automated data synchronization, and real-time monitoring of data flows.

The project aims to streamline data exchange processes, reduce manual effort, and ensure data consistency across various business systems. Key features include a robust 4-phase synchronization engine, delta sync for efficient updates, comprehensive backup mechanisms, and a user-friendly interface for managing integrations.

## User Preferences

- Clean, black-and-white design, without unnecessary colors.
- Modular architecture where each module is in a separate file.
- Responsive and modern UI.
- Security-first approach with audit logging.
- Slovak interface (default), with an option to switch to English.
- Copyright: SEDAJ s.r.o.
- **Always bump APP_VERSION in `shared/version.ts` with every change**, no exceptions.

## Non-Negotiable Deployment Rules

These rules must be respected with every change, without exception:

### Dockerfile integrity
- Build stage MUST use `npm ci --include=dev` (esbuild and other devDependencies are required to compile TypeScript).
- Runtime stage MUST use `npm ci --omit=dev` (production image must not contain devDependencies).
- HEALTHCHECK must target `127.0.0.1:5000/api/health` — NOT `localhost` (Alpine Linux resolves localhost as IPv6 ::1, which fails).
- Do NOT modify `Dockerfile` structure without explicit user approval.

### Database schema changes
- Any change to the database schema (new column, new table, rename, type change) MUST be accompanied by an idempotent migration in `server/seed.ts` → `runMigrations()`, using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or equivalent.
- Changing only the Drizzle schema in `shared/schema.ts` without a corresponding migration is NOT sufficient — the running database will not reflect the change.
- Migrations must be idempotent (safe to run multiple times on a database that already has the change applied).

## GitHub Push & PAT Renewal

Pushes to `origin` (github.com/rsedaj/synchub) — especially any change that
touches `.github/workflows/` — require a classic Personal Access Token with the
`repo` **and** `workflow` scopes, stored as the `GITHUB_PAT` secret. The Replit
GitHub OAuth integration token lacks the `workflow` scope, so without
`GITHUB_PAT` those pushes fail silently.

`scripts/post-merge.sh` configures the `origin` remote to use `GITHUB_PAT` and
validates the token against the GitHub API after every merge:
- Missing `GITHUB_PAT` → prints a `WARNING` that workflow pushes will fail.
- Expired/revoked token (GitHub API `401`) → prints a `WARNING` to renew it.
- Valid token but missing the `repo` or `workflow` scope → prints a `WARNING`
  naming the missing scope(s); a valid-but-under-scoped token would otherwise
  push everything EXCEPT `.github/workflows/` and fail silently there.
- Valid classic token with both scopes → prints `GITHUB_PAT validated OK`.
- Valid token whose scopes can't be read (no `x-oauth-scopes` header, e.g. a
  fine-grained token) → prints a `NOTE` to verify it can push workflows.

### Renewing an expired GITHUB_PAT
1. Go to GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token (classic).
2. Select the `repo` and `workflow` scopes. Set an expiry you can track.
3. Copy the new token and update the `GITHUB_PAT` secret in this Repl
   (Secrets pane / environment), replacing the old value.
4. Trigger any merge (or re-run `bash scripts/post-merge.sh`) and confirm the
   log shows `post-merge: GITHUB_PAT validated OK`.

## Automated Checks

There is ONE canonical command for the automated test gate — use it instead of
remembering individual test files:

- `bash scripts/run-tests.sh --backend-only` — the automated "test" validation
  step. Runs the offline backend tests (`tests/server/**`) AND the black-box API
  tests (`tests/api/**`, against a live server) and skips the `tsc` type-check.
- `bash scripts/run-tests.sh` — full suite (adds the `tsc --noEmit` type-check).
- `bash scripts/run-tests.sh --no-api` — skip the live-server API phase (for
  environments with no database/server).

`scripts/run-tests.sh` also runs a fast, offline **server import-graph smoke
check** (`scripts/check-server-imports.ts`) before the backend tests in every
mode. It esbuild-bundles `server/index.ts` with all npm packages external and
output discarded, so it resolves the whole LOCAL server import graph and fails
immediately with a clear "Could not resolve" error when a server module is
missing/renamed (e.g. a new file imported but never committed) — instead of only
surfacing at runtime as a 120s health-check timeout. It does NOT type-check, so
the project's pre-existing unrelated `tsc` errors don't affect it. CI runs the
same check (`.github/workflows/deploy.yml` → `test:` job) before booting the app.

The API phase is delegated to `scripts/run-api-tests.sh`, which reuses a server
already serving `/api/health` or boots `npm run dev` itself, waits for readiness,
runs the tests, and tears down only a server it started. The same API tests also
run in CI (`.github/workflows/deploy.yml`) before the Docker image is built.

`scripts/run-api-tests.sh` also accepts optional filename-substring filters, so
you can run just a slice of the API suite without remembering each file:

- `bash scripts/run-viewer-role-tests.sh` — run the WHOLE viewer-role
  permission suite (every `tests/api/*viewer-role-guard*.test.ts`: sync-config,
  modules/logs, sync+backup) in one pass against the dev server. New
  `*viewer-role-guard*.test.ts` files are picked up automatically. Use this when
  verifying any read-only/role-guard permission change.
- `bash scripts/run-api-tests.sh <substring> [<substring>...]` — run only the
  API test files whose path contains any of the given substrings (e.g.
  `bash scripts/run-api-tests.sh viewer-role-guard`).

## System Architecture

SyncHub is built with a modern web stack, featuring a React 18 frontend with TypeScript and Vite, utilizing Shadcn/ui and Tailwind CSS for UI components. The backend is an Express.js application also written in TypeScript, connected to a PostgreSQL database managed with Drizzle ORM. Session-based authentication is handled by Passport.js and bcrypt.

**Key Architectural Decisions & Features:**
- **Modular Design:** Both frontend and backend are structured with a strong emphasis on modularity, with distinct components for authentication, data fetching, synchronization logic, and UI elements.
- **4-Phase Sync Engine:** Implements a robust pipeline for data synchronization:
    1.  **Preflight:** Configuration validation.
    2.  **Backup:** Optional data backup to Google Drive before synchronization.
    3.  **Fetch:** Retrieval of source data with retry logic and SSRF protection. Includes Delta Diff functionality for efficient updates by comparing MD5 hashes of mapped fields.
    4.  **Sync:** Batched processing, sequential API calls (especially for ONIX), retry mechanisms, live progress updates, and early stop conditions.
- **Data Storage:** PostgreSQL database with Drizzle ORM is used for storing user data, module configurations, sync run history, baseline hashes for delta sync, and audit logs.
- **UI/UX:** Features a responsive design, multi-language support (SK/EN), dark/light mode, and a comprehensive dashboard for monitoring sync operations, network maps, and command center functionalities. Specific pages include login, dashboard, module management, sync configuration, sync dashboard, logs, API key vault, user management, audit logs, and an in-app help system.
- **Security:** Includes SSRF protection with allowlists for external hosts, bcrypt for password hashing, session secrets, and extensive audit logging for critical actions.
- **ONIX Integration Logic:** Specific handling for ONIX ERP, including auto-filling mandatory fields, removing read-only fields from POST bodies, and managing `CustomColumns` format. Implements retry logic and configurable concurrency for ONIX API calls.
- **Resilience:** Features zombie run cleanup on server restart and resilient database writes (`resilientDbUpdate`) with exponential backoff for critical operations.
- **Versioning:** Centralized `APP_VERSION` management.
- **User Management:** Role-based access control (Admin, Operator, Viewer) governing various actions within the platform.

**Database Schema Highlights:**
- `users`: Stores user information with roles.
- `api_modules`: Configures external integration modules.
- `sync_configs`: Defines synchronization pairs, field mappings, and schedules.
- `sync_runs`: Records the history and status of all synchronization operations.
- `sync_baselines`: Stores MD5 hashes for delta synchronization.
- `sync_backups`: Manages metadata for Google Drive backups.
- `sync_logs` and `audit_logs`: Detailed logging for operations and user actions.

## External Dependencies

- **Database:** PostgreSQL
- **Authentication:** Passport.js (for session management), bcrypt (for password hashing)
- **Cloud Storage:** Google Drive (for data and configuration backups, integrated via Replit Connectors SDK)
- **External Systems Integrated:**
    - **ONIX ERP:** Primary target system for products, prices, stock, and partners.
    - **Promotron E-shop:** Data source for ~100k products (121MB XML feed).
    - **Pipedrive CRM:** Data source/target for deals, contacts, organizations, activities, products.
    - **Raynet CRM:** Data source (REST API v2, Basic Auth + X-Instance-Name).
    - **Giving Europe:** Data source (Debtor API REST).
    - **Midocean:** Data source (REST API v2.0, x-Gateway-APIKey).
    - **Stricker Europe:** Data source (REST API v2.20, AccessKey session).
    - **Macma:** Data source (JSON API v2).
    - **XD Connects:** Data source (multiple feeds: XML/CSV/JSON).
    - **Anda Present:** Data source (XML/CSV feeds, 9 sources).
    - **Easy Gifts:** Data source (XML/JSON feeds).
    - **PF Concept:** Data source (Data Feeds Gateway v3 XML).
- **KROS a.s.:** Provider of ONIX ERP.

