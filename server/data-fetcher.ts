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
  "ws.stricker-europe.com",
  "www.stricker-europe.com",
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
    } else if (mod.code === "STICKER") {
      const accessKey = config?.accessKey;
      if (accessKey) {
        testUrl = `http://ws.stricker-europe.com/api/v1/authenticateclient?AccessKey=${accessKey}`;
        headers["Accept"] = "application/json";
      } else if (mod.baseUrl) {
        testUrl = mod.baseUrl;
      }
    } else if (mod.code === "PIPEDRIVE") {
      const token = config?.apiToken;
      if (token) {
        testUrl = `https://api.pipedrive.com/v1/users/me?api_token=${token}`;
        headers["Accept"] = "application/json";
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

    if (mod.code === "STICKER" && res.ok && config?.accessKey) {
      try {
        const data = await res.json();
        if (data.SessionToken) {
          message = `Connection successful — Session token received. Stricker Europe webservice v2.20 ready.`;
        } else if (data.ErrorMessage) {
          message = `Authentication failed: ${data.ErrorMessage}`;
        }
      } catch {}
    }

    if (mod.code === "PIPEDRIVE" && res.ok) {
      try {
        const data = await res.json();
        if (data.success && data.data) {
          message = `Connection successful — User: ${data.data.name} (${data.data.email}), Company: ${data.data.company_domain || "N/A"}`;
        }
      } catch {}
    }

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

export async function fetchModuleData(mod: ApiModule, limit = 20, source?: string): Promise<FetchResult> {
  const config = mod.config as Record<string, any>;

  switch (mod.code) {
    case "EASYGIFTS":
      return fetchXmlFeedData(mod.code, config?.skuFeedUrl, limit);
    case "PROMOTRON":
      if (source === "feed") {
        return fetchXmlFeedData(mod.code, config?.xmlFeedUrl, limit);
      }
      if (source === "api" || (!source && config?.apiKey)) {
        return fetchPromotronApiData(config, mod.baseUrl || "https://api-ts-westeu.promotron.com", limit);
      }
      return fetchXmlFeedData(mod.code, config?.xmlFeedUrl, limit);
    case "STICKER":
      return fetchStrickerData(config, source, limit);
    case "ANDA":
      return fetchXmlFeedData(mod.code, config?.skuFeedUrl, limit);
    case "PIPEDRIVE":
      return fetchPipedriveData(config, source, limit);
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

const STRICKER_SOURCES: Record<string, { data: string; restEndpoint: string; label: string }> = {
  products: { data: "products", restEndpoint: "/api/v1/products", label: "Products" },
  optionals: { data: "optionals", restEndpoint: "/api/v1/optionals", label: "Optionals (SKUs)" },
  optionalscomplete: { data: "optionalscomplete", restEndpoint: "/api/v1/optionalscomplete", label: "Optionals Complete" },
  stocks: { data: "stocks", restEndpoint: "/api/v1/stocks", label: "Stocks" },
  stocksPt: { data: "stocksPt", restEndpoint: "/api/v1/StocksByCountry", label: "Stocks PT" },
  stocksCz: { data: "stocksCz", restEndpoint: "/api/v1/StocksByCountry", label: "Stocks CZ" },
  colors: { data: "colors", restEndpoint: "/api/v1/colors", label: "Colors" },
  customizationOptions: { data: "customizationOptions", restEndpoint: "/api/v1/customizationOptions", label: "Customization Options" },
  customizationTables: { data: "customizationTables", restEndpoint: "/api/v1/customizationTables", label: "Customization Tables" },
  producttypes: { data: "producttypes", restEndpoint: "/api/v1/productTypes", label: "Product Types" },
  catalogprices: { data: "catalogprices", restEndpoint: "/api/v1/CatalogPrices", label: "Catalog Prices" },
};

let strickerSessionToken: string | null = null;
let strickerSessionExpiry = 0;

async function authenticateStricker(accessKey: string): Promise<string | null> {
  if (strickerSessionToken && Date.now() < strickerSessionExpiry) {
    return strickerSessionToken;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`http://ws.stricker-europe.com/api/v1/authenticateclient?AccessKey=${accessKey}`, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "SyncHub/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.SessionToken) {
      strickerSessionToken = data.SessionToken;
      strickerSessionExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return strickerSessionToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchStrickerData(config: Record<string, any> | undefined, source: string | undefined, limit: number): Promise<FetchResult> {
  const accessKey = config?.accessKey;
  if (!accessKey) {
    return {
      success: false,
      source: "Stricker Europe",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "Access Key nie je nakonfigurovaný. Prejdite na záložku Settings a zadajte Access Key od Stricker Europe.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const lang = config?.language || "SK";
  const srcKey = source && STRICKER_SOURCES[source] ? source : "products";
  const src = STRICKER_SOURCES[srcKey];

  try {
    const sessionToken = await authenticateStricker(accessKey);

    let fetchUrl: string;
    if (sessionToken) {
      if (srcKey === "stocksPt") {
        fetchUrl = `http://ws.stricker-europe.com${src.restEndpoint}?token=${sessionToken}&country=PT&lang=${lang}`;
      } else if (srcKey === "stocksCz") {
        fetchUrl = `http://ws.stricker-europe.com${src.restEndpoint}?token=${sessionToken}&country=CZ&lang=${lang}`;
      } else {
        fetchUrl = `http://ws.stricker-europe.com${src.restEndpoint}?token=${sessionToken}&lang=${lang}`;
      }
    } else {
      fetchUrl = `http://ws.stricker-europe.com/downloads/v1/file?AccessKey=${accessKey}&data=${src.data}&lang=${lang}&extension=json`;
    }

    if (!isUrlAllowed(fetchUrl)) {
      return {
        success: false, source: `Stricker ${src.label}`, recordCount: 0, fields: [], preview: [],
        error: "URL not in allowed hosts", fetchedAt: new Date().toISOString(),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "SyncHub/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        strickerSessionToken = null;
        strickerSessionExpiry = 0;
      }
      return {
        success: false,
        source: `Stricker ${src.label}`,
        recordCount: 0,
        fields: [],
        preview: [],
        error: `Stricker API error: HTTP ${res.status}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const rawData = await res.json();
    let items: any[] = [];

    if (Array.isArray(rawData)) {
      items = rawData;
    } else if (rawData && typeof rawData === "object") {
      const firstArrayKey = Object.keys(rawData).find((k) => Array.isArray(rawData[k]));
      if (firstArrayKey) {
        items = rawData[firstArrayKey];
      } else {
        items = [rawData];
      }
    }

    const totalCount = items.length;
    const limited = items.slice(0, limit);

    const preview = limited.map((item: any) => {
      if (typeof item !== "object" || item === null) return { value: String(item) };
      const flat: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const obj = v as Record<string, any>;
          if (obj.name !== undefined) flat[k] = obj.name;
          else if (obj.value !== undefined) flat[k] = obj.value;
          else flat[k] = JSON.stringify(v).substring(0, 120);
        } else if (Array.isArray(v)) {
          flat[k] = `[${v.length} items]`;
        } else {
          flat[k] = v;
        }
      }
      return flat;
    });

    const fields = preview.length > 0 ? Object.keys(preview[0]) : [];
    const method = sessionToken ? "REST API" : "Direct Download";

    return {
      success: true,
      source: `Stricker ${src.label} (${method})`,
      recordCount: totalCount,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source: `Stricker ${src.label}`,
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

const PIPEDRIVE_SOURCES: Record<string, { endpoint: string; label: string }> = {
  deals: { endpoint: "/v1/deals", label: "Deals" },
  persons: { endpoint: "/v1/persons", label: "Contacts" },
  organizations: { endpoint: "/v1/organizations", label: "Organizations" },
  activities: { endpoint: "/v1/activities", label: "Activities" },
  leads: { endpoint: "/v1/leads", label: "Leads" },
  products: { endpoint: "/v1/products", label: "Products" },
};

async function fetchPipedriveData(config: Record<string, any> | undefined, source: string | undefined, limit: number): Promise<FetchResult> {
  const token = config?.apiToken;
  if (!token) {
    return {
      success: false,
      source: "PIPEDRIVE",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "API Token is not configured. Go to Settings tab and add your Pipedrive Personal API Token.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const srcKey = source && PIPEDRIVE_SOURCES[source] ? source : "deals";
  const src = PIPEDRIVE_SOURCES[srcKey];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const url = `https://api.pipedrive.com${src.endpoint}?api_token=${token}&limit=${limit}&start=0`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "SyncHub/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        source: `Pipedrive ${src.label}`,
        recordCount: 0,
        fields: [],
        preview: [],
        error: `Pipedrive API error: HTTP ${res.status}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const data = await res.json();
    const items: any[] = data.data || [];
    const totalCount = data.additional_data?.pagination?.total_count;

    const SKIP_KEYS = new Set(["v_goals", "picture_id", "cc_email"]);
    const preview = items.map((item: any) => {
      const flat: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        if (SKIP_KEYS.has(k)) continue;
        if (k.match(/^[0-9a-f]{40}$/)) continue;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const obj = v as Record<string, any>;
          if (obj.name !== undefined) {
            flat[k] = obj.name;
          } else if (obj.value !== undefined) {
            flat[k] = obj.value;
          } else {
            flat[k] = JSON.stringify(v).substring(0, 100);
          }
        } else if (Array.isArray(v)) {
          flat[k] = `[${v.length} items]`;
        } else {
          flat[k] = v;
        }
      }
      return flat;
    });

    const fields = preview.length > 0 ? Object.keys(preview[0]) : [];

    return {
      success: true,
      source: `Pipedrive ${src.label}`,
      recordCount: totalCount ?? items.length,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source: `Pipedrive ${src.label}`,
      recordCount: 0,
      fields: [],
      preview: [],
      error: err.name === "AbortError"
        ? "Request timed out (15s)"
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
