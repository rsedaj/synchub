import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { MODULE_HELP } from "@/lib/module-help-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Save,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plug,
  Database,
  ExternalLink,
  FileText,
  Zap,
  Eye,
  EyeOff,
  Key,
  HelpCircle,
  Globe,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import type { ApiModule, SyncLog } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

interface ConfigFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder: string;
  required?: boolean;
  helpText?: string;
}

const MODULE_CONFIG_FIELDS: Record<string, ConfigFieldDef[]> = {
  ONIX: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "token" },
    { key: "swaggerUrl", label: "Swagger URL", type: "url", placeholder: "http://195.146.148.139/onix_api/swagger/ui/index" },
    { key: "apiToken", label: "API Token", type: "password", placeholder: "Enter ONIX API token", required: true, helpText: "Authentication token for ONIX API" },
    { key: "databasePath", label: "Database Path", type: "text", placeholder: "C:\\ONIX\\DATABASE.NDB", required: true, helpText: "Cesta k ONIX databáze na serveri (header DatabasePath). Poskytne vám ju Kros a.s." },
    { key: "defaultStock", label: "Cieľový sklad (Default_Stock)", type: "text", placeholder: "SYN", helpText: "Kód skladu v ONIX, do ktorého sa synchronizujú nové skladové karty. Predvolené: SYN (Sklad_SyncHub). Overené kódy: SYN, SK1, OPP, VOS, VZ, T" },
    { key: "companyId", label: "Company ID", type: "text", placeholder: "Enter company identifier", helpText: "ONIX company/database identifier" },
  ],
  PROMOTRON: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "api_key" },
    { key: "swaggerUrl", label: "Swagger URL", type: "url", placeholder: "https://api-ts-westeu.promotron.com/swagger/index.html" },
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Enter Promotron API key", required: true, helpText: "API key from Promotron admin panel" },
    { key: "shopId", label: "Shop ID", type: "text", placeholder: "Enter shop identifier", helpText: "Promotron shop/tenant ID" },
    { key: "xmlFeedUrl", label: "XML Feed URL", type: "url", placeholder: "https://shop.hauerland.sk/feed/...", required: false, helpText: "URL XML product feedu pre prezeranie produktov v Data Preview" },
  ],
  RAYNET: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "basic_api_key" },
    { key: "username", label: "Username", type: "text", placeholder: "vas@email.cz", required: true, helpText: "Prihlasovacie meno do Raynet CRM" },
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Enter Raynet API key", required: true, helpText: "API kľúč z Raynet → Nastavenia → API" },
    { key: "instanceName", label: "Instance Name", type: "text", placeholder: "nazov-firmy", required: true, helpText: "Názov inštancie z URL vášho Raynet účtu (napr. 'sedaj')" },
  ],
  PIPEDRIVE: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "api_key" },
    { key: "apiToken", label: "API Token", type: "password", placeholder: "Enter Pipedrive API token", required: true, helpText: "Personal API token from Pipedrive Settings > API" },
    { key: "companyDomain", label: "Company Domain", type: "text", placeholder: "yourcompany", helpText: "Pipedrive subdomain (e.g. 'hauerland')" },
  ],
  GIVING: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "bearer_token" },
    { key: "apiBaseUrl", label: "API Base URL", type: "url", placeholder: "https://debtorapi-sandbox.givingeurope.com", helpText: "Sandbox alebo production API URL" },
    { key: "apiToken", label: "API Token (Sandbox)", type: "password", placeholder: "Enter sandbox bearer token", required: true, helpText: "Bearer token pre sandbox prostredie" },
    { key: "apiTokenProd", label: "API Token (Production)", type: "password", placeholder: "Enter production bearer token", helpText: "Bearer token pre produkčné prostredie (hau-web)" },
    { key: "environment", label: "Active Environment", type: "text", placeholder: "sandbox", helpText: "sandbox alebo production" },
  ],
  MID: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "api_key" },
    { key: "apiKey", label: "API Key (Production)", type: "password", placeholder: "Enter Midocean REST API key", required: true, helpText: "Production API key z midocean.com → Account → Customer API" },
    { key: "language", label: "Jazyk produktov", type: "text", placeholder: "en", helpText: "Kód jazyka pre produktové dáta: en, de, es, fr, it, hu, nl, pl, pt, ro, ru, sv, no, cs, da, fi" },
  ],
  STICKER: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "access_key" },
    { key: "accessKey", label: "Access Key", type: "password", placeholder: "Enter Stricker Europe Access Key", required: true, helpText: "Prístupový kľúč od obchodného manažéra Stricker Europe" },
    { key: "language", label: "Jazyk dát", type: "text", placeholder: "SK", helpText: "Kód jazyka: SK, CZ, EN, DE, FR, IT, ES, PT, PL, NL, HU, RO, RU, BG, HR, DK, FI, GR, NO, RS, SE, UA" },
  ],
  MACMA: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "JSON" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "feed_url" },
    { key: "skuFeedUrl", label: "SKU Feed URL", type: "url", placeholder: "https://macma.sk/api/v2/.../sk/sku.json", required: true, helpText: "JSON feed URL for product SKU data (3 169 products)" },
    { key: "pricelistFeedUrl", label: "Pricelist Feed URL", type: "url", placeholder: "https://macma.sk/api/v2/.../sk/pricelist.json", helpText: "JSON feed URL for pricelist data" },
    { key: "stockFeedUrl", label: "Stock Feed URL", type: "url", placeholder: "https://macma.sk/api/v2/.../sk/stock.json", helpText: "JSON feed URL for stock data (local/regional/international)" },
  ],
  XDCONNECT: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "data_feed" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "feed_url" },
    { key: "feedFormat", label: "Formát feedov", type: "text", placeholder: "XML/CSV/JSON", helpText: "Auto-detekcia formátu (XML, CSV tab-separated, JSON). Excel nie je podporovaný." },
    { key: "productFeedUrl", label: "Product Data V5 URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V5.ProductData", required: true, helpText: "Zákaznícky špecifický link — 100+ atribútov, aktualizácia každú hodinu" },
    { key: "pricesFeedUrl", label: "Product Prices V2 URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V2.ProductPrices", helpText: "6-stupňové tier ceny (net + gross), aktualizácia denne o 00:00" },
    { key: "printDataFeedUrl", label: "Print Data V3 URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V3.PrintData", helpText: "Potlačové techniky, pozície, printing coordinates (VRP), denne o 02:00" },
    { key: "printPricesFeedUrl", label: "Print Prices V3 URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V3.PrintPrices", helpText: "Ceny potlače, setup, sample, small order charge, VDP, denne o 00:00" },
    { key: "stockFeedUrl", label: "Stock V2 URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V2.Stock", helpText: "Aktuálne zásoby + 2 budúce dodávky, aktualizácia každých 15 minút" },
    { key: "combinedFeedUrl", label: "Combined Data V5 URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V5.AllData", helpText: "Kombinácia všetkých 5 feedov (len default print option + zjednodušené ceny)" },
  ],
  ANDA: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "XML/CSV" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "feed_id" },
    { key: "xmlFeedId", label: "XML Feed ID", type: "password", placeholder: "Enter unique XML Feed ID", required: true, helpText: "Unikátne ID pre XML feedy od Anda Present (poskytnú po aktivácii)" },
    { key: "csvFeedId", label: "CSV Feed ID", type: "password", placeholder: "Enter unique CSV Feed ID", helpText: "Odlišné ID pre CSV feedy (voliteľné)" },
    { key: "language", label: "Jazyk dát", type: "text", placeholder: "sk", helpText: "Kód jazyka: sk, cz, en, de, hu, it, fr, nl, pl, ro, no, se, dk, fi, gr, si, bg, es, pt" },
  ],
  EASYGIFTS: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "JSON" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "feed_url" },
    { key: "skuFeedUrl", label: "SKU Feed URL", type: "url", placeholder: "https://easygifts.sk/api/v2/.../sk/sku.json", required: true, helpText: "JSON feed URL for product SKU data (13 400+ products)" },
    { key: "pricelistFeedUrl", label: "Pricelist Feed URL", type: "url", placeholder: "https://easygifts.sk/api/v2/.../sk/pricelist.json", helpText: "JSON feed URL for pricelist data" },
    { key: "stockFeedUrl", label: "Stock Feed URL", type: "url", placeholder: "https://easygifts.sk/api/v2/.../sk/stock.json", helpText: "JSON feed URL for stock data (local/regional/international)" },
  ],
  PFCONCEPT: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "XML" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "credentials" },
    { key: "username", label: "Username", type: "text", placeholder: "production@hauerland.sk", required: true, helpText: "PF Concept Data Feeds Gateway login email" },
    { key: "password", label: "Password", type: "password", placeholder: "Enter password", required: true, helpText: "PF Concept Data Feeds Gateway password" },
    { key: "productFeedUrl", label: "Product Feed URL", type: "url", placeholder: "http://www.pfconcept.com/portal/datafeed/productfeed_cz_v3.xml", required: true, helpText: "XML Product Feed v3 — katalóg produktov (~5 000+ modelov)" },
    { key: "priceFeedUrl", label: "Price Feed URL", type: "url", placeholder: "http://www.pfconcept.com/portal/datafeed/pricefeed_..._v3.xml", helpText: "XML Price Feed v3 — individuálny cenník (unikátny kód)" },
    { key: "printPriceFeedUrl", label: "Print Price Feed URL", type: "url", placeholder: "http://www.pfconcept.com/portal/datafeed/printpricefeed_..._v3.xml", helpText: "XML Print Price Feed v3 — ceny potlačových techník" },
    { key: "stockFeedUrl", label: "Stock Feed URL", type: "url", placeholder: "http://www.pfconcept.com/portal/datafeed/stockfeed_..._v3.xml", required: true, helpText: "XML Stock Feed v3 — skladové zásoby (2× denne)" },
  ],
};

