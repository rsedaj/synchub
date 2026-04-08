import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Store,
  LayoutGrid,
  List,
  Search,
  Package,
  Tag,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  X,
  RefreshCw,
  Box,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Truck,
  ExternalLink,
  Plus,
  Trash2,
  Globe,
} from "lucide-react";

type Module = {
  id: string;
  name: string;
  code: string;
  status: string;
};

type DataPreview = {
  success: boolean;
  source: string;
  recordCount: number;
  fields: string[];
  preview: Record<string, any>[];
  fetchedAt: string;
  error?: string;
};

type FeedKey = string;

type FeedDef = {
  key: FeedKey;
  moduleCode: string;
  moduleName: string;
  moduleId: string;
  source: string;
  sourceLabel: string;
};

type NormalizedProduct = {
  _feedKey: string;
  _supplierName: string;
  _supplierCode: string;
  _raw: Record<string, any>;
  _fields: string[];
  name: string;
  sku: string;
  price: string;
  category: string;
  brand: string;
  stock: string;
  description: string;
  color: string;
  imageUrl: string | null;
  link: string;
};

const PRODUCT_SOURCES: Record<string, { value: string; label: string }[]> = {
  ONIX: [
    { value: "stockitems", label: "Skladové karty" },
    { value: "partners", label: "Partneri" },
    { value: "stocks", label: "Sklady" },
    { value: "catalogprices", label: "Cenníky" },
  ],
  PROMOTRON: [
    { value: "feed", label: "XML Feed" },
  ],
  ANDA: [
    { value: "products", label: "Products XML" },
  ],
  MID: [
    { value: "products", label: "Products v2.0" },
  ],
  XDCONNECT: [
    { value: "products", label: "Product Data V5" },
    { value: "combined", label: "Combined V5" },
  ],
  EASYGIFTS: [
    { value: "sku", label: "SKU Products" },
  ],
  MACMA: [
    { value: "sku", label: "SKU Products" },
  ],
  PFCONCEPT: [
    { value: "products", label: "Product Feed" },
  ],
  STICKER: [
    { value: "products", label: "Products" },
  ],
  GIVING: [
    { value: "auto", label: "Products" },
  ],
};

const IMAGE_PATTERNS = [
  "CustomColumns.STOCK_ITEMS_Z_HAUE_SK001_URL_TXT",
  "image_link", "main_image", "image", "img", "picture", "photo", "thumbnail",
  "imageUrl", "ImageURL", "digital_asset", "item_picture",
  "MainImage", "PictureURL", "ProductPicture", "mainpic",
];

const NAME_PATTERNS = [
  "title", "name", "product_name", "ProductName",
  "Name", "Title", "ProductTitle",
];

const PRICE_PATTERNS = [
  "Default_Price", "Default_Price_Vat", "Managerial_Price",
  "price", "Price", "cost", "retail", "Purchase", "amount",
  "scale_1_price", "unit_price", "UnitPrice", "ListPrice", "SellingPrice",
];

const SKU_PATTERNS = [
  "custom_label_1", "catalogcode", "modelCode", "firstItemCode",
  "sku", "SKU", "code", "Code", "article", "Article", "item_number",
  "ItemNumber", "ProductCode", "master_code", "MasterCode", "ean", "EAN",
  "Ist_Code", "Ns_Code", "Plu",
  "id",
];

const CATEGORY_PATTERNS = [
  "Id_Stock_Items_Group_Default", "StockItemGroups",
  "product_type", "chapter", "categoryData",
  "category", "Category", "group", "Group", "MainCategory", "SubCategory",
  "category_code", "product_group", "ProductGroup", "CategoryName",
  "categories", "family", "Family",
];

const BRAND_PATTERNS = [
  "brand", "Brand", "manufacturer", "Manufacturer",
];

const STOCK_PATTERNS = [
  "StockItemBalance[0].Available", "StockItemBalance[0].Balance",
  "availability", "stock", "Stock", "inventory", "Inventory",
  "qty", "quantity", "available", "InStock", "StockLevel",
];

const DESC_PATTERNS = [
  "Ist_Description", "Info",
  "description", "Description", "desc", "long_description", "ProductDescription",
  "short_description", "ShortDescription", "LongDescription", "extDesc",
];

