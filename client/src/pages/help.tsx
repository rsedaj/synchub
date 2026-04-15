import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { APP_VERSION } from "@shared/version";
import { MODULE_HELP } from "@/lib/module-help-data";
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

function TextBlock({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        if (line.trim() === "") return <br key={i} />;
        if (line.startsWith("•")) {
          return <p key={i} className="text-sm leading-relaxed text-muted-foreground pl-4">{line}</p>;
        }
        return <p key={i} className="text-sm leading-relaxed text-muted-foreground">{line}</p>;
      })}
    </>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted/60 border rounded p-3 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 border-b">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 font-medium text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-xs text-muted-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  return (
    <div className="p-6 max-w-[900px] print:max-w-none print:p-4">
      <div className="flex items-center justify-between gap-4 mb-8 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-help-title">
            Dokumentácia SyncHub
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
        <h1 className="text-2xl font-bold">SyncHub — Dokumentácia</h1>
        <p className="text-sm text-gray-500 mt-1">{APP_VERSION} · {new Date().toLocaleDateString("sk-SK")}</p>
      </div>

      <article className="prose prose-sm dark:prose-invert max-w-none space-y-10" data-testid="help-content">

        {/* O APLIKÁCII */}
        <section data-testid="section-help-about">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">O aplikácii SyncHub</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            SyncHub je modulárna integračná platforma pre <strong className="text-foreground">SEDAJ s.r.o. / Hauerland</strong>.
            Prepája interný ERP systém <strong className="text-foreground">ONIX</strong> s 12 externými systémami
            (dodávatelia, e-shop, CRM) cez REST API, XML feedy a JSON feedy.
            Umožňuje konfiguráciu, automatizovanú synchronizáciu a monitoring dátových tokov v reálnom čase.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground mt-2">
            Aktuálna verzia: <strong className="text-foreground font-mono">{APP_VERSION}</strong> ·
            Databáza: PostgreSQL ·
            Modulov: <strong className="text-foreground">{modules?.length || 0}</strong>
          </p>
          <div className="mt-4">
            <Table
              headers={["Vrstva", "Technológia"]}
              rows={[
                ["Frontend", "React 18 + TypeScript + Vite + Tailwind CSS + Shadcn/ui"],
                ["Routing", "Wouter"],
                ["API klient", "TanStack Query v5"],
                ["Backend", "Express.js + TypeScript"],
                ["Databáza", "PostgreSQL + Drizzle ORM"],
                ["Autentifikácia", "Passport.js (session) + bcrypt"],
                ["Zálohy", "Google Drive (Replit Connectors SDK)"],
              ]}
            />
          </div>
        </section>

        {/* NAVIGÁCIA */}
        <section data-testid="section-help-navigation">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Navigácia a funkcie</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p><strong className="text-foreground">Dashboard</strong> — hlavný prehľad systému. Stav všetkých modulov, dnešná aktivita, sieťová mapa pripojení, command center s live hodinami.</p>
            <p><strong className="text-foreground">Moduly</strong> — zoznam API integrácií. Kliknutím sa otvorí detail s tabmi: Prehľad (stav, test pripojenia), Dáta Preview (live náhľad z API), Konfigurácia (API kľúče, URL), História sync, Pomoc.</p>
            <p><strong className="text-foreground">Sync Konfigurácie</strong> — definícia pravidiel synchronizácie. Konfigurácia zdroja, cieľa, mapovania polí, limitu záznamov, časového plánu a zálohy.</p>
            <p><strong className="text-foreground">Synchronizácia</strong> — spustenie a sledovanie behov v reálnom čase. Live priebeh s fázami, rýchlosťou, ETA. Správa záloh. Delta alebo full sync.</p>
            <p><strong className="text-foreground">Shop View</strong> — vizuálny prehľad produktov z dodávateľských feedov. Kombinácia feedov, filtrovanie, vyhľadávanie, grid/list zobrazenie.</p>
            <p><strong className="text-foreground">Zálohy</strong> — správa dátových záloh a záloh konfigurácie na SEDAJ Cloud (Google Drive). Automatické zálohovanie pred sync, manuálna záloha, obnova.</p>
            <p><strong className="text-foreground">Trezor</strong> — (iba admin) centrálny prehľad všetkých API kľúčov a tokenov na jednom mieste.</p>
            <p><strong className="text-foreground">Audit Log</strong> — (iba admin) história všetkých akcií: login, sync, konfiguračné zmeny, zálohy, obnovy.</p>
          </div>
        </section>

        {/* ROLY */}
        <section data-testid="section-help-roles">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Používateľské role a oprávnenia</h2>
          <Table
            headers={["Funkcia", "Admin", "Operátor", "Čitateľ"]}
            rows={[
              ["Dashboard", "✅", "✅", "✅"],
              ["Moduly — prezeranie", "✅", "✅", "✅"],
              ["Test pripojenia", "✅", "✅", "❌"],
              ["Dáta preview", "✅", "✅", "❌"],
              ["Spustiť sync", "✅", "✅", "❌"],
              ["Sync konfigurácie", "✅", "✅", "❌"],
              ["Zálohy a obnova", "✅", "✅", "❌"],
              ["Správa používateľov", "✅", "❌", "❌"],
              ["Trezor (API kľúče)", "✅", "❌", "❌"],
              ["Audit Log", "✅", "❌", "❌"],
            ]}
          />
        </section>

        {/* TYPICKÝ POSTUP */}
        <section data-testid="section-help-workflow">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Typický pracovný postup</h2>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p><strong className="text-foreground">1.</strong> Nakonfigurujte modul — zadajte API kľúče a URL v záložke Konfigurácia modulu.</p>
            <p><strong className="text-foreground">2.</strong> Otestujte pripojenie — použite tlačidlo "Test Connection" na overenie funkčnosti.</p>
            <p><strong className="text-foreground">3.</strong> Overte dáta — v záložke "Dáta Preview" načítajte live náhľad z API a skontrolujte polia.</p>
            <p><strong className="text-foreground">4.</strong> Vytvorte sync konfiguráciu — definujte zdroj, cieľ, mapovanie polí, limit záznamov a plán.</p>
            <p><strong className="text-foreground">5.</strong> Spustite synchronizáciu — v sekcii Synchronizácia kliknite Spustiť a sledujte priebeh.</p>
            <p><strong className="text-foreground">6.</strong> Skontrolujte výsledky — v logoch, Audit Logu a priamo v ONIX overte úspešnosť operácií.</p>
            <p><strong className="text-foreground">7.</strong> Ďalšie behy — automaticky prebehne v delta móde (len zmeny). Pre force full sync zaškrtnite "Full sync".</p>
          </div>
        </section>

        {/* AKO FUNGUJE SYNC */}
        <section data-testid="section-help-sync-engine">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Ako funguje synchronizácia (4-fázový engine)</h2>
          <p className="text-sm leading-relaxed text-muted-foreground mb-4">
            Každý sync beh prechádza 4 fázami. Priebeh je viditeľný v reálnom čase v sekcii Synchronizácia.
          </p>

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold mb-1">Fáza 1: Preflight (kontrola pripojenia)</h3>
              <p className="text-sm text-muted-foreground">Overenie sync konfigurácie — existencia zdrojového a cieľového modulu, definované field mappings. Ak niečo chýba, sync sa zastaví s chybovou správou ešte pred akýmkoľvek volaním API.</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">Fáza 2: Záloha na Google Drive (voliteľné)</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Predvolene zapnuté. Stiahne aktuálne dáta z cieľového systému (napr. existujúce ONIX karty) a zálohu uloží na Google Drive.
              </p>
              <ul className="text-sm text-muted-foreground space-y-0.5 ml-4 list-disc">
                <li>Umiestnenie: <code className="text-xs bg-muted px-1 rounded">SyncHub_Backups/Data/YYYY-MM-DD/ModuleName/</code></li>
                <li>Rotácia: max 10 záloh na konfiguráciu (najstaršia sa zmaže)</li>
                <li>Veľké datasety: automaticky rozdelené na viacero súborov (chunking &gt;50MB)</li>
                <li>Zálohu je možné kedykoľvek obnoviť jedným kliknutím</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">Fáza 3: Načítanie zdrojových dát</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Stiahnutie dát zo zdrojového systému (napr. Promotron XML feed — 121MB, ~100 000 produktov).
              </p>
              <ul className="text-sm text-muted-foreground space-y-0.5 ml-4 list-disc">
                <li>3 pokusy s 2s oneskorením pri zlyhaní</li>
                <li>Limit záznamov: konfigurovateľný (predvolené: 120 000)</li>
                <li>Ak nie sú žiadne dáta, sync sa zastaví s chybou</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">Fáza 3.5: Delta porovnanie (len v delta móde)</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Každý záznam sa porovná s posledným uloženým stavom. Odosielajú sa len záznamy, kde sa niečo zmenilo.
                Podrobnosti v sekcii "Delta sync" nižšie.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">Fáza 4: Synchronizácia do cieľa</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Záznamy sa posielajú do cieľového API (napr. ONIX) po dávkach.
              </p>
              <Table
                headers={["Parameter", "Hodnota", "Popis"]}
                rows={[
                  ["Veľkosť dávky", "50 záznamov", "Každá dávka = 50 záznamov"],
                  ["Concurrency", "1 (sériové)", "ONIX API nepodporuje paralelné volania."],
                  ["Retry pri 503/504/429", "3× (2s/4s/6s)", "Retry pri preťažení servera"],
                  ["Timeout / Retry", "20s (1. pokus), 30s (retry), 3× celkom", "AbortController na každý request"],
                  ["Early stop", "3 po sebe idúce 100% chybové dávky", "Automatické zastavenie"],
                  ["Pauza medzi POST-mi", "žiadna", "Response time reguluje tempo"],
                ]}
              />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Live priebeh v UI</h3>
            <p className="text-sm text-muted-foreground">
              Počas sync behu vidíte: % dokončenia, aktuálnu dávku, rýchlosť (záznamy/s), odhadovaný čas dokončenia,
              live počty vytvorených/aktualizovaných/chybových záznamov, latenciu ONIX API a speed rating.
              Zelený pulzujúci bod v navigácii signalizuje aktívny sync.
            </p>
          </div>
        </section>

        {/* DELTA SYNC */}
        <section data-testid="section-help-delta">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Delta sync — inteligentná synchronizácia zmien</h2>

          <p className="text-sm leading-relaxed text-muted-foreground mb-4">
            <strong className="text-foreground">Problém:</strong> Sync 100 000 produktov trvá pri sekvenčnom POST-ovaní (1 request ≈ 1.8s) cca <strong className="text-foreground">50 hodín</strong>.
            Delta sync tento čas dramaticky skracuje tým, že posiela len záznamy, kde sa niečo skutočne zmenilo.
          </p>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Ako to funguje</h3>
              <CodeBlock>{`Pre každý produkt:
  1. Vypočíta MD5 hash z hodnôt mapovaných polí:
     hash = md5(price + "|" + title + "|" + description + "|" + gtin + ...)

  2. Porovná hash s posledným uloženým stavom v DB (tabuľka sync_baselines)

  3. Ak hash = baseline:  PRESKOČIŤ (žiadna zmena)
     Ak hash ≠ baseline:  ODOSLAŤ do ONIX + aktualizovať baseline

Po dokončení sync:
  - Uloží nové MD5 hashe do sync_baselines
  - Nabudúce sa porovná s týmito novými hodnotami`}</CodeBlock>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Príklad úspory</h3>
              <Table
                headers={["Scenár", "Počet zmenených", "Full sync", "Delta sync"]}
                rows={[
                  ["Denná aktualizácia cien", "500 z 100 000", "~50 hodín", "~15 minút"],
                  ["Väčší update katalógu", "5 000 z 100 000", "~50 hodín", "~2.5 hodiny"],
                  ["Prvý beh (bez baseline)", "100 000 z 100 000", "~50 hodín", "~50 hodín (jednorazovo)"],
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Prvý beh vs. ďalšie behy</h3>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Prvý delta beh:</strong> Žiadna baseline → všetky záznamy sa považujú za nové → pošlú sa všetky → vytvorí sa baseline pre 100k produktov. Tento beh trvá rovnako dlho ako full sync.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                <strong className="text-foreground">Každý ďalší beh:</strong> Porovnanie s baselineom → odosielajú sa len zmeny → dramatická úspora.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Ovládanie v UI</h3>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>V sekcii "Spustiť synchronizáciu" je checkbox <strong className="text-foreground">Full sync</strong></li>
                <li>Bez zaškrtnutia = delta mód (predvolený, odporúčaný pre každodenné behy)</li>
                <li>So zaškrtnutím = full sync (pošle všetko bez ohľadu na zmeny — vhodné po veľkej zmene štruktúry)</li>
                <li>Počas behu sa zobrazuje badge <code className="text-xs bg-muted px-1 rounded">DELTA</code> alebo <code className="text-xs bg-muted px-1 rounded">FULL</code> a štatistiky</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Technické detaily</h3>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Tabuľka <code className="text-xs bg-muted px-1 rounded">sync_baselines</code> — unikátny index na (configId, recordKey)</li>
                <li>Kľúč záznamu: <code className="text-xs bg-muted px-1 rounded">id</code> / <code className="text-xs bg-muted px-1 rounded">gtin</code> / <code className="text-xs bg-muted px-1 rounded">sku</code> / <code className="text-xs bg-muted px-1 rounded">code</code> (prvý dostupný)</li>
                <li>Hash: MD5 z hodnôt polí definovaných v field mappings</li>
                <li>Upsert: 500 záznamov na jeden SQL INSERT ON CONFLICT DO UPDATE</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ONIX INTEGRÁCIA */}
        <section data-testid="section-help-onix">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">ONIX ERP — technická integrácia</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Pripojenie</h3>
              <Table
                headers={["Parameter", "Hodnota"]}
                rows={[
                  ["API URL", "https://onix-api.hauerland.sk/ONIX_API"],
                  ["Swagger UI", "https://onix-api.hauerland.sk/onix_api/swagger/ui/index"],
                  ["Swagger DEMO (KROS)", "http://195.146.148.139/onix_api/swagger/ui/index"],
                  ["Databáza", "testovacia_hauerland (env: ONIX_DATABASE_PATH)"],
                  ["PostgreSQL port", "20457"],
                  ["Auth", "Bearer token (env: ONIX_API_TOKEN)"],
                  ["Výrobca", "KROS a.s. — servis.onix@kros.sk"],
                  ["Priemerná latencia", "~1.8 s/záznam"],
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Aktuálne mapovanie polí (Eshop → ONIX)</h3>
              <Table
                headers={["E-shop pole", "ONIX pole", "Popis"]}
                rows={[
                  ["price", "Default_Price", "Základná cena produktu (číslo)"],
                  ["title", "Name", "Názov skladovej karty"],
                  ["description", "Description", "Popis (môže obsahovať HTML)"],
                  ["description", "Ist_Description", "Interný popis"],
                  ["id", "Ist_Code", "Interný kód produktu"],
                  ["gtin", "Ns_Number", "EAN / číslo karty (auto-fill z id ak prázdne)"],
                  ["image_link", "CustomColumns.STOCK_ITEMS_Z_HAUE_SK001_URL_TXT", "URL obrázku produktu"],
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Auto-fill povinných polí (SyncHub doplní ak chýbajú)</h3>
              <Table
                headers={["Pole", "Predvolená hodnota", "Popis"]}
                rows={[
                  ["RecordExternalIdentificator", "id z e-shopu", "Externý identifikátor záznamu"],
                  ["Ns_Number", "= RecordExternalIdentificator", "Číslo karty (ak chýba gtin)"],
                  ["Ns_Code", "SK", "Kód krajiny"],
                  ["Type", "1", "Typ: 1=Tovar, 2=Služba, 3=Zariadenie"],
                  ["Measure_Units_Default_Name", "ks", "Merná jednotka"],
                  ["Default_Stock", "SYN", "Predvolený sklad (Sklad_SyncHub)"],
                  ["Default_Price", "0", "Cena (0 ak nie je zadaná)"],
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Sklady v testovacej databáze</h3>
              <Table
                headers={["Kód", "Názov", "ID"]}
                rows={[
                  ["SYN ⭐", "Sklad_SyncHub (predvolený)", "1000036"],
                  ["SK1", "SKLAD 1", "1000030"],
                  ["OPP", "Sklad OPP", "1000034"],
                  ["VOS", "Voľný sklad", "1000016"],
                  ["VZ", "Vzorky", "1000011"],
                  ["T", "Viazaný sklad", "1000007"],
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Read-only polia (automaticky odstránené z POST)</h3>
              <p className="text-sm text-muted-foreground">
                Nasledujúce polia ONIX API neprijíma pri POST/PUT — SyncHub ich automaticky vymaže z tela requestu:
              </p>
              <CodeBlock>{`StockItemBalance, StockItemGroups, StockItemParams,
StockItemCodes, StockItemAccessories, StockItemAlternatives,
StockItemPartners, StockItemMeasureUnits, Enclosures`}</CodeBlock>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">CustomColumns formát</h3>
              <CodeBlock>{`// Pole image_link sa mapuje na CustomColumns.STOCK_ITEMS_Z_HAUE_SK001_URL_TXT
// SyncHub ho automaticky transformuje na:
{
  "CustomColumns": [
    { "Name": "STOCK_ITEMS_Z_HAUE_SK001_URL_TXT", "Value": "https://example.com/image.jpg" }
  ]
}`}</CodeBlock>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Výsledkový kód odpovede ONIX</h3>
              <Table
                headers={["Kód", "Význam"]}
                rows={[
                  ["0", "Úspech — záznam vytvorený / aktualizovaný"],
                  ["3", "Chyba / odmietnuté — chybné dáta alebo validácia"],
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Prečo sync trvá dlho</h3>
              <p className="text-sm text-muted-foreground">
                ONIX REST API <strong className="text-foreground">nepodporuje bulk import</strong> — každá skladová karta musí byť odoslaná ako samostatný HTTP POST request.
                ONIX tiež <strong className="text-foreground">nepodporuje paralelné POST requesty</strong> — posiela sa len 1 karta naraz.
                Pri priemernej latencii 1.8s/karta a 100 000 kartách = ~50 hodín pre full sync.
                Delta sync toto rieši — pri bežných denných zmenách trvá sync len niekoľko minút.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Riešenie problémov (Troubleshooting)</h3>
              <Table
                headers={["Chyba", "Príčina", "Riešenie"]}
                rows={[
                  ["OpenFirm_DBVersionSmaller (HTTP 500)", "Databáza má staršiu schému ako ONIX API server vyžaduje", "KROS musí spustiť migráciu DB — kontakt: servis.onix@kros.sk"],
                  ["OpenFirm_DBVersionGreater (HTTP 500)", "API server je starší ako databáza", "Aktualizácia ONIX API servera — kontakt: servis.onix@kros.sk"],
                  ["OpenFirm_CantConnect (HTTP 500)", "API nemôže otvoriť databázu", "Skontrolujte DatabasePath a PostgreSQL port 20457"],
                  ["database does not exist (HTTP 500)", "Nesprávny názov databázy v DatabasePath", "Overte správny názov PostgreSQL databázy"],
                  ["HTTP 401 Unauthorized", "Neplatný alebo expirovaný API token", "Skontrolujte env ONIX_API_TOKEN — vyžiadajte nový token od KROS"],
                  ["HTTP 503 Service Unavailable", "ONIX API server nebeží", "Kontaktujte správcu ONIX servera"],
                  ["Timeout (>30s)", "Pomalé sieťové spojenie alebo server preťažený", "Skúste neskôr, skontrolujte firewallové pravidlá / IP whitelisting"],
                ]}
              />
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ <strong className="text-foreground">OpenFirm_DBVersionSmaller</strong> je problém na strane KROS servera — SyncHub ani databázové nastavenia to nevyriešia. Je nutný zásah správcu ONIX.
              </p>
            </div>
          </div>
        </section>

        {/* ZÁLOHY */}
        <section data-testid="section-help-backups">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Zálohovanie a obnova</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Automatická záloha pred sync</strong> — predvolene zapnutá pri každom behu.
              Stiahne aktuálny stav cieľového systému a uloží ho na Google Drive.
              Dá sa vypnúť v nastaveniach sync konfigurácie.
            </p>
            <p>
              <strong className="text-foreground">Manuálna záloha</strong> — dostupná pre každú konfiguráciu bez spustenia sync.
            </p>
            <p>
              <strong className="text-foreground">Záloha konfigurácie</strong> — exportuje celú konfiguráciu SyncHub (moduly + sync configs, bez hesiel) na Google Drive.
              Umožňuje obnovu nastavení pri reinštalácii.
            </p>
            <p>
              <strong className="text-foreground">Obnova (restore)</strong> — kliknutím na zálohu v sekcii Zálohy sa obnoví stav cieľového systému k danému bodu.
            </p>
            <div className="mt-3">
              <Table
                headers={["Parameter", "Hodnota"]}
                rows={[
                  ["Úložisko", "Google Drive (Shared Drive)"],
                  ["Max záloh / konfiguráciu", "10 (najstaršia sa zmaže)"],
                  ["Rotácia", "Automatická"],
                  ["Veľké datasety", "Rozdelenie na viacero súborov (chunking)"],
                  ["Formát", "JSON"],
                  ["Config zálohy", "SyncHub_Backups/Config/"],
                  ["Dátové zálohy", "SyncHub_Backups/Data/YYYY-MM-DD/"],
                ]}
              />
            </div>
          </div>
        </section>

        {/* MODULY */}
        <section data-testid="section-help-modules">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Detailná dokumentácia modulov</h2>
          <p className="text-sm leading-relaxed text-muted-foreground mb-6">
            Kompletná dokumentácia každého integrovaného modulu — API, autentifikácia, dátové polia a praktické poznámky.
          </p>

          {modules?.map((mod) => {
            const help = MODULE_HELP[mod.code];
            const swaggerUrl = mod.config?.swaggerUrl;
            if (!help) return null;

            return (
              <div key={mod.id} className="mb-10 print:break-inside-avoid" data-testid={`help-module-detail-${mod.code}`}>
                <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                  {mod.name}
                  <span className="text-xs font-mono text-muted-foreground font-normal">({mod.code})</span>
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {mod.apiType} · {mod.authType}
                  {mod.docsUrl && (
                    <>
                      {" · "}
                      <a href={mod.docsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                        data-testid={`link-docs-${mod.code}`}>
                        Docs <ExternalLink className="h-2.5 w-2.5 inline" />
                      </a>
                    </>
                  )}
                  {swaggerUrl && (
                    <>
                      {" · "}
                      <a href={swaggerUrl} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                        data-testid={`link-swagger-${mod.code}`}>
                        Swagger <ExternalLink className="h-2.5 w-2.5 inline" />
                      </a>
                    </>
                  )}
                </p>

                <div className="space-y-4 ml-0">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Popis</h4>
                    <TextBlock text={help.description} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-1">API informácie</h4>
                    <TextBlock text={help.apiInfo} />
                  </div>
                  {help.endpoints && help.endpoints.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Endpointy</h4>
                      <div className="bg-muted/50 rounded p-3 space-y-0.5">
                        {help.endpoints.map((ep, i) => (
                          <p key={i} className="text-xs font-mono text-muted-foreground">{ep}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium mb-1">Autentifikácia</h4>
                    <TextBlock text={help.authInfo} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-1">Dátové polia</h4>
                    <TextBlock text={help.dataFields} />
                  </div>
                  {help.notes && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Poznámky</h4>
                      <TextBlock text={help.notes} />
                    </div>
                  )}
                  {help.links && help.links.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Užitočné odkazy</h4>
                      <div className="flex flex-wrap gap-3">
                        {help.links.map((link, i) => (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                            {link.label} <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-b mt-6" />
              </div>
            );
          })}
        </section>

        {/* DOKUMENTY */}
        <section data-testid="section-help-documents">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Dokumenty a manuály dodávateľov</h2>
          <p className="text-sm leading-relaxed text-muted-foreground mb-3">
            PDF dokumenty s technickými špecifikáciami API a dátových feedov dodávateľov.
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

        {/* CHANGELOG */}
        <section data-testid="section-help-changelog" className="print:break-inside-avoid">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Changelog — čo je nové</h2>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">

            <div>
              <strong className="text-foreground font-mono">v1.25.0</strong> <span className="text-xs">(apríl 2026)</span>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li><strong className="text-foreground">Delta sync</strong> — MD5 porovnanie, odosielajú sa len zmenené záznamy (dramatická úspora času)</li>
                <li>Tabuľka <code className="text-xs bg-muted px-1 rounded">sync_baselines</code> s unikátnym indexom (configId, recordKey)</li>
                <li>Checkbox "Full sync" v Quick Sync UI pre force full sync</li>
                <li>DELTA/FULL badge + štatistiky (stiahnuté / zmenené / preskočené) v run paneli</li>
                <li>Kompletná in-app dokumentácia (help.tsx) so sekciami o sync engine, delta sync, ONIX integrácii</li>
                <li>Aktualizovaný replit.md s plnou technickou dokumentáciou projektu</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground font-mono">v1.24.x</strong> <span className="text-xs">(apríl 2026)</span>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>Endpoint <code className="text-xs bg-muted px-1 rounded">/api/my-ip</code> — zistenie odchádzajúcej IP produkcie (pre ESET whitelisting na ONIX serveri)</li>
                <li>Automatické čistenie zombie runov pri štarte servera (running → error)</li>
                <li><code className="text-xs bg-muted px-1 rounded">/api/sync-runs/active</code> vracia aj DB running runy (nielen in-memory)</li>
                <li>Force-stop zombie runov cez cancel endpoint</li>
                <li>Odstránená 300ms zbytočná pauza medzi POST requestmi (úspora ~8h na 100k sync)</li>
                <li>Resilientné DB zápisy — 5 pokusov s exponenciálnym backoffom (3s × pokus)</li>
                <li>Concurrency znížená na 1 (ONIX nepodporuje paralelné POST)</li>
                <li>Sliding-window ETA (rolling average posledných 5 dávok)</li>
                <li>Globálny sync indikátor v sidebar (pulzujúci zelený bod, polling každých 5s)</li>
                <li>Formát dĺžky trvania zobrazuje hodiny (napr. "2h 15m")</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground font-mono">v1.23.0</strong> <span className="text-xs">(apríl 2026)</span>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>Editovateľný limit záznamov v sync konfigurácii (predvolené: 120 000)</li>
                <li>Nový predvolený sklad: Sklad_SyncHub (kód: SYN) pre ONIX push</li>
                <li>Rozšírená ONIX dokumentácia — Swagger DEMO, POST povinné polia, sklady, read-only polia</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground font-mono">v1.22.0</strong> <span className="text-xs">(apríl 2026)</span>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>ModuleHints — kontextové nápovedy pri konfigurácii sync (ONIX/Pipedrive/Raynet)</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground font-mono">v1.21.x</strong> <span className="text-xs">(apríl 2026)</span>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>Multi-file zálohy na Google Drive (chunking veľkých datasetov)</li>
                <li>SpeedGauge — vizuálne zobrazenie latencie ONIX API</li>
                <li>ONIX push: Default_Stock opravený na kód skladu (string namiesto ID)</li>
                <li>Úspešná synchronizácia 10 000+ záznamov PROMOTRON → ONIX</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground font-mono">v1.20.x</strong> <span className="text-xs">(apríl 2026)</span>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>hasVal() funkcia — správna detekcia prázdnych/whitespace hodnôt</li>
                <li>Default_Price=0 fallback pre nové záznamy</li>
                <li>Retry logika pre HTTP 503/504/429 (3×, 3s backoff)</li>
                <li>Paralelný ONIX push — 3 súbežné API volania (neskôr znížené na 1)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* KONTAKT */}
        <section data-testid="section-help-contact" className="print:break-inside-avoid">
          <h2 className="text-lg font-semibold border-b pb-2 mb-3">Kontakt a podpora</h2>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>Pre technickú podporu, hlásenie chýb alebo požiadavky na nové funkcie kontaktujte administrátora systému.</p>
            <p>Všetky zmeny a akcie sú zaznamenávané v <strong className="text-foreground">Audit Logu</strong> pre prehľadnosť a bezpečnosť.</p>
            <p>Zdrojový kód: <strong className="text-foreground">github.com/rsedaj/synchub</strong> (privátny repozitár)</p>
            <p>ONIX podpora (KROS a.s.): <strong className="text-foreground">servis.onix@kros.sk</strong></p>
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            &copy; {new Date().getFullYear()} SEDAJ s.r.o. — Hauerland Integration Platform · {APP_VERSION}
          </p>
        </section>

      </article>
    </div>
  );
}
