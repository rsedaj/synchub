import type { ApiModule } from "@shared/schema";

const RAYNET_SOURCES: Record<string, string> = {
  company: "/company/",
  person: "/person/",
  businessCase: "/businessCase/",
  lead: "/lead/",
  activity: "/activity/",
  invoice: "/invoice/",
  product: "/product/",
};

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
  target_id: number | null;
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
  batchIndex: number,
  sourceRecords?: Record<string, any>[]
): Promise<PushResult> {
  const code = targetModule.code.toUpperCase();

  if (code === "PIPEDRIVE") {
    return pushToPipedrive(targetModule, targetDataSource, records, batchIndex);
  }

  if (code === "RAYNET") {
    return pushToRaynet(targetModule, targetDataSource, records, batchIndex);
  }

  if (code === "ONIX") {
    return pushToOnix(targetModule, targetDataSource, records, batchIndex, sourceRecords);
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
          recordResults.push({ sourceIndex: globalIndex, target_id: newId, status: "updated" });
        } else {
          created++;
          recordResults.push({ sourceIndex: globalIndex, target_id: newId, status: "created" });
        }
      } else {
        errorCount++;
        const errMsg = data.error || data.error_info || `HTTP ${res.status}`;
        errors.push({ index: globalIndex, message: errMsg });
        recordResults.push({ sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg });
        if (i < 5 || errorCount <= 3) {
          console.error(`[target-push] Pipedrive ${method} ${source} record ${i} failed:`, errMsg);
        }
      }
    } catch (err: any) {
      errorCount++;
      const errMsg = err.message || "Unknown error";
      errors.push({ index: globalIndex, message: errMsg });
      recordResults.push({ sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg });
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

function sanitizeRaynetBody(body: Record<string, any>, entityType: string): Record<string, any> {
  delete body.id;
  delete body._raynet_id;

  for (const [key, val] of Object.entries(body)) {
    if (typeof val === "string" && /^\[\d+ items?\]$/.test(val)) {
      delete body[key];
    }
  }

  const numericFields = ["rating", "price", "totalAmount", "estimatedValue"];
  for (const field of numericFields) {
    if (field in body) {
      if (body[field] === null || body[field] === undefined || body[field] === "") {
        delete body[field];
      } else {
        const num = Number(body[field]);
        body[field] = isNaN(num) ? undefined : num;
        if (body[field] === undefined) delete body[field];
      }
    }
  }

  if (entityType === "company" || entityType === "person") {
    if ("owner" in body && body.owner !== null && typeof body.owner === "object" && body.owner.id) {
      body.owner = body.owner.id;
    }
  }

  for (const [key, val] of Object.entries(body)) {
    if (val === null || val === undefined) {
      delete body[key];
    }
  }

  return body;
}

async function pushToRaynet(
  module: ApiModule,
  dataSource: string | null,
  records: Record<string, any>[],
  batchIndex: number
): Promise<PushResult> {
  const config = module.config as Record<string, any> | null;
  const username = config?.username;
  const apiKey = config?.apiKey;
  const instanceName = config?.instanceName;

  if (!username || !apiKey || !instanceName) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: "Raynet credentials not configured (username, apiKey, instanceName required)" }],
      records: [],
    };
  }

  const source = (!dataSource || dataSource === "auto") ? "company" : dataSource;
  const endpoint = RAYNET_SOURCES[source];
  if (!endpoint) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: `Unknown Raynet data source: '${source}'` }],
      records: [],
    };
  }

  const baseUrl = "https://app.raynet.cz/api/v2";
  const authHeader = "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64");

  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: Array<{ index: number; message: string }> = [];
  const recordResults: PushRecordResult[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const globalIndex = batchIndex * 50 + i;

    try {
      const raynetId = record._raynet_id;
      const isUpdate = raynetId && !isNaN(Number(raynetId));

      const method = isUpdate ? "POST" : "PUT";
      const url = isUpdate
        ? `${baseUrl}${endpoint}${raynetId}`
        : `${baseUrl}${endpoint}`;

      const body = { ...record };
      sanitizeRaynetBody(body, source);

      if (i < 3 && batchIndex === 0) {
        console.log(`[target-push] DEBUG Raynet record ${i}: ${method} ${url}`);
        console.log(`[target-push] DEBUG Raynet body:`, JSON.stringify(body).slice(0, 500));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": authHeader,
          "X-Instance-Name": instanceName,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
        console.warn(`[target-push] Raynet rate limit hit, waiting ${waitMs}ms`);
        await sleep(waitMs);
        i--;
        continue;
      }

      let data: any = {};
      const responseText = await res.text();
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { rawResponse: responseText.slice(0, 200) };
      }

      if (res.ok) {
        const newId = data?.data?.id || null;
        if (isUpdate) {
          updated++;
          recordResults.push({ sourceIndex: globalIndex, target_id: newId, status: "updated" });
        } else {
          created++;
          recordResults.push({ sourceIndex: globalIndex, target_id: newId, status: "created" });
        }
      } else {
        errorCount++;
        const errMsg = data?.message || data?.error || `HTTP ${res.status}`;
        errors.push({ index: globalIndex, message: errMsg });
        recordResults.push({ sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg });
        if (i < 5 || errorCount <= 3) {
          console.error(`[target-push] Raynet ${method} ${source} record ${i} failed:`, errMsg);
        }
      }
    } catch (err: any) {
      errorCount++;
      const errMsg = err.message || "Unknown error";
      errors.push({ index: globalIndex, message: errMsg });
      recordResults.push({ sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg });
      if (errorCount <= 3) {
        console.error(`[target-push] Raynet record ${i} exception:`, errMsg);
      }
    }

    if ((i + 1) % 5 === 0) {
      await sleep(500);
    }
  }

  console.log(`[target-push] Raynet ${source} batch ${batchIndex}: created=${created} updated=${updated} errors=${errorCount}`);

  return {
    success: errorCount === 0,
    createdCount: created,
    updatedCount: updated,
    errorCount,
    errors: errors.slice(0, 20),
    records: recordResults,
  };
}