function ImageCell({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="text-xs truncate block">{url.length > 40 ? url.substring(0, 40) + "..." : url}</span>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt={alt}
        className="h-10 w-10 object-contain rounded border"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`${testId}-toggle`}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

interface ConnectionTestResult {
  success: boolean;
  statusCode?: number;
  responseTime: number;
  message: string;
}

interface DataPreviewResult {
  success: boolean;
  source: string;
  recordCount: number;
  fields: string[];
  preview: Record<string, any>[];
  error?: string;
  fetchedAt: string;
}

function SyncStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500",
    disconnected: "bg-gray-400 dark:bg-gray-600",
    error: "bg-red-500",
    configuring: "bg-yellow-500",
  };
  return (
    <span className={`h-2.5 w-2.5 rounded-full inline-block ${colors[status] || colors.disconnected}`} />
  );
}

export default function ModuleDetailPage() {
  const [, params] = useRoute("/modules/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const moduleId = params?.id;

  const { data: mod, isLoading } = useQuery<ApiModule>({
    queryKey: ["/api/modules", moduleId],
    enabled: !!moduleId,
  });

  const { data: syncLogs } = useQuery<SyncLog[]>({
    queryKey: ["/api/sync-logs"],
    select: (logs) => logs.filter(l => l.moduleId === moduleId).slice(0, 20),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [status, setStatus] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [dataPreview, setDataPreview] = useState<DataPreviewResult | null>(null);
  const [dataSource, setDataSource] = useState<string>("");
  const [rowLimit, setRowLimit] = useState<number>(50);
  const [showImages, setShowImages] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [visibleColumns, setVisibleColumns] = useState<number>(0);
  const rowsPerPage = rowLimit;
  const rowLimitRef = useRef(rowLimit);
  const dataSourceRef = useRef(dataSource);
  rowLimitRef.current = rowLimit;
  dataSourceRef.current = dataSource;

  useEffect(() => {
    if (mod) {
      setName(mod.name);
      setDescription(mod.description || "");
      setBaseUrl(mod.baseUrl || "");
      setStatus(mod.status);
      const cfg = (mod.config as Record<string, any>) || {};
      const vals: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        vals[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      setConfigValues(vals);
    }
  }, [mod]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ApiModule>) => {
      const res = await apiRequest("PATCH", `/api/modules/${moduleId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/modules", moduleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: t("moduleDetail.saved"), description: t("moduleDetail.savedDesc") });
    },
    onError: (err: any) => {
      toast({ title: t("moduleDetail.saveFailed"), description: err.message, variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/modules/${moduleId}/test-connection`);
      return res.json();
    },
    onSuccess: (data: ConnectionTestResult) => {
      setConnectionResult(data);
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
        queryClient.invalidateQueries({ queryKey: ["/api/modules", moduleId] });
      }
    },
    onError: (err: any) => {
      setConnectionResult({
        success: false,
        responseTime: 0,
        message: err.message,
      });
    },
  });

  const fetchDataMutation = useMutation({
    mutationFn: async () => {
      const limit = rowLimitRef.current;
      const source = dataSourceRef.current;
      const sourceParam = source ? `&source=${source}` : "";
      const res = await apiRequest("GET", `/api/modules/${moduleId}/data-preview?limit=${limit}${sourceParam}`);
      return res.json();
    },
    onSuccess: (data: DataPreviewResult) => {
      setDataPreview(data);
      setCurrentPage(1);
    },
    onError: (err: any) => {
      setDataPreview({
        success: false,
        source: mod?.code || "",
        recordCount: 0,
        fields: [],
        preview: [],
        error: err.message,
        fetchedAt: new Date().toISOString(),
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ name, description, baseUrl, status: status as any, config: configValues });
  };

  const updateConfigValue = (key: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] rounded-lg" />
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("moduleDetail.moduleNotFound")}</p>
      </div>
    );
  }

  const config = mod.config as Record<string, any>;
  const dataFields = (mod.dataFields as string[]) || [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/modules")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-module-name">
              {mod.sortOrder.toString().padStart(2, "0")}. {mod.name}
            </h1>
            <Badge variant="outline">{mod.code}</Badge>
            <StatusDot status={mod.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mod.description}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">{t("moduleDetail.overview")}</TabsTrigger>
          <TabsTrigger value="data" data-testid="tab-data">{t("moduleDetail.dataPreview")}</TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">{t("moduleDetail.configuration")}</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">{t("moduleDetail.syncHistory")}</TabsTrigger>
          <TabsTrigger value="help" data-testid="tab-help">{t("moduleDetail.help")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">{t("moduleDetail.connection")}</h2>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("moduleDetail.status")}</span>
                    <div className="flex items-center gap-2">
                      <StatusDot status={mod.status} />
                      <span className="text-sm capitalize">{mod.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("moduleDetail.apiType")}</span>
                    <span className="text-sm">{config?.apiType || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("moduleDetail.authType")}</span>
                    <span className="text-sm">{config?.authType || "N/A"}</span>
                  </div>
                  {mod.baseUrl && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{t("moduleDetail.baseUrl")}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{mod.baseUrl}</span>
                    </div>
                  )}
                  {mod.docsUrl && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{t("moduleDetail.documentation")}</span>
                      <a
                        href={mod.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-docs"
                      >
                        {t("moduleDetail.open")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>

                <div className="pt-2 space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => testConnectionMutation.mutate()}
                    disabled={testConnectionMutation.isPending}
                    data-testid="button-test-connection"
                  >
                    {testConnectionMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    {t("moduleDetail.testConnection")}
                  </Button>

                  {connectionResult && (
                    <div className={`flex items-start gap-3 p-3 rounded-md text-sm ${
                      connectionResult.success
                        ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                        : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300"
                    }`}>
                      {connectionResult.success ? (
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium">{connectionResult.message}</p>
                        <p className="text-xs mt-0.5 opacity-75">
                          {t("moduleDetail.responseTime")}: {connectionResult.responseTime}ms
                          {connectionResult.statusCode ? ` | HTTP ${connectionResult.statusCode}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">{t("moduleDetail.dataFields")}</h2>
                </div>
              </CardHeader>
              <CardContent>
                {dataFields.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <Database className="h-6 w-6 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">{t("moduleDetail.noDataFields")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {config?.note || t("moduleDetail.waitingDocs")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dataFields.map((field: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-md text-sm"
                        data-testid={`field-${i}`}
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-foreground/30 flex-shrink-0" />
                        <span>{field}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">{t("moduleDetail.liveDataPreview")}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const sources: Record<string, { value: string; label: string }[]> = {
                      ONIX: [
                        { value: "auto", label: "Auto (Skladové karty)" },
                        { value: "stockitems", label: "Skladové karty" },
                        { value: "stocks", label: "Sklady" },
                        { value: "balances", label: "Stav zásob" },
                        { value: "partners", label: "Partneri" },
                        { value: "catalogprices", label: "Cenníky" },
                        { value: "stockitemgroups", label: "Skupiny kariet" },
                        { value: "documents", label: "Typy dokladov" },
                      ],
                      PROMOTRON: [
                        { value: "auto", label: "Auto (API / Feed)" },
                        { value: "api", label: "REST API (Orders)" },
                        { value: "feed", label: "XML Feed (Products)" },
                      ],
                      RAYNET: [
                        { value: "auto", label: "Auto (Companies)" },
                        { value: "company", label: "Klienti (Companies)" },
                        { value: "person", label: "Kontakty (Persons)" },
                        { value: "businessCase", label: "Obch. prípady (Deals)" },
                        { value: "lead", label: "Leady" },
                        { value: "activity", label: "Aktivity" },
                        { value: "invoice", label: "Faktúry" },
                        { value: "product", label: "Produkty" },
                      ],
                      PIPEDRIVE: [
                        { value: "auto", label: "Auto (Deals)" },
                        { value: "deals", label: "Deals" },
                        { value: "persons", label: "Contacts" },
                        { value: "organizations", label: "Organizations" },
                        { value: "activities", label: "Activities" },
                        { value: "leads", label: "Leads" },
                        { value: "products", label: "Products" },
                      ],
                      ANDA: [
                        { value: "auto", label: "Auto (Products XML)" },
                        { value: "products", label: "Products (XML)" },
                        { value: "prices", label: "Prices (XML)" },
                        { value: "inventories", label: "Inventory / Stocks (XML)" },
                        { value: "labeling", label: "Labeling Info (XML)" },
                        { value: "categories", label: "Categories (XML)" },
                        { value: "labeling-prices", label: "Labeling Prices (XML)" },
                        { value: "unique-prices", label: "Unique Prices (XML)" },
                        { value: "products-csv", label: "Products (CSV)" },
                        { value: "prices-csv", label: "Prices (CSV)" },
                      ],
                      MID: [
                        { value: "auto", label: "Auto (Products)" },
                        { value: "products", label: "Products v2.0" },
                        { value: "stock", label: "Stock Levels" },
                        { value: "pricelist", label: "Pricelist (ceny)" },
                        { value: "printdata", label: "Print Data" },
                        { value: "printpricelist", label: "Print Pricelist" },
                      ],
                      XDCONNECT: [
                        { value: "auto", label: "Auto (Product Data)" },
                        { value: "products", label: "Product Data V5" },
                        { value: "prices", label: "Product Prices V2" },
                        { value: "printdata", label: "Print Data V3" },
                        { value: "printprices", label: "Print Prices V3" },
                        { value: "stock", label: "Stock V2" },
                        { value: "combined", label: "Combined Data V5" },
                      ],
                      EASYGIFTS: [
                        { value: "sku", label: "SKU (Products)" },
                        { value: "pricelist", label: "Pricelist (ceny)" },
                        { value: "stock", label: "Stock (sklady)" },
                      ],
                      MACMA: [
                        { value: "sku", label: "SKU (Products)" },
                        { value: "pricelist", label: "Pricelist (ceny)" },
                        { value: "stock", label: "Stock (sklady)" },
                      ],
                      PFCONCEPT: [
                        { value: "products", label: "Product Feed (katalóg)" },
                        { value: "prices", label: "Price Feed (cenník)" },
                        { value: "printprices", label: "Print Price Feed (potlač)" },
                        { value: "stock", label: "Stock Feed (sklady)" },
                      ],
                      STICKER: [
                        { value: "auto", label: "Auto (Products)" },
                        { value: "products", label: "Products" },
                        { value: "optionals", label: "Optionals (SKUs)" },
                        { value: "optionalscomplete", label: "Optionals Complete" },
                        { value: "stocks", label: "Stocks" },
                        { value: "stocksPt", label: "Stocks PT" },
                        { value: "stocksCz", label: "Stocks CZ" },
                        { value: "colors", label: "Colors" },
                        { value: "customizationOptions", label: "Customization Options" },
                        { value: "customizationTables", label: "Customization Tables" },
                        { value: "producttypes", label: "Product Types" },
                        { value: "catalogprices", label: "Catalog Prices" },
                      ],
                    };
                    const options = sources[mod.code];
                    if (!options) return null;
                    return (
                      <Select value={dataSource || "auto"} onValueChange={(v) => setDataSource(v === "auto" ? "" : v)}>
                        <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-data-source">
                          <SelectValue placeholder={t("moduleDetail.dataSource")} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} data-testid={`option-source-${opt.value}`}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                  <Select value={String(rowLimit)} onValueChange={(v) => setRowLimit(Number(v))}>
                    <SelectTrigger className="h-8 w-[110px] text-xs" data-testid="select-row-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="100">100 rows</SelectItem>
                      <SelectItem value="200">200 rows</SelectItem>
                      <SelectItem value="500">500 rows</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant={showImages ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowImages(!showImages)}
                    data-testid="button-toggle-images"
                    className="gap-1.5"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="text-xs">{showImages ? "IMG ON" : "IMG OFF"}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchDataMutation.mutate()}
                    disabled={fetchDataMutation.isPending}
                    data-testid="button-fetch-data"
                  >
                    {fetchDataMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                    ) : (
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-2" />
                    )}
                    {t("moduleDetail.fetchData")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!dataPreview && !fetchDataMutation.isPending && (
                <div className="flex flex-col items-center py-16 text-center">
                  <Database className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("moduleDetail.noDataLoaded")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("moduleDetail.clickFetch")}
                  </p>
                </div>
              )}

              {fetchDataMutation.isPending && (
                <div className="flex flex-col items-center py-16 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{t("moduleDetail.fetchingData")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("moduleDetail.mayTakeMoment")}</p>
                </div>
              )}

              {dataPreview && !fetchDataMutation.isPending && (
                <>
                  {!dataPreview.success ? (
                    <div className="flex items-start gap-3 p-4 rounded-md bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
                      <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{t("moduleDetail.failedFetch")}</p>
                        <p className="text-xs mt-1">{dataPreview.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const totalRows = dataPreview.preview.length;
                        const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
                        const safeCurrentPage = Math.min(currentPage, totalPages);
                        const startIdx = (safeCurrentPage - 1) * rowsPerPage;
                        const endIdx = Math.min(startIdx + rowsPerPage, totalRows);
                        const pageRows = dataPreview.preview.slice(startIdx, endIdx);

                        const isImageUrl = (val: string) => {
                          if (!val) return false;
                          const lower = val.toLowerCase();
                          return (lower.startsWith("http://") || lower.startsWith("https://")) &&
                            (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(lower) ||
                             /\/image\//i.test(lower) ||
                             /cdn.*\.(com|net|org)/i.test(lower));
                        };

                        return (
                          <>
                            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">{t("moduleDetail.totalRecords")}</span>
                                  <span className="font-medium" data-testid="text-record-count">
                                    {dataPreview.recordCount.toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">{t("moduleDetail.fields")}</span>
                                  <span className="font-medium">{dataPreview.fields.length}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">{t("moduleDetail.fetched")}</span>
                                  <span className="font-medium">{totalRows} {t("moduleDetail.rows")}</span>
                                </div>
                              </div>
                              {totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {startIdx + 1}–{endIdx} z {totalRows}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={safeCurrentPage <= 1}
                                    onClick={() => setCurrentPage(safeCurrentPage - 1)}
                                    data-testid="button-prev-page"
                                  >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                  </Button>
                                  <span className="text-xs font-medium min-w-[60px] text-center">
                                    {safeCurrentPage} / {totalPages}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={safeCurrentPage >= totalPages}
                                    onClick={() => setCurrentPage(safeCurrentPage + 1)}
                                    data-testid="button-next-page"
                                  >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            {(() => {
                              const allFields = dataPreview.fields;
                              const colLimit = visibleColumns > 0 ? visibleColumns : allFields.length;
                              const displayFields = allFields.slice(0, colLimit);
                              const hiddenCount = allFields.length - displayFields.length;

                              return (
                                <div className="space-y-2">
                                  {allFields.length > 10 && (
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-muted-foreground">{t("moduleDetail.columns")}</span>
                                      <div className="flex gap-1">
                                        {[10, 20, 30, 50].filter(n => n < allFields.length).map(n => (
                                          <Button
                                            key={n}
                                            variant={colLimit === n ? "default" : "outline"}
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => setVisibleColumns(n)}
                                            data-testid={`button-cols-${n}`}
                                          >
                                            {n}
                                          </Button>
                                        ))}
                                        <Button
                                          variant={visibleColumns === 0 ? "default" : "outline"}
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => setVisibleColumns(0)}
                                          data-testid="button-cols-all"
                                        >
                                          All ({allFields.length})
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                  <div className="overflow-x-auto border rounded-md">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-12 text-xs sticky left-0 bg-background z-10 border-r">#</TableHead>
                                          {displayFields.map((field) => (
                                            <TableHead key={field} className="text-xs whitespace-nowrap px-3">
                                              {field}
                                            </TableHead>
                                          ))}
                                          {hiddenCount > 0 && (
                                            <TableHead className="text-xs text-muted-foreground whitespace-nowrap px-3">
                                              +{hiddenCount} {t("moduleDetail.more")}
                                            </TableHead>
                                          )}
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {pageRows.map((row, i) => (
                                          <TableRow key={startIdx + i} data-testid={`row-preview-${startIdx + i}`}>
                                            <TableCell className="text-xs text-muted-foreground sticky left-0 bg-background z-10 border-r">{startIdx + i + 1}</TableCell>
                                            {displayFields.map((field) => {
                                              const val = row[field];
                                              const display = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
                                              const isImg = showImages && typeof display === "string" && isImageUrl(display);
                                              return (
                                                <TableCell key={field} className="text-xs max-w-[250px] px-3" title={display}>
                                                  {isImg ? (
                                                    <ImageCell url={display} alt={field} />
                                                  ) : (
                                                    <span className="truncate block">{display}</span>
                                                  )}
                                                </TableCell>
                                              );
                                            })}
                                            {hiddenCount > 0 && (
                                              <TableCell className="text-xs text-muted-foreground">...</TableCell>
                                            )}
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              );
                            })()}

                            {totalPages > 1 && (
                              <div className="flex items-center justify-between pt-1">
                                <p className="text-xs text-muted-foreground">
                                  Fetched at {new Date(dataPreview.fetchedAt).toLocaleString()}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    Page {safeCurrentPage} / {totalPages}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={safeCurrentPage <= 1}
                                    onClick={() => setCurrentPage(safeCurrentPage - 1)}
                                    data-testid="button-prev-page-bottom"
                                  >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={safeCurrentPage >= totalPages}
                                    onClick={() => setCurrentPage(safeCurrentPage + 1)}
                                    data-testid="button-next-page-bottom"
                                  >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}

                            {totalPages <= 1 && (
                              <p className="text-xs text-muted-foreground">
                                Fetched at {new Date(dataPreview.fetchedAt).toLocaleString()}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-medium">{t("moduleDetail.generalSettings")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mod-name">{t("moduleDetail.name")}</Label>
                  <Input
                    id="mod-name"
                    data-testid="input-module-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mod-status">{t("moduleDetail.status")}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger data-testid="select-module-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="connected">{t("moduleDetail.statusConnected")}</SelectItem>
                      <SelectItem value="disconnected">{t("moduleDetail.statusDisconnected")}</SelectItem>
                      <SelectItem value="configuring">{t("moduleDetail.statusConfiguring")}</SelectItem>
                      <SelectItem value="error">{t("moduleDetail.statusError")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mod-url">{t("moduleDetail.baseUrl")}</Label>
                <Input
                  id="mod-url"
                  data-testid="input-module-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mod-desc">{t("moduleDetail.description")}</Label>
                <Textarea
                  id="mod-desc"
                  data-testid="input-module-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">{t("moduleDetail.apiCredentials")}</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("moduleDetail.apiCredentialsDesc")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const fields = MODULE_CONFIG_FIELDS[mod?.code || ""] || [];
                if (fields.length === 0) {
                  return (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Key className="h-6 w-6 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">{t("moduleDetail.noConfigSchema")}</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    {fields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`cfg-${field.key}`}>
                            {field.label}
                            {field.required && <span className="text-red-500 ml-0.5">*</span>}
                          </Label>
                        </div>
                        {field.type === "password" ? (
                          <PasswordField
                            value={configValues[field.key] || ""}
                            onChange={(val) => updateConfigValue(field.key, val)}
                            placeholder={field.placeholder}
                            testId={`input-config-${field.key}`}
                          />
                        ) : (
                          <Input
                            id={`cfg-${field.key}`}
                            data-testid={`input-config-${field.key}`}
                            type={field.type === "url" ? "url" : "text"}
                            value={configValues[field.key] || ""}
                            onChange={(e) => updateConfigValue(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        )}
                        {field.helpText && (
                          <p className="text-xs text-muted-foreground">{field.helpText}</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-module"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("moduleDetail.saveChanges")}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">{t("moduleDetail.syncHistory")}</h2>
              </div>
            </CardHeader>
            <CardContent>
              {!syncLogs || syncLogs.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <ArrowLeftRight className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("moduleDetail.noSyncHistory")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("moduleDetail.syncWillAppear")}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {syncLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-md"
                      data-testid={`row-sync-${log.id}`}
                    >
                      <SyncStatusIcon status={log.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {log.direction === "import" ? (
                            <ArrowDownToLine className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ArrowUpFromLine className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="text-sm capitalize">{log.direction}</span>
                          <span className="text-xs text-muted-foreground">
                            {log.recordsProcessed} records
                            {(log.recordsFailed ?? 0) > 0 ? ` (${log.recordsFailed} failed)` : ""}
                          </span>
                        </div>
                        {log.errorMessage && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            {log.errorMessage}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.startedAt
                          ? formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="help" className="space-y-4">
          {(() => {
            const help = MODULE_HELP[mod.code];
            if (!help) {
              return (
                <Card>
                  <CardContent className="py-12 text-center">
                    <HelpCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{t("moduleDetail.noHelp")}</p>
                  </CardContent>
                </Card>
              );
            }
            return (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-medium">{t("moduleDetail.aboutModule")}</h2>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm" data-testid="text-help-description">{help.description}</p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium">{t("moduleDetail.apiInfo")}</h2>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm" data-testid="text-help-api">{help.apiInfo}</p>
                      {help.endpoints && help.endpoints.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">{t("moduleDetail.endpoints")}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {help.endpoints.map((ep) => (
                              <Badge key={ep} variant="outline" className="text-xs font-mono">{ep}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium">{t("moduleDetail.authentication")}</h2>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm" data-testid="text-help-auth">{help.authInfo}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-medium">Data Fields</h2>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm" data-testid="text-help-fields">{help.dataFields}</p>
                  </CardContent>
                </Card>

                {help.notes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium">{t("moduleDetail.notes")}</h2>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-line" data-testid="text-help-notes">{help.notes}</p>
                    </CardContent>
                  </Card>
                )}

                {help.links && help.links.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium">{t("moduleDetail.usefulLinks")}</h2>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {help.links.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm hover:underline"
                            data-testid={`link-help-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {mod.docsUrl && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium">{t("moduleDetail.officialDocs")}</h2>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <a
                        href={mod.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:underline flex items-center gap-2"
                        data-testid="link-help-docs"
                      >
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        {mod.docsUrl}
                      </a>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