const COLOR_PATTERNS = [
  "color_name", "color", "Color", "colour", "Colour", "ColorName",
];

const LINK_PATTERNS = [
  "link", "url", "URL", "productUrl", "ProductURL", "product_url",
  "detail_url", "DetailURL", "productLink", "ProductLink",
  "product_page_url", "webpage",
];

function findField(fields: string[], patterns: string[]): string | null {
  for (const p of patterns) {
    const exact = fields.find(f => f === p);
    if (exact) return exact;
  }
  for (const p of patterns) {
    const partial = fields.find(f => f.toLowerCase().includes(p.toLowerCase()));
    if (partial) return partial;
  }
  return null;
}

function isImageUrl(val: any): boolean {
  if (typeof val !== "string") return false;
  const lower = val.toLowerCase().trim();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false;
  if (lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".png") ||
      lower.includes(".webp") || lower.includes(".gif") || lower.includes(".svg")) return true;
  if (lower.includes("/image") || lower.includes("/img") || lower.includes("media") ||
      lower.includes("/products/") || lower.includes("cdn.") || lower.includes("web-images")) return true;
  return false;
}

function detectImageValue(record: Record<string, any>, fields: string[]): string | null {
  for (const p of IMAGE_PATTERNS) {
    for (const f of fields) {
      if (f.toLowerCase().includes(p.toLowerCase())) {
        const val = record[f];
        if (val && typeof val === "string" && isImageUrl(val)) return val;
      }
    }
  }
  for (const f of fields) {
    const val = record[f];
    if (val && typeof val === "string" && isImageUrl(val)) return val;
  }
  return null;
}

function formatPrice(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  const str = String(val).trim();
  const numMatch = str.match(/[\d.,]+/);
  if (!numMatch) return str;
  const num = parseFloat(numMatch[0].replace(",", "."));
  if (isNaN(num)) return str;
  if (str.includes("EUR") || str.includes("€")) return num.toFixed(2) + " €";
  return num.toFixed(2) + " €";
}

function extractCategory(val: any): string {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.catDesc || parsed.groupDesc || parsed.CategoryName || "";
    } catch { /* not JSON */ }
    const match = trimmed.match(/"(?:catDesc|groupDesc|CategoryName)":"([^"]+)"/);
    if (match) return match[1];
  }
  if (trimmed.includes("|")) {
    return trimmed.split("|")[0].trim();
  }
  return trimmed;
}

function isStockPositive(val: string): boolean {
  const lower = val.toLowerCase().trim();
  if (lower === "in stock" || lower === "na sklade" || lower === "available") return true;
  if (lower === "out of stock" || lower === "nie je na sklade" || lower === "unavailable") return false;
  const num = parseFloat(val);
  return !isNaN(num) && num > 0;
}

function formatStock(val: string): string {
  const lower = val.toLowerCase().trim();
  if (lower === "in stock" || lower === "na sklade") return "Na sklade";
  if (lower === "out of stock" || lower === "nie je na sklade") return "Nedostupné";
  const num = parseFloat(val);
  if (!isNaN(num)) return num > 0 ? `${val} ks` : "0 ks";
  return val;
}

function extractImageFromData(val: any): string | null {
  if (!val || typeof val !== "string") return null;
  if (val.startsWith("{")) {
    const match = val.match(/"imageMain":"([^"]+)"/);
    if (match) {
      const filename = match[1];
      if (filename.startsWith("http")) return filename;
      return `https://www.pfconcept.com/img/catalog/${filename}`;
    }
  }
  return null;
}

