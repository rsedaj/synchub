import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  ImageOff,
  SlidersHorizontal,
  X,
  RefreshCw,
  Box,
  FolderOpen,
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

const PRODUCT_SOURCES: Record<string, { value: string; label: string }[]> = {
  PROMOTRON: [
    { value: "feed", label: "XML Feed (Products)" },
  ],
  ANDA: [
    { value: "products", label: "Products (XML)" },
  ],
  MID: [
    { value: "products", label: "Products v2.0" },
  ],
  XDCONNECT: [
    { value: "products", label: "Product Data V5" },
    { value: "combined", label: "Combined Data V5" },
  ],
  EASYGIFTS: [
    { value: "sku", label: "SKU (Products)" },
  ],
  MACMA: [
    { value: "sku", label: "SKU (Products)" },
  ],
  PFCONCEPT: [
    { value: "products", label: "Product Feed (katalóg)" },
  ],
  STICKER: [
    { value: "products", label: "Products" },
  ],
  GIVING: [
    { value: "auto", label: "Products" },
  ],
};

const IMAGE_PATTERNS = [
  "image", "img", "picture", "photo", "thumbnail",
  "main_image", "imageUrl", "ImageURL", "digital_asset", "item_picture",
  "MainImage", "PictureURL", "ProductPicture",
];

const NAME_PATTERNS = [
  "name", "title", "product_name", "ProductName", "short_description",
  "Name", "Title", "description_short", "ProductTitle",
];

const PRICE_PATTERNS = [
  "price", "Price", "cost", "retail", "Purchase", "amount",
  "scale_1_price", "unit_price", "UnitPrice", "ListPrice", "SellingPrice",
];

const SKU_PATTERNS = [
  "sku", "SKU", "code", "Code", "article", "Article", "item_number",
  "ItemNumber", "ProductCode", "master_code", "MasterCode", "ean", "EAN",
];

const CATEGORY_PATTERNS = [
  "category", "Category", "group", "Group", "MainCategory", "SubCategory",
  "category_code", "product_group", "ProductGroup", "CategoryName",
  "categories", "family", "Family",
];

const BRAND_PATTERNS = [
  "brand", "Brand", "manufacturer", "Manufacturer", "supplier", "Supplier",
];

const STOCK_PATTERNS = [
  "stock", "Stock", "inventory", "Inventory", "qty", "quantity", "available",
  "InStock", "StockLevel",
];

const DESC_PATTERNS = [
  "description", "Description", "desc", "long_description", "ProductDescription",
  "short_description", "ShortDescription", "LongDescription",
];

const COLOR_PATTERNS = [
  "color", "Color", "colour", "Colour", "ColorName", "color_name",
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

function findAllFields(fields: string[], patterns: string[]): string[] {
  const result: string[] = [];
  for (const f of fields) {
    for (const p of patterns) {
      if (f.toLowerCase().includes(p.toLowerCase()) && !result.includes(f)) {
        result.push(f);
      }
    }
  }
  return result;
}

function isImageUrl(val: any): boolean {
  if (typeof val !== "string") return false;
  const lower = val.toLowerCase();
  return (lower.startsWith("http://") || lower.startsWith("https://")) &&
    (lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".png") ||
     lower.includes(".webp") || lower.includes(".gif") || lower.includes(".svg") ||
     lower.includes("/image") || lower.includes("/img") || lower.includes("media"));
}

function detectImageValue(record: Record<string, any>, fields: string[]): string | null {
  const imgFields = findAllFields(fields, IMAGE_PATTERNS);
  for (const f of imgFields) {
    const val = record[f];
    if (val && typeof val === "string" && isImageUrl(val)) return val;
  }
  for (const f of fields) {
    const val = record[f];
    if (val && typeof val === "string" && isImageUrl(val)) return val;
  }
  return null;
}

function formatPrice(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  return num.toFixed(2) + " €";
}

const ITEMS_PER_PAGE = 24;

