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

