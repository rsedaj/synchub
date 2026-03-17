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
  "apitest.midocean.com",
  "easygifts.sk",
  "macma.sk",
  "www.pfconcept.com",
  "images.pfconcept.com",
  "ws.stricker-europe.com",
  "www.stricker-europe.com",
  "xml.andapresent.com",
  "feeds.xindao.com",
  "onix-api.hauerland.sk",
  "app.raynet.cz",
  "app.raynetcrm.sk",
  "app.raynetcrm.com",
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

export function collectAllFields(records: Record<string, any>[]): string[] {
  if (records.length === 0) return [];
  const allFields = new Set<string>();
  records.forEach(item => Object.keys(item).forEach(key => allFields.add(key)));
  return Array.from(allFields);
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

    if ((mod.code === "EASYGIFTS" || mod.code === "MACMA") && config?.stockFeedUrl) {
      testUrl = config.stockFeedUrl;
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
    } else if (mod.code === "ANDA") {
      const feedId = config?.xmlFeedId;
      const lang = config?.language || "sk";
      if (feedId) {
        testUrl = `https://xml.andapresent.com/export/products/${lang}/${feedId}`;
      } else if (config?.skuFeedUrl) {
        testUrl = config.skuFeedUrl;
      } else if (mod.baseUrl) {
        testUrl = mod.baseUrl;
      }
    } else if (mod.code === "ONIX") {
      const token = config?.apiToken;
      if (token) {
        testUrl = `${mod.baseUrl || "https://onix-api.hauerland.sk/onix_api"}/api/SkladoveKarty?pageSize=1`;
        headers["Authorization"] = `Bearer ${token}`;
        headers["Accept"] = "application/json";
      } else if (mod.baseUrl) {
        testUrl = `${mod.baseUrl}/swagger/ui/index`;
      }
    } else if (mod.code === "RAYNET") {
      const username = config?.username;
      const apiKey = config?.apiKey;
      const instanceName = config?.instanceName;
      if (username && apiKey && instanceName) {
        testUrl = `https://app.raynet.cz/api/v2/company/?rowCount=true&limit=1`;
        const credentials = Buffer.from(`${username}:${apiKey}`).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
        headers["X-Instance-Name"] = instanceName;
        headers["Accept"] = "application/json";
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
    } else if (mod.code === "MID") {
      const apiKey = config?.apiKey;
      if (apiKey) {
        testUrl = "https://api.midocean.com/gateway/stock/2.0";
        headers["x-Gateway-APIKey"] = apiKey;
        headers["Accept"] = "text/json";
      } else if (mod.baseUrl) {
        testUrl = mod.baseUrl;
      }
    } else if (mod.code === "XDCONNECT") {
      const feedUrl = config?.productFeedUrl || config?.stockFeedUrl || config?.combinedFeedUrl || config?.pricesFeedUrl || config?.printDataFeedUrl || config?.printPricesFeedUrl;
      if (feedUrl) {
        testUrl = feedUrl;
      } else {
        return {
          success: false,
          responseTime: Date.now() - start,
          message: "No feed URLs configured. Request your feed links from onlineclients@xdconnects.com and add them in Settings tab.",
        };
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
    } else if (mod.code === "PFCONCEPT") {
      const feedUrl = config?.stockFeedUrl || config?.productFeedUrl || config?.priceFeedUrl;
      if (feedUrl) {
        testUrl = feedUrl;
      } else {
        return {
          success: false,
          responseTime: Date.now() - start,
          message: "No feed URLs configured. Add Product/Price/Stock feed URLs in Configuration tab.",
        };
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

    if (mod.code === "RAYNET" && config?.username && config?.apiKey && config?.instanceName) {
      if (res.ok) {
        try {
          const data = await res.json();
          const totalCount = data.totalCount ?? data.data?.length ?? "N/A";
          message = `Connection successful — Raynet CRM instance "${config.instanceName}" ready. Companies: ${totalCount}`;
        } catch {
          message = `Connection successful — Raynet CRM accessible (HTTP ${res.status})`;
        }
      } else if (res.status === 401) {
        message = `Authentication failed — Invalid username or API key (HTTP 401)`;
      } else if (res.status === 403) {
        message = `Access denied — Check instance name "${config.instanceName}" (HTTP 403)`;
      }
    }

    if (mod.code === "ONIX" && config?.apiToken) {
      if (res.ok) {
        try {
          const data = await res.json();
          const count = Array.isArray(data) ? data.length : (data?.totalCount || data?.length || "N/A");
          message = `Connection successful — ONIX ERP API ready. Stock cards: ${count}`;
        } catch {
          message = `Connection successful — ONIX ERP API accessible (HTTP ${res.status})`;
        }
      } else if (res.status === 401) {
        message = `Authentication failed — Invalid API token (HTTP 401)`;
      } else if (res.status === 503) {
        message = `ONIX API service unavailable (HTTP 503) — service may not be running on the server`;
      }
    }

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

    if (mod.code === "PFCONCEPT" && res.ok) {
      const contentLength = res.headers.get("content-length");
      const sizeKb = contentLength ? Math.round(parseInt(contentLength) / 1024) : 0;
      message = `Connection successful — PF Concept Data Feed v3 accessible${sizeKb ? ` (${sizeKb} KB)` : ""}`;
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
    case "MACMA":
      return fetchEasyGiftsData(config, source, limit);
    case "PROMOTRON":
      if (source === "feed") {
        return fetchXmlFeedData(mod.code, config?.xmlFeedUrl, limit);
      }
      if (source === "api" || (!source && config?.apiKey)) {
        return fetchPromotronApiData(config, mod.baseUrl || "https://api-ts-westeu.promotron.com", limit);
      }
      return fetchXmlFeedData(mod.code, config?.xmlFeedUrl, limit);
    case "ONIX":
      return fetchOnixData(config, mod.baseUrl || "https://onix-api.hauerland.sk/onix_api", source, limit);
    case "RAYNET":
      return fetchRaynetData(config, source, limit);
    case "STICKER":
      return fetchStrickerData(config, source, limit);
    case "ANDA":
      return fetchAndaData(config, source, limit);
    case "PIPEDRIVE":
      return fetchPipedriveData(config, source, limit);
    case "MID":
      return fetchMidoceanData(config, source, limit);
    case "XDCONNECT":
      return fetchXdConnectsData(config, source, limit);
    case "GIVING":
      return fetchGivingEuropeData(config, limit);
    case "PFCONCEPT":
      return fetchPfConceptData(config, source, limit);
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

    const fields = collectAllFields(preview);

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

    const fields = collectAllFields(preview);

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

const MID_ENDPOINTS: Record<string, { path: string; label: string; dataKey?: string }> = {
  products: { path: "gateway/products/2.0", label: "Products v2.0" },
  stock: { path: "gateway/stock/2.0", label: "Stock Levels", dataKey: "stock" },
  pricelist: { path: "gateway/pricelist/2.0", label: "Pricelist", dataKey: "price" },
  printdata: { path: "gateway/printdata/1.0", label: "Print Data" },
  printpricelist: { path: "gateway/printpricelist/2.0", label: "Print Pricelist" },
};

async function fetchMidoceanData(config: Record<string, any>, source: string | undefined, limit: number): Promise<FetchResult> {
  const apiKey = config?.apiKey;
  if (!apiKey) {
    return {
      success: false, source: source || "products", recordCount: 0, fields: [], preview: [],
      error: "API Key not configured. Get your key from midocean.com → Account → Customer API tab.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const selectedSource = source && source !== "auto" ? source : "products";
  const endpoint = MID_ENDPOINTS[selectedSource];
  if (!endpoint) {
    return {
      success: false, source: selectedSource, recordCount: 0, fields: [], preview: [],
      error: `Unknown data source: ${selectedSource}`,
      fetchedAt: new Date().toISOString(),
    };
  }

  const lang = config?.language || "en";
  let url = `https://api.midocean.com/${endpoint.path}`;
  if (selectedSource === "products") {
    url += `?language=${lang}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "x-Gateway-APIKey": apiKey,
        "Accept": "text/json",
        "User-Agent": "SyncHub/1.0",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}: ${res.statusText}`;
      if (res.status === 401 || res.status === 403) {
        errMsg += " — Invalid API Key or missing API subscription. Check your key at midocean.com → Account → Customer API.";
      } else if (res.status === 503) {
        errMsg += " — Service temporarily unavailable. Test environment is off outside EU business hours.";
      }
      return {
        success: false, source: selectedSource, recordCount: 0, fields: [], preview: [],
        error: errMsg, fetchedAt: new Date().toISOString(),
      };
    }

    const json = await res.json();

    let items: any[] = [];
    if (selectedSource === "products") {
      items = Array.isArray(json) ? json : (json?.product || json?.products || []);
      const flatItems = items.slice(0, limit).map((p: any) => {
        const flat: Record<string, any> = {};
        flat.master_code = p.master_code || "";
        flat.product_name = p.product_name || "";
        flat.brand = p.brand || "";
        flat.short_description = p.short_description || "";
        flat.material = p.material || "";
        flat.dimensions = p.dimensions || "";
        flat.country_of_origin = p.country_of_origin || "";
        flat.commodity_code = p.commodity_code || "";
        flat.category_code = p.category_code || "";
        flat.product_class = p.product_class || "";
        flat.green = p.green || "";
        flat.printable = p.printable || "";
        const variants = p.variants || [];
        if (variants.length > 0) {
          const v = variants[0];
          flat.sku = v.sku || "";
          flat.color_description = v.color_description || "";
          flat.color_group = v.color_group || "";
          flat.plc_status_description = v.plc_status_description || "";
          flat.gtin = v.gtin || "";
          const imgs = v.digital_assets || [];
          const mainImg = imgs.find((a: any) => a.subtype === "item_picture_front");
          flat.image_url = mainImg?.url || (imgs[0]?.url || "");
        }
        return flat;
      });
      return {
        success: true, source: selectedSource, recordCount: items.length,
        fields: collectAllFields(flatItems),
        preview: flatItems, fetchedAt: new Date().toISOString(),
      };
    }

    if (selectedSource === "stock") {
      items = json?.stock || (Array.isArray(json) ? json : []);
      const preview = items.slice(0, limit);
      return {
        success: true, source: selectedSource, recordCount: items.length,
        fields: collectAllFields(preview),
        preview, fetchedAt: new Date().toISOString(),
      };
    }

    if (selectedSource === "pricelist") {
      items = json?.price || (Array.isArray(json) ? json : []);
      const preview = items.slice(0, limit).map((p: any) => {
        const flat: Record<string, any> = {
          sku: p.sku || "",
          variant_id: p.variant_id || "",
          price: p.price || "",
          valid_until: p.valid_until || "",
        };
        const scales = p.scale || [];
        scales.forEach((s: any, i: number) => {
          flat[`scale_${i + 1}_qty`] = s.minimum_quantity || "";
          flat[`scale_${i + 1}_price`] = s.price || "";
        });
        return flat;
      });
      return {
        success: true, source: selectedSource, recordCount: items.length,
        fields: collectAllFields(preview),
        preview, fetchedAt: new Date().toISOString(),
      };
    }

    if (selectedSource === "printdata") {
      const products = json?.print_data || json?.products || (Array.isArray(json) ? json : []);
      const preview = products.slice(0, limit).map((p: any) => {
        const flat: Record<string, any> = {
          master_code: p.master_code || "",
          master_id: p.master_id || "",
          print_manipulation: p.print_manipulation || "",
        };
        const positions = p.printing_positions || [];
        flat.positions_count = positions.length;
        if (positions.length > 0) {
          flat.first_position = positions[0]?.position_id || "";
          const techs = positions[0]?.printing_techniques || [];
          flat.first_techniques = techs.map((t: any) => t.id).join(", ");
        }
        const colors = p.item_color_numbers || [];
        flat.color_variants = Array.isArray(colors) ? colors.join(", ") : "";
        return flat;
      });
      return {
        success: true, source: selectedSource, recordCount: products.length,
        fields: collectAllFields(preview),
        preview, fetchedAt: new Date().toISOString(),
      };
    }

    if (selectedSource === "printpricelist") {
      const techniques = json?.print_techniques || [];
      const manipulations = json?.print_manipulations || [];
      const preview: Record<string, any>[] = [];
      manipulations.forEach((m: any) => {
        preview.push({ type: "manipulation", code: m.code, description: m.description, price: m.price });
      });
      techniques.slice(0, limit).forEach((t: any) => {
        const flat: Record<string, any> = {
          type: "technique",
          id: t.id || "",
          description: t.description || "",
          pricing_type: t.pricing_type || "",
          setup: t.setup || "",
          setup_repeat: t.setup_repeat || "",
        };
        preview.push(flat);
      });
      return {
        success: true, source: selectedSource, recordCount: techniques.length + manipulations.length,
        fields: collectAllFields(preview),
        preview: preview.slice(0, limit), fetchedAt: new Date().toISOString(),
      };
    }

    return {
      success: false, source: selectedSource, recordCount: 0, fields: [], preview: [],
      error: "Unsupported source", fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false, source: selectedSource, recordCount: 0, fields: [], preview: [],
      error: err.name === "AbortError" ? "Request timed out (60s) — Midocean API can be slow for large datasets" : `Failed to fetch: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

const XD_FEED_KEYS: Record<string, { configKey: string; label: string; format: string }> = {
  products: { configKey: "productFeedUrl", label: "Product Data V5", format: "auto" },
  prices: { configKey: "pricesFeedUrl", label: "Product Prices V2", format: "auto" },
  printdata: { configKey: "printDataFeedUrl", label: "Print Data V3", format: "auto" },
  printprices: { configKey: "printPricesFeedUrl", label: "Print Prices V3", format: "auto" },
  stock: { configKey: "stockFeedUrl", label: "Stock V2", format: "auto" },
  combined: { configKey: "combinedFeedUrl", label: "Combined Data V5", format: "auto" },
};

async function fetchXdConnectsData(config: Record<string, any>, source: string | undefined, limit: number): Promise<FetchResult> {
  const selectedSource = source && source !== "auto" ? source : "products";
  const feedDef = XD_FEED_KEYS[selectedSource];
  if (!feedDef) {
    return {
      success: false, source: selectedSource, recordCount: 0, fields: [], preview: [],
      error: `Unknown data source: ${selectedSource}`,
      fetchedAt: new Date().toISOString(),
    };
  }

  const feedUrl = config?.[feedDef.configKey];
  if (!feedUrl) {
    return {
      success: false, source: feedDef.label, recordCount: 0, fields: [], preview: [],
      error: `Feed URL not configured for "${feedDef.label}". Request your feed links from onlineclients@xdconnects.com and add them in Settings tab.`,
      fetchedAt: new Date().toISOString(),
    };
  }

  if (!isUrlAllowed(feedUrl)) {
    return {
      success: false, source: feedDef.label, recordCount: 0, fields: [], preview: [],
      error: "Feed URL not in allowed hosts list. Feeds must be from feeds.xindao.com.",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "SyncHub/1.0", "Accept": "*/*" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}: ${res.statusText}`;
      if (res.status === 401 || res.status === 403) {
        errMsg += " — Feed link may have expired or been revoked. Contact onlineclients@xdconnects.com for new links.";
      } else if (res.status === 404) {
        errMsg += " — Feed not found. Check the URL or contact XD Connects support.";
      }
      return {
        success: false, source: feedDef.label, recordCount: 0, fields: [], preview: [],
        error: errMsg, fetchedAt: new Date().toISOString(),
      };
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (contentType.includes("json") || text.trimStart().startsWith("[") || text.trimStart().startsWith("{")) {
      return parseXdJsonFeed(text, feedDef.label, selectedSource, limit);
    }

    if (contentType.includes("xml") || text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<")) {
      return parseXdXmlFeed(text, feedDef.label, selectedSource, limit);
    }

    if (contentType.includes("csv") || contentType.includes("text/plain") || contentType.includes("tab-separated")) {
      return parseXdCsvFeed(text, feedDef.label, selectedSource, limit);
    }

    if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("vnd.openxmlformats") || contentType.includes("vnd.ms-excel")) {
      return {
        success: false, source: feedDef.label, recordCount: 0, fields: [], preview: [],
        error: "Excel format detected. SyncHub supports XML, CSV and JSON feeds. Request your feeds in XML or JSON format from onlineclients@xdconnects.com.",
        fetchedAt: new Date().toISOString(),
      };
    }

    if (text.includes("\t") || text.includes(";") || text.includes(",")) {
      return parseXdCsvFeed(text, feedDef.label, selectedSource, limit);
    }

    return {
      success: false, source: feedDef.label, recordCount: 0, fields: [], preview: [],
      error: `Unrecognized feed format (Content-Type: ${contentType}). Expected XML, JSON or CSV. Request feeds in supported format from onlineclients@xdconnects.com.`,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false, source: feedDef.label, recordCount: 0, fields: [], preview: [],
      error: err.name === "AbortError"
        ? "Request timed out (60s) — XD Connects feeds can be large, try again later"
        : `Failed to fetch: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function parseXdJsonFeed(text: string, label: string, source: string, limit: number): FetchResult {
  try {
    const json = JSON.parse(text);
    let items: any[] = [];

    if (Array.isArray(json)) {
      items = json;
    } else if (json.data && Array.isArray(json.data)) {
      items = json.data;
    } else {
      const rootKeys = Object.keys(json);
      for (const k of rootKeys) {
        if (Array.isArray(json[k]) && json[k].length > 0) {
          items = json[k];
          break;
        }
      }
      if (items.length === 0) items = [json];
    }

    const preview = items.slice(0, limit).map((item: any) => {
      const flat: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        if (v === null || v === undefined) {
          flat[k] = "";
        } else if (typeof v === "object") {
          if (Array.isArray(v)) {
            flat[k] = `[${v.length} items]`;
          } else {
            flat[k] = JSON.stringify(v).substring(0, 120);
          }
        } else {
          flat[k] = String(v);
        }
      }
      return flat;
    });

    return {
      success: true, source: label, recordCount: items.length,
      fields: collectAllFields(preview),
      preview, fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false, source: label, recordCount: 0, fields: [], preview: [],
      error: `JSON parse error: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

async function parseXdXmlFeed(text: string, label: string, source: string, limit: number): Promise<FetchResult> {
  try {
    const parsed = await parseStringPromise(text, { explicitArray: false, trim: true, tagNameProcessors: [stripPrefix] });

    let items: any[] = [];
    const rootKey = Object.keys(parsed)[0];
    if (rootKey && parsed[rootKey]) {
      const root = parsed[rootKey];
      const innerKeys = Object.keys(root);
      for (const k of innerKeys) {
        if (Array.isArray(root[k]) && root[k].length > 0) {
          items = root[k];
          break;
        }
        if (root[k] && typeof root[k] === "object" && !Array.isArray(root[k])) {
          const subKeys = Object.keys(root[k]);
          for (const sk of subKeys) {
            if (Array.isArray(root[k][sk]) && root[k][sk].length > 0) {
              items = root[k][sk];
              break;
            }
          }
          if (items.length > 0) break;
        }
      }
    }

    const totalCount = items.length;
    const preview = items.slice(0, limit).map((p: any) => flattenObject(p));
    const fields = collectAllFields(preview);

    return {
      success: true, source: label, recordCount: totalCount,
      fields, preview, fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false, source: label, recordCount: 0, fields: [], preview: [],
      error: `XML parse error: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function parseXdCsvFeed(text: string, label: string, source: string, limit: number): FetchResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      success: false, source: label, recordCount: 0, fields: [], preview: [],
      error: "CSV feed is empty or has no data rows.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const headerLine = lines[0];
  let delimiter = "\t";
  if (headerLine.split("\t").length < 3) {
    if (headerLine.split(";").length >= 3) delimiter = ";";
    else if (headerLine.split(",").length >= 3) delimiter = ",";
  }

  const headers = headerLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, "").trim());
  const totalCount = lines.length - 1;

  const preview: Record<string, any>[] = [];
  for (let i = 1; i <= Math.min(totalCount, limit); i++) {
    const values = lines[i].split(delimiter);
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").replace(/^["']|["']$/g, "").trim();
    });
    preview.push(row);
  }

  return {
    success: true, source: label, recordCount: totalCount,
    fields: headers, preview, fetchedAt: new Date().toISOString(),
  };
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

    const fields = collectAllFields(preview);

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

async function fetchEasyGiftsData(config: Record<string, any> | undefined, source: string | undefined, limit: number): Promise<FetchResult> {
  const sources: Record<string, { label: string; urlKey: string }> = {
    sku: { label: "SKU (Products)", urlKey: "skuFeedUrl" },
    pricelist: { label: "Pricelist", urlKey: "pricelistFeedUrl" },
    stock: { label: "Stock", urlKey: "stockFeedUrl" },
  };

  const selectedSource = source && source !== "auto" ? source : "sku";
  const src = sources[selectedSource];
  if (!src) {
    return { success: false, source: selectedSource, recordCount: 0, fields: [], preview: [], error: `Unknown source: ${selectedSource}`, fetchedAt: new Date().toISOString() };
  }

  const feedUrl = config?.[src.urlKey];
  if (!feedUrl || !isUrlAllowed(feedUrl)) {
    return { success: false, source: src.label, recordCount: 0, fields: [], preview: [], error: !feedUrl ? `${src.label} feed URL not configured.` : "URL not in allowed hosts", fetchedAt: new Date().toISOString() };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(feedUrl, { signal: controller.signal, headers: { "User-Agent": "SyncHub/1.0", "Accept": "application/json" } });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, source: src.label, recordCount: 0, fields: [], preview: [], error: `HTTP ${res.status}: ${res.statusText}`, fetchedAt: new Date().toISOString() };
    }

    const json = await res.json();
    const items: any[] = Array.isArray(json) ? json : (json.items || json.products || json.data || []);
    const totalCount = items.length;

    const preview = items.slice(0, limit).map((item: any) => {
      const row: Record<string, any> = {};
      for (const [key, val] of Object.entries(item)) {
        if (val === null || val === undefined) {
          row[key] = "";
        } else if (key === "img" && Array.isArray(val)) {
          row["main_image"] = val.length > 0 ? String(val[0]) : "";
          row["images_count"] = val.length;
        } else if (key === "color" && typeof val === "object" && !Array.isArray(val)) {
          const c = val as Record<string, any>;
          row["color_name"] = c.name || "";
          row["color_code"] = c.code || "";
          row["color_rgb"] = c.rgb || "";
        } else if (key === "future" && Array.isArray(val)) {
          if (val.length > 0) {
            row["future_week"] = `${val[0].year}-W${val[0].week}`;
            row["future_stock"] = val[0].stock;
          }
        } else if (key === "print" && typeof val === "object") {
          const p = val as Record<string, any>;
          row["print_technologies"] = Array.isArray(p.technology) ? p.technology.map((t: any) => typeof t === "object" ? t.name || t.code || JSON.stringify(t) : String(t)).join(", ") : "";
        } else if (key === "packing" && typeof val === "object") {
          const pk = val as Record<string, any>;
          row["pack_inner"] = pk.inner?.qty || "";
          row["pack_outer"] = pk.outer?.qty || "";
        } else if (typeof val === "object") {
          row[key] = JSON.stringify(val).substring(0, 100);
        } else {
          row[key] = val;
        }
      }
      return row;
    });

    const fields = collectAllFields(preview);
    return { success: true, source: src.label, recordCount: totalCount, fields, preview, fetchedAt: new Date().toISOString() };
  } catch (err: any) {
    return { success: false, source: src.label, recordCount: 0, fields: [], preview: [], error: err.name === "AbortError" ? "Request timed out (30s)" : `Failed: ${err.message}`, fetchedAt: new Date().toISOString() };
  }
}

async function fetchPfConceptData(config: Record<string, any> | undefined, source: string | undefined, limit: number): Promise<FetchResult> {
  const sources: Record<string, { label: string; urlKey: string; rootPath: string[][] }> = {
    products: { label: "Product Feed v3", urlKey: "productFeedUrl", rootPath: [["PFCProductFeed", "productfeed", "models", "model"], ["productfeed", "models", "model"]] },
    prices: { label: "Price Feed v3", urlKey: "priceFeedUrl", rootPath: [["PFCPriceFeed", "priceInfo", "models", "model"], ["priceInfo", "models", "model"]] },
    printprices: { label: "Print Price Feed v3", urlKey: "printPriceFeedUrl", rootPath: [["PFCPrintpricefeed", "decoCharges", "decoCharge"], ["decoCharges", "decoCharge"]] },
    stock: { label: "Stock Feed v3", urlKey: "stockFeedUrl", rootPath: [["PFCStockFeed", "stockFeed", "models", "model"], ["stockFeed", "models", "model"]] },
  };

  const selectedSource = source && source !== "auto" ? source : "products";
  const src = sources[selectedSource];
  if (!src) {
    return { success: false, source: selectedSource, recordCount: 0, fields: [], preview: [], error: `Unknown source: ${selectedSource}`, fetchedAt: new Date().toISOString() };
  }

  const feedUrl = config?.[src.urlKey];
  if (!feedUrl || !isUrlAllowed(feedUrl)) {
    return { success: false, source: src.label, recordCount: 0, fields: [], preview: [], error: !feedUrl ? `${src.label} URL not configured. Add it in Configuration tab.` : "URL not in allowed hosts", fetchedAt: new Date().toISOString() };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(feedUrl, { signal: controller.signal, headers: { "User-Agent": "SyncHub/1.0" } });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, source: src.label, recordCount: 0, fields: [], preview: [], error: `HTTP ${res.status}: ${res.statusText}`, fetchedAt: new Date().toISOString() };
    }

    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true, tagNameProcessors: [stripPrefix] });

    let items: any[] = [];
    for (const path of src.rootPath) {
      let obj: any = parsed;
      for (const key of path) {
        if (obj && typeof obj === "object") {
          obj = obj[key];
        } else {
          obj = undefined;
          break;
        }
      }
      if (Array.isArray(obj) && obj.length > 0) {
        items = obj;
        break;
      } else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        items = [obj];
        break;
      }
    }

    if (items.length === 0) {
      const rootKey = Object.keys(parsed)[0];
      if (rootKey && parsed[rootKey]) {
        const inner = parsed[rootKey];
        for (const k of Object.keys(inner)) {
          if (k === "$") continue;
          const val = inner[k];
          if (val && typeof val === "object" && !Array.isArray(val)) {
            for (const sk of Object.keys(val)) {
              if (sk === "$") continue;
              const sv = val[sk];
              if (Array.isArray(sv) && sv.length > 0) { items = sv; break; }
              if (sv && typeof sv === "object" && !Array.isArray(sv)) {
                for (const ssk of Object.keys(sv)) {
                  if (Array.isArray(sv[ssk]) && sv[ssk].length > 0) { items = sv[ssk]; break; }
                }
                if (items.length > 0) break;
              }
            }
            if (items.length > 0) break;
          }
        }
      }
    }

    const totalCount = items.length;

    const preview = items.slice(0, limit).map((item: any) => {
      const row: Record<string, any> = {};
      const processObj = (prefix: string, o: any) => {
        if (!o || typeof o !== "object") return;
        for (const [key, val] of Object.entries(o)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          if (key === "$") {
            for (const [ak, av] of Object.entries(val as Record<string, any>)) {
              row[ak] = av;
            }
          } else if (val === null || val === undefined) {
            row[fullKey] = "";
          } else if (typeof val === "object" && !Array.isArray(val)) {
            const subKeys = Object.keys(val as Record<string, any>);
            if (subKeys.length <= 4 && !subKeys.some(sk => typeof (val as any)[sk] === "object")) {
              for (const [sk, sv] of Object.entries(val as Record<string, any>)) {
                if (sk === "$") {
                  for (const [ak, av] of Object.entries(sv as Record<string, any>)) {
                    row[`${fullKey}.${ak}`] = av;
                  }
                } else {
                  row[`${fullKey}.${sk}`] = sv;
                }
              }
            } else {
              row[fullKey] = JSON.stringify(val).substring(0, 120);
            }
          } else if (Array.isArray(val)) {
            row[fullKey] = `[${(val as any[]).length} items]`;
          } else {
            row[fullKey] = val;
          }
        }
      };

      if (item && item.$ && item.$.modelCode) {
        row["modelCode"] = item.$.modelCode;
      }
      if (item && item.$ && item.$.itemCode) {
        row["itemCode"] = item.$.itemCode;
      }
      if (item && item.$ && item.$.modelcode) {
        row["modelCode"] = item.$.modelcode;
      }
      if (item && item.$ && item.$.itemcode) {
        row["itemCode"] = item.$.itemcode;
      }

      for (const [key, val] of Object.entries(item)) {
        if (key === "$") continue;
        if (key === "items" && typeof val === "object") {
          const innerItems = (val as any)?.item;
          if (innerItems) {
            const firstItem = Array.isArray(innerItems) ? innerItems[0] : innerItems;
            if (firstItem) {
              if (firstItem.$ && (firstItem.$.itemCode || firstItem.$.itemcode)) {
                row["firstItemCode"] = firstItem.$.itemCode || firstItem.$.itemcode;
              }
              row["itemCount"] = Array.isArray(innerItems) ? innerItems.length : 1;
              for (const [ik, iv] of Object.entries(firstItem)) {
                if (ik === "$" || ik === "items") continue;
                if (typeof iv === "string" || typeof iv === "number") {
                  row[ik] = iv;
                } else if (iv && typeof iv === "object" && !Array.isArray(iv)) {
                  const sub = iv as Record<string, any>;
                  if (sub.$ && Object.keys(sub).length === 1) {
                    for (const [ak, av] of Object.entries(sub.$)) {
                      row[`${ik}.${ak}`] = av;
                    }
                  } else {
                    row[ik] = JSON.stringify(iv).substring(0, 100);
                  }
                }
              }
            }
          }
          continue;
        }
        if (typeof val === "string" || typeof val === "number") {
          row[key] = val;
        } else if (val && typeof val === "object" && !Array.isArray(val)) {
          const sub = val as Record<string, any>;
          if (sub.$ && Object.keys(sub).length <= 3) {
            for (const [ak, av] of Object.entries(sub.$)) {
              row[`${key}.${ak}`] = av;
            }
            for (const [sk, sv] of Object.entries(sub)) {
              if (sk === "$") continue;
              if (typeof sv === "string" || typeof sv === "number") {
                row[`${key}.${sk}`] = sv;
              }
            }
          } else {
            row[key] = JSON.stringify(val).substring(0, 100);
          }
        } else if (Array.isArray(val)) {
          row[key] = `[${(val as any[]).length} items]`;
        } else {
          row[key] = val;
        }
      }
      return row;
    });

    const fields = collectAllFields(preview);
    return { success: true, source: src.label, recordCount: totalCount, fields, preview, fetchedAt: new Date().toISOString() };
  } catch (err: any) {
    return { success: false, source: src.label, recordCount: 0, fields: [], preview: [], error: err.name === "AbortError" ? "Request timed out (60s) — PF Concept feeds can be large" : `Failed: ${err.message}`, fetchedAt: new Date().toISOString() };
  }
}

async function fetchCsvFeedData(source: string, feedUrl: string | undefined, limit: number): Promise<FetchResult> {
  if (!feedUrl || !isUrlAllowed(feedUrl)) {
    return {
      success: false, source, recordCount: 0, fields: [], preview: [],
      error: !feedUrl ? "CSV feed URL not configured." : "URL not in allowed hosts list",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(feedUrl, { signal: controller.signal, headers: { "User-Agent": "SyncHub/1.0" } });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false, source, recordCount: 0, fields: [], preview: [],
        error: `HTTP ${res.status}: ${res.statusText}`, fetchedAt: new Date().toISOString(),
      };
    }

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { success: true, source, recordCount: 0, fields: [], preview: [], fetchedAt: new Date().toISOString() };
    }

    const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
    const headers_row = lines[0].split(delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
    const dataLines = lines.slice(1, limit + 1);

    const preview = dataLines.map((line) => {
      const vals = line.split(delimiter).map((v) => v.replace(/^"|"$/g, "").trim());
      const row: Record<string, any> = {};
      headers_row.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    });

    return {
      success: true, source, recordCount: lines.length - 1,
      fields: headers_row, preview, fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false, source, recordCount: 0, fields: [], preview: [],
      error: err.name === "AbortError" ? "Request timed out (30s)" : `Failed to fetch CSV: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

const ANDA_SOURCES: Record<string, { path: string; label: string; needsLang: boolean; format: "xml" | "csv" }> = {
  products: { path: "products", label: "Products (XML)", needsLang: true, format: "xml" },
  prices: { path: "prices", label: "Prices (XML)", needsLang: false, format: "xml" },
  inventories: { path: "inventories", label: "Inventory / Stocks (XML)", needsLang: false, format: "xml" },
  labeling: { path: "labeling", label: "Labeling Info (XML)", needsLang: true, format: "xml" },
  categories: { path: "categories", label: "Categories (XML)", needsLang: true, format: "xml" },
  "labeling-prices": { path: "labeling-prices", label: "Labeling Prices (XML)", needsLang: false, format: "xml" },
  "unique-prices": { path: "unique-product-prices", label: "Unique Prices (XML)", needsLang: false, format: "xml" },
  "products-csv": { path: "products-csv", label: "Products (CSV)", needsLang: true, format: "csv" },
  "prices-csv": { path: "prices-csv", label: "Prices (CSV)", needsLang: false, format: "csv" },
};

async function fetchAndaData(config: Record<string, any> | undefined, source: string | undefined, limit: number): Promise<FetchResult> {
  const feedId = config?.xmlFeedId;
  if (!feedId) {
    if (config?.skuFeedUrl) {
      return fetchXmlFeedData("ANDA", config.skuFeedUrl, limit);
    }
    return {
      success: false,
      source: "Anda Present",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "XML Feed ID nie je nakonfigurované. Prejdite na záložku Settings a zadajte unikátne Feed ID od Anda Present.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const lang = config?.language || "sk";
  const srcKey = source && ANDA_SOURCES[source] ? source : "products";
  const src = ANDA_SOURCES[srcKey];

  const id = src.format === "csv" ? (config?.csvFeedId || feedId) : feedId;
  const feedUrl = src.needsLang
    ? `https://xml.andapresent.com/export/${src.path}/${lang}/${id}`
    : `https://xml.andapresent.com/export/${src.path}/${id}`;

  if (src.format === "csv") {
    return fetchCsvFeedData(`Anda ${src.label}`, feedUrl, limit);
  }
  return fetchXmlFeedData(`Anda ${src.label}`, feedUrl, limit);
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

    const fields = collectAllFields(preview);
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

    const fields = collectAllFields(preview);

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

const RAYNET_SOURCES: Record<string, { endpoint: string; label: string }> = {
  company: { endpoint: "/company/", label: "Klienti (Companies)" },
  person: { endpoint: "/person/", label: "Kontakty (Persons)" },
  businessCase: { endpoint: "/businessCase/", label: "Obchodné prípady (Deals)" },
  lead: { endpoint: "/lead/", label: "Leady" },
  activity: { endpoint: "/activity/", label: "Aktivity" },
  invoice: { endpoint: "/invoice/", label: "Faktúry" },
  product: { endpoint: "/product/", label: "Produkty" },
};

async function fetchRaynetData(config: Record<string, any>, source?: string, limit = 20): Promise<FetchResult> {
  const username = config?.username;
  const apiKey = config?.apiKey;
  const instanceName = config?.instanceName;
  if (!username || !apiKey || !instanceName) {
    return {
      success: false,
      source: "Raynet CRM",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "Missing credentials. Configure Username, API Key, and Instance Name in the Configuration tab.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const srcKey = source || "company";
  const src = RAYNET_SOURCES[srcKey] || RAYNET_SOURCES.company;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const credentials = Buffer.from(`${username}:${apiKey}`).toString("base64");
    const url = `https://app.raynet.cz/api/v2${src.endpoint}?limit=${limit}&offset=0`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Authorization": `Basic ${credentials}`,
        "X-Instance-Name": instanceName,
        "Accept": "application/json",
        "User-Agent": "SyncHub/1.0",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      return {
        success: false,
        source: `Raynet ${src.label}`,
        recordCount: 0,
        fields: [],
        preview: [],
        error: `Raynet API responded with HTTP ${res.status}${res.status === 401 ? " — Invalid credentials" : res.status === 403 ? " — Access denied (check instance name)" : ""}${errorText ? `: ${errorText.slice(0, 200)}` : ""}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const rawData = await res.json();
    let items: any[] = [];
    let totalCount = 0;

    if (rawData.data && Array.isArray(rawData.data)) {
      items = rawData.data;
      totalCount = rawData.totalCount ?? items.length;
    } else if (Array.isArray(rawData)) {
      items = rawData;
      totalCount = items.length;
    } else {
      items = [rawData];
      totalCount = 1;
    }

    const limited = items.slice(0, limit);
    const fields = collectAllFields(limited);
    const preview = limited.map((item) => flattenObject(item));

    return {
      success: true,
      source: `Raynet ${src.label}`,
      recordCount: totalCount,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source: `Raynet ${src.label}`,
      recordCount: 0,
      fields: [],
      preview: [],
      error: err.name === "AbortError"
        ? "Request timed out (20s)"
        : `Failed to fetch data: ${err.message}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}

const ONIX_SOURCES: Record<string, { endpoint: string; label: string }> = {
  skladovekarty: { endpoint: "/api/SkladoveKarty", label: "Skladové karty" },
  cenypredajne: { endpoint: "/api/CenyPredajne", label: "Ceny predajné" },
  cenynakupne: { endpoint: "/api/CenyNakupne", label: "Ceny nákupné" },
  cenymanazerskekarty: { endpoint: "/api/CenyManazerskeKarty", label: "Ceny manažérske (karty)" },
  stavzasob: { endpoint: "/api/StavZasob", label: "Stav zásob" },
  pohybydoklady: { endpoint: "/api/PohybyDoklady", label: "Pohyby - doklady" },
  intrastat: { endpoint: "/api/Intrastat", label: "Intrastat" },
};

async function fetchOnixData(config: Record<string, any>, baseUrl: string, source?: string, limit = 20): Promise<FetchResult> {
  const token = config?.apiToken;
  if (!token) {
    return {
      success: false,
      source: "ONIX ERP",
      recordCount: 0,
      fields: [],
      preview: [],
      error: "No API token configured. Add your ONIX API token in the Configuration tab.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const srcKey = source || "skladovekarty";
  const src = ONIX_SOURCES[srcKey] || ONIX_SOURCES.skladovekarty;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const url = `${baseUrl}${src.endpoint}?pageSize=${limit}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "SyncHub/1.0",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      return {
        success: false,
        source: `ONIX ${src.label}`,
        recordCount: 0,
        fields: [],
        preview: [],
        error: `ONIX API responded with HTTP ${res.status}${res.status === 401 ? " — Invalid token" : res.status === 503 ? " — Service unavailable" : ""}${errorText ? `: ${errorText.slice(0, 200)}` : ""}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const rawData = await res.json();
    let items: any[] = [];

    if (Array.isArray(rawData)) {
      items = rawData;
    } else if (rawData && typeof rawData === "object") {
      if (rawData.items && Array.isArray(rawData.items)) {
        items = rawData.items;
      } else if (rawData.data && Array.isArray(rawData.data)) {
        items = rawData.data;
      } else {
        const firstArrayKey = Object.keys(rawData).find((k) => Array.isArray(rawData[k]));
        if (firstArrayKey) {
          items = rawData[firstArrayKey];
        } else {
          items = [rawData];
        }
      }
    }

    const totalCount = items.length;
    const limited = items.slice(0, limit);
    const fields = collectAllFields(limited);
    const preview = limited.map((item) => flattenObject(item));

    return {
      success: true,
      source: `ONIX ${src.label}`,
      recordCount: totalCount,
      fields,
      preview,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      source: `ONIX ${src.label}`,
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

export function flattenObject(obj: any, prefix = ""): Record<string, string> {
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
