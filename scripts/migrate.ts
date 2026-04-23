import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
-- Enums (CREATE TYPE IF NOT EXISTS nie je v starých PG, preto cez DO block)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE module_status AS ENUM ('connected', 'disconnected', 'error', 'configuring');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sync_direction AS ENUM ('import', 'export');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('pending', 'running', 'success', 'error', 'partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('login', 'logout', 'create', 'update', 'delete', 'sync', 'config_change', 'sync_run', 'sync_complete', 'restore_backup', 'delete_backup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  role user_role NOT NULL DEFAULT 'operator',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_modules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status module_status NOT NULL DEFAULT 'disconnected',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB DEFAULT '{}',
  data_fields JSONB DEFAULT '[]',
  docs_url TEXT,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id),
  action audit_action NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id VARCHAR NOT NULL REFERENCES api_modules(id),
  direction sync_direction NOT NULL,
  status sync_status NOT NULL DEFAULT 'pending',
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  triggered_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_module_id VARCHAR NOT NULL REFERENCES api_modules(id),
  source_module_id VARCHAR NOT NULL REFERENCES api_modules(id),
  target_data_source TEXT,
  source_data_source TEXT,
  source_record_limit INTEGER DEFAULT 120000,
  field_mappings JSONB DEFAULT '[]',
  match_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
  match_operator TEXT DEFAULT 'and',
  on_missing TEXT DEFAULT 'create',
  target_stock TEXT,
  source_filters JSONB DEFAULT '[]',
  schedule JSONB DEFAULT '{"enabled":false,"frequency":"daily","backupBeforeSync":true}',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id VARCHAR NOT NULL REFERENCES sync_configs(id),
  status sync_status NOT NULL DEFAULT 'pending',
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_total INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  batch_size INTEGER DEFAULT 100,
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER DEFAULT 0,
  speed_per_sec INTEGER DEFAULT 0,
  estimated_end_at TIMESTAMP,
  backup_id VARCHAR,
  cancelled BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  checkpoint_data JSONB,
  details JSONB,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  triggered_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_backups (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id VARCHAR NOT NULL REFERENCES sync_configs(id),
  sync_run_id VARCHAR,
  file_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  google_drive_file_id TEXT,
  google_drive_url TEXT,
  backup_record_count INTEGER DEFAULT 0,
  config_snapshot JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_baselines (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id VARCHAR NOT NULL REFERENCES sync_configs(id),
  record_key TEXT NOT NULL,
  field_hash TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_baselines_config_key_unique
  ON sync_baselines (sync_config_id, record_key);
`;

async function migrate() {
  console.log("[migrate] Connecting to database...");
  const client = await pool.connect();
  try {
    console.log("[migrate] Running schema migration...");
    await client.query(SQL);
    console.log("[migrate] Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("[migrate] Migration failed:", err.message);
  process.exit(1);
});
