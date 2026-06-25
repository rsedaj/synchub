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

export interface VATTransformEntry {
  field: string;
  originalPrice: number;
  convertedPrice: number;
  vatRate: number;
}

export interface PushRecordResult {
  sourceIndex: number;
  target_id: number | null;
  status: "created" | "updated" | "error" | "skipped";
  matchType?: "matchFields" | "hkod_fallback";
  errorMsg?: string;
  nsNumber?: string;
  vatTransforms?: VATTransformEntry[];
  recordKey?: string;
  hCode?: string;
  onixNsNumber?: string;
  onixRecordId?: string;
}

export interface HKodDecision {
  recordKey: string;
  onixId: number | null;
  onixNsNumber: string | null;
  decision: 'preserved' | 'assigned' | 'skipped';
  hCodeValue: string;
  reason: string;
}

export interface PushResult {
  success: boolean;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  skippedCount?: number;
  errors: Array<{ index: number; message: string }>;
  records: PushRecordResult[];
  avgLatencyMs?: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  hKodNextNumber?: number;
  hKodDecisions?: HKodDecision[];
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

export interface MatchOptions {
  matchFields?: string[];
  matchOperator?: "and" | "or";
  onMissing?: "create" | "skip" | "force";
  mappings?: Array<{ sourceField: string; targetField: string }>;
  targetStock?: string;
  hKodConfig?: { enabled: boolean; prefix: string; nextNumber: number; field: string } | null;
  onixFixedFields?: Array<{ field: string; value: string; condition: "always" | "if_empty" }> | null;
  prevHkodAssignments?: Map<string, string>;
  matchNormalization?: MatchNormalizationOpts | null;
}

export async function pushToTarget(
  targetModule: ApiModule,
  targetDataSource: string | null,
  records: Record<string, any>[],
  batchIndex: number,
  sourceRecords?: Record<string, any>[],
  matchOptions?: MatchOptions
): Promise<PushResult> {
  const code = targetModule.code.toUpperCase();

  if (code === "PIPEDRIVE") {
    return pushToPipedrive(targetModule, targetDataSource, records, batchIndex);
  }

  if (code === "RAYNET") {
    return pushToRaynet(targetModule, targetDataSource, records, batchIndex);
  }

  if (code === "ONIX") {
    return pushToOnix(targetModule, targetDataSource, records, batchIndex, sourceRecords, matchOptions);
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

interface OnixIndexEntry {
  fetchedAt: number;
  recordCount: number;
  fieldMap: Map<string, Map<string, number[]>>;
  // Map IdRecord → RecordExternalIdentificator (ONIX requires it on every POST, even updates)
  idToRecExtId: Map<number, string>;
  // Map IdRecord → Ns_Number (for H kód check on existing records)
  idToNsNumber: Map<number, string>;
  // Map IdRecord → configured H kód field value (when field ≠ Ns_Number)
  idToHKodFieldVal: Map<number, string>;
  // Index completeness verification (ONIX duplicate prevention — cause 6).
  // expectedCount = @odata.count reported by ONIX (null when not provided).
  // complete = false when fewer records were indexed than ONIX reported, meaning
  // a genuine card may be missing from the index → AND-match could falsely create.
  expectedCount: number | null;
  complete: boolean;
  // Per match field: how many indexed records had a non-empty value (cause 2 —
  // distinguishes "field never populated on ONIX cards" from "value not found").
  fieldNonEmptyCount: Map<string, number>;
}
const _onixIndexCache = new Map<string, OnixIndexEntry>();
const ONIX_INDEX_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Clears the ONIX index cache.
 * MUST be called at the start of every sync run so each run fetches a fresh
 * snapshot from ONIX. Without this, a stale index from a previous run would
 * cause records that were just created (with new H kóds) to appear "missing"
 * again in the next run → re-assigned new H kóds → duplicate ONIX records.
 */
export function clearOnixIndexCache(): void {
  const size = _onixIndexCache.size;
  _onixIndexCache.clear();
  if (size > 0) {
    console.log(`[target-push] ONIX index cache cleared (${size} entries invalidated)`);
  }
}

// ONIX REST API returns CustomColumns with table-prefixed names when reading
// (e.g. "STOCK_ITEMS_Product_Code") but expects bare names when writing.
// Use this helper everywhere we search a CustomColumns array so both formats match.
const ONIX_CC_TABLE_PREFIXES = ["STOCK_ITEMS_", "PARTNERS_", "ORDER_ITEMS_", "ORDERS_", "PRICE_LISTS_"];
function findCustomColumn(customColumns: any, colName: string): any {
  if (!Array.isArray(customColumns)) return null;
  return customColumns.find((c: any) => {
    if (!c?.Name) return false;
    if (c.Name === colName) return true;
    for (const pfx of ONIX_CC_TABLE_PREFIXES) {
      if (c.Name.startsWith(pfx) && c.Name.substring(pfx.length) === colName) return true;
    }
    return false;
  }) ?? null;
}

// ── Match value normalization (ONIX duplicate prevention — cause 1) ──────────
// Configurable per-sync. Applied IDENTICALLY when building the ONIX index keys
// and when looking up the source value, so the index key and the lookup value
// always agree. trim() is always applied (matches legacy behaviour); the other
// transforms are opt-in so existing exact matches are never broken.
export interface MatchNormalizationOpts {
  caseInsensitive?: boolean;
  collapseWhitespace?: boolean;
  stripLeadingZeros?: boolean;
  normalizeDecimals?: boolean;
  stripDiacritics?: boolean;
}

function stripDiacriticsStr(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeMatchValue(raw: any, opts?: MatchNormalizationOpts | null): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";
  if (!opts) return s;
  if (opts.collapseWhitespace) s = s.replace(/\s+/g, " ");
  if (opts.stripDiacritics) s = stripDiacriticsStr(s);
  if (opts.caseInsensitive) s = s.toLowerCase();
  if (opts.normalizeDecimals) {
    // Treat "12,50" and "12.50" and "12.5" as the same value.
    const candidate = s.replace(",", ".");
    if (/^-?\d+(\.\d+)?$/.test(candidate)) {
      const num = parseFloat(candidate);
      if (!isNaN(num)) s = String(num);
    }
  }
  if (opts.stripLeadingZeros) {
    // Only strip when the (remaining) value is purely numeric, to avoid
    // mangling alphanumeric codes like "00AB".
    if (/^0\d*$/.test(s)) {
      const stripped = s.replace(/^0+/, "");
      s = stripped === "" ? "0" : stripped;
    }
  }
  return s;
}

// Aggressive normalization used ONLY for diagnostics — detects whether a source
// value exists in the index under a *different format* (cause 1) even when the
// configured normalization did not unify them. Never used for actual matching.
export function looseMatchValue(raw: any): string {
  if (raw == null) return "";
  let s = stripDiacriticsStr(String(raw).trim().toLowerCase());
  const asNum = s.replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(asNum)) {
    const n = parseFloat(asNum);
    if (!isNaN(n)) return String(n);
  }
  return s.replace(/[^a-z0-9]/g, "").replace(/^0+(?=\d)/, "");
}

// Canonical stable record key derivation (ONIX duplicate prevention — cause 4).
// MUST be used identically wherever a source record is keyed (delta baselines,
// H kód decisions, prevHkodAssignments lookup) so the same source record maps to
// the same key across runs regardless of which match field happens to be filled.
export function deriveRecordKey(record: Record<string, any>, matchFields?: string[]): string | null {
  if (matchFields && matchFields.length > 0) {
    for (const mf of matchFields) {
      const v = record[mf];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return record.id || record.code || record.sku || record.gtin ||
    record.Code || record.SKU || record.product_id ||
    record.externalId || record.productId || record.item_id ||
    record.article_number || record.articleNumber || null;
}

async function buildOnixIndex(
  baseUrl: string,
  endpoint: string,
  hdrs: Record<string, string>,
  targetFields: string[],
  targetStock?: string,
  hKodField?: string,
  normOpts?: MatchNormalizationOpts | null
): Promise<OnixIndexEntry | null> {
  // Build the actual fetch URL — ONIX GET /stockitems doesn't support Default_Stock as query filter
  // (per Swagger: only `tables`, `StockCode`, `SupplierCode`, `$select` are supported).
  // Stock filtering is done in-memory after fetch.
  //
  // IMPORTANT: ONIX does NOT include CustomColumns in the response by default.
  // When any target match field is a CustomColumns.* field, we must append
  // ?tables=CustomColumns so ONIX returns the CustomColumns array per record.
  // Without this, item.CustomColumns is always undefined → no match ever found → all records skipped.
  //
  // $count=true is required by OData v4 spec to ask the server to return @odata.count.
  // Without it ONIX will NOT include @odata.count even if pagination is active.
  const needsCustomColumns = targetFields.some(f => f.startsWith("CustomColumns."));
  const fetchUrl = needsCustomColumns
    ? `${baseUrl}${endpoint}?tables=CustomColumns&$count=true`
    : `${baseUrl}${endpoint}?$count=true`;
  // databasePath is included so prod and test ONIX environments never share the same index.
  const _dbPathForKey = hdrs["DatabasePath"] ?? "";
  // Normalization opts are part of the cache key — different normalization produces
  // different index keys, so two configs with different normalization must not share an index.
  const _normKey = normOpts ? JSON.stringify({
    c: !!normOpts.caseInsensitive, w: !!normOpts.collapseWhitespace,
    z: !!normOpts.stripLeadingZeros, d: !!normOpts.normalizeDecimals, x: !!normOpts.stripDiacritics,
  }) : "none";
  const cacheKey = `${fetchUrl}:db=${_dbPathForKey}:fields=${targetFields.slice().sort().join(",")}:stock=${targetStock ?? ""}:hkodField=${hKodField ?? ""}:norm=${_normKey}`;

  const existing = _onixIndexCache.get(cacheKey);
  if (existing && (Date.now() - existing.fetchedAt) < ONIX_INDEX_TTL_MS) {
    const allFieldsPresent = targetFields.every(f => existing.fieldMap.has(f));
    if (allFieldsPresent) {
      console.log(`[target-push] ONIX index cache HIT: ${existing.recordCount} records (stock=${targetStock ?? "none"})`);
      return existing;
    }
  }

  console.log(`[target-push] ONIX pre-fetch: building index url=${fetchUrl} fields=${targetFields.join(",")}`);
  const fetchStart = Date.now();

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 300000);
    const fetchHdrs = { ...hdrs };
    delete fetchHdrs["Content-Type"];

    const res = await fetch(fetchUrl, { headers: fetchHdrs, signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) {
      console.warn(`[target-push] ONIX index fetch failed: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data :
      (Array.isArray(data?.value) ? data.value :
        (Array.isArray(data?.data) ? data.data :
          (Array.isArray(data?.items) ? data.items : [])));

    // Log OData metadata present in the response (key diagnostic for pagination verification)
    {
      const odataKeys = Object.keys(data ?? {}).filter(k => k.startsWith('@odata.') || k.startsWith('@'));
      const rawCount = data?.['@odata.count'];
      const rawNextLink = data?.['@odata.nextLink'];
      console.log(
        `[target-push] ONIX index first response: page1=${arr.length} records | ` +
        `odataFields=[${odataKeys.join(',')}] | ` +
        `@odata.count=${rawCount ?? 'absent'} | ` +
        `@odata.nextLink=${rawNextLink ? 'present' : 'absent'} | ` +
        `responseType=${Array.isArray(data) ? 'array' : (typeof data === 'object' ? `object(keys:${Object.keys(data ?? {}).slice(0,8).join(',')})` : typeof data)}`
      );
    }

    // OData pagination: follow @odata.nextLink or use @odata.count to fetch remaining pages
    let indexExpectedCount: number | null = null;
    {
      const oDataCount = typeof data?.['@odata.count'] === 'number' ? (data['@odata.count'] as number) : null;
      indexExpectedCount = oDataCount;
      let nextLink: string | null = typeof data?.['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : null;

      if (nextLink) {
        // No fixed page cap — terminate when nextLink is null; 10 000 is an upper safety guard only
        let safetyLimit = 10000;
        while (nextLink && safetyLimit-- > 0) {
          const ctrl2 = new AbortController();
          const t2 = setTimeout(() => ctrl2.abort(), 300000);
          try {
            const res2 = await fetch(nextLink, { headers: fetchHdrs, signal: ctrl2.signal });
            clearTimeout(t2);
            if (!res2.ok) { console.warn(`[target-push] ONIX index nextLink failed HTTP ${res2.status}`); break; }
            const data2 = await res2.json();
            const page: any[] = Array.isArray(data2) ? data2 : (Array.isArray(data2?.value) ? data2.value : []);
            arr.push(...page);
            nextLink = typeof data2?.['@odata.nextLink'] === 'string' ? data2['@odata.nextLink'] : null;
          } catch (e2: any) { clearTimeout(t2); console.warn(`[target-push] ONIX index nextLink error: ${e2.message}`); break; }
        }
        console.log(`[target-push] ONIX index paginated via @odata.nextLink: total=${arr.length} records`);
      } else if (oDataCount && oDataCount > arr.length) {
        const PAGE_SIZE = arr.length > 0 ? arr.length : 500;
        // Terminate when arr.length >= oDataCount; 10 000 is an upper safety guard only
        let safetyLimit = 10000;
        while (arr.length < oDataCount && safetyLimit-- > 0) {
          const skip = arr.length;
          const sep = fetchUrl.includes('?') ? '&' : '?';
          const pageUrl = `${fetchUrl}${sep}$skip=${skip}&$top=${PAGE_SIZE}`;
          const ctrl2 = new AbortController();
          const t2 = setTimeout(() => ctrl2.abort(), 300000);
          try {
            const res2 = await fetch(pageUrl, { headers: fetchHdrs, signal: ctrl2.signal });
            clearTimeout(t2);
            if (!res2.ok) { console.warn(`[target-push] ONIX index $skip failed HTTP ${res2.status}`); break; }
            const data2 = await res2.json();
            const page: any[] = Array.isArray(data2) ? data2 : (Array.isArray(data2?.value) ? data2.value : []);
            if (page.length === 0) break;
            arr.push(...page);
          } catch (e2: any) { clearTimeout(t2); console.warn(`[target-push] ONIX index $skip error: ${e2.message}`); break; }
        }
        console.log(`[target-push] ONIX index paginated via @odata.count: fetched=${arr.length}/${oDataCount}`);
      } else if (oDataCount && oDataCount === arr.length) {
        // @odata.count matches first page — ONIX returned everything in one shot
        console.log(`[target-push] ONIX index: single-page response confirmed by @odata.count=${oDataCount} == page1=${arr.length} — no pagination needed`);
      } else if (!nextLink && !oDataCount && arr.length > 0) {
        // Fallback: non-OData page-limited response — try $skip/$top until short/empty page.
        // Triggered for ANY non-empty first page (no threshold) to handle small ONIX page sizes
        // (e.g., 250 records/page). Stops when page is shorter than first page, empty, or
        // duplicate-page detection fires (ONIX ignoring $skip).
        const PAGE_SIZE = arr.length;
        const firstPageFirstId = arr[0]?.IdRecord ?? arr[0]?.Id ?? arr[0]?.id ?? null;
        const initialLen = arr.length;
        // 10 000 page hard cap (~2.5M records at 250/page) + loop-progress guard below
        let maxPages = 10000;
        let pageFailed = false;
        let singlePageConfirmed = false;
        while (!pageFailed && maxPages-- > 0) {
          const prevLen = arr.length;
          const skip = arr.length;
          const sep = fetchUrl.includes('?') ? '&' : '?';
          const pageUrl = `${fetchUrl}${sep}$skip=${skip}&$top=${PAGE_SIZE}`;
          const ctrl2 = new AbortController();
          const t2 = setTimeout(() => ctrl2.abort(), 300000);
          try {
            const res2 = await fetch(pageUrl, { headers: fetchHdrs, signal: ctrl2.signal });
            clearTimeout(t2);
            if (!res2.ok) { console.warn(`[target-push] ONIX index fallback $skip HTTP ${res2.status}`); pageFailed = true; break; }
            const data2 = await res2.json();
            const page: any[] = Array.isArray(data2) ? data2 : (Array.isArray(data2?.value) ? data2.value : []);
            if (page.length === 0) { singlePageConfirmed = true; break; } // Empty page — done
            // Detect if ONIX ignores $skip by comparing first record ID to first page
            const pageFirstId = page[0]?.IdRecord ?? page[0]?.Id ?? page[0]?.id ?? null;
            if (pageFirstId !== null && pageFirstId === firstPageFirstId) {
              console.log(`[target-push] ONIX index: $skip ignored (same first record) — single-response endpoint, total=${arr.length}`);
              singlePageConfirmed = true;
              break;
            }
            arr.push(...page);
            // Loop-progress guard: stop if no growth (shouldn't happen, but defensive)
            if (arr.length <= prevLen) { console.warn(`[target-push] ONIX index fallback: no growth after push, stopping`); break; }
            if (page.length < PAGE_SIZE) break; // Short page — last page
          } catch (e2: any) { clearTimeout(t2); console.warn(`[target-push] ONIX index fallback $skip error: ${e2.message}`); pageFailed = true; }
        }
        if (singlePageConfirmed && arr.length === initialLen) {
          console.log(`[target-push] ONIX index: single-page response (no @odata.count/@odata.nextLink) — ONIX returned all ${arr.length} records at once, no pagination needed`);
        } else if (arr.length > initialLen) {
          console.log(`[target-push] ONIX index fallback pagination complete: total=${arr.length} records (${Math.ceil(arr.length / PAGE_SIZE)} pages)`);
        }
      }
    }

    // Log first record structure to diagnose Default_Stock field availability
    if (arr.length > 0) {
      const sample = arr[0];
      const stockVal = sample?.Default_Stock ?? sample?.default_stock ?? sample?.Stock ?? "MISSING";
      console.log(`[target-push] ONIX index sample record keys=${Object.keys(sample).slice(0, 15).join(",")} Default_Stock="${stockVal}" totalFetched=${arr.length}`);
    }

    const fieldMap = new Map<string, Map<string, number[]>>();
    // Always index Ns_Number — even when not in matchFields — so H kód fallback lookup
    // (prevHkodAssignments → Ns_Number search) works on any sync configuration.
    const fieldsToIndex = targetFields.includes("Ns_Number") ? targetFields : [...targetFields, "Ns_Number"];
    for (const tf of fieldsToIndex) {
      fieldMap.set(tf, new Map());
    }
    const idToRecExtId = new Map<number, string>();
    const idToNsNumber = new Map<number, string>();
    const idToHKodFieldVal = new Map<number, string>();
    const fieldNonEmptyCount = new Map<string, number>();

    let filteredByStock = 0;
    for (const item of arr) {
      const rawId = item?.IdRecord ?? item?.Id ?? item?.id ?? null;
      const id = rawId != null && !isNaN(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : null;
      if (id === null) continue;

      // Filter by targetStock if specified — avoids ambiguous matches across warehouses
      if (targetStock) {
        const itemStock = item?.Default_Stock ?? item?.default_stock ?? item?.Stock ?? null;
        if (itemStock != null && String(itemStock).trim() !== targetStock) {
          filteredByStock++;
          continue;
        }
      }

      // Capture RecordExternalIdentificator — ONIX requires this on every POST (even updates)
      const recExtId = item?.RecordExternalIdentificator ?? item?.recordExternalIdentificator;
      if (recExtId != null && String(recExtId).trim() !== "") {
        idToRecExtId.set(id, String(recExtId));
      }
      // Capture Ns_Number — needed for H kód check on existing records
      const nsNumRaw = item?.Ns_Number ?? item?.ns_number;
      if (nsNumRaw != null && String(nsNumRaw).trim() !== "") {
        idToNsNumber.set(id, String(nsNumRaw).trim());
      }
      // Capture configured H kód field value (if different from Ns_Number)
      if (hKodField && hKodField !== "Ns_Number") {
        const hkRaw = item?.[hKodField];
        if (hkRaw != null && String(hkRaw).trim() !== "") {
          idToHKodFieldVal.set(id, String(hkRaw).trim());
        }
      }

      for (const tf of fieldsToIndex) {
        let value: any;
        if (tf.startsWith("CustomColumns.")) {
          const colName = tf.substring("CustomColumns.".length);
          const cc = findCustomColumn(item.CustomColumns, colName);
          value = cc?.Value;
        } else {
          value = item[tf];
        }
        if (value == null) continue;
        // Apply the SAME normalization here as in pickMatchValue so the index key
        // and the looked-up source value always agree (ONIX duplicate prevention — cause 1).
        const normalized = normalizeMatchValue(value, normOpts);
        if (!normalized) continue;
        fieldNonEmptyCount.set(tf, (fieldNonEmptyCount.get(tf) ?? 0) + 1);
        const vMap = fieldMap.get(tf)!;
        const existing = vMap.get(normalized);
        if (existing) {
          existing.push(id);
        } else {
          vMap.set(normalized, [id]);
        }
      }
    }

    const indexedCount = arr.length - filteredByStock;
    // Completeness check (cause 6): ONIX reported @odata.count but we indexed fewer
    // records → a real card may be missing. AND-match against an incomplete index
    // risks a false "not found" → duplicate creation, so flag it loudly.
    const complete = indexExpectedCount == null ? true : arr.length >= indexExpectedCount;
    if (!complete) {
      console.warn(`[target-push] ⚠ ONIX index INCOMPLETE: fetched ${arr.length}/${indexExpectedCount} records (@odata.count). Matching may miss existing cards → risk of duplicate creation. AND-match no-match will be treated cautiously.`);
    }
    const entry: OnixIndexEntry = { fetchedAt: Date.now(), recordCount: indexedCount, fieldMap, idToRecExtId, idToNsNumber, idToHKodFieldVal, expectedCount: indexExpectedCount, complete, fieldNonEmptyCount };
    _onixIndexCache.set(cacheKey, entry);
    console.log(`[target-push] ONIX index built: captured RecordExternalIdentificator for ${idToRecExtId.size}/${indexedCount} records`);
    const sampleLog: string[] = [];
    for (const [field, vMap] of fieldMap.entries()) {
      const samples = Array.from(vMap.keys()).slice(0, 5);
      sampleLog.push(`${field}: [${samples.map(s => JSON.stringify(s)).join(", ")}] (${vMap.size} unique vals)`);
      if (vMap.size === 0 && field.startsWith("CustomColumns.")) {
        // Diagnose: show which CustomColumns names actually exist in ONIX records
        const colName = field.substring("CustomColumns.".length);
        const actualCCNames = new Set<string>();
        for (const item of arr.slice(0, 20)) {
          if (Array.isArray(item.CustomColumns)) {
            for (const cc of item.CustomColumns) {
              if (cc?.Name) actualCCNames.add(String(cc.Name));
            }
          }
        }
        if (actualCCNames.size > 0) {
          console.warn(`[target-push] ⚠ ONIX index: "${colName}" not found in CustomColumns! Available names (from first 20 records): [${Array.from(actualCCNames).join(", ")}]`);
        } else if (arr.length > 0 && !Array.isArray(arr[0].CustomColumns)) {
          console.warn(`[target-push] ⚠ ONIX index: item.CustomColumns is NOT an array for "${colName}" — type=${typeof arr[0].CustomColumns}, value=${JSON.stringify(arr[0].CustomColumns)?.slice(0, 200)}. Check if ?tables=CustomColumns is supported by this ONIX endpoint.`);
        } else {
          console.warn(`[target-push] ⚠ ONIX index: "${colName}" has 0 entries — ONIX records may have empty CustomColumns arrays (no records with this column populated).`);
        }
      }
    }
    const stockMsg = targetStock ? ` | stock filter=${targetStock} skipped=${filteredByStock}` : "";
    console.log(`[target-push] ONIX index built: ${arr.length} total / ${indexedCount} indexed in ${Date.now() - fetchStart}ms${stockMsg} | ${sampleLog.join(" | ")}`);
    return entry;
  } catch (err: any) {
    console.warn(`[target-push] ONIX index build failed: ${err.message}`);
    return null;
  }
}

function sanitizeOnixBody(body: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(body)) {
    if (key === "_onix_id" || key === "id") continue;
    if (typeof val === "string" && /^\[\d+ items?\]$/.test(val)) continue;
    if (val === "[]" || val === "{}") continue;
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
  sourceRecords?: Record<string, any>[],
  matchOptions?: MatchOptions
): Promise<PushResult> {
  const config = module.config as Record<string, any> | null;
  const { getOnixCreds } = await import("./onix-creds");
  const creds = getOnixCreds(config);
  const token = creds.token;
  const databasePath = creds.databasePath;

  if (!token) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errorCount: records.length,
      errors: [{ index: 0, message: `ONIX API token not configured for environment "${creds.environment}"` }],
      records: [],
    };
  }
  console.log(`[target-push] ONIX active environment: ${creds.environment} (db: ${databasePath || "n/a"})`);

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
  let totalLatencyMs = 0;
  let latencyCount = 0;
  let minLatencyMs = Infinity;
  let maxLatencyMs = 0;
  const hKodDecisions: HKodDecision[] = [];

  const CONCURRENCY = Math.max(1, Math.min(8, parseInt(process.env.ONIX_CONCURRENCY || "1", 10)));

  const ONIX_READONLY_PREFIXES = [
    "StockItemBalance", "StockItemGroups", "StockItemParams",
    "StockItemCodes", "StockItemAccessories", "StockItemAlternatives",
    "StockItemPartners", "StockItemMeasureUnits", "Enclosures",
  ];

  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
    "User-Agent": "SyncHub/1.0",
    "Connection": "keep-alive",
  };
  if (databasePath) {
    hdrs["DatabasePath"] = databasePath;
  }

  const matchFields = (matchOptions?.matchFields || []).filter(f => f && f.trim());
  const matchOperator: "and" | "or" = (matchOptions?.matchOperator as "and" | "or") || "and";
  const onMissing = (matchOptions?.onMissing as "create" | "skip" | "force") || "create";
  const normOpts = matchOptions?.matchNormalization ?? null;

  const hKodCfg = matchOptions?.hKodConfig?.enabled && matchOptions.hKodConfig.prefix ? matchOptions.hKodConfig : null;
  let hKodCounter = hKodCfg ? hKodCfg.nextNumber : 0;

  function resolveNsNumber(mappedRec: Record<string, any>, srcRec?: Record<string, any>): string {
    const fromMapped = mappedRec.Ns_Number ?? mappedRec.Ns_Code;
    if (fromMapped != null && String(fromMapped).trim() !== "") return String(fromMapped).trim();
    if (srcRec) {
      const nsMapping = (matchOptions?.mappings || []).find(
        m => m.targetField === "Ns_Number" || m.targetField === "Ns_Code"
      );
      if (nsMapping) {
        const fromSrc = srcRec[nsMapping.sourceField];
        if (fromSrc != null && String(fromSrc).trim() !== "") return String(fromSrc).trim();
      }
      const directSrc = srcRec.Ns_Number ?? srcRec.Ns_Code ?? srcRec.custom_label_2;
      if (directSrc != null && String(directSrc).trim() !== "") return String(directSrc).trim();
    }
    return "";
  }

  const matchTargetByMappingsRaw = (matchOptions?.mappings || [])
    .filter(m => matchFields.includes(m.sourceField))
    .map(m => ({ sourceField: m.sourceField, targetField: m.targetField }));

  function buildOnixFilterParam(targetField: string, value: any): { key: string; val: string } {
    const v = value == null ? "" : String(value);
    if (targetField.startsWith("CustomColumns.")) {
      const colName = targetField.substring("CustomColumns.".length);
      return { key: `CustomColumns.${colName}`, val: v };
    }
    return { key: targetField, val: v };
  }

  const matchCache = new Map<string, number | null>();
  let _noMatchDebugCount = 0;

  const targetFieldsForIndex = matchTargetByMappingsRaw.map(m => m.targetField).filter((v, i, a) => a.indexOf(v) === i);
  let onixIndex: OnixIndexEntry | null = null;
  if (targetFieldsForIndex.length > 0) {
    onixIndex = await buildOnixIndex(baseUrl, writeDef.endpoint, hdrs, targetFieldsForIndex, matchOptions?.targetStock, hKodCfg?.field || "Ns_Number", normOpts);
    if (onixIndex) {
      console.log(`[target-push] ONIX index ready: ${onixIndex.recordCount} records cached, batch ${batchIndex}`);
    }
  }

  function pickMatchValue(record: Record<string, any>, sourceRec: Record<string, any> | undefined, m: { sourceField: string; targetField: string }): string {
    const mappedVal = record[m.targetField];
    const sourceVal = sourceRec ? sourceRec[m.sourceField] : undefined;
    const candidates = [mappedVal, sourceVal];
    for (const c of candidates) {
      if (c == null) continue;
      // Apply the SAME normalization used when building the index (cause 1) so the
      // looked-up value and the index key always agree.
      const s = normalizeMatchValue(c, normOpts);
      if (s.length > 0) return s;
    }
    return "";
  }

  function extractOnixId(item: any): number | null {
    const id = item?.IdRecord ?? item?.Id ?? item?.id ?? null;
    return id != null && !isNaN(Number(id)) && Number(id) > 0 ? Number(id) : null;
  }

  async function lookupOnixByField(targetField: string, value: string, expectedValues: Array<{ targetField: string; value: string }>): Promise<{ id: number | null; ambiguous: boolean }> {
    if (onixIndex) {
      const vMap = onixIndex.fieldMap.get(targetField);
      const ids = vMap?.get(value) ?? [];
      if (ids.length > 1) {
        // ONIX has duplicate records sharing this Ns_Number. The ONIX REST API has no
        // endpoint to update a specific IdRecord — POST /stockitems upserts by Ns_Number
        // and rejects when duplicates exist. We mark this as ambiguous so the engine
        // can skip the record with a clear message instead of failing the sync.
        console.warn(`[target-push] ONIX duplicate ${targetField}="${value}": ${ids.length} records (${ids.join(",")}) — record will be SKIPPED (ONIX data quality issue)`);
        return { id: null, ambiguous: true };
      }
      return { id: ids[0] ?? null, ambiguous: false };
    }

    const f = buildOnixFilterParam(targetField, value);
    const params = new URLSearchParams();
    params.append(f.key, f.val);
    // ONIX omits CustomColumns from the response unless explicitly requested.
    // Add ?tables=CustomColumns so the returned records include the CustomColumns array
    // and the post-filter on cc.Name / cc.Value works correctly.
    if (targetField.startsWith("CustomColumns.")) {
      params.append("tables", "CustomColumns");
    }
    try {
      const lookupUrl = `${baseUrl}${writeDef.endpoint}?${params.toString()}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(lookupUrl, { headers: hdrs, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return { id: null, ambiguous: false };
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.value) ? data.value : (Array.isArray(data?.data) ? data.data : []));
      const matches = arr.filter((r: any) => {
        for (const ev of expectedValues) {
          let actual: any = r[ev.targetField];
          if (ev.targetField.startsWith("CustomColumns.")) {
            const colName = ev.targetField.substring("CustomColumns.".length);
            const cc = findCustomColumn(r.CustomColumns, colName);
            actual = cc?.Value;
          }
          if (normalizeMatchValue(actual, normOpts) !== ev.value) return false;
        }
        return true;
      });
      if (matches.length > 1) {
        // Pick the lowest IdRecord among duplicates
        const sorted = matches.map((m: any) => extractOnixId(m)).filter((id): id is number => id !== null).sort((a, b) => a - b);
        return { id: sorted[0] ?? null, ambiguous: false };
      }
      return { id: extractOnixId(matches[0]), ambiguous: false };
    } catch {
      return { id: null, ambiguous: false };
    }
  }

  // reason describes WHY no existing ONIX card was matched (ONIX duplicate prevention —
  // step 1: log the specific cause whenever a new record is about to be created).
  type MatchLookupResult = { id: number | null; ambiguous: boolean; reason?: string };

  // Classify the no-match cause for diagnostics + audit (causes 1, 2, 3, 6).
  function classifyNoMatch(fieldValues: Array<{ targetField: string; value: string }>, emptyFields: string[]): string {
    if (emptyFields.length > 0) {
      return `prázdna match hodnota v zdroji pre pole: ${emptyFields.join(", ")} (záznam nedá sa spoľahlivo spárovať)`;
    }
    if (onixIndex && !onixIndex.complete) {
      return `neúplný ONIX index (${onixIndex.recordCount}/${onixIndex.expectedCount} kariet) — existujúca karta mohla chýbať v indexe`;
    }
    if (onixIndex) {
      // cause 2: a match field is never populated on ONIX cards at all
      for (const fv of fieldValues) {
        const pop = onixIndex.fieldNonEmptyCount.get(fv.targetField) ?? 0;
        if (pop === 0) {
          return `pole "${fv.targetField}" nie je vyplnené na žiadnej ONIX karte — párovanie podľa tohto poľa nikdy neuspeje`;
        }
      }
      // cause 1: value exists under a different format (normalization mismatch)
      for (const fv of fieldValues) {
        const vMap = onixIndex.fieldMap.get(fv.targetField);
        if (vMap && !vMap.has(fv.value)) {
          const loose = looseMatchValue(fv.value);
          for (const k of vMap.keys()) {
            if (looseMatchValue(k) === loose) {
              return `nesúlad formátu hodnoty pre "${fv.targetField}": zdroj="${fv.value}" vs ONIX="${k}" — zapnite normalizáciu párovania`;
            }
          }
        }
      }
    }
    return `hodnota sa nenašla v ONIX-e (karta zrejme ešte neexistuje) — vytvorí sa nový záznam`;
  }

  async function findOnixIdByMatch(record: Record<string, any>, sourceRec: Record<string, any> | undefined): Promise<MatchLookupResult> {
    if (matchFields.length === 0 || matchTargetByMappingsRaw.length === 0) return { id: null, ambiguous: false, reason: "žiadne match polia nie sú nakonfigurované" };

    if (matchOperator === "or") {
      // OR: try each match field independently, return first hit
      for (const m of matchTargetByMappingsRaw) {
        const value = pickMatchValue(record, sourceRec, m);
        if (!value) continue;
        const ck = `or|${m.targetField}=${value}`;
        if (matchCache.has(ck)) {
          const cached = matchCache.get(ck);
          if (cached !== null) return { id: cached!, ambiguous: false };
          continue;
        }
        const result = await lookupOnixByField(m.targetField, value, [{ targetField: m.targetField, value }]);
        matchCache.set(ck, result.id);
        if (result.ambiguous) return { id: null, ambiguous: true };
        if (result.id !== null) return { id: result.id, ambiguous: false };
      }
      return { id: null, ambiguous: false, reason: "OR párovanie: žiadne z polí sa nezhodovalo s existujúcou ONIX kartou" };
    }

    // AND (default): all fields must match — use index if available
    const cacheKey: string[] = [];
    const fieldValues: Array<{ targetField: string; value: string }> = [];
    const emptyFields: string[] = [];
    for (const m of matchTargetByMappingsRaw) {
      const value = pickMatchValue(record, sourceRec, m);
      if (!value) {
        // cause 3: an AND match value is empty — protect against creating a duplicate
        // off a partial key. Record which field is empty so the cause is auditable.
        emptyFields.push(m.targetField);
        continue;
      }
      cacheKey.push(`${m.targetField}=${value}`);
      fieldValues.push({ targetField: m.targetField, value });
    }
    if (emptyFields.length > 0) {
      return { id: null, ambiguous: false, reason: classifyNoMatch(fieldValues, emptyFields) };
    }
    const ck = cacheKey.sort().join("|");
    if (matchCache.has(ck)) {
      const cached = matchCache.get(ck);
      return { id: cached ?? null, ambiguous: false };
    }

    if (onixIndex) {
      // Intersection of ID sets across all required fields
      let candidateIds: Set<number> | null = null;
      for (const fv of fieldValues) {
        const vMap = onixIndex.fieldMap.get(fv.targetField);
        const ids = vMap?.get(fv.value) ?? [];
        const idSet = new Set(ids);
        if (candidateIds === null) {
          candidateIds = idSet;
        } else {
          for (const id of candidateIds) {
            if (!idSet.has(id)) candidateIds.delete(id);
          }
        }
        if (candidateIds.size === 0) break;
      }
      const finalIds = candidateIds ? Array.from(candidateIds) : [];
      if (finalIds.length > 1) {
        // ONIX has duplicate records sharing the match key. The ONIX REST API has no
        // endpoint to update a specific IdRecord — POST /stockitems upserts by Ns_Number
        // and rejects when duplicates exist. Mark as ambiguous so the engine skips
        // the record cleanly with a clear message instead of a hard failure.
        console.warn(`[target-push] ONIX duplicate match (AND): ${fieldValues.map(fv => `${fv.targetField}="${fv.value}"`).join(" + ")} → ${finalIds.length} records (${finalIds.join(",")}) — record will be SKIPPED (ONIX data quality issue)`);
        return { id: null, ambiguous: true };
      }
      const result = finalIds[0] ?? null;
      if (result === null && _noMatchDebugCount < 3 && onixIndex) {
        _noMatchDebugCount++;
        const debugParts = fieldValues.map(fv => {
          const vMap = onixIndex!.fieldMap.get(fv.targetField);
          const inIndex = vMap ? vMap.has(fv.value) : false;
          const sampleKeys = vMap ? Array.from(vMap.keys()).slice(0, 3).map(k => JSON.stringify(k)).join(", ") : "no map";
          return `${fv.targetField}=${JSON.stringify(fv.value)} inIndex=${inIndex} samples=[${sampleKeys}]`;
        });
        console.log(`[target-push] NO-MATCH #${_noMatchDebugCount}: ${debugParts.join(" AND ")}`);
      }
      matchCache.set(ck, result);
      if (result === null) {
        return { id: null, ambiguous: false, reason: classifyNoMatch(fieldValues, []) };
      }
      return { id: result, ambiguous: false };
    }

    // Fallback: API lookup
    const params = new URLSearchParams();
    const expectedValues: Array<{ targetField: string; value: string }> = [];
    for (const fv of fieldValues) {
      const f = buildOnixFilterParam(fv.targetField, fv.value);
      params.append(f.key, f.val);
      expectedValues.push(fv);
    }
    // ONIX omits CustomColumns from the response unless explicitly requested.
    // If any AND-match field is a CustomColumns.* field, append tables=CustomColumns
    // so returned records include the CustomColumns array for post-filter verification.
    if (fieldValues.some(fv => fv.targetField.startsWith("CustomColumns."))) {
      params.append("tables", "CustomColumns");
    }
    try {
      const lookupUrl = `${baseUrl}${writeDef.endpoint}?${params.toString()}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(lookupUrl, { headers: hdrs, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        matchCache.set(ck, null);
        return { id: null, ambiguous: false };
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.value) ? data.value : (Array.isArray(data?.data) ? data.data : []));
      const matches = arr.filter((r: any) => {
        for (const ev of expectedValues) {
          let actual: any = r[ev.targetField];
          if (ev.targetField.startsWith("CustomColumns.")) {
            const colName = ev.targetField.substring("CustomColumns.".length);
            const cc = findCustomColumn(r.CustomColumns, colName);
            actual = cc?.Value;
          }
          if (normalizeMatchValue(actual, normOpts) !== ev.value) return false;
        }
        return true;
      });
      if (matches.length > 1) {
        // ONIX has duplicate records (API fallback path) — same as the index path,
        // ONIX won't allow targeting a specific IdRecord, so skip cleanly.
        console.warn(`[target-push] ONIX duplicate match (API fallback): ${expectedValues.map(ev => `${ev.targetField}="${ev.value}"`).join(" + ")} → ${matches.length} records — record will be SKIPPED (ONIX data quality issue)`);
        return { id: null, ambiguous: true };
      }
      const numericId = extractOnixId(matches[0]);
      matchCache.set(ck, numericId);
      if (numericId === null) {
        return { id: null, ambiguous: false, reason: "API vyhľadávanie nevrátilo žiadnu zhodnú ONIX kartu (karta zrejme ešte neexistuje)" };
      }
      return { id: numericId, ambiguous: false };
    } catch (err: any) {
      console.warn(`[target-push] ONIX match lookup failed: ${err.message}`);
      matchCache.set(ck, null);
      return { id: null, ambiguous: false, reason: `chyba pri API vyhľadávaní v ONIX-e: ${err.message}` };
    }
  }

  async function pushSingleRecord(i: number): Promise<{
    created: number; updated: number; error: number;
    errEntry?: { index: number; message: string };
    recResult: PushRecordResult;
    latency: number;
  }> {
    const record = records[i];
    const globalIndex = batchIndex * 50 + i;

    let _snapHCode: string | undefined;
    let _snapNsNum: string | undefined;
    let _snapRecId: string | undefined;
    let _usedHkodFallback = false;
    let _noMatchReason: string | undefined;
    // Stable record key (ONIX duplicate prevention — cause 4): derived ONCE via the
    // canonical deriveRecordKey (matchFields first, then id/code/sku fallbacks), the
    // SAME logic used for delta baselines and H kód decisions. This makes the key the
    // same source record produces stable across runs, so prevHkodAssignments lookups
    // and hkod_decisions writes always agree → no re-assigned H kód → no duplicate card.
    let _snapKey = (sourceRecords?.[i] ? deriveRecordKey(sourceRecords[i], matchFields) : null) ?? '';

    try {
      let onixId: any = record._onix_id || record[writeDef.idField] || record.Id || record.id;
      let isUpdate = onixId && !isNaN(Number(onixId)) && Number(onixId) > 0;

      if (!isUpdate && matchFields.length > 0 && onMissing !== "force") {
        const lookup = await findOnixIdByMatch(record, sourceRecords?.[i]);
        if (lookup.ambiguous) {
          // Duplicate Ns_Number in ONIX itself — ONIX REST API has no way to update a
          // specific IdRecord, and POST /stockitems would be rejected by ONIX with
          // "sa nachádza v evidencii viac krát". Skip cleanly (data quality issue on
          // ONIX side), do NOT count as error so sync continues.
          const nsNum = resolveNsNumber(record, sourceRecords?.[i]);
          return {
            created: 0, updated: 0, error: 0,
            recResult: { sourceIndex: globalIndex, target_id: null, status: "skipped", errorMsg: "Preskočené: záznam existuje v ONIX-e viackrát s rovnakým Ns_Number (problém kvality dát v ONIX-e). API neumožňuje cieliť konkrétny IdRecord.", nsNumber: nsNum, recordKey: _snapKey },
            latency: 0,
          };
        }
        if (lookup.id) {
          onixId = lookup.id;
          isUpdate = true;
        } else if (!lookup.ambiguous) {
          // matchFields lookup returned no result. Capture the classified cause so it
          // can be logged + audited when (if) a new record ends up being created.
          _noMatchReason = lookup.reason;
          // Log what was tried (first 3 failures).
          if (_noMatchDebugCount <= 3) {
            const src = sourceRecords?.[i];
            const lookupDesc = matchTargetByMappingsRaw.map(m => {
              const val = src ? src[m.sourceField] : undefined;
              return `${m.targetField}=${val != null ? JSON.stringify(String(val)) : "?"}`;
            }).join(", ");
            console.log(`[target-push] matchFields ZLYHALO (záznam ${globalIndex}, key=${_snapKey || "–"}): hľadané: ${lookupDesc || "(žiadne matchFields)"} | PRÍČINA: ${_noMatchReason || "neznáma"}`);
          }

          // H kód fallback: if this record was previously assigned an H kód in a prior sync run,
          // search the ONIX index by Ns_Number = that H kód. This prevents creating duplicate ONIX
          // cards when the matchFields can't locate the card that was created in a previous run.
          // (ONIX upserts by Ns_Number, so if we find the card this way we can safely update it.)
          if (onMissing !== "force" && _snapKey && matchOptions?.prevHkodAssignments && onixIndex) {
            const prevHKod = matchOptions.prevHkodAssignments.get(_snapKey);
            if (prevHKod) {
              const nsMap = onixIndex.fieldMap.get("Ns_Number");
              const nsIds = nsMap?.get(prevHKod) ?? [];
              if (nsIds.length === 1) {
                onixId = nsIds[0];
                isUpdate = true;
                _usedHkodFallback = true;
                console.log(`[target-push] H kód fallback: nájdené cez Ns_Number="${prevHKod}" → IdRecord=${onixId} (záznam ${globalIndex}, key=${_snapKey})`);
              } else if (nsIds.length > 1) {
                console.warn(`[target-push] H kód fallback: Ns_Number="${prevHKod}" má ${nsIds.length} záznamov v ONIX — ambiguous, preskočené (záznam ${globalIndex})`);
              } else {
                console.log(`[target-push] H kód fallback: Ns_Number="${prevHKod}" nenájdené v ONIX indexe — bude vytvorený nový záznam (záznam ${globalIndex}, key=${_snapKey})`);
              }
            }
          }

          // If still not found and onMissing === "skip", skip cleanly
          if (!isUpdate && onMissing === "skip") {
            const nsNum = resolveNsNumber(record, sourceRecords?.[i]);
            const src = sourceRecords?.[i];
            const lookupDesc = matchTargetByMappingsRaw.map(m => {
              const val = src ? src[m.sourceField] : undefined;
              return `${m.targetField}=${val != null ? JSON.stringify(String(val)) : "?"}`;
            }).join(", ");
            return {
              created: 0, updated: 0, error: 0,
              recResult: { sourceIndex: globalIndex, target_id: null, status: "skipped", errorMsg: `Nenájdené v ONIX: ${lookupDesc} — preskočené podľa konfigurácie`, nsNumber: nsNum, recordKey: _snapKey },
              latency: 0,
            };
          }
        }
      }

      // ONIX API uses POST for both create AND update — ONIX automatically upserts by Ns_Number
      // (per official Swagger docs: "V prípade, že pridávaná karta už existuje vykoná sa akcia edit")
      // IdRecord is NOT part of the POST schema — must NOT be included in body (it confuses ONIX)
      const method = "POST";
      const url = `${baseUrl}${writeDef.endpoint}`;

      const body = sanitizeOnixBody(record);

      // H kód auto-assignment: assign prefix+number to configured field if record lacks H kód
      if (hKodCfg) {
        const hkField = hKodCfg.field || "Ns_Number";
        // detectionPrefix: prefix used to RECOGNISE existing H kóds in ONIX records.
        // Defaults to the generation prefix if not explicitly configured.
        const detPfx: string = (hKodCfg as any).detectionPrefix?.trim() || hKodCfg.prefix;
        let existingFieldVal: string | null = null;
        if (isUpdate && onixId) {
          if (hkField === "Ns_Number") {
            existingFieldVal = onixIndex?.idToNsNumber?.get(Number(onixId)) ?? null;
          } else {
            existingFieldVal = onixIndex?.idToHKodFieldVal?.get(Number(onixId)) ?? null;
          }
        }
        // alreadyHasHKod uses detPfx so ONIX records with prefix "H20..." are recognised
        // even if the generation prefix changes later.
        const alreadyHasHKod = existingFieldVal ? existingFieldVal.startsWith(detPfx) : false;
        const _hkOnixNsNum = onixIndex?.idToNsNumber?.get(Number(onixId)) ?? null;
        const _hkRecKey = _snapKey || `idx-${globalIndex}`;
        // Check if source mapping already placed a valid H kód in body
        const sourceBodyVal = body[hkField] != null ? String(body[hkField]).trim() : null;
        // Source check also uses detPfx
        const sourceAlreadyHasHKod = sourceBodyVal ? sourceBodyVal.startsWith(detPfx) : false;
        if (sourceAlreadyHasHKod) {
          // Source already provides a valid H kód — use it as-is, do NOT increment counter
          console.log(`[target-push] H kód prevzatý zo zdroja: ${sourceBodyVal} → ${hkField} (detPfx="${detPfx}", záznam ${globalIndex}, key=${_hkRecKey})`);
          hKodDecisions.push({ recordKey: _hkRecKey, onixId: onixId ? Number(onixId) : null, onixNsNumber: _hkOnixNsNum, decision: 'skipped', hCodeValue: sourceBodyVal!, reason: 'source-provided' });
        } else if (!alreadyHasHKod) {
          // CRITICAL: ONIX upserts exclusively by Ns_Number.
          // If hkField = "Ns_Number" and the record already exists in ONIX with a DIFFERENT
          // Ns_Number (not matching detPfx), we CANNOT send a new H kód as Ns_Number —
          // ONIX would CREATE a new duplicate record instead of updating the existing one.
          // Preserve the existing Ns_Number so ONIX can find and update the correct record.
          if (isUpdate && hkField === "Ns_Number" && existingFieldVal) {
            body[hkField] = existingFieldVal;
            console.warn(`[target-push] H kód: ONIX Ns_Number="${existingFieldVal}" nezačína detekčným prefixom "${detPfx}" — H kód SA NEPRIRADÍ, zachováva sa existujúci Ns_Number (zmena Ns_Number by vytvorila duplikát v ONIX, záznam ${globalIndex}, key=${_hkRecKey})`);
            hKodDecisions.push({ recordKey: _hkRecKey, onixId: onixId ? Number(onixId) : null, onixNsNumber: _hkOnixNsNum, decision: 'preserved', hCodeValue: existingFieldVal, reason: 'cannot-reassign-ns-number' });
          } else {
            // New record (isUpdate=false) OR hkField is not Ns_Number OR existingFieldVal is empty
            // → safe to assign a new H kód using generation prefix + padding
            // Anti-duplicate: check if this recordKey was previously assigned an H kód
            const prevAssigned = matchOptions?.prevHkodAssignments?.get(_hkRecKey);
            const _hkPad: number = (hKodCfg as any).padding || 0;
            if (prevAssigned) {
              body[hkField] = prevAssigned;
              console.log(`[target-push] H kód opätovne použitý (predchádzajúci run): ${prevAssigned} → ${hkField} (záznam ${globalIndex}, key=${_hkRecKey})`);
              hKodDecisions.push({ recordKey: _hkRecKey, onixId: onixId ? Number(onixId) : null, onixNsNumber: _hkOnixNsNum, decision: 'assigned', hCodeValue: prevAssigned, reason: 'reused-from-previous-run' });
            } else {
              const _hkNum = hKodCounter++;
              body[hkField] = hKodCfg.prefix + (_hkPad > 0 ? String(_hkNum).padStart(_hkPad, '0') : String(_hkNum));
              console.log(`[target-push] H kód priradený: ${body[hkField]} → ${hkField} (genPfx="${hKodCfg.prefix}", pad=${_hkPad}, ${isUpdate ? "update-bez-hkod" : "nový záznam"}, existingNs="${existingFieldVal ?? "–"}", key=${_hkRecKey}${!isUpdate && _noMatchReason ? `, príčina: ${_noMatchReason}` : ""})`);
              // Audit the SPECIFIC cause for a brand-new card so duplicate root causes are traceable (step 7).
              const _newReason = isUpdate ? 'update-no-hkod' : `new-record: ${_noMatchReason || 'karta nenájdená v ONIX-e'}`;
              hKodDecisions.push({ recordKey: _hkRecKey, onixId: onixId ? Number(onixId) : null, onixNsNumber: _hkOnixNsNum, decision: 'assigned', hCodeValue: body[hkField], reason: _newReason });
            }
          }
        } else {
          // Existujúci H kód — vloží sa späť do body z DVOCH dôvodov:
          // 1. ONIX POST musí obsahovať Ns_Number aby vedel ktorý záznam upsertovať
          // 2. Snapshot (_snapHCode) číta z body → sync_baselines uloží WebSku↔H kód mapping
          body[hkField] = existingFieldVal!;
          console.log(`[target-push] H kód zachovaný z ONIX: ${existingFieldVal} → ${hkField} (záznam ${globalIndex}, key=${_hkRecKey})`);
          hKodDecisions.push({ recordKey: _hkRecKey, onixId: onixId ? Number(onixId) : null, onixNsNumber: _hkOnixNsNum, decision: 'preserved', hCodeValue: existingFieldVal!, reason: 'already-has-hkod' });
        }
      }

      const hasVal = (v: any): boolean => {
        if (v == null) return false;
        if (typeof v === "string") return v.trim().length > 0;
        if (typeof v === "number") return true;
        return !!v;
      };

      const sourceRec = sourceRecords?.[i];
      let extId: string | undefined;
      for (const mf of matchFields) {
        const v = sourceRec?.[mf];
        if (v != null && String(v).trim() !== "") { extId = String(v).trim(); break; }
      }
      if (!extId) {
        const raw = sourceRec?.id || sourceRec?.code || sourceRec?.sku ||
          sourceRec?.Code || sourceRec?.SKU || sourceRec?.product_id ||
          sourceRec?.externalId || sourceRec?.productId || sourceRec?.item_id ||
          sourceRec?.article_number || sourceRec?.articleNumber ||
          sourceRec?.custom_label_0 || sourceRec?.custom_label_1;
        extId = raw ? String(raw) : undefined;
      }
      const autoId = extId || `SYNCHUB_${globalIndex + 1}`;

      if (!hasVal(body.RecordExternalIdentificator)) {
        if (isUpdate && onixIndex && onixId) {
          // For updates, reuse the existing RecordExternalIdentificator from ONIX (don't overwrite)
          const existingRecExtId = onixIndex.idToRecExtId.get(Number(onixId));
          if (existingRecExtId) {
            body.RecordExternalIdentificator = existingRecExtId;
          } else {
            // Fallback if not in index — use source autoId (better than empty, ONIX requires it)
            body.RecordExternalIdentificator = autoId;
          }
        } else if (!isUpdate) {
          body.RecordExternalIdentificator = autoId;
        }
      }
      // Apply "if_empty" fixed fields before autofill — user-defined defaults
      if (matchOptions?.onixFixedFields?.length) {
        for (const ff of matchOptions.onixFixedFields) {
          if (ff.condition === "if_empty" && ff.field && !hasVal(body[ff.field])) {
            body[ff.field] = ff.value;
          }
        }
      }

      if (!hasVal(body.Ns_Number) && !isUpdate) {
        body.Ns_Number = hasVal(body.RecordExternalIdentificator) ? body.RecordExternalIdentificator : autoId;
      }
      // For updates: if Ns_Number is still missing (not set by mappings or H kód logic),
      // restore it from the ONIX index — ONIX upserts by Ns_Number, so without it ONIX
      // would create a new record instead of updating the existing one.
      if (isUpdate && !hasVal(body.Ns_Number) && onixIndex && onixId) {
        const existingNsNum = onixIndex.idToNsNumber.get(Number(onixId));
        if (existingNsNum) {
          body.Ns_Number = existingNsNum;
          console.log(`[target-push] Ns_Number dotiahnutý z indexu pre update: "${existingNsNum}" (záznam ${globalIndex})`);
        }
      }
      if (!hasVal(body.Ns_Code) && !isUpdate) {
        body.Ns_Code = "SK";
      }
      // Type is REQUIRED by ONIX on every POST (per Swagger schema), even for updates.
      // Default 1 = "Skladová karta" (standard stock card).
      if (source === "stockitems" && !hasVal(body.Type)) {
        body.Type = 1;
      }
      if (source === "stockitems" && !hasVal(body.Measure_Units_Default_Name) && !isUpdate) {
        body.Measure_Units_Default_Name = "ks";
      }
      if (source === "stockitems" && !hasVal(body.Default_Stock) && !isUpdate) {
        body.Default_Stock = matchOptions?.targetStock || config?.defaultStock || "SYN";
      }

      const customCols: Array<{Name: string; Value: string}> = [];
      const keysToRemove: string[] = [];

      for (const [k, v] of Object.entries(body)) {
        if (k.startsWith("CustomColumns.")) {
          let colName = k.substring("CustomColumns.".length);
          // ONIX REST API returns custom column names with a table prefix
          // (e.g. "STOCK_ITEMS_Z_STOI_00001_SIZE") but expects bare "Z_..." names
          // when writing. Strip any known table prefix automatically.
          for (const pfx of ONIX_CC_TABLE_PREFIXES) {
            if (colName.startsWith(pfx)) { colName = colName.substring(pfx.length); break; }
          }
          // Legacy short-name alias (old mappings that used "URL" directly)
          if (colName === "URL") {
            colName = "Z_HAUE_SK001_URL_TXT";
          }
          customCols.push({ Name: colName, Value: v != null ? String(v) : "" });
          keysToRemove.push(k);
          continue;
        }

        if (ONIX_READONLY_PREFIXES.some(p => k.startsWith(p + "[") || k === p)) {
          keysToRemove.push(k);
          continue;
        }

        if (typeof v === "string") {
          const lower = k.toLowerCase();
          if (lower.includes("price") || lower.includes("quantity") || lower.includes("amount") ||
              lower.includes("weight") || lower.includes("vat") || lower === "default_price" ||
              lower === "recycle_rate_per_kg" || lower === "recycle_tax") {
            const cleaned = v.replace(/[a-zA-Z€$£ ]/g, "").replace(",", ".").trim();
            const num = parseFloat(cleaned);
            if (!isNaN(num)) {
              body[k] = num;
            } else {
              body[k] = 0;
            }
          }
        }
      }

      for (const k of keysToRemove) {
        delete body[k];
      }

      if (customCols.length > 0) {
        body.CustomColumns = customCols;
      }

      // Convert any remaining array values (e.g. CombinedSizes) to comma-separated strings
      for (const [k, v] of Object.entries(body)) {
        if (k === "CustomColumns") continue;
        if (Array.isArray(v)) {
          body[k] = v.map((x: any) => (x != null ? String(x) : "")).filter(Boolean).join(", ");
        }
      }

      // Apply "always" fixed fields last — absolute overrides regardless of mapping
      if (matchOptions?.onixFixedFields?.length) {
        for (const ff of matchOptions.onixFixedFields) {
          if (ff.condition === "always" && ff.field) {
            body[ff.field] = ff.value;
          }
        }
      }

      if (body.Default_Price !== undefined && body.Default_Price !== null) {
        const dp = typeof body.Default_Price === "string"
          ? parseFloat(body.Default_Price.replace(/[a-zA-Z€$£ ]/g, "").replace(",", ".")) 
          : Number(body.Default_Price);
        body.Default_Price = isNaN(dp) ? 0 : dp;
      } else if (!isUpdate) {
        body.Default_Price = 0;
      }

      if (body.Default_Price_Vat !== undefined && body.Default_Price_Vat !== null) {
        const dpv = typeof body.Default_Price_Vat === "string"
          ? parseFloat(body.Default_Price_Vat.replace(/[a-zA-Z€$£ ]/g, "").replace(",", "."))
          : Number(body.Default_Price_Vat);
        body.Default_Price_Vat = isNaN(dpv) ? 0 : dpv;
      }

      // Keep the stable key derived at the top (cause 4). Only fall back to autoId
      // when no stable source identifier exists at all — never overwrite a good key,
      // otherwise the snapshot/hkod key would diverge from prevHkodAssignments.
      _snapKey = _snapKey || extId || autoId;
      _snapHCode = hKodCfg && body[hKodCfg.field || "Ns_Number"] != null ? String(body[hKodCfg.field || "Ns_Number"]) : undefined;
      _snapNsNum = body.Ns_Number != null ? String(body.Ns_Number) : undefined;
      _snapRecId = body.RecordExternalIdentificator != null ? String(body.RecordExternalIdentificator) : undefined;

      if (i < 5 && batchIndex < 2) {
        console.log(`[target-push] ONIX record [b${batchIndex},r${i}]: ${method} ${url}`);
        console.log(`[target-push] body keys: [${Object.keys(body).join(", ")}]`);
        console.log(`[target-push] required fields: Ns_Number=${JSON.stringify(body.Ns_Number)} RecExtId=${JSON.stringify(body.RecordExternalIdentificator)} Default_Price=${JSON.stringify(body.Default_Price)} Default_Stock=${JSON.stringify(body.Default_Stock)} Type=${JSON.stringify(body.Type)} Ns_Code=${JSON.stringify(body.Ns_Code)}`);
        if (sourceRec) {
          console.log(`[target-push] source: id=${JSON.stringify(sourceRec.id)} gtin=${JSON.stringify(sourceRec.gtin)} price=${JSON.stringify(sourceRec.price)} autoId=${autoId}`);
        }
      }

      let res: Response | null = null;
      let fetchLatency = 0;
      const MAX_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutMs = attempt === 1 ? 20000 : 30000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const fetchStart = Date.now();
        try {
          res = await fetch(url, {
            method,
            headers: hdrs,
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          fetchLatency = Date.now() - fetchStart;
          clearTimeout(timeout);

          if (res.status === 503 || res.status === 504 || res.status === 429) {
            if (attempt < MAX_RETRIES) {
              const errText = await res.text().catch(() => "");
              console.warn(`[target-push] ONIX server overload retry ${attempt}/${MAX_RETRIES}: HTTP ${res.status} — ${errText.slice(0, 100)}`);
              await sleep(2000 * attempt);
              res = null;
              continue;
            }
          }

          if (res.status === 401 || res.status === 408) {
            const errText = await res.text().catch(() => "");
            const isAuthTimeout = errText.toLowerCase().includes("timed out") || errText.toLowerCase().includes("timeout");
            if (isAuthTimeout && attempt < MAX_RETRIES) {
              console.warn(`[target-push] ONIX auth/timeout retry ${attempt}/${MAX_RETRIES}: HTTP ${res.status} — ${errText.slice(0, 100)}`);
              await sleep(2000 * attempt);
              res = null;
              continue;
            }
          }
          break;
        } catch (retryErr: any) {
          clearTimeout(timeout);
          fetchLatency = Date.now() - fetchStart;
          if (retryErr.name === "AbortError" && attempt < MAX_RETRIES) {
            console.warn(`[target-push] ONIX timeout retry ${attempt}/${MAX_RETRIES}`);
            await sleep(2000 * attempt);
            continue;
          }
          throw retryErr;
        }
      }

      if (!res) {
        throw new Error("ONIX API authentication timed out after retries");
      }

      if (res.ok) {
        let newId: number | null = null;
        let onixRejected = false;
        let onixRejectMsg = "";
        try {
          const resText = await res.text();
          if (batchIndex === 0 && i < 3) {
            console.log(`[target-push] ONIX response raw [batch ${batchIndex}, record ${i}]:`, resText.slice(0, 500));
          }
          try {
            const data = JSON.parse(resText);

            if (data?.Result === 3 || (Array.isArray(data?.Errors) && data.Errors.length > 0)) {
              onixRejected = true;
              const msgs = (data.Errors || []).map((e: any) => e.Message || e.message || JSON.stringify(e));
              onixRejectMsg = msgs.join("; ").slice(0, 300);
            }

            if (!onixRejected) {
              newId = data?.Id || data?.id || data?.IdRecord || data?.StockItemId || data?.stockItemId ||
                      (typeof data === "number" ? data : null);
              if (!newId && typeof data === "object" && data !== null) {
                for (const key of Object.keys(data)) {
                  if (/^(id|Id|ID)$/.test(key) || key.toLowerCase().endsWith("id")) {
                    const val = data[key];
                    if (typeof val === "number" && val > 0) { newId = val; break; }
                    if (typeof val === "string" && /^\d+$/.test(val)) { newId = parseInt(val, 10); break; }
                  }
                }
              }
            }
          } catch {
            if (/^\d+$/.test(resText.trim())) {
              newId = parseInt(resText.trim(), 10);
            }
          }
        } catch {}

        if (onixRejected) {
          return {
            created: 0, updated: 0, error: 1, latency: fetchLatency,
            errEntry: { index: globalIndex, message: `ONIX rejected: ${onixRejectMsg}` },
            recResult: { sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: `ONIX rejected: ${onixRejectMsg}`, recordKey: _snapKey, hCode: _snapHCode, onixNsNumber: _snapNsNum, onixRecordId: _snapRecId },
          };
        } else if (isUpdate) {
          return {
            created: 0, updated: 1, error: 0, latency: fetchLatency,
            recResult: { sourceIndex: globalIndex, target_id: newId || Number(onixId), status: "updated", matchType: _usedHkodFallback ? "hkod_fallback" : "matchFields", recordKey: _snapKey, hCode: _snapHCode, onixNsNumber: _snapNsNum, onixRecordId: _snapRecId },
          };
        } else {
          return {
            created: 1, updated: 0, error: 0, latency: fetchLatency,
            recResult: { sourceIndex: globalIndex, target_id: newId, status: "created", recordKey: _snapKey, hCode: _snapHCode, onixNsNumber: _snapNsNum, onixRecordId: _snapRecId },
          };
        }
      } else {
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
        return {
          created: 0, updated: 0, error: 1, latency: fetchLatency,
          errEntry: { index: globalIndex, message: errMsg },
          recResult: { sourceIndex: globalIndex, target_id: null, status: "error", errorMsg: errMsg, recordKey: _snapKey, hCode: _snapHCode, onixNsNumber: _snapNsNum, onixRecordId: _snapRecId },
        };
      }
    } catch (err: any) {
      const errMsg = err.name === "AbortError" ? "Request timed out (30s)" : (err.message || "Unknown error");
      return {
        created: 0, updated: 0, error: 1, latency: 0,
        errEntry: { index: batchIndex * 50 + i, message: errMsg },
        recResult: { sourceIndex: batchIndex * 50 + i, target_id: null, status: "error", errorMsg: errMsg, recordKey: _snapKey },
      };
    }
  }

  const sortedResults: Array<{ idx: number; result: Awaited<ReturnType<typeof pushSingleRecord>> }> = [];

  for (let chunkStart = 0; chunkStart < records.length; chunkStart += CONCURRENCY) {
    const chunkEnd = Math.min(chunkStart + CONCURRENCY, records.length);
    const promises = [];
    for (let i = chunkStart; i < chunkEnd; i++) {
      promises.push(pushSingleRecord(i).then(result => ({ idx: i, result })));
    }
    const chunkResults = await Promise.all(promises);
    sortedResults.push(...chunkResults);
  }

  sortedResults.sort((a, b) => a.idx - b.idx);

  let loggedErrors = 0;
  let skippedCount = 0;
  for (const { result } of sortedResults) {
    created += result.created;
    updated += result.updated;
    errorCount += result.error;
    if (result.recResult.status === "skipped") skippedCount++;
    if (result.errEntry) {
      errors.push(result.errEntry);
      if (loggedErrors < 5) {
        console.error(`[target-push] ONIX record error:`, result.errEntry.message.slice(0, 200));
        loggedErrors++;
      }
    }
    recordResults.push(result.recResult);
    if (result.latency > 0) {
      totalLatencyMs += result.latency;
      latencyCount++;
      if (result.latency < minLatencyMs) minLatencyMs = result.latency;
      if (result.latency > maxLatencyMs) maxLatencyMs = result.latency;
    }
  }

  const avgLatency = latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0;
  const errorRate = records.length > 0 ? errorCount / records.length : 0;
  const warnOverload = errorRate > 0.3 && errorCount > 3;
  console.log(`[target-push] ONIX ${source} batch ${batchIndex}: created=${created} updated=${updated} skipped=${skippedCount} errors=${errorCount} avgLatency=${avgLatency}ms min=${minLatencyMs === Infinity ? 0 : minLatencyMs}ms max=${maxLatencyMs}ms${warnOverload ? ` ⚠️ HIGH ERROR RATE (${Math.round(errorRate * 100)}%)` : ""}`);

  return {
    success: errorCount === 0,
    createdCount: created,
    updatedCount: updated,
    errorCount,
    skippedCount,
    errors: errors.slice(0, 20),
    records: recordResults,
    avgLatencyMs: avgLatency,
    minLatencyMs: minLatencyMs === Infinity ? 0 : minLatencyMs,
    maxLatencyMs,
    hKodNextNumber: hKodCfg ? hKodCounter : undefined,
    hKodDecisions: hKodDecisions.length > 0 ? hKodDecisions : undefined,
  };
}
