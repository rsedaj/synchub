export type OnixEnvironment = "test" | "production";

export interface OnixCreds {
  token: string;
  databasePath: string;
  environment: OnixEnvironment;
}

/**
 * Resolves active ONIX credentials based on config.environment ("test" | "production").
 * Falls back to legacy fields (apiToken, databasePath) if env-specific ones are not set,
 * so existing installations keep working without manual migration.
 */
export function getOnixCreds(config: Record<string, any> | null | undefined): OnixCreds {
  const cfg = config || {};
  const env: OnixEnvironment = cfg.environment === "production" ? "production" : "test";

  if (env === "production") {
    return {
      token: cfg.prodApiToken || "",
      databasePath: cfg.prodDatabasePath || "",
      environment: "production",
    };
  }

  return {
    token: cfg.testApiToken || cfg.apiToken || "",
    databasePath: cfg.testDatabasePath || cfg.databasePath || "",
    environment: "test",
  };
}
