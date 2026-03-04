import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ApiModule, SyncLog } from "@shared/schema";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

interface ConfigFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder: string;
  required?: boolean;
  helpText?: string;
}

interface HelpSection {
  title: string;
  content: string;
}

const MODULE_HELP: Record<string, { description: string; apiInfo: string; endpoints?: string[]; authInfo: string; dataFields: string; notes?: string; links?: { label: string; url: string }[] }> = {
  ONIX: {
    description: "Centrálny ERP systém ONIX od KROS. Slúži ako hlavný zdroj dát pre produkty, ceny, skladové zásoby a všetky ostatné moduly sa s ním synchronizujú.",
    apiInfo: "REST API dostupné na internom serveri (195.146.148.139). Swagger dokumentácia je dostupná priamo na serveri.",
    authInfo: "Autentifikácia cez API token v hlavičke požiadavky.",
    dataFields: "Stock Cards, Product Codes, Names, Descriptions, Prices (Purchase/Manager/Retail), Images, Stock Availability, Intrastat",
    links: [
      { label: "ONIX Web API Dokumentácia", url: "https://onix.kros.sk/externe-prepojenie/web-api-dokumentacia/" },
    ],
  },
  PROMOTRON: {
    description: "E-shop platforma TronShop od Promotron (shop.hauerland.sk). Kompletná správa objednávok, zákazníkov, košíkov, dopytov a produktového katalógu. Synchronizácia s ONIX ERP.",
    apiInfo: "TronShop REST API (v1) — 15 endpointov. API Key sa posiela v hlavičke každej požiadavky. Podporuje čítanie objednávok, zákazníkov, dopytov, košíkov, kupónov a produktov. Umožňuje zmenu stavu objednávok a platieb (single aj bulk). Navyše XML product feed (~99 000 produktov) na feed.hauerland.sk.",
    endpoints: [
      "GET /tronshop-api/orders",
      "GET /tronshop-api/orders/{orderGuid}",
      "POST /tronshop-api/orders/state",
      "POST /tronshop-api/orders/state/bulk",
      "GET /tronshop-api/customers",
      "GET /tronshop-api/customers/{personGuid}",
      "GET /tronshop-api/inquiries",
      "GET /tronshop-api/inquiries/{inquiryGuid}",
      "GET /tronshop-api/carts-v2",
      "GET /tronshop-api/carts-v2/{trackingId}",
      "GET /tronshop-api/carts",
      "GET /tronshop-api/coupons",
      "GET /tronshop-api/products",
      "POST /tronshop-api/payment-state",
      "POST /tronshop-api/payment-state/bulk",
    ],
    authInfo: "API Key autentifikácia — kľúč sa posiela v hlavičke (header). API key sa získava z administrácie e-shopu. XML Feed je verejne dostupný bez autentifikácie.",
    dataFields: "Orders (objednávky, stav, platba), Customers (zákazníci, kontakty), Inquiries (dopyty), Carts (košíky), Coupons (kupóny), Products (produktový katalóg), Payment States",
    notes: "API Base URL: https://api-ts-westeu.promotron.com\nXML Feed URL: https://feed.hauerland.sk/hau-feed.xml (RSS/Google Shopping formát, ~99 000 produktov)\n\nAPI umožňuje:\n- Čítanie zoznamu a detailov objednávok\n- Zmenu stavu objednávok (single aj bulk)\n- Zmenu stavu platieb (single aj bulk)\n- Čítanie zákazníkov a ich detailov\n- Čítanie dopytov a ich detailov\n- Čítanie otvorených košíkov (carts-v2)\n- Čítanie kupónov\n- Čítanie produktového katalógu",
    links: [
      { label: "TronShop API Swagger", url: "https://api-ts-westeu.promotron.com/swagger/index.html" },
      { label: "Promotron API Dokumentácia", url: "https://support.promotron.com/hc/en-us/articles/16618416323473-TronShop-API-access-reading-data-from-orders-inquiries-and-customers" },
      { label: "E-shop Hauerland", url: "https://shop.hauerland.sk" },
      { label: "XML Product Feed", url: "https://feed.hauerland.sk/hau-feed.xml" },
    ],
  },
  PIPEDRIVE: {
    description: "CRM systém Pipedrive pre správu obchodných príležitostí, kontaktov a aktivít. Synchronizácia s ONIX ERP.",
    apiInfo: "REST API v1. Plná integrácia pre deals, contacts, organizations a activities.",
    endpoints: ["Deals", "Contacts", "Organizations", "Activities"],
    authInfo: "API Token autentifikácia (Personal API token z Pipedrive Settings > API).",
    dataFields: "Deals, Contacts, Organizations, Activities",
    links: [
      { label: "Pipedrive API Dokumentácia", url: "https://developers.pipedrive.com/docs/api/v1" },
    ],
  },
  GIVING: {
    description: "Dodávateľ reklamných predmetov Giving Europe. Prístup cez Debtor API pre katalóg produktov, ceny, objednávky a skladové zásoby.",
    apiInfo: "REST Debtor API (v1). Podporuje sandbox aj production prostredie. API vracia lokalizované dáta (DE, EN, ES, FR, IT, NL, PT).",
    endpoints: ["/v1/products", "/v1/categories", "/v1/orders", "/v1/stock_levels", "/v1/print_methods", "/v1/print_handlings", "/v1/products/{code}/prices/breakdown"],
    authInfo: "Bearer Token autentifikácia. Dva tokeny: sandbox (hauerland) a production (hau-web). Aktívne prostredie sa prepína v konfigurácii.",
    dataFields: "Products (~1 600), Categories, Orders, Stock Levels, Print Methods, Print Handlings, Price Breakdowns",
    notes: "Sandbox URL: https://debtorapi-sandbox.givingeurope.com\nProduction URL: https://debtorapi.givingeurope.com\nObjednávky sú ešte v testovacej fáze (môžu sa meniť).",
    links: [
      { label: "API Dokumentácia (Swagger)", url: "https://debtorapi-sandbox.givingeurope.com/spec/index.html" },
      { label: "Giving Europe Web", url: "https://www.givingeurope.com/global/en/" },
    ],
  },
  MID: {
    description: "Dodávateľ Midocean. Produktový katalóg, cenníky a skladové zásoby cez REST API.",
    apiInfo: "REST API v2.0. Katalóg produktov s cenami a dostupnosťou.",
    authInfo: "API Key autentifikácia.",
    dataFields: "Product Code, Name, Description, Purchase/Manager/Retail Price, Image, Stock Availability, Intrastat",
    links: [
      { label: "Midocean", url: "https://www.midocean.com" },
    ],
  },
  STICKER: {
    description: "Dodávateľ Sticker. Produktový katalóg a cenníky cez webové služby.",
    apiInfo: "SOAP/REST API pre produktové dáta.",
    authInfo: "API Key autentifikácia.",
    dataFields: "Product Code, Name, Description, Prices, Image, Stock Availability, Intrastat",
  },
  MACMA: {
    description: "Dodávateľ Macma. Čaká sa na dokumentáciu a nastavenie integrácie.",
    apiInfo: "Typ API ešte nie je určený. Čaká sa na dokumentáciu od dodávateľa.",
    authInfo: "Zatiaľ neurčené.",
    dataFields: "Zatiaľ nedefinované",
    notes: "Integrácia bude nastavená po obdržaní API dokumentácie od dodávateľa.",
  },
  XDCONNECT: {
    description: "Dodávateľ XD Connect (XD Connects / Xindao). Produktové dáta a katalóg cez data feeds.",
    apiInfo: "Data feed formát (XML/CSV). Prístup cez prihlasovacie údaje.",
    authInfo: "Username/Password autentifikácia.",
    dataFields: "Product Code, Name, Description, Prices, Image, Stock Availability, Intrastat",
    links: [
      { label: "XD Connects", url: "https://www.xdconnects.com" },
    ],
  },
  ANDA: {
    description: "Dodávateľ Anda Present. Produktové dáta cez XML/CSV feedy.",
    apiInfo: "XML a CSV feedy pre produkty a cenníky. Feed URL sa konfiguruje v nastaveniach.",
    authInfo: "Priamy prístup cez feed URL (bez autentifikácie).",
    dataFields: "Product Code, Name, Description, Prices, Image, Stock Availability, Intrastat",
    links: [
      { label: "Anda Present", url: "https://andapresent.com" },
    ],
  },
  EASYGIFTS: {
    description: "Dodávateľ Easy Gifts. SKU a cenníkové XML feedy s automatickým prístupom.",
    apiInfo: "XML API v2. Dva hlavné feedy: SKU (produkty) a Pricelist (cenník). Feed obsahuje kompletné produktové dáta.",
    authInfo: "Priamy prístup cez feed URL s API kľúčom v URL.",
    dataFields: "Product Code, Name, Description, Prices, Image, Stock Availability, Intrastat",
    notes: "SKU Feed: https://easygifts.sk/api/v2/.../sku.xml\nPricelist Feed: https://easygifts.sk/api/v2/.../pricelist.xml",
    links: [
      { label: "Easy Gifts", url: "https://easygifts.sk" },
    ],
  },
  PFCONCEPT: {
    description: "Dodávateľ PF Concept. Produktové dáta cez data feeds gateway.",
    apiInfo: "Data feeds gateway pre produktovú synchronizáciu.",
    authInfo: "Username/Password autentifikácia pre prístup k feedom.",
    dataFields: "Product Code, Name, Description, Prices, Image, Stock Availability, Intrastat",
    links: [
      { label: "PF Concept Data Feeds", url: "https://www.pfconcept.com/cs_cz/data-feeds-gateway" },
    ],
  },
};

