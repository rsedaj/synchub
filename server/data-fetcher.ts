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

    if (mod.code === "EASYGIFTS" && config?.skuFeedUrl) {
      testUrl = config.skuFeedUrl;
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
      headers: {
        "User-Agent": "SyncHub/1.0",
      },
    });

    clearTimeout(timeout);

    return {
      success: res.ok,
      statusCode: res.status,
      responseTime: Date.now() - start,
      message: res.ok
        ? `Connection successful (HTTP ${res.status})`
        : `Server responded with HTTP ${res.status}`,
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
      return fetchXmlFeedData(mod.code, config?.xmlFeedUrl, limit);
    case "ANDA":
      return fetchXmlFeedData(mod.code, config?.skuFeedUrl, limit);
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
