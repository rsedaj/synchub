import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyRound, Eye, EyeOff, Copy, Check, ExternalLink, Globe, Lock, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiModule } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";

const SENSITIVE_KEYS = new Set(["apiToken", "apiTokenProd", "apiKey", "accessKey", "xmlFeedId", "csvFeedId", "password", "productFeedUrl", "pricesFeedUrl", "printDataFeedUrl", "printPricesFeedUrl", "combinedFeedUrl"]);

const FIELD_LABELS: Record<string, string> = {
  apiType: "Typ API",
  authType: "Autentifik\u00e1cia",
  apiToken: "API Token",
  apiTokenProd: "API Token (Production)",
  apiKey: "API Key",
  username: "Pou\u017e\u00edvate\u013e",
  password: "Heslo",
  shopId: "Shop ID",
  companyId: "Company ID",
  companyDomain: "Company Domain",
  xmlFeedUrl: "XML Feed URL",
  apiBaseUrl: "API Base URL",
  environment: "Prostredie",
  skuFeedUrl: "SKU Feed URL",
  pricelistFeedUrl: "Cenníkov\u00fd Feed URL",
  stockFeedUrl: "Skladov\u00fd Feed URL",
  productFeedUrl: "Product Feed URL",
  priceFeedUrl: "Price Feed URL",
  printPriceFeedUrl: "Print Price Feed URL",
  pricesFeedUrl: "Prices Feed URL",
  printDataFeedUrl: "Print Data Feed URL",
  printPricesFeedUrl: "Print Prices Feed URL",
  combinedFeedUrl: "Combined Feed URL",
  feedFormat: "Formát feedov",
  swaggerUrl: "Swagger URL",
  accessKey: "Access Key",
  xmlFeedId: "XML Feed ID",
  csvFeedId: "CSV Feed ID",
  language: "Jazyk",
  note: "Pozn\u00e1mka",
};

const FIELD_ORDER = [
  "apiType", "authType", "environment",
  "apiBaseUrl", "swaggerUrl",
  "apiToken", "apiTokenProd", "apiKey", "accessKey", "xmlFeedId", "csvFeedId",
  "username", "password",
  "companyDomain", "companyId", "shopId",
  "xmlFeedUrl", "skuFeedUrl", "pricelistFeedUrl", "stockFeedUrl", "productFeedUrl", "priceFeedUrl", "printPriceFeedUrl",
  "pricesFeedUrl", "printDataFeedUrl", "printPricesFeedUrl", "combinedFeedUrl", "feedFormat",
  "note",
];

