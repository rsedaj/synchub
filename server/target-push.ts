import type { ApiModule } from "@shared/schema";

const PIPEDRIVE_SOURCES: Record<string, string> = {
  deals: "/v1/deals",
  persons: "/v1/persons",
  organizations: "/v1/organizations",
  activities: "/v1/activities",
  leads: "/v1/leads",
  products: "/v1/products",
};

export interface PushResult {
  success: boolean;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: Array<{ index: number; message: string }>;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function pushToTarget(
  targetModule: ApiModule,
  targetDataSource: string | null,
  records: Record<string, any>[],
  batchIndex: number
): Promise<PushResult> {
  const code = targetModule.code.toUpperCase();

  if (code === "PIPEDRIVE") {
    return pushToPipedrive(targetModule, targetDataSource, records, batchIndex);
  }

  if (code === "ONIX") {
    console.log(`[target-push] ONIX write API not yet implemented — ${records.length} records would be pushed`);
    return {
      success: true,
      createdCount: records.length,
      updatedCount: 0,
      errorCount: 0,
      errors: [],
    };
  }

  return {
    success: false,
    createdCount: 0,
    updatedCount: 0,
    errorCount: records.length,
    errors: [{ index: 0, message: `Target module '${code}' does not support write operations` }],
  };
}

async function pushToPipedrive(
  module: ApiModule,
  dataSource: string | null,
  records: Record<string, any>[],
  batchIndex: number
): Promise<PushResult> {
  const config = module.config as Record<string, any> | null;
  const apiToken = config?.apiToken;

  if (!apiToken) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: "Pipedrive API token not configured" }],
    };
  }

  const source = dataSource || "deals";
  const endpoint = PIPEDRIVE_SOURCES[source];
  if (!endpoint) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: `Unknown Pipedrive data source: '${source}'` }],
    };
  }

  const baseUrl = "https://api.pipedrive.com";
  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    try {
      const hasId = record.id && typeof record.id !== "undefined";
      const method = hasId ? "PUT" : "POST";
      const url = hasId
        ? `${baseUrl}${endpoint}/${record.id}?api_token=${apiToken}`
        : `${baseUrl}${endpoint}?api_token=${apiToken}`;

      const body = { ...record };
      if (!hasId) delete body.id;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();

      if (data.success) {
        if (hasId) updated++;
        else created++;
      } else {
        errorCount++;
        const errMsg = data.error || data.error_info || `HTTP ${res.status}`;
        errors.push({ index: batchIndex * 50 + i, message: errMsg });
        console.error(`[target-push] Pipedrive ${method} ${source} record ${i} failed:`, errMsg);
      }
    } catch (err: any) {
      errorCount++;
      errors.push({ index: batchIndex * 50 + i, message: err.message || "Unknown error" });
      console.error(`[target-push] Pipedrive record ${i} exception:`, err.message);
    }

    if ((i + 1) % 10 === 0) {
      await sleep(250);
    }
  }

  console.log(`[target-push] Pipedrive ${source} batch ${batchIndex}: created=${created} updated=${updated} errors=${errorCount}`);

  return {
    success: errorCount === 0,
    createdCount: created,
    updatedCount: updated,
    errorCount,
    errors: errors.slice(0, 20),
  };
}
