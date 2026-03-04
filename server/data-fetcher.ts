import { parseStringPromise } from "xml2js";
import type { ApiModule } from "@shared/schema";

const ALLOWED_HOSTS = new Set([
  "195.146.148.139",
  "api-ts-westeu.promotron.com",
  "shop.hauerland.sk",
  "feed.hauerland.sk",
  "www.hauerland.sk",
  "hauerland.sk",
  "api.pipedrive.com",
  "www.givingeurope.com",
  "debtorapi-sandbox.givingeurope.com",
  "debtorapi.givingeurope.com",
  "api.midocean.com",
  "easygifts.sk",
  "www.pfconcept.com",
]);

function isUrlAllowed(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export interface FetchResult {
  success: boolean;
  source: string;
  recordCount: number;
  fields: string[];
  preview: Record<string, any>[];
  error?: string;
  fetchedAt: string;
}

export interface ConnectionTestResult {
  success: boolean;
  statusCode?: number;
  responseTime: number;
  message: string;
}

export async function testModuleConnection(mod: ApiModule): Promise<ConnectionTestResult> {
  const start = Date.now();
  const config = mod.config as Record<string, any>;

  try {
    let testUrl = "";
    const headers: Record<string, string> = { "User-Agent": "SyncHub/1.0" };

    if (mod.code === "EASYGIFTS" && config?.skuFeedUrl) {
      testUrl = config.skuFeedUrl;
    } else if (mod.code === "PROMOTRON") {
      if (config?.apiKey) {
        testUrl = `${mod.baseUrl || "https://api-ts-westeu.promotron.com"}/tronshop-api/products`;
        headers["ApiKey"] = config.apiKey;
        headers["Accept"] = "application/json";
      } else if (config?.xmlFeedUrl) {
        testUrl = config.xmlFeedUrl;
      } else if (mod.baseUrl) {
        testUrl = mod.baseUrl;
      }
    } else if (mod.code === "GIVING") {
      const env = config?.environment || "sandbox";
      const token = env === "production" ? (config?.apiTokenProd || config?.apiToken) : config?.apiToken;
      const base = config?.apiBaseUrl || (env === "production" ? "https://debtorapi.givingeurope.com" : "https://debtorapi-sandbox.givingeurope.com");
      testUrl = `${base}/v1/products?limit=1`;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["Accept"] = "application/json";
      }
    } else if (mod.baseUrl) {
      testUrl = mod.baseUrl;
    } else {
      return {
        success: false,
        responseTime: Date.now() - start,
        message: "No base URL or feed URL configured",
      };
    }

    if (!isUrlAllowed(testUrl)) {
      return {
        success: false,
        responseTime: Date.now() - start,
        message: "URL not in allowed hosts list",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(testUrl, {
      method: "GET",
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);

    let message = res.ok
      ? `Connection successful (HTTP ${res.status})`
      : `Server responded with HTTP ${res.status}`;

    if (mod.code === "GIVING" && res.ok) {
      try {
        const data = await res.json();
        message = `Connection successful — ${data.total || 0} products available`;
      } catch {}
    }

    return {
      success: res.ok,
      statusCode: res.status,
      responseTime: Date.now() - start,
      message,
    };
  } catch (err: any) {
    return {
      success: false,
      responseTime: Date.now() - start,
      message: err.name === "AbortError"
        ? "Connection timed out (15s)"
        : `Connection failed: ${err.message}`,
    };
  }
}

export async function fetchModuleData(mod: ApiModule, limit = 20): Promise<FetchResult> {
  const config = mod.config as Record<string, any>;

  switch (mod.code) {
    case "EASYGIFTS":
      return fetchXmlFeedData(mod.code, config?.skuFeedUrl, limit);
    case "PROMOTRON":
      if (config?.apiKey) {
        return fetchPromotronApiData(config, mod.baseUrl || "https://api-ts-westeu.promotron.com", limit);
      }
      return fetchXmlFeedData(mod.code, config?.xmlFeedUrl, limit);
    case "ANDA":
      return fetchXmlFeedData(mod.code, config?.skuFeedUrl, limit);
    case "GIVING":
      return fetchGivingEuropeData(config, limit);
    default:
      return {
        success: false,
        source: mod.code,
        recordCount: 0,
        fields: [],
        preview: [],
        error: `Module ${mod.code} does not have a data fetcher configured yet. Configure the API connection first.`,
        fetchedAt: new Date().toISOString(),
      };
  }
}

async function fetchXmlFeedData(source: string, feedUrl: string | undefined, limit: number): Promise<FetchResult> {
  if (!feedUrl || !isUrlAllowed(feedUrl)) {
    return {
      success: false,
      source,
      recordCount: 0,
      fields: [],
      preview: [],
      error: !feedUrl ? "XML feed URL not configured. Add the URL in Configuration tab and save." : "URL not in allowed hosts list",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "SyncHub/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        source,
        recordCount: 0,
        fields: [],
        preview: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true, tagNameProcessors: [stripPrefix] });

    let products: any[] = [];

    if (parsed?.rss?.channel?.item) {
      const items = parsed.rss.channel.item;
      products = Array.isArray(items) ? items : [items];
    } else if (parsed?.products?.product) {
      products = Array.isArray(parsed.products.product)
        ? parsed.products.product
        : [parsed.products.product];
    } else if (parsed?.offer?.products?.product) {
      products = Array.isArray(parsed.offer.products.product)
        ? parsed.offer.products.product
        : [parsed.offer.products.product];
    } else {
      const rootKey = Object.keys(parsed)[0];
      if (rootKey && parsed[rootKey]) {
        const innerKeys = Object.keys(parsed[rootKey]);
        for (const key of innerKeys) {
          const val = parsed[rootKey][key];
          if (Array.isArray(val) && val.length > 0) {
            products = val;
            break;
          }
          if (val && typeof val === "object") {
            const subKeys = Object.keys(val);
            for (const sk of subKeys) {
              if (Array.isArray(val[sk]) && val[sk].length > 0) {
                products = val[sk];
                break;
              }
            }
            if (products.length > 0) break;
          }
        }
      }
    }

    const totalCount = products.length;
    const preview = products.slice(0, limit).map((p: any) => flattenObject(p));

    const fields = preview.length > 0 ? Object.keys(preview[0]) : [];

    return {
      success: true,
      source,
      recordCount: totalCount,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source,
      recordCount: 0,
      fields: [],
      preview: [],
      error: err.name === "AbortError"
        ? "Request timed out (30s)"
        : `Failed to fetch data: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

async function fetchPromotronApiData(config: Record<string, any>, baseUrl: string, limit: number): Promise<FetchResult> {
  const apiKey = config?.apiKey;

  if (!apiKey) {
    return {
      success: false,
      source: "PROMOTRON",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "API Key not configured. Add the key in Configuration tab.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const testUrl = `${baseUrl}/tronshop-api/orders`;
  if (!isUrlAllowed(testUrl)) {
    return {
      success: false,
      source: "PROMOTRON",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "API URL not in allowed hosts list",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${baseUrl}/tronshop-api/orders`, {
      signal: controller.signal,
      headers: {
        "ApiKey": apiKey,
        "Accept": "application/json",
        "User-Agent": "SyncHub/1.0",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      return {
        success: false,
        source: "PROMOTRON",
        recordCount: 0,
        fields: [],
        preview: [],
        error: `HTTP ${res.status}: ${res.statusText}${errorBody ? ` - ${errorBody.substring(0, 200)}` : ""}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const data = await res.json();
    const items: any[] = Array.isArray(data) ? data : (data.items || data.orders || data.data || []);
    const totalCount = items.length;

    const preview = items.slice(0, limit).map((item: any) => {
      const row: Record<string, any> = {};
      for (const [key, val] of Object.entries(item)) {
        if (val === null || val === undefined) {
          row[key] = "";
        } else if (typeof val === "object") {
          if (Array.isArray(val)) {
            row[key] = `[${val.length} items]`;
          } else {
            row[key] = JSON.stringify(val).substring(0, 100);
          }
        } else {
          row[key] = String(val);
        }
      }
      return row;
    });

    const fields = preview.length > 0 ? Object.keys(preview[0]) : [];

    return {
      success: true,
      source: "PROMOTRON",
      recordCount: totalCount,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source: "PROMOTRON",
      recordCount: 0,
      fields: [],
      preview: [],
      error: err.name === "AbortError"
        ? "Request timed out (30s)"
        : `Failed to fetch data: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

async function fetchGivingEuropeData(config: Record<string, any>, limit: number): Promise<FetchResult> {
  const env = config?.environment || "sandbox";
  const apiToken = env === "production" ? (config?.apiTokenProd || config?.apiToken) : config?.apiToken;
  const apiBaseUrl = config?.apiBaseUrl || (env === "production" ? "https://debtorapi.givingeurope.com" : "https://debtorapi-sandbox.givingeurope.com");

  if (!apiToken) {
    return {
      success: false,
      source: "GIVING",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "API token not configured. Add the token in Configuration tab and save.",
      fetchedAt: new Date().toISOString(),
    };
  }

  if (!isUrlAllowed(apiBaseUrl)) {
    return {
      success: false,
      source: "GIVING",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "API base URL not in allowed hosts list",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${apiBaseUrl}/v1/products?limit=${limit}&locale=en-US`, {
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      return {
        success: false,
        source: "GIVING",
        recordCount: 0,
        fields: [],
        preview: [],
        error: `HTTP ${res.status}: ${res.statusText}${errorBody ? ` - ${errorBody.substring(0, 200)}` : ""}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const data = await res.json();
    const totalCount = data.total || 0;
    const items: any[] = data.items || [];

    const preview = items.map((item: any) => {
      const row: Record<string, any> = {};
      row["code"] = item.code || "";
      row["name"] = extractLocalized(item.name, "en-US");
      row["description"] = extractLocalized(item.description_long, "en-US")?.substring(0, 150) || "";
      row["brand"] = extractLocalized(item.brand, "en-US");
      row["origin_country"] = item.origin_country || "";
      row["commodity_code"] = item.commodity_code || "";
      row["can_order_printed"] = item.can_order_printed ? "Yes" : "No";
      row["can_order_unprinted"] = item.can_order_unprinted ? "Yes" : "No";
      row["min_qty_unprinted"] = item.min_quantity_unprinted ?? "";
      row["min_qty_printed"] = item.min_quantity_printed ?? "";
      row["categories"] = (item.categories || []).map((c: any) => typeof c === "string" ? c : extractLocalized(c.name || c, "en-US")).filter(Boolean).join(", ");
      row["variants_count"] = item.variants?.length ?? 0;
      row["images_count"] = item.images?.length ?? 0;
      row["image_url"] = item.images?.[0]?.value || item.images?.[0]?.url || "";
      return row;
    });

    const fields = preview.length > 0 ? Object.keys(preview[0]) : [];

    return {
      success: true,
      source: "GIVING",
      recordCount: totalCount,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source: "GIVING",
      recordCount: 0,
      fields: [],
      preview: [],
      error: err.name === "AbortError"
        ? "Request timed out (30s)"
        : `Failed to fetch data: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function extractLocalized(arr: any, locale: string): string {
  if (!arr) return "";
  if (typeof arr === "string") return arr;
  if (Array.isArray(arr)) {
    const match = arr.find((a: any) => a.locale === locale);
    return match?.value || arr[0]?.value || "";
  }
  return "";
}

function stripPrefix(name: string): string {
  const idx = name.indexOf(":");
  return idx >= 0 ? name.substring(idx + 1) : name;
}

function flattenObject(obj: any, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val) && key !== "$") {
      Object.assign(result, flattenObject(val, newKey));
    } else if (Array.isArray(val)) {
      result[newKey] = val.length > 0 ? `[${val.length} items]` : "[]";
    } else {
      result[newKey] = val != null ? String(val) : "";
    }
  }
  return result;
}
