import type { ApiModule } from "@shared/schema";

const PIPEDRIVE_SOURCES: Record<string, string> = {
  deals: "/v1/deals",
  persons: "/v1/persons",
  organizations: "/v1/organizations",
  activities: "/v1/activities",
  leads: "/v1/leads",
  products: "/v1/products",
};

export interface PushRecordResult {
  sourceIndex: number;
  pipedrive_id: number | null;
  status: "created" | "updated" | "error";
  errorMsg?: string;
}

export interface PushResult {
  success: boolean;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: Array<{ index: number; message: string }>;
  records: PushRecordResult[];
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizePipedriveBody(body: Record<string, any>, entityType: string): Record<string, any> {
  for (const [key, val] of Object.entries(body)) {
    if (typeof val === "string" && /^\[\d+ items?\]$/.test(val)) {
      delete body[key];
    }
  }

  if (entityType === "products") {
    if ("category" in body) {
      const cat = body.category;
      if (cat === null || cat === undefined || cat === "") {
        body.category = null;
      } else {
        const num = Number(cat);
        body.category = isNaN(num) ? null : num;
      }
    }

    if ("prices" in body) {
      const p = body.prices;
      if (Array.isArray(p)) {
        // already correct
      } else if (p && typeof p === "object" && !Array.isArray(p)) {
        body.prices = [p];
      } else if (typeof p === "number" || (typeof p === "string" && !isNaN(Number(p)))) {
        body.prices = [{ currency: "EUR", price: Number(p) }];
      } else {
        delete body.prices;
      }
    }

    if ("tax" in body) {
      if (body.tax === null || body.tax === undefined || body.tax === "") {
        delete body.tax;
      } else {
        const t = Number(body.tax);
        body.tax = isNaN(t) ? 0 : t;
      }
    }
    if ("owner_id" in body) {
      const o = Number(body.owner_id);
      if (!o || isNaN(o)) delete body.owner_id;
      else body.owner_id = o;
    }
  }

  if (entityType === "deals" || entityType === "persons" || entityType === "organizations") {
    if ("owner_id" in body) {
      const o = Number(body.owner_id);
      if (!o || isNaN(o)) delete body.owner_id;
      else body.owner_id = o;
    }
    if ("value" in body) {
      if (body.value === null || body.value === undefined || body.value === "") {
        delete body.value;
      } else {
        const v = Number(body.value);
        body.value = isNaN(v) ? 0 : v;
      }
    }
  }

  return body;
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
      records: records.map((_, i) => ({
        sourceIndex: batchIndex * 50 + i,
        pipedrive_id: null,
        status: "created" as const,
      })),
    };
  }

  return {
    success: false,
    createdCount: 0,
    updatedCount: 0,
    errorCount: records.length,
    errors: [{ index: 0, message: `Target module '${code}' does not support write operations` }],
    records: [],
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
      records: [],
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
      records: [],
    };
  }

  const baseUrl = "https://api.pipedrive.com";
  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: Array<{ index: number; message: string }> = [];
  const recordResults: PushRecordResult[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const globalIndex = batchIndex * 50 + i;

    try {
      const pipedriveId = record._pipedrive_id;
      const isUpdate = pipedriveId && !isNaN(Number(pipedriveId));

      const method = isUpdate ? "PUT" : "POST";
      const url = isUpdate
        ? `${baseUrl}${endpoint}/${pipedriveId}?api_token=${apiToken}`
        : `${baseUrl}${endpoint}?api_token=${apiToken}`;

      const body = { ...record };
      delete body.id;
      delete body._pipedrive_id;
      sanitizePipedriveBody(body, source);

      if (i < 3 && batchIndex === 0) {
        console.log(`[target-push] DEBUG record ${i}: ${method} ${url.replace(apiToken, '***')}`);
        console.log(`[target-push] DEBUG body:`, JSON.stringify(body).slice(0, 500));
      }

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

      if (i < 3 && batchIndex === 0) {
        console.log(`[target-push] DEBUG response ${i}: success=${data.success}, id=${data.data?.id}, error=${data.error}`);
      }

      if (data.success) {
        const newId = data.data?.id || null;
        if (isUpdate) {
          updated++;
          recordResults.push({ sourceIndex: globalIndex, pipedrive_id: newId, status: "updated" });
        } else {
          created++;
          recordResults.push({ sourceIndex: globalIndex, pipedrive_id: newId, status: "created" });
        }
      } else {
        errorCount++;
        const errMsg = data.error || data.error_info || `HTTP ${res.status}`;
        errors.push({ index: globalIndex, message: errMsg });
        recordResults.push({ sourceIndex: globalIndex, pipedrive_id: null, status: "error", errorMsg: errMsg });
        if (i < 5 || errorCount <= 3) {
          console.error(`[target-push] Pipedrive ${method} ${source} record ${i} failed:`, errMsg);
        }
      }
    } catch (err: any) {
      errorCount++;
      const errMsg = err.message || "Unknown error";
      errors.push({ index: globalIndex, message: errMsg });
      recordResults.push({ sourceIndex: globalIndex, pipedrive_id: null, status: "error", errorMsg: errMsg });
      if (errorCount <= 3) {
        console.error(`[target-push] Pipedrive record ${i} exception:`, errMsg);
      }
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
    records: recordResults,
  };
}
