export type OnixEnvironment = "test" | "production";

export interface OnixCreds {
  token: string;
  databasePath: string;
  environment: OnixEnvironment;
  source: "vault" | "config" | "legacy" | "empty";
}

/**
 * Resolves active ONIX credentials based on config.environment ("test" | "production").
 *
 * Production credentials precedence:
 *   1. ONIX_PROD_API_TOKEN / ONIX_PROD_DATABASE_PATH env vars (secure vault)
 *   2. config.prodApiToken / config.prodDatabasePath (DB-stored)
 *
 * Test credentials precedence:
 *   1. config.testApiToken / config.testDatabasePath
 *   2. legacy config.apiToken / config.databasePath (auto-migrated on first save)
 */
export function getOnixCreds(config: Record<string, any> | null | undefined): OnixCreds {
  const cfg = config || {};
  const env: OnixEnvironment = cfg.environment === "production" ? "production" : "test";

  if (env === "production") {
    const vaultToken = process.env.ONIX_PROD_API_TOKEN || "";
    const vaultDb = process.env.ONIX_PROD_DATABASE_PATH || "";
    const cfgToken = cfg.prodApiToken || "";
    const cfgDb = cfg.prodDatabasePath || "";

    const token = vaultToken || cfgToken;
    const databasePath = vaultDb || cfgDb;

    let source: OnixCreds["source"] = "empty";
    if (vaultToken && vaultDb) source = "vault";
    else if (vaultToken || vaultDb) source = "vault";
    else if (cfgToken || cfgDb) source = "config";

    return { token, databasePath, environment: "production", source };
  }

  const cfgToken = cfg.testApiToken || "";
  const cfgDb = cfg.testDatabasePath || "";
  const legacyToken = cfg.apiToken || "";
  const legacyDb = cfg.databasePath || "";

  const token = cfgToken || legacyToken;
  const databasePath = cfgDb || legacyDb;

  let source: OnixCreds["source"] = "empty";
  if (cfgToken || cfgDb) source = "config";
  else if (legacyToken || legacyDb) source = "legacy";

  return { token, databasePath, environment: "test", source };
}

/**
 * Reports which production credential parts are populated from the secure vault
 * (env vars). Used by the UI to render "stored in vault" indicators instead of
 * empty input fields.
 */
export function getOnixVaultStatus(): { prodTokenInVault: boolean; prodDatabaseInVault: boolean } {
  return {
    prodTokenInVault: !!process.env.ONIX_PROD_API_TOKEN,
    prodDatabaseInVault: !!process.env.ONIX_PROD_DATABASE_PATH,
  };
}
