import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { APP_VERSION } from "@shared/version";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ExternalLink, Download } from "lucide-react";

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
  { name: "Midocean — API Implementation Guide", file: "Midocean_-_API_implementation_guide_and_integration_overview_-_1772738954233.pdf", supplier: "MID" },
  { name: "XD Connects — Data Delivery Manual 2025", file: "Data_delivery_manual_XD_Connects_-_2025_1772786469884.pdf", supplier: "XDCONNECT" },
  { name: "Anda Present — XML & CSV Feed Manual v2.8", file: "ANDA_WEB_CUSTOMER_EN_XML_and_CSV_feed_manual_v2.8_1772660315184.pdf", supplier: "ANDA" },
  { name: "Stricker Europe — Webservice Manual 2021", file: "webserviceManual_2021_1772659037320.pdf", supplier: "STICKER" },
  { name: "XD Connects — Data Feed Manual v3", file: "Data_feed_manual_v3_1772750643185.pdf", supplier: "XDCONNECT" },
];

export default function HelpPage() {
  const { t } = useLanguage();

  const { data: modules, isLoading } = useQuery<Module[]>({
    queryKey: ["/api/modules"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
      </div>
    );
  }

  const connectedModules = modules?.filter(m => m.status === "connected") || [];
  const modulesWithDocs = modules?.filter(m => m.docsUrl) || [];

  return (
    <div className="p-6 max-w-[900px] print:max-w-none print:p-4">
      <div className="flex items-center justify-between gap-4 mb-8 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-help-title">
            Help
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("help.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} data-testid="button-export-pdf">
          <Printer className="h-4 w-4 mr-2" />
          {t("help.exportPdf")}
        </Button>
      </div>

      <div className="hidden print:block mb-8">
        <h1 className="text-2xl font-bold">SyncHub — Help</h1>
        <p className="text-sm text-gray-500 mt-1">{APP_VERSION} · {new Date().toLocaleDateString()}</p>
      </div>

      <article className="prose prose-sm dark:prose-invert max-w-none space-y-8" data-testid="help-content">

        <section data-testid="section-help-about">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">O aplikácii SyncHub</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            SyncHub je modulárna integračná platforma pre spoločnosť SEDAJ s.r.o. / Hauerland.
            Slúži na prepojenie interného ERP systému ONIX s externými dodávateľskými systémami,
            CRM (Pipedrive) a e-shopom. Aplikácia umožňuje konfiguráciu, synchronizáciu a monitoring
            dátových tokov medzi systémami v reálnom čase.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground mt-2">
            Aktuálna verzia: <strong className="text-foreground font-mono">{APP_VERSION}</strong> ·
            Platforma: Replit · Databáza: PostgreSQL ·
            Počet modulov: <strong className="text-foreground">{modules?.length || 0}</strong> ·
            Pripojených: <strong className="text-foreground">{connectedModules.length}</strong>
          </p>
        </section>

        <section data-testid="section-help-modules">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Integrované moduly</h2>
          <p className="text-sm leading-relaxed text-muted-foreground mb-3">
            Systém integruje nasledujúce externé služby a dodávateľov. Každý modul má vlastnú
            konfiguráciu, prístupové údaje a možnosť synchronizácie dát.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-medium">Modul</th>
                  <th className="text-left px-3 py-2 font-medium">Kód</th>
                  <th className="text-left px-3 py-2 font-medium">API / Auth</th>
                  <th className="text-left px-3 py-2 font-medium">Stav</th>
                  <th className="text-left px-3 py-2 font-medium">Dokumentácia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modules?.map((mod) => {
                  const swaggerUrl = mod.config?.swaggerUrl;
                  return (
                    <tr key={mod.id} className="hover:bg-muted/30" data-testid={`row-help-module-${mod.code}`}>
                      <td className="px-3 py-2 font-medium">{mod.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{mod.code}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{mod.apiType} · {mod.authType}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${
                          mod.status === "connected" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                          mod.status === "error" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" :
                          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        }`}>{mod.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {mod.docsUrl && (
                            <a href={mod.docsUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              data-testid={`link-docs-${mod.code}`}>
                              Docs <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {swaggerUrl && (
                            <a href={swaggerUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              data-testid={`link-swagger-${mod.code}`}>
                              Swagger <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {!mod.docsUrl && !swaggerUrl && (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section data-testid="section-help-navigation">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Navigácia a funkcie</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Dashboard</strong> — hlavný prehľad systému so stavom
              všetkých modulov, dnešnou aktivitou synchronizácií a chybami. Obsahuje sieťovú mapu
              pripojení a tlačidlo pre hromadný test všetkých modulov.
            </p>
            <p>
              <strong className="text-foreground">Moduly</strong> — zoznam všetkých API integrácií.
              Kliknutím na modul sa otvorí detail s tabmi: Prehľad (stav, test pripojenia),
              Dáta Preview (live náhľad dát z API), Konfigurácia (API kľúče, URL adresy),
              História sync (logy synchronizácií), Pomoc (dokumentácia modulu).
            </p>
            <p>
              <strong className="text-foreground">Sync Konfigurácie</strong> — definícia pravidiel
              synchronizácie medzi modulmi. Konfigurácia zdroja, cieľa, mapovania polí a časového plánu.
            </p>
            <p>
              <strong className="text-foreground">Synchronizácia</strong> — spustenie a sledovanie
              synchronizácií v reálnom čase. Live priebeh s fázami (preflight, backup, fetch, sync),
              rýchlosťou spracovania a odhadovaným časom dokončenia. Správa dátových záloh.
            </p>
            <p>
              <strong className="text-foreground">Shop View</strong> — vizuálny prehľad produktov
              z dodávateľských feedov. Kombinácia viacerých feedov, filtrovanie podľa dodávateľa
              a kategórie, vyhľadávanie, zobrazenie v mriežke alebo zozname. Podpora vlastných
              externých feedov (XML/JSON).
            </p>
            <p>
              <strong className="text-foreground">Zálohy</strong> — správa dátových záloh a záloh
              konfigurácie na Google Drive. Automatické zálohovanie pred synchronizáciou,
              možnosť manuálnej zálohy a obnovy.
            </p>
            <p>
              <strong className="text-foreground">Trezor</strong> — (iba admin) centrálny prehľad
              všetkých API kľúčov, tokenov a prístupových údajov modulov na jednom mieste.
            </p>
          </div>
        </section>

        <section data-testid="section-help-roles">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Používateľské role a oprávnenia</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Admin</strong> — plný prístup ku všetkým funkciám.
              Správa používateľov (vytváranie, editácia, mazanie), prístup do Trezoru s API kľúčmi,
              Audit Log s históriou všetkých akcií, konfigurácia modulov a synchronizácií,
              zálohovanie a obnova systému.
            </p>
            <p>
              <strong className="text-foreground">Operátor</strong> — prístup k modulom, konfiguráciám
              a synchronizáciám. Môže spúšťať synchronizácie, prezerať dáta a Shop View.
              Nemá prístup k správe používateľov, Trezoru ani Audit Logu.
            </p>
            <p>
              <strong className="text-foreground">Čitateľ</strong> — iba čítací prístup. Vidí Dashboard,
              zoznam modulov a ich stav. Nemôže meniť konfigurácie, spúšťať synchronizácie
              ani pristupovať k citlivým údajom.
            </p>
          </div>
        </section>

        <section data-testid="section-help-documents">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Dokumenty a manuály dodávateľov</h2>
          <p className="text-sm leading-relaxed text-muted-foreground mb-3">
            Nasledujúce PDF dokumenty obsahujú technické špecifikácie API a dátových feedov
            jednotlivých dodávateľov. Tieto manuály sú užitočné pri konfigurácii a riešení problémov.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-medium">Dokument</th>
                  <th className="text-left px-3 py-2 font-medium">Dodávateľ</th>
                  <th className="text-right px-3 py-2 font-medium print:hidden">Akcia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {DOCUMENTS.map((doc, idx) => (
                  <tr key={idx} className="hover:bg-muted/30" data-testid={`row-help-doc-${idx}`}>
                    <td className="px-3 py-2">{doc.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{doc.supplier}</td>
                    <td className="px-3 py-2 text-right print:hidden">
                      <a href={`/attached_assets/${doc.file}`} download={doc.file}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid={`button-download-doc-${idx}`}>
                          <Download className="h-3 w-3 mr-1" />
                          {t("help.download")}
                        </Button>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section data-testid="section-help-workflow">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Typický pracovný postup</h2>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p><strong className="text-foreground">1.</strong> Nakonfigurujte modul — zadajte API kľúče a URL v záložke Konfigurácia modulu.</p>
            <p><strong className="text-foreground">2.</strong> Otestujte pripojenie — použite tlačidlo "Test Connection" na overenie funkčnosti.</p>
            <p><strong className="text-foreground">3.</strong> Overte dáta — v záložke "Dáta Preview" načítajte live náhľad z API.</p>
            <p><strong className="text-foreground">4.</strong> Vytvorte sync konfiguráciu — definujte zdroj, cieľ a mapovanie polí.</p>
            <p><strong className="text-foreground">5.</strong> Spustite synchronizáciu — v sekcii Synchronizácia spustite beh a sledujte priebeh.</p>
            <p><strong className="text-foreground">6.</strong> Skontrolujte výsledky — v logoch a Audit Logu overte úspešnosť operácií.</p>
          </div>
        </section>

        <section data-testid="section-help-contact" className="print:break-inside-avoid">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Kontakt a podpora</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pre technickú podporu, hlásenie chýb alebo požiadavky na nové funkcie
            kontaktujte administrátora systému. Všetky zmeny a akcie sú zaznamenávané
            v Audit Logu pre prehľadnosť a bezpečnosť.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            &copy; {new Date().getFullYear()} SEDAJ s.r.o. — Hauerland Integration Platform · {APP_VERSION}
          </p>
        </section>

      </article>
    </div>
  );
}