function maskValue(val: string): string {
  if (val.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return val.substring(0, 4) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + val.substring(val.length - 4);
}

function VaultField({ label, value, sensitive, fieldKey }: { label: string; value: string; sensitive: boolean; fieldKey: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const isUrl = value.startsWith("http://") || value.startsWith("https://");
  const displayValue = sensitive && !revealed ? maskValue(value) : value;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: t("vault.copied"), description: t("vault.copiedDesc", { label }) });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t("vault.copyError"), description: t("vault.copyErrorDesc"), variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group" data-testid={`vault-field-${fieldKey}`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {sensitive ? (
          <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : isUrl ? (
          <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-xs text-muted-foreground w-36 flex-shrink-0">{label}</span>
        <span className={`text-xs font-mono truncate ${sensitive && !revealed ? "text-muted-foreground" : ""}`}>
          {isUrl && !sensitive ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline flex items-center gap-1" data-testid={`link-vault-${fieldKey}`}>
              {value}
              <ExternalLink className="h-3 w-3 inline flex-shrink-0" />
            </a>
          ) : (
            displayValue
          )}
        </span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {sensitive && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRevealed(!revealed)} data-testid={`button-reveal-${fieldKey}`}>
            {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} data-testid={`button-copy-${fieldKey}`}>
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

function ModuleVaultCard({ mod }: { mod: ApiModule }) {
  const { t } = useLanguage();
  const config = (mod.config || {}) as Record<string, any>;
  const entries = FIELD_ORDER
    .filter((k) => config[k] !== undefined && config[k] !== null && config[k] !== "")
    .map((k) => ({ key: k, label: FIELD_LABELS[k] || k, value: String(config[k]), sensitive: SENSITIVE_KEYS.has(k) }));

  const extraEntries = Object.keys(config)
    .filter((k) => !FIELD_ORDER.includes(k) && config[k] !== undefined && config[k] !== null && config[k] !== "")
    .map((k) => ({ key: k, label: FIELD_LABELS[k] || k, value: String(config[k]), sensitive: SENSITIVE_KEYS.has(k) }));

  const allEntries = [...entries, ...extraEntries];
  const sensitiveCount = allEntries.filter((e) => e.sensitive).length;
  const hasBaseUrl = mod.baseUrl && mod.baseUrl.length > 0;

  return (
    <Card className="border" data-testid={`vault-card-${mod.code}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">{String(mod.sortOrder).padStart(2, "0")}.</span>
            {mod.name}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {sensitiveCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-5">
                <Lock className="h-2.5 w-2.5 mr-1" />
                {sensitiveCount} {sensitiveCount === 1 ? t("vault.key") : sensitiveCount < 5 ? t("vault.keys") : t("vault.keysMany")}
              </Badge>
            )}
            <Badge
              variant={mod.status === "active" ? "default" : mod.status === "configured" ? "secondary" : "outline"}
              className="text-[10px] h-5"
              data-testid={`badge-status-${mod.code}`}
            >
              {mod.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {hasBaseUrl && (
          <VaultField
            label="Base URL"
            value={mod.baseUrl!}
            sensitive={false}
            fieldKey={`${mod.code}-baseUrl`}
          />
        )}
        {allEntries.length > 0 ? (
          <div className="divide-y divide-border/50">
            {allEntries.map((entry) => (
              <VaultField
                key={entry.key}
                label={entry.label}
                value={entry.value}
                sensitive={entry.sensitive}
                fieldKey={`${mod.code}-${entry.key}`}
              />
            ))}
          </div>
        ) : !hasBaseUrl ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            {t("vault.noCredentials")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function VaultPage() {
  const { t } = useLanguage();
  const { data: modules, isLoading } = useQuery<ApiModule[]>({
    queryKey: ["/api/modules"],
  });

  const configuredModules = modules?.filter((m) => {
    const config = (m.config || {}) as Record<string, any>;
    const hasConfig = Object.keys(config).some((k) => SENSITIVE_KEYS.has(k) && config[k]);
    return hasConfig || (m.baseUrl && m.baseUrl.length > 0);
  }) || [];

  const unconfiguredModules = modules?.filter((m) => {
    const config = (m.config || {}) as Record<string, any>;
    const hasConfig = Object.keys(config).some((k) => SENSITIVE_KEYS.has(k) && config[k]);
    return !hasConfig && !(m.baseUrl && m.baseUrl.length > 0);
  }) || [];

  const totalSecrets = modules?.reduce((sum, m) => {
    const config = (m.config || {}) as Record<string, any>;
    return sum + Object.keys(config).filter((k) => SENSITIVE_KEYS.has(k) && config[k]).length;
  }, 0) || 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-vault">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground">
            <KeyRound className="h-5 w-5 text-background" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-vault-title">{t("vault.title")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("vault.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs" data-testid="badge-total-secrets">
            <Lock className="h-3 w-3 mr-1" />
            {totalSecrets} {t("vault.secretKeys")}
          </Badge>
          <Badge variant="outline" className="text-xs" data-testid="badge-total-modules">
            {modules?.length || 0} {t("vault.modules")}
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <>
          {configuredModules.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                {t("vault.configuredModules")} ({configuredModules.length})
              </h2>
              <div className="grid gap-3">
                {configuredModules.map((mod) => (
                  <ModuleVaultCard key={mod.id} mod={mod} />
                ))}
              </div>
            </div>
          )}

          {unconfiguredModules.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("vault.waitingConfig")} ({unconfiguredModules.length})
              </h2>
              <div className="grid gap-3">
                {unconfiguredModules.map((mod) => (
                  <ModuleVaultCard key={mod.id} mod={mod} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