function normalizeProducts(
  data: DataPreview,
  feedDef: FeedDef
): NormalizedProduct[] {
  const fields = data.fields;
  const nameF = findField(fields, NAME_PATTERNS);
  const priceF = findField(fields, PRICE_PATTERNS);
  const skuF = findField(fields, SKU_PATTERNS);
  const catF = findField(fields, CATEGORY_PATTERNS);
  const brandF = findField(fields, BRAND_PATTERNS);
  const stockF = findField(fields, STOCK_PATTERNS);
  const descF = findField(fields, DESC_PATTERNS);
  const colorF = findField(fields, COLOR_PATTERNS);
  const linkF = findField(fields, LINK_PATTERNS);
  const hasImageData = fields.includes("imageData");

  return data.preview.map(item => {
    let imageUrl = detectImageValue(item, fields);
    if (!imageUrl && hasImageData) {
      imageUrl = extractImageFromData(item["imageData"]);
    }

    const rawCategory = catF ? String(item[catF] || "") : "";
    const category = extractCategory(rawCategory);

    return {
      _feedKey: feedDef.key,
      _supplierName: feedDef.moduleName,
      _supplierCode: feedDef.moduleCode,
      _raw: item,
      _fields: fields,
      name: nameF ? String(item[nameF] || "") : "",
      sku: skuF ? String(item[skuF] || "") : "",
      price: priceF ? String(item[priceF] || "") : "",
      category,
      brand: brandF ? String(item[brandF] || "") : "",
      stock: stockF ? String(item[stockF] || "") : "",
      description: descF ? String(item[descF] || "") : "",
      color: colorF ? String(item[colorF] || "") : "",
      imageUrl,
      link: linkF ? String(item[linkF] || "") : "",
    };
  });
}

const PAGE_SIZES = [48, 96, 200];
const DEFAULT_PAGE_SIZE = 48;

