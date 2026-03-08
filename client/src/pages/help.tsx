import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { APP_VERSION } from "@shared/version";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HelpCircle,
  FileText,
  ExternalLink,
  Download,
  Puzzle,
  Info,
  Shield,
  UserCheck,
  Eye,
  Printer,
  Globe,
  BookOpen,
  Server,
} from "lucide-react";

type Module = {
  id: string;
  name: string;
  code: string;
  status: string;
  apiType: string;
  authType: string;
  docsUrl: string | null;
  baseUrl: string | null;
  config: Record<string, any> | null;
};

const DOCUMENTS = [
  {
    name: "Midocean — API Implementation Guide",
    file: "Midocean_-_API_implementation_guide_and_integration_overview_-_1772738954233.pdf",
    supplier: "MID",
  },
  {
    name: "XD Connects — Data Delivery Manual 2025",
    file: "Data_delivery_manual_XD_Connects_-_2025_1772786469884.pdf",
    supplier: "XDCONNECT",
  },
  {
    name: "Anda Present — XML & CSV Feed Manual v2.8",
    file: "ANDA_WEB_CUSTOMER_EN_XML_and_CSV_feed_manual_v2.8_1772660315184.pdf",
    supplier: "ANDA",
  },
  {
    name: "Stricker Europe — Webservice Manual 2021",
    file: "webserviceManual_2021_1772659037320.pdf",
    supplier: "STICKER",
  },
  {
    name: "XD Connects — Data Feed Manual v3",
    file: "Data_feed_manual_v3_1772750643185.pdf",
    supplier: "XDCONNECT",
  },
];

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  disconnected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  configuring: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function HelpPage() {
  const { t } = useLanguage();

  const { data: modules, isLoading } = useQuery<Module[]>({
    queryKey: ["/api/modules"],
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-[1100px] print:max-w-none print:p-4">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-help-title">
            <HelpCircle className="h-5 w-5" />
            {t("help.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("help.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={handlePrint} data-testid="button-export-pdf">
          <Printer className="h-4 w-4 mr-2" />
          {t("help.exportPdf")}
        </Button>
      </div>

      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">{t("help.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("help.subtitle")}</p>
        <p className="text-xs text-gray-400 mt-1">{APP_VERSION} — {new Date().toLocaleDateString()}</p>
      </div>

      <section data-testid="section-help-modules">
        <div className="flex items-center gap-2 mb-4">
          <Puzzle className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">{t("help.modules")}</h2>
            <p className="text-sm text-muted-foreground">{t("help.modulesDesc")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modules?.map((mod) => {
            const swaggerUrl = mod.config?.swaggerUrl;
            return (
              <Card key={mod.id} className="print:break-inside-avoid" data-testid={`card-help-module-${mod.code}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{mod.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{mod.code}</p>
                      </div>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[mod.status] || ""}`}>
                      {mod.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                    <span>{mod.apiType}</span>
                    <span>·</span>
                    <span>{mod.authType}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {mod.docsUrl ? (
                      <a
                        href={mod.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        data-testid={`link-docs-${mod.code}`}
                      >
                        <BookOpen className="h-3 w-3" />
                        {t("help.officialDocs")}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">{t("help.noDocsAvailable")}</span>
                    )}

                    {swaggerUrl && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <a
                          href={swaggerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          data-testid={`link-swagger-${mod.code}`}
                        >
                          <Globe className="h-3 w-3" />
                          {t("help.swaggerApi")}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator className="print:hidden" />

      <section data-testid="section-help-documents">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">{t("help.documents")}</h2>
            <p className="text-sm text-muted-foreground">{t("help.documentsDesc")}</p>
          </div>
        </div>

        <div className="space-y-2">
          {DOCUMENTS.map((doc, idx) => (
            <Card key={idx} className="print:break-inside-avoid" data-testid={`card-help-doc-${idx}`}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-muted flex-shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{doc.supplier}</Badge>
                      <span className="text-[10px] text-muted-foreground">PDF</span>
                    </div>
                  </div>
                </div>
                <a
                  href={`/attached_assets/${doc.file}`}
                  download={doc.file}
                  className="print:hidden"
                >
                  <Button variant="outline" size="sm" data-testid={`button-download-doc-${idx}`}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    {t("help.download")}
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="print:hidden" />

      <section data-testid="section-help-system">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">{t("help.systemInfo")}</h2>
            <p className="text-sm text-muted-foreground">{t("help.systemInfoDesc")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="print:break-inside-avoid">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{t("help.appVersion")}</p>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SyncHub</span>
                  <span className="font-mono">{APP_VERSION}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="font-mono">Replit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database</span>
                  <span className="font-mono">PostgreSQL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("help.modules")}</span>
                  <span className="font-mono">{modules?.length || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:break-inside-avoid">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{t("help.rolesTitle")}</p>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <UserCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <p>{t("help.roleAdmin")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <UserCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <p>{t("help.roleOperator")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Eye className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <p>{t("help.roleViewer")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 print:break-inside-avoid">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{t("help.contact")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t("help.contactDesc")}</p>
              <p className="text-xs text-muted-foreground mt-2">&copy; {new Date().getFullYear()} {t("help.copyright")}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