const ONIX_WRITE_SOURCES: Record<string, { endpoint: string; idField: string }> = {
  stockitems: { endpoint: "/api/v1/stockitems", idField: "Id" },
  partners: { endpoint: "/api/v1/partners", idField: "Id" },
  stocks: { endpoint: "/api/v1/stocks", idField: "Id" },
  catalogprices: { endpoint: "/api/v1/pricinglists/partnerprices", idField: "Id" },
  stockitemgroups: { endpoint: "/api/v1/stockitemgroups", idField: "Id" },
};

function sanitizeOnixBody(body: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(body)) {
    if (key === "_onix_id" || key === "id") continue;
    if (typeof val === "string" && /^\[\d+ items?\]$/.test(val)) continue;
    if (val === undefined) continue;
    cleaned[key] = val;
  }
  return cleaned;
}

async function pushToOnix(
  module: ApiModule,
  dataSource: string | null,
  records: Record<string, any>[],
  batchIndex: number,
  sourceRecords?: Record<string, any>[]
): Promise<PushResult> {
  const config = module.config as Record<string, any> | null;
  const token = config?.apiToken;
  const databasePath = config?.databasePath;

  if (!token) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: "ONIX API token not configured" }],
      records: [],
    };
  }

  const source = (!dataSource || dataSource === "auto") ? "stockitems" : dataSource;
  const writeDef = ONIX_WRITE_SOURCES[source];
  if (!writeDef) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: `ONIX data source '${source}' does not support write operations. Supported: ${Object.keys(ONIX_WRITE_SOURCES).join(", ")}` }],
      records: [],
    };
  }

  const rawBase = module.baseUrl || "https://onix-api.hauerland.sk/onix_api";
  const baseUrl = rawBase.replace(/\/onix_api$/i, "/ONIX_API");

  const ALLOWED_ONIX_HOSTS = new Set(["onix-api.hauerland.sk", "195.146.148.139"]);
  try {
    const parsedUrl = new URL(baseUrl);
    if (!ALLOWED_ONIX_HOSTS.has(parsedUrl.hostname)) {
      return {
        success: false,
        createdCount: 0,
        updatedCount: 0,
        errorCount: records.length,
        errors: [{ index: 0, message: `ONIX API host '${parsedUrl.hostname}' is not in the allowed hosts list` }],
        records: [],
      };
    }
  } catch {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: `Invalid ONIX API base URL: ${rawBase}` }],
      records: [],
    };
  }

  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: Array<{ index: number; message: string }> = [];
  const recordResults: PushRecordResult[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const globalIndex = batchIndex * 50 + i;

    try {
      const onixId = record._onix_id || record[writeDef.idField] || record.Id || record.id;
      const isUpdate = onixId && !isNaN(Number(onixId)) && Number(onixId) > 0;

      const method = isUpdate ? "PUT" : "POST";
      const url = isUpdate
        ? `${baseUrl}${writeDef.endpoint}/${onixId}`
        : `${baseUrl}${writeDef.endpoint}`;

      const body = sanitizeOnixBody(record);

      const sourceRec = sourceRecords?.[i];
      if (!body.RecordExternalIdentificator && !isUpdate) {
        const extId = sourceRec?.id || sourceRec?.code || sourceRec?.sku || sourceRec?.Code || sourceRec?.SKU || sourceRec?.product_id || sourceRec?.externalId;
        body.RecordExternalIdentificator = extId ? String(extId) : `SYNCHUB_${globalIndex + 1}`;
      }

      for (const [k, v] of Object.entries(body)) {
        if (v === null || v === undefined) continue;
        if (typeof v === "string") {
          const lower = k.toLowerCase();
          if (lower.includes("price") || lower.includes("quantity") || lower.includes("amount") || lower.includes("weight") || lower.includes("vat") || lower === "default_price") {
            const num = parseFloat(v.replace(",", ".").replace(/[^\d.\-]/g, ""));
            if (!isNaN(num)) {
              body[k] = num;
            }
          }
        }
      }

      if (i < 3 && batchIndex === 0) {
        console.log(`[target-push] DEBUG ONIX record ${i}: ${method} ${url}`);
        console.log(`[target-push] DEBUG ONIX body:`, JSON.stringify(body).slice(0, 500));
      }

      const hdrs: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": "SyncHub/1.0",
      };
      if (databasePath) {
        hdrs["DatabasePath"] = databasePath;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, {
        method,
        headers: hdrs,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        let newId: number | null = null;
        try {
          const data = await res.json();
          newId = data?.Id || data?.id || (typeof data === "number" ? data : null);
        } catch {}

        if (isUpdate) {
          updated++;
          recordResults.push({ sourceIndex: globalIndex, target_id: newId || Number(onixId), status: "updated" });
        } else {
          created++;
          recordResults.push({ sourceIndex: globalIndex, target_id: newId, status: "created" });
        }
      } else {
        errorCount++;
        let errMsg = `HTTP ${res.status}`;
        try {
          const errText = await res.text();
          if (errText) {
            if (res.status === 401) {
              errMsg = "Authentication failed — Invalid ONIX API token";
            } else if (res.status === 500 && errText.includes("does not exist")) {
              errMsg = `ONIX database error — verify DatabasePath`;
            } else {
              errMsg = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
            }
          }
        } catch {}
        errors.push({ index: globalIndex, message: errMsg });
        recordResults.push({ sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg });
        if (i < 5 || errorCount <= 3) {
          console.error(`[target-push] ONIX ${method} ${source} record ${i} failed:`, errMsg);
        }
      }
    } catch (err: any) {
      errorCount++;
      const errMsg = err.name === "AbortError" ? "Request timed out (30s)" : (err.message || "Unknown error");
      errors.push({ index: globalIndex, message: errMsg });
      recordResults.push({ sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg });
      if (errorCount <= 3) {
        console.error(`[target-push] ONIX record ${i} exception:`, errMsg);
      }
    }

    if ((i + 1) % 5 === 0) {
      await sleep(200);
    }
  }

  console.log(`[target-push] ONIX ${source} batch ${batchIndex}: created=${created} updated=${updated} errors=${errorCount}`);

  return {
    success: errorCount === 0,
    createdCount: created,
    updatedCount: updated,
    errorCount,
    errors: errors.slice(0, 20),
    records: recordResults,
  };
}