const SUPPLIER_COLORS: Record<string, string> = {
  ONIX: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  MACMA: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EASYGIFTS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PFCONCEPT: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  MID: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  ANDA: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  XDCONNECT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  STICKER: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  GIVING: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  PROMOTRON: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  CUSTOM: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

export default function ShopViewPage() {
  const { t } = useLanguage();
  const [selectedFeeds, setSelectedFeeds] = useState<Set<FeedKey>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("name");
  const [showFilters, setShowFilters] = useState(true);
  const [showFeedSelector, setShowFeedSelector] = useState(true);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadedProducts, setLoadedProducts] = useState<NormalizedProduct[]>([]);
  const [loadErrors, setLoadErrors] = useState<{ feed: string; error: string }[]>([]);
  const [feedStats, setFeedStats] = useState<Record<FeedKey, number>>({});
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [customFeedUrl, setCustomFeedUrl] = useState("");
  const [customFeedName, setCustomFeedName] = useState("");
  const [customFeeds, setCustomFeeds] = useState<{ url: string; name: string }[]>([]);

  const handleSortChange = (val: string) => {
    setSortBy(val);
    setCurrentPage(1);
  };

  const { data: modules } = useQuery<Module[]>({
    queryKey: ["/api/modules"],
  });

  const availableFeeds: FeedDef[] = useMemo(() => {
    if (!modules) return [];
    const feeds: FeedDef[] = [];
    for (const mod of modules) {
      const sources = PRODUCT_SOURCES[mod.code];
      if (!sources) continue;
      for (const src of sources) {
        feeds.push({
          key: `${mod.code}:${src.value}`,
          moduleCode: mod.code,
          moduleName: mod.name,
          moduleId: mod.id,
          source: src.value,
          sourceLabel: src.label,
        });
      }
    }
    return feeds;
  }, [modules]);

  const feedsByModule = useMemo(() => {
    const map: Record<string, FeedDef[]> = {};
    for (const f of availableFeeds) {
      if (!map[f.moduleCode]) map[f.moduleCode] = [];
      map[f.moduleCode].push(f);
    }
    return map;
  }, [availableFeeds]);

  const toggleFeed = (key: FeedKey) => {
    setSelectedFeeds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFeeds = () => {
    setSelectedFeeds(new Set(availableFeeds.map(f => f.key)));
  };

  const clearAllFeeds = () => {
    setSelectedFeeds(new Set());
  };

  const handleImageError = (key: string) => {
    setImgErrors(prev => new Set(prev).add(key));
  };

  const handleLoadFeeds = useCallback(async () => {
    if (selectedFeeds.size === 0) return;
    setIsLoading(true);
    setLoadedProducts([]);
    setLoadErrors([]);
    setFeedStats({});
    setCurrentPage(1);
    setSelectedCategory("all");
    setSelectedSupplier("all");
    setSearchQuery("");
    setImgErrors(new Set());

    const feedsToLoad = availableFeeds.filter(f => selectedFeeds.has(f.key));
    const allProducts: NormalizedProduct[] = [];
    const errors: { feed: string; error: string }[] = [];
    const stats: Record<FeedKey, number> = {};

    const results = await Promise.allSettled(
      feedsToLoad.map(async (feed) => {
        const res = await apiRequest(
          "GET",
          `/api/modules/${feed.moduleId}/data-preview?limit=500&source=${feed.source}`
        );
        const data = await res.json() as DataPreview;
        return { feed, data };
      })
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const feedDef = feedsToLoad[i];
      if (result.status === "fulfilled") {
        const { data } = result.value;
        if (data.success && data.preview?.length > 0) {
          const normalized = normalizeProducts(data, feedDef);
          allProducts.push(...normalized);
          stats[feedDef.key] = normalized.length;
        } else if (data.error) {
          errors.push({ feed: `${feedDef.moduleName} — ${feedDef.sourceLabel}`, error: data.error });
        } else {
          stats[feedDef.key] = 0;
        }
      } else {
        errors.push({
          feed: `${feedDef.moduleName} — ${feedDef.sourceLabel}`,
          error: result.reason?.message || "Neznáma chyba",
        });
      }
    }

    for (const cf of customFeeds) {
      try {
        const res = await apiRequest("POST", "/api/shop-view/custom-feed", {
          url: cf.url,
          limit: 500,
        });
        const data = await res.json() as DataPreview;
        if (data.success && data.preview?.length > 0) {
          const hostname = cf.name || new URL(cf.url).hostname;
          const feedDef: FeedDef = {
            key: `custom_${cf.url}`,
            moduleCode: "CUSTOM",
            moduleName: hostname,
            moduleId: "",
            source: "custom",
            sourceLabel: hostname,
          };
          const normalized = normalizeProducts(data, feedDef);
          allProducts.push(...normalized);
          stats[feedDef.key] = normalized.length;
        } else if ((data as any).message) {
          errors.push({ feed: cf.name || cf.url, error: (data as any).message });
        }
      } catch (err: any) {
        errors.push({ feed: cf.name || cf.url, error: err.message || "Neznáma chyba" });
      }
    }

    setLoadedProducts(allProducts);
    setLoadErrors(errors);
    setFeedStats(stats);
    setIsLoading(false);
    setShowFeedSelector(false);
  }, [selectedFeeds, availableFeeds, customFeeds]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const p of loadedProducts) {
      set.add(p._supplierCode);
    }
    return Array.from(set).sort();
  }, [loadedProducts]);

  const categories = useMemo(() => {
    const catSet = new Set<string>();
    for (const p of loadedProducts) {
      if (p.category) catSet.add(p.category);
    }
    return Array.from(catSet).sort();
  }, [loadedProducts]);

  const filteredItems = useMemo(() => {
    let items = [...loadedProducts];

    if (selectedSupplier !== "all") {
      items = items.filter(p => p._supplierCode === selectedSupplier);
    }

    if (selectedCategory !== "all") {
      items = items.filter(p => p.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p =>
        [p.name, p.sku, p.description, p.brand, p.color]
          .filter(Boolean)
          .some(v => v.toLowerCase().includes(q))
      );
    }

    if (sortBy === "name") {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "price") {
      items.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    } else if (sortBy === "sku") {
      items.sort((a, b) => a.sku.localeCompare(b.sku));
    } else if (sortBy === "supplier") {
      items.sort((a, b) => a._supplierName.localeCompare(b._supplierName));
    }

    return items;
  }, [loadedProducts, selectedSupplier, selectedCategory, searchQuery, sortBy]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const hasData = loadedProducts.length > 0;

  return (
    <div className="flex flex-col h-full" data-testid="page-shop-view">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            <h1 className="text-lg font-semibold" data-testid="text-shop-view-title">
              {t("shopView.title")}
            </h1>
          </div>

          <Separator orientation="vertical" className="h-6 hidden sm:block" />

          <div className="flex items-center gap-2 flex-wrap flex-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFeedSelector(!showFeedSelector)}
              data-testid="button-toggle-feed-selector"
            >
              <Package className="h-4 w-4 mr-1" />
              {t("shopView.feeds")} ({selectedFeeds.size})
              {showFeedSelector ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>

            <Button
              size="sm"
              onClick={handleLoadFeeds}
              disabled={(selectedFeeds.size === 0 && customFeeds.length === 0) || isLoading}
              data-testid="button-fetch-shop"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {t("shopView.loadProducts")}
            </Button>

            {hasData && (
              <Badge variant="secondary" className="text-xs" data-testid="text-product-count">
                {filteredItems.length} / {loadedProducts.length} {t("shopView.products")}
                {Object.keys(feedStats).length > 1 && (
                  <span className="ml-1 text-muted-foreground">
                    ({Object.keys(feedStats).length} {t("shopView.feedsLoaded")})
                  </span>
                )}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {hasData && (
              <Button
                variant={showFilters ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showFeedSelector && (
          <div className="mt-3 border rounded-lg p-3 bg-muted/30" data-testid="panel-feed-selector">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">{t("shopView.selectFeeds")}</span>
              <div className="flex gap-2">
                <button
                  onClick={selectAllFeeds}
                  className="text-[10px] text-primary hover:underline"
                  data-testid="button-select-all-feeds"
                >
                  {t("shopView.selectAll")}
                </button>
                <button
                  onClick={clearAllFeeds}
                  className="text-[10px] text-muted-foreground hover:underline"
                  data-testid="button-clear-all-feeds"
                >
                  {t("shopView.clearAll")}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(feedsByModule).map(([code, feeds]) => (
                <div key={code} className="border rounded p-2 bg-background">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${SUPPLIER_COLORS[code] || ""}`}
                    >
                      {code}
                    </Badge>
                    <span className="text-[11px] font-medium truncate">{feeds[0].moduleName}</span>
                  </div>
                  {feeds.map(feed => (
                    <label
                      key={feed.key}
                      className="flex items-center gap-2 py-0.5 cursor-pointer"
                      data-testid={`checkbox-feed-${feed.key}`}
                    >
                      <Checkbox
                        checked={selectedFeeds.has(feed.key)}
                        onCheckedChange={() => toggleFeed(feed.key)}
                      />
                      <span className="text-xs">
                        {feed.sourceLabel}
                        {feedStats[feed.key] !== undefined && (
                          <span className="text-muted-foreground ml-1">
                            ({feedStats[feed.key]})
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <Separator className="my-3" />
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Vlastný feed (XML/JSON)</span>
              </div>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="https://example.com/feed.xml"
                    value={customFeedUrl}
                    onChange={(e) => setCustomFeedUrl(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-custom-feed-url"
                  />
                </div>
                <div className="w-32">
                  <Input
                    placeholder="Názov (voliteľné)"
                    value={customFeedName}
                    onChange={(e) => setCustomFeedName(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-custom-feed-name"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    if (!customFeedUrl.trim()) return;
                    setCustomFeeds(prev => [...prev, { url: customFeedUrl.trim(), name: customFeedName.trim() }]);
                    setCustomFeedUrl("");
                    setCustomFeedName("");
                  }}
                  disabled={!customFeedUrl.trim()}
                  data-testid="button-add-custom-feed"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Pridať
                </Button>
              </div>
              {customFeeds.length > 0 && (
                <div className="mt-2 space-y-1">
                  {customFeeds.map((cf, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1 border">
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${SUPPLIER_COLORS.CUSTOM}`}>
                        CUSTOM
                      </Badge>
                      <span className="truncate flex-1" title={cf.url}>
                        {cf.name || cf.url}
                      </span>
                      <button
                        onClick={() => setCustomFeeds(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid={`button-remove-custom-feed-${i}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showFilters && hasData && (
          <div className="w-56 border-r bg-muted/30 overflow-y-auto flex-shrink-0 p-3 space-y-4" data-testid="panel-filters">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{t("shopView.search")}</span>
              </div>
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder={t("shopView.searchPlaceholder")}
                  className="h-8 text-xs pr-7"
                  data-testid="input-shop-search"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                    data-testid="button-clear-search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{t("shopView.sortBy")}</span>
              </div>
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t("shopView.sortName")}</SelectItem>
                  <SelectItem value="price">{t("shopView.sortPrice")}</SelectItem>
                  <SelectItem value="sku">{t("shopView.sortSku")}</SelectItem>
                  <SelectItem value="supplier">{t("shopView.sortSupplier")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {suppliers.length > 1 && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">
                      {t("shopView.supplier")} ({suppliers.length})
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => { setSelectedSupplier("all"); setCurrentPage(1); }}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                        selectedSupplier === "all"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      data-testid="button-supplier-all"
                    >
                      {t("shopView.allSuppliers")}
                    </button>
                    {suppliers.map((code) => {
                      const mod = availableFeeds.find(f => f.moduleCode === code);
                      const count = loadedProducts.filter(p => p._supplierCode === code).length;
                      return (
                        <button
                          key={code}
                          onClick={() => { setSelectedSupplier(code); setCurrentPage(1); }}
                          className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors flex items-center justify-between ${
                            selectedSupplier === code
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                          data-testid={`button-supplier-${code}`}
                        >
                          <span className="truncate">{mod?.moduleName || code}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{count}</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {categories.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">
                      {t("shopView.categories")} ({categories.length})
                    </span>
                  </div>
                  <div className="space-y-0.5 max-h-[250px] overflow-y-auto">
                    <button
                      onClick={() => { setSelectedCategory("all"); setCurrentPage(1); }}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                        selectedCategory === "all"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      data-testid="button-category-all"
                    >
                      {t("shopView.allCategories")}
                    </button>
                    {categories.map((cat, idx) => (
                      <button
                        key={cat}
                        onClick={() => { setSelectedCategory(cat); setCurrentPage(1); }}
                        className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate ${
                          selectedCategory === cat
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                        title={cat}
                        data-testid={`button-category-${idx}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {loadErrors.length > 0 && (
              <>
                <Separator />
                <div>
                  <span className="text-xs font-medium text-destructive">{t("shopView.loadErrors")}</span>
                  <div className="space-y-1 mt-1">
                    {loadErrors.map((err, i) => (
                      <div key={i} className="text-[10px] text-destructive/80">
                        <span className="font-medium">{err.feed}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!hasData && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 p-8" data-testid="text-shop-empty">
              <Store className="h-16 w-16 opacity-20" />
              <div className="text-center space-y-2">
                <h2 className="text-lg font-medium text-foreground">{t("shopView.title")}</h2>
                <p className="text-sm max-w-md">
                  {t("shopView.emptyDesc")}
                </p>
              </div>
              {loadErrors.length > 0 && (
                <div className="mt-4 w-full max-w-lg space-y-2" data-testid="panel-load-errors">
                  <p className="text-xs font-medium text-destructive">{t("shopView.loadErrors")}</p>
                  {loadErrors.map((err, i) => (
                    <Card key={i} className="border-destructive/30 p-3">
                      <p className="text-xs">
                        <span className="font-medium">{err.feed}:</span>{" "}
                        <span className="text-destructive/80">{err.error}</span>
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">{t("shopView.loadingFeeds")}</span>
              </div>
              <div className={viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
                : "space-y-2"
              }>
                {Array.from({ length: 12 }).map((_, i) => (
                  viewMode === "grid" ? (
                    <Card key={i} className="overflow-hidden">
                      <Skeleton className="w-full aspect-square" />
                      <CardContent className="p-3 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-4 w-1/3" />
                      </CardContent>
                    </Card>
                  ) : (
                    <Card key={i} className="p-3">
                      <div className="flex gap-3">
                        <Skeleton className="h-16 w-16 rounded flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-3 w-1/3" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    </Card>
                  )
                ))}
              </div>
            </div>
          )}

          {hasData && !isLoading && (
            <>
              {paginatedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                  <Package className="h-10 w-10 opacity-30" />
                  <p className="text-sm">{t("shopView.noResults")}</p>
                </div>
              ) : (
                <div className="p-4">
                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {paginatedItems.map((item, idx) => {
                        const imgKey = `grid-${currentPage}-${idx}`;
                        return (
                          <Card
                            key={imgKey}
                            className={`overflow-hidden group ${item.link ? "cursor-pointer hover:shadow-md transition-shadow" : "cursor-default"}`}
                            data-testid={`card-product-${idx}`}
                            onClick={() => { if (item.link) window.open(item.link, "_blank", "noopener"); }}
                          >
                            <div className="relative aspect-square bg-muted/50 flex items-center justify-center overflow-hidden">
                              {item.imageUrl && !imgErrors.has(imgKey) ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name || "Product"}
                                  className="w-full h-full object-contain p-2"
                                  loading="lazy"
                                  onError={() => handleImageError(imgKey)}
                                />
                              ) : (
                                <Box className="h-8 w-8 text-muted-foreground/20" />
                              )}
                              <Badge
                                className={`absolute top-1.5 left-1.5 text-[8px] px-1 py-0 ${SUPPLIER_COLORS[item._supplierCode] || ""}`}
                              >
                                {item._supplierCode}
                              </Badge>
                              {item.stock && (
                                <Badge
                                  variant={isStockPositive(item.stock) ? "default" : "secondary"}
                                  className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0"
                                >
                                  {formatStock(item.stock)}
                                </Badge>
                              )}
                              {item.link && (
                                <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="bg-background/80 rounded-full p-1">
                                    <ExternalLink className="h-3.5 w-3.5 text-foreground" />
                                  </div>
                                </div>
                              )}
                            </div>
                            <CardContent className="p-2.5 space-y-1">
                              <p className="text-xs font-medium line-clamp-2 leading-tight min-h-[2rem]" data-testid={`text-product-name-${idx}`}>
                                {item.name || t("shopView.noName")}
                              </p>
                              {item.sku && (
                                <p className="text-[10px] text-muted-foreground font-mono truncate" data-testid={`text-product-sku-${idx}`}>
                                  {item.sku}
                                </p>
                              )}
                              {item.brand && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  {item.brand}
                                </Badge>
                              )}
                              {item.category && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {item.category}
                                </p>
                              )}
                              {item.color && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {item.color}
                                </p>
                              )}
                              <div className="flex items-center justify-between">
                                {item.price && (
                                  <p className="text-sm font-bold" data-testid={`text-product-price-${idx}`}>
                                    {formatPrice(item.price)}
                                  </p>
                                )}
                                {item.link && (
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paginatedItems.map((item, idx) => {
                        const imgKey = `list-${currentPage}-${idx}`;
                        return (
                          <Card
                            key={imgKey}
                            className={`p-3 ${item.link ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
                            data-testid={`card-product-${idx}`}
                            onClick={() => { if (item.link) window.open(item.link, "_blank", "noopener"); }}
                          >
                            <div className="flex gap-3">
                              <div className="w-20 h-20 rounded bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                                {item.imageUrl && !imgErrors.has(imgKey) ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name || "Product"}
                                    className="w-full h-full object-contain p-1"
                                    loading="lazy"
                                    onError={() => handleImageError(imgKey)}
                                  />
                                ) : (
                                  <Box className="h-6 w-6 text-muted-foreground/20" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <Badge
                                        className={`text-[8px] px-1 py-0 ${SUPPLIER_COLORS[item._supplierCode] || ""}`}
                                      >
                                        {item._supplierCode}
                                      </Badge>
                                      <p className="text-sm font-medium truncate" data-testid={`text-product-name-${idx}`}>
                                        {item.name || t("shopView.noName")}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {item.sku && (
                                        <span className="text-[10px] text-muted-foreground font-mono" data-testid={`text-product-sku-${idx}`}>
                                          {item.sku}
                                        </span>
                                      )}
                                      {item.brand && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                                          {item.brand}
                                        </Badge>
                                      )}
                                      {item.category && (
                                        <span className="text-[10px] text-muted-foreground">{item.category}</span>
                                      )}
                                      {item.color && (
                                        <span className="text-[10px] text-muted-foreground">{item.color}</span>
                                      )}
                                    </div>
                                    {item.description && (
                                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    {item.price && (
                                      <p className="text-sm font-bold whitespace-nowrap" data-testid={`text-product-price-${idx}`}>
                                        {formatPrice(item.price)}
                                      </p>
                                    )}
                                    {item.stock && (
                                      <Badge
                                        variant={isStockPositive(item.stock) ? "default" : "secondary"}
                                        className="text-[9px] px-1.5 py-0"
                                      >
                                        {formatStock(item.stock)}
                                      </Badge>
                                    )}
                                    {item.link && (
                                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 py-4" data-testid="pagination-shop">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          {currentPage} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => setCurrentPage(p => p + 1)}
                          data-testid="button-next-page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      <Select
                        value={String(itemsPerPage)}
                        onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs" data-testid="select-page-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZES.map(s => (
                            <SelectItem key={s} value={String(s)}>{s} / str.</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