export default function ShopViewPage() {
  const { t } = useLanguage();
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("products");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("name");
  const [showFilters, setShowFilters] = useState(true);
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());

  const handleSortChange = (val: string) => {
    setSortBy(val);
    setCurrentPage(1);
  };

  const { data: modules } = useQuery<Module[]>({
    queryKey: ["/api/modules"],
  });

  const productModules = useMemo(() => {
    if (!modules) return [];
    return modules.filter(m => PRODUCT_SOURCES[m.code]);
  }, [modules]);

  const selectedModule = useMemo(() => {
    return productModules.find(m => m.id === selectedModuleId);
  }, [productModules, selectedModuleId]);

  const availableSources = useMemo(() => {
    if (!selectedModule) return [];
    return PRODUCT_SOURCES[selectedModule.code] || [];
  }, [selectedModule]);

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/modules/${selectedModuleId}/data-preview?limit=500&source=${selectedSource}`
      );
      return res.json() as Promise<DataPreview>;
    },
  });

  const data = fetchMutation.data;

  const fieldMapping = useMemo(() => {
    if (!data?.fields) return null;
    const fields = data.fields;
    return {
      name: findField(fields, NAME_PATTERNS),
      price: findField(fields, PRICE_PATTERNS),
      sku: findField(fields, SKU_PATTERNS),
      category: findField(fields, CATEGORY_PATTERNS),
      brand: findField(fields, BRAND_PATTERNS),
      stock: findField(fields, STOCK_PATTERNS),
      description: findField(fields, DESC_PATTERNS),
      color: findField(fields, COLOR_PATTERNS),
      allPrices: findAllFields(fields, PRICE_PATTERNS),
      allImages: findAllFields(fields, IMAGE_PATTERNS),
    };
  }, [data]);

  const categories = useMemo(() => {
    if (!data?.preview || !fieldMapping?.category) return [];
    const catField = fieldMapping.category;
    const catSet = new Set<string>();
    for (const item of data.preview) {
      const val = item[catField];
      if (val && typeof val === "string" && val.trim()) {
        catSet.add(val.trim());
      }
    }
    return Array.from(catSet).sort();
  }, [data, fieldMapping]);

  const filteredItems = useMemo(() => {
    if (!data?.preview) return [];
    let items = [...data.preview];

    if (selectedCategory !== "all" && fieldMapping?.category) {
      items = items.filter(item => {
        const val = item[fieldMapping.category!];
        return val && String(val).trim() === selectedCategory;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(item => {
        const nameVal = fieldMapping?.name ? item[fieldMapping.name] : "";
        const skuVal = fieldMapping?.sku ? item[fieldMapping.sku] : "";
        const descVal = fieldMapping?.description ? item[fieldMapping.description] : "";
        const brandVal = fieldMapping?.brand ? item[fieldMapping.brand] : "";
        return [nameVal, skuVal, descVal, brandVal]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q));
      });
    }

    if (sortBy === "name" && fieldMapping?.name) {
      items.sort((a, b) => String(a[fieldMapping.name!] || "").localeCompare(String(b[fieldMapping.name!] || "")));
    } else if (sortBy === "price" && fieldMapping?.price) {
      items.sort((a, b) => {
        const pa = parseFloat(a[fieldMapping.price!]) || 0;
        const pb = parseFloat(b[fieldMapping.price!]) || 0;
        return pa - pb;
      });
    } else if (sortBy === "sku" && fieldMapping?.sku) {
      items.sort((a, b) => String(a[fieldMapping.sku!] || "").localeCompare(String(b[fieldMapping.sku!] || "")));
    }

    return items;
  }, [data, selectedCategory, searchQuery, sortBy, fieldMapping]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleImageError = (idx: number) => {
    setImgErrors(prev => new Set(prev).add(idx));
  };

  const handleModuleChange = (moduleId: string) => {
    setSelectedModuleId(moduleId);
    const mod = productModules.find(m => m.id === moduleId);
    if (mod && PRODUCT_SOURCES[mod.code]) {
      setSelectedSource(PRODUCT_SOURCES[mod.code][0].value);
    }
    setSearchQuery("");
    setSelectedCategory("all");
    setCurrentPage(1);
    setImgErrors(new Set());
    fetchMutation.reset();
  };

  const handleFetch = () => {
    if (!selectedModuleId) return;
    setCurrentPage(1);
    setSearchQuery("");
    setSelectedCategory("all");
    fetchMutation.mutate();
  };

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
            <Select value={selectedModuleId} onValueChange={handleModuleChange}>
              <SelectTrigger className="h-9 w-[200px] text-sm" data-testid="select-shop-module">
                <SelectValue placeholder={t("shopView.selectModule")} />
              </SelectTrigger>
              <SelectContent>
                {productModules.map(m => (
                  <SelectItem key={m.id} value={m.id} data-testid={`option-module-${m.code}`}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {availableSources.length > 1 && (
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="h-9 w-[180px] text-sm" data-testid="select-shop-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSources.map(s => (
                    <SelectItem key={s.value} value={s.value} data-testid={`option-source-${s.value}`}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              onClick={handleFetch}
              disabled={!selectedModuleId || fetchMutation.isPending}
              data-testid="button-fetch-shop"
            >
              {fetchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {t("shopView.loadProducts")}
            </Button>

            {data && (
              <Badge variant="secondary" className="text-xs" data-testid="text-product-count">
                {filteredItems.length} / {data.preview.length} {t("shopView.products")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
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
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showFilters && data && (
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
                </SelectContent>
              </Select>
            </div>

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
                  <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
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

            {fieldMapping && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{t("shopView.detectedFields")}</span>
                  </div>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    {fieldMapping.name && <div>Názov: <span className="font-mono">{fieldMapping.name}</span></div>}
                    {fieldMapping.price && <div>Cena: <span className="font-mono">{fieldMapping.price}</span></div>}
                    {fieldMapping.sku && <div>SKU: <span className="font-mono">{fieldMapping.sku}</span></div>}
                    {fieldMapping.category && <div>Kategória: <span className="font-mono">{fieldMapping.category}</span></div>}
                    {fieldMapping.brand && <div>Značka: <span className="font-mono">{fieldMapping.brand}</span></div>}
                    {fieldMapping.stock && <div>Sklad: <span className="font-mono">{fieldMapping.stock}</span></div>}
                    {fieldMapping.color && <div>Farba: <span className="font-mono">{fieldMapping.color}</span></div>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!data && !fetchMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 p-8" data-testid="text-shop-empty">
              <Store className="h-16 w-16 opacity-20" />
              <div className="text-center space-y-2">
                <h2 className="text-lg font-medium text-foreground">{t("shopView.title")}</h2>
                <p className="text-sm max-w-md">
                  {t("shopView.emptyDesc")}
                </p>
              </div>
            </div>
          )}

          {fetchMutation.isPending && (
            <div className="p-4">
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

          {data && !fetchMutation.isPending && (
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
                        const imageUrl = detectImageValue(item, data.fields);
                        const name = fieldMapping?.name ? item[fieldMapping.name] : null;
                        const price = fieldMapping?.price ? item[fieldMapping.price] : null;
                        const sku = fieldMapping?.sku ? item[fieldMapping.sku] : null;
                        const category = fieldMapping?.category ? item[fieldMapping.category] : null;
                        const brand = fieldMapping?.brand ? item[fieldMapping.brand] : null;
                        const stock = fieldMapping?.stock ? item[fieldMapping.stock] : null;
                        const color = fieldMapping?.color ? item[fieldMapping.color] : null;

                        return (
                          <Card
                            key={idx}
                            className="overflow-hidden group hover:shadow-md transition-shadow cursor-default"
                            data-testid={`card-product-${idx}`}
                          >
                            <div className="relative aspect-square bg-muted/50 flex items-center justify-center overflow-hidden">
                              {imageUrl && !imgErrors.has(idx) ? (
                                <img
                                  src={imageUrl}
                                  alt={name || "Product"}
                                  className="w-full h-full object-contain p-2"
                                  loading="lazy"
                                  onError={() => handleImageError(idx)}
                                />
                              ) : (
                                <Box className="h-8 w-8 text-muted-foreground/20" />
                              )}
                              {stock !== null && stock !== undefined && stock !== "" && (
                                <Badge
                                  variant={Number(stock) > 0 ? "default" : "secondary"}
                                  className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0"
                                >
                                  {Number(stock) > 0 ? `${stock} ks` : "0"}
                                </Badge>
                              )}
                            </div>
                            <CardContent className="p-2.5 space-y-1">
                              <p className="text-xs font-medium line-clamp-2 leading-tight min-h-[2rem]" data-testid={`text-product-name-${idx}`}>
                                {name || t("shopView.noName")}
                              </p>
                              {sku && (
                                <p className="text-[10px] text-muted-foreground font-mono truncate" data-testid={`text-product-sku-${idx}`}>
                                  {sku}
                                </p>
                              )}
                              {brand && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  {brand}
                                </Badge>
                              )}
                              {category && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {category}
                                </p>
                              )}
                              {color && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {color}
                                </p>
                              )}
                              {price !== null && price !== undefined && price !== "" && (
                                <p className="text-sm font-bold" data-testid={`text-product-price-${idx}`}>
                                  {formatPrice(price)}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paginatedItems.map((item, idx) => {
                        const imageUrl = detectImageValue(item, data.fields);
                        const name = fieldMapping?.name ? item[fieldMapping.name] : null;
                        const price = fieldMapping?.price ? item[fieldMapping.price] : null;
                        const sku = fieldMapping?.sku ? item[fieldMapping.sku] : null;
                        const category = fieldMapping?.category ? item[fieldMapping.category] : null;
                        const brand = fieldMapping?.brand ? item[fieldMapping.brand] : null;
                        const stock = fieldMapping?.stock ? item[fieldMapping.stock] : null;
                        const desc = fieldMapping?.description ? item[fieldMapping.description] : null;
                        const color = fieldMapping?.color ? item[fieldMapping.color] : null;

                        return (
                          <Card
                            key={idx}
                            className="p-3 hover:shadow-sm transition-shadow"
                            data-testid={`card-product-${idx}`}
                          >
                            <div className="flex gap-3">
                              <div className="w-20 h-20 rounded bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {imageUrl && !imgErrors.has(idx + 10000) ? (
                                  <img
                                    src={imageUrl}
                                    alt={name || "Product"}
                                    className="w-full h-full object-contain p-1"
                                    loading="lazy"
                                    onError={() => handleImageError(idx + 10000)}
                                  />
                                ) : (
                                  <Box className="h-6 w-6 text-muted-foreground/20" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate" data-testid={`text-product-name-${idx}`}>
                                      {name || t("shopView.noName")}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {sku && (
                                        <span className="text-[10px] text-muted-foreground font-mono" data-testid={`text-product-sku-${idx}`}>
                                          {sku}
                                        </span>
                                      )}
                                      {brand && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                                          {brand}
                                        </Badge>
                                      )}
                                      {category && (
                                        <span className="text-[10px] text-muted-foreground">{category}</span>
                                      )}
                                      {color && (
                                        <span className="text-[10px] text-muted-foreground">{color}</span>
                                      )}
                                    </div>
                                    {desc && (
                                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                                        {desc}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    {price !== null && price !== undefined && price !== "" && (
                                      <p className="text-sm font-bold whitespace-nowrap" data-testid={`text-product-price-${idx}`}>
                                        {formatPrice(price)}
                                      </p>
                                    )}
                                    {stock !== null && stock !== undefined && stock !== "" && (
                                      <Badge
                                        variant={Number(stock) > 0 ? "default" : "secondary"}
                                        className="text-[9px] px-1.5 py-0"
                                      >
                                        {Number(stock) > 0 ? `${stock} ks` : "0 ks"}
                                      </Badge>
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
                    <div className="flex items-center justify-center gap-2 py-4" data-testid="pagination-shop">
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
                  )}
                </div>
              )}
            </>
          )}

          {data && data.error && (
            <div className="p-4">
              <Card className="border-destructive/50 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{data.error}</p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