const MODULE_CONFIG_FIELDS: Record<string, ConfigFieldDef[]> = {
  ONIX: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "token" },
    { key: "swaggerUrl", label: "Swagger URL", type: "url", placeholder: "http://195.146.148.139/onix_api/swagger/ui/index" },
    { key: "apiToken", label: "API Token", type: "password", placeholder: "Enter ONIX API token", required: true, helpText: "Authentication token for ONIX API" },
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
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Enter Midocean API key", required: true, helpText: "API key from Midocean portal" },
  ],
  STICKER: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "SOAP/REST" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "api_key" },
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Enter Sticker API key", required: true },
    { key: "feedUrl", label: "Feed URL", type: "url", placeholder: "Enter feed URL" },
  ],
  MACMA: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "TBD" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "TBD" },
    { key: "note", label: "Note", type: "text", placeholder: "Waiting for documentation" },
  ],
  XDCONNECT: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "data_feed" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "credentials" },
    { key: "username", label: "Username", type: "text", placeholder: "Enter XD Connect username", required: true },
    { key: "password", label: "Password", type: "password", placeholder: "Enter password", required: true },
    { key: "feedUrl", label: "Data Feed URL", type: "url", placeholder: "Enter feed URL" },
  ],
  ANDA: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "XML/CSV" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "feed_url" },
    { key: "skuFeedUrl", label: "SKU Feed URL", type: "url", placeholder: "Enter SKU XML feed URL", required: true },
    { key: "pricelistFeedUrl", label: "Pricelist Feed URL", type: "url", placeholder: "Enter pricelist feed URL" },
  ],
  EASYGIFTS: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "XML" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "feed_url" },
    { key: "skuFeedUrl", label: "SKU Feed URL", type: "url", placeholder: "https://easygifts.sk/api/v2/.../sku.xml", required: true, helpText: "XML feed URL for product SKU data" },
    { key: "pricelistFeedUrl", label: "Pricelist Feed URL", type: "url", placeholder: "https://easygifts.sk/api/v2/.../pricelist.xml", helpText: "XML feed URL for pricelist data" },
  ],
  PFCONCEPT: [
    { key: "apiType", label: "API Type", type: "text", placeholder: "data_feed" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "credentials" },
    { key: "username", label: "Username", type: "text", placeholder: "Enter PF Concept username", required: true },
    { key: "password", label: "Password", type: "password", placeholder: "Enter password", required: true },
    { key: "feedUrl", label: "Data Feed URL", type: "url", placeholder: "Enter feed gateway URL" },
  ],
};

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
      toast({ title: "Module updated", description: "Changes saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
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
      const res = await apiRequest("GET", `/api/modules/${moduleId}/data-preview?limit=50`);
      return res.json();
    },
    onSuccess: (data: DataPreviewResult) => {
      setDataPreview(data);
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
        <p className="text-muted-foreground">Module not found</p>
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
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="data" data-testid="tab-data">Data Preview</TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">Configuration</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Sync History</TabsTrigger>
          <TabsTrigger value="help" data-testid="tab-help">Help</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">Connection</h2>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <div className="flex items-center gap-2">
                      <StatusDot status={mod.status} />
                      <span className="text-sm capitalize">{mod.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">API Type</span>
                    <span className="text-sm">{config?.apiType || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Auth Type</span>
                    <span className="text-sm">{config?.authType || "N/A"}</span>
                  </div>
                  {mod.baseUrl && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Base URL</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{mod.baseUrl}</span>
                    </div>
                  )}
                  {mod.docsUrl && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Documentation</span>
                      <a
                        href={mod.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-docs"
                      >
                        Open
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
                    Test Connection
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
                          Response time: {connectionResult.responseTime}ms
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
                  <h2 className="text-sm font-medium">Data Fields</h2>
                </div>
              </CardHeader>
              <CardContent>
                {dataFields.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <Database className="h-6 w-6 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">No data fields defined yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {config?.note || "Waiting for documentation"}
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
                  <h2 className="text-sm font-medium">Live Data Preview</h2>
                </div>
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
                  Fetch Data
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!dataPreview && !fetchDataMutation.isPending && (
                <div className="flex flex-col items-center py-16 text-center">
                  <Database className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No data loaded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "Fetch Data" to load a live preview from the API
                  </p>
                </div>
              )}

              {fetchDataMutation.isPending && (
                <div className="flex flex-col items-center py-16 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Fetching data from API...</p>
                  <p className="text-xs text-muted-foreground mt-1">This may take a moment</p>
                </div>
              )}

              {dataPreview && !fetchDataMutation.isPending && (
                <>
                  {!dataPreview.success ? (
                    <div className="flex items-start gap-3 p-4 rounded-md bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
                      <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Failed to fetch data</p>
                        <p className="text-xs mt-1">{dataPreview.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Total records:</span>
                          <span className="font-medium" data-testid="text-record-count">
                            {dataPreview.recordCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Fields:</span>
                          <span className="font-medium">{dataPreview.fields.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Showing:</span>
                          <span className="font-medium">{dataPreview.preview.length} rows</span>
                        </div>
                      </div>

                      <ScrollArea className="w-full">
                        <div className="min-w-[800px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12 text-xs">#</TableHead>
                                {dataPreview.fields.slice(0, 10).map((field) => (
                                  <TableHead key={field} className="text-xs whitespace-nowrap">
                                    {field}
                                  </TableHead>
                                ))}
                                {dataPreview.fields.length > 10 && (
                                  <TableHead className="text-xs">
                                    +{dataPreview.fields.length - 10} more
                                  </TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dataPreview.preview.map((row, i) => (
                                <TableRow key={i} data-testid={`row-preview-${i}`}>
                                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                  {dataPreview.fields.slice(0, 10).map((field) => {
                                    const val = row[field];
                                    const display = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
                                    return (
                                      <TableCell key={field} className="text-xs max-w-[200px] truncate" title={display}>
                                        {display}
                                      </TableCell>
                                    );
                                  })}
                                  {dataPreview.fields.length > 10 && (
                                    <TableCell className="text-xs text-muted-foreground">...</TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </ScrollArea>

                      <p className="text-xs text-muted-foreground">
                        Fetched at {new Date(dataPreview.fetchedAt).toLocaleString()}
                      </p>
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
              <h2 className="text-sm font-medium">General Settings</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mod-name">Name</Label>
                  <Input
                    id="mod-name"
                    data-testid="input-module-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mod-status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger data-testid="select-module-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="connected">Connected</SelectItem>
                      <SelectItem value="disconnected">Disconnected</SelectItem>
                      <SelectItem value="configuring">Configuring</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mod-url">Base URL</Label>
                <Input
                  id="mod-url"
                  data-testid="input-module-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mod-desc">Description</Label>
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
                <h2 className="text-sm font-medium">API Credentials & Connection</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                API keys and tokens are stored encrypted in the database. Fill in the required fields and save to connect.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const fields = MODULE_CONFIG_FIELDS[mod?.code || ""] || [];
                if (fields.length === 0) {
                  return (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Key className="h-6 w-6 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No configuration schema defined for this module</p>
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
              Save Changes
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Sync History</h2>
              </div>
            </CardHeader>
            <CardContent>
              {!syncLogs || syncLogs.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <ArrowLeftRight className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No sync history yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sync activity will appear here once configured
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
                    <p className="text-sm text-muted-foreground">No help information available for this module yet.</p>
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
                      <h2 className="text-sm font-medium">About this module</h2>
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
                        <h2 className="text-sm font-medium">API Information</h2>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm" data-testid="text-help-api">{help.apiInfo}</p>
                      {help.endpoints && help.endpoints.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Endpoints:</p>
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
                        <h2 className="text-sm font-medium">Authentication</h2>
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
                        <h2 className="text-sm font-medium">Notes</h2>
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
                        <h2 className="text-sm font-medium">Useful Links</h2>
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
                        <h2 className="text-sm font-medium">Official Documentation</h2>
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
