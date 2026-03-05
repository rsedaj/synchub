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

interface HelpSection {
  title: string;
  content: string;
}

const MODULE_HELP: Record<string, { description: string; apiInfo: string; endpoints?: string[]; authInfo: string; dataFields: string; notes?: string; links?: { label: string; url: string }[] }> = {
  ONIX: {
    description: "Centrálny ERP systém ONIX od spoločnosti KROS a.s. Slúži ako hlavný zdroj dát (master data) pre celú platformu SyncHub. Všetky ostatné moduly sa synchronizujú práve s ONIX — produkty, ceny, skladové zásoby, objednávky a faktúry.\n\nONIX spravuje kompletný životný cyklus produktu: od vytvorenia skladovej karty, cez naskladnenie, predaj, až po fakturáciu. SyncHub z neho číta aktuálne dáta a zapisuje späť objednávky z e-shopu a CRM.",
    apiInfo: "REST API dostupné na internom serveri (IP: 195.146.148.139). Swagger dokumentácia je priamo na serveri na /onix_api/swagger/ui/index.\n\nAPI podporuje operácie:\n• Čítanie skladových kariet (stock cards) — produkty, varianty, EAN kódy\n• Čítanie a zápis cien (nákupná, manažérska, predajná, akciová)\n• Čítanie skladových zásob v reálnom čase\n• Vytváranie a čítanie objednávok\n• Správa odberateľov a dodávateľov\n• Fakturácia a platobné doklady\n\nFormát: JSON. Stránkovanie cez offset/limit parametre.",
    endpoints: [
      "GET /api/StockCards — zoznam skladových kariet",
      "GET /api/StockCards/{id} — detail skladovej karty",
      "GET /api/Prices — cenníky podľa skupín",
      "GET /api/StockAvailability — aktuálne stavy skladu",
      "POST /api/Orders — vytvorenie objednávky",
      "GET /api/Orders — zoznam objednávok",
      "GET /api/Partners — odberatelia a dodávatelia",
      "GET /api/Invoices — faktúry a doklady",
    ],
    authInfo: "API Token autentifikácia — token sa posiela v hlavičke Authorization pri každej požiadavke.\n\nToken sa generuje v administrácii ONIX (Nastavenia → Externé prepojenia → Web API). Token je viazaný na konkrétnu firmu/databázu v ONIX.\n\nPre získanie tokenu kontaktujte správcu ONIX systému vo firme SEDAJ s.r.o.",
    dataFields: "Skladové karty: kód, názov, popis, EAN, merná jednotka, skupina, kategória, výrobca, krajina pôvodu, colný sadzobník (Intrastat)\nCeny: nákupná cena, manažérska cena, predajná cena (bez/s DPH), akciová cena, mena\nSklady: aktuálny stav, rezervácie, dostupné množstvo, minimálne zásoby\nObjednávky: číslo, dátum, odberateľ, položky, stav, celková suma\nPartneri: IČO, DIČ, IČ DPH, adresa, kontaktné údaje",
    notes: "ONIX je on-premise systém bežiaci na internom serveri SEDAJ s.r.o. API je dostupné len z povolenej siete (VPN alebo whitelist IP).\n\nDôležité:\n• API server: 195.146.148.139 (interný)\n• Swagger UI: http://195.146.148.139/onix_api/swagger/ui/index\n• Databáza: SQL Server\n• Výrobca: KROS a.s. (www.kros.sk)\n• Podpora: KROS helpdesk alebo interný IT\n\nSynchronizačný tok:\n1. ONIX → SyncHub: produkty, ceny, sklady (čítanie)\n2. SyncHub → ONIX: objednávky z e-shopu, CRM dáta (zápis)\n3. Frekvencia: nastaviteľná podľa modulu (real-time / interval)",
    links: [
      { label: "ONIX Web API Dokumentácia", url: "https://onix.kros.sk/externe-prepojenie/web-api-dokumentacia/" },
      { label: "KROS a.s. — výrobca ONIX", url: "https://www.kros.sk" },
      { label: "ONIX Swagger UI", url: "http://195.146.148.139/onix_api/swagger/ui/index" },
    ],
  },
  PROMOTRON: {
    description: "E-shop platforma TronShop od spoločnosti Promotron (shop.hauerland.sk). Hlavný predajný kanál firmy Hauerland / SEDAJ s.r.o. pre reklamné predmety a darčekové produkty.\n\nTronShop API poskytuje kompletný prístup k e-shopovým dátam: objednávky (vrátane zmeny stavov), zákazníci, dopyty (inquiries), košíky (carts), kupóny a produktový katalóg. Navyše je dostupný verejný XML product feed (~99 000 produktov) vo formáte RSS/Google Shopping.\n\nSyncHub slúži ako most medzi e-shopom a ERP systémom ONIX — automatizuje import objednávok, synchronizáciu skladov a aktualizáciu produktového katalógu.",
    apiInfo: "TronShop REST API (v1) — 15 endpointov rozdelených do 6 skupín:\n\n1. Objednávky (Orders): čítanie zoznamu, detail podľa GUID, zmena stavu (single + bulk)\n2. Platby (Payments): zmena platobného stavu (single + bulk)\n3. Zákazníci (Customers): zoznam + detail podľa personGuid\n4. Dopyty (Inquiries): zoznam + detail podľa inquiryGuid\n5. Košíky (Carts): aktuálne otvorené košíky (carts-v2) + staršia verzia (carts)\n6. Produkty & Kupóny: produktový katalóg, zoznam kupónov\n\nFormát: JSON. Base URL: https://api-ts-westeu.promotron.com\nXML Feed: https://feed.hauerland.sk/hau-feed.xml (verejný, ~99 000 produktov, RSS formát)",
    endpoints: [
      "GET /tronshop-api/orders — zoznam objednávok (filtrovanie podľa dátumu, stavu)",
      "GET /tronshop-api/orders/{orderGuid} — detail objednávky (položky, adresa, platba)",
      "POST /tronshop-api/orders/state — zmena stavu jednej objednávky",
      "POST /tronshop-api/orders/state/bulk — hromadná zmena stavu objednávok",
      "GET /tronshop-api/customers — zoznam zákazníkov",
      "GET /tronshop-api/customers/{personGuid} — detail zákazníka (adresy, kontakty)",
      "GET /tronshop-api/inquiries — zoznam dopytov od zákazníkov",
      "GET /tronshop-api/inquiries/{inquiryGuid} — detail dopytu",
      "GET /tronshop-api/carts-v2 — aktuálne otvorené košíky (nová verzia)",
      "GET /tronshop-api/carts-v2/{trackingId} — detail košíka podľa tracking ID",
      "GET /tronshop-api/carts — košíky (staršia verzia, spätná kompatibilita)",
      "GET /tronshop-api/coupons — zoznam zľavových kupónov",
      "GET /tronshop-api/products — produktový katalóg e-shopu",
      "POST /tronshop-api/payment-state — zmena platobného stavu objednávky",
      "POST /tronshop-api/payment-state/bulk — hromadná zmena platobných stavov",
    ],
    authInfo: "API Key autentifikácia — kľúč sa posiela v HTTP hlavičke pri každej požiadavke.\n\nZískanie API kľúča:\n1. Prihlásiť sa do administrácie TronShop (admin panel e-shopu)\n2. Nastavenia → Integrácie → API prístupy\n3. Vygenerovať nový API kľúč\n\nXML Feed na feed.hauerland.sk je verejne dostupný bez autentifikácie.\n\nDôležité: API kľúč je viazaný na konkrétny e-shop (shop.hauerland.sk).",
    dataFields: "Objednávky: číslo, dátum, stav (New/Processing/Sent/Completed/Cancelled), platobný stav, zákazník, dodacia adresa, fakturačná adresa, položky (produkt, množstvo, cena), doprava, platobná metóda, poznámky\nZákazníci: meno, email, telefón, firma, IČO, DIČ, adresy (fakturačná/dodacia), registrácia\nDopyty: predmet, text, zákazník, produkt, dátum, stav\nKošíky: tracking ID, položky, množstvá, ceny, dátum vytvorenia\nKupóny: kód, typ zľavy (%, €), platnosť, minimálna hodnota, použitie\nProdukty: názov, popis, cena, kategória, dostupnosť, obrázky, varianty",
    notes: "Praktické informácie pre integráciu:\n\nAPI Base URL: https://api-ts-westeu.promotron.com\nXML Feed URL: https://feed.hauerland.sk/hau-feed.xml\nSwagger UI: https://api-ts-westeu.promotron.com/swagger/index.html\n\nSynchronizačné scenáre:\n• Objednávky: e-shop → SyncHub → ONIX (nové objednávky každých 5 min)\n• Stavy objednávok: ONIX → SyncHub → e-shop (spätná synchronizácia stavov)\n• Platby: sledovanie a aktualizácia platobných stavov\n• Produkty: ONIX → SyncHub → e-shop (ceny, dostupnosť, popisy)\n• Zákazníci: e-shop → SyncHub → ONIX (noví zákazníci, kontakty)\n\nXML Feed (~99 000 produktov):\n• Formát: RSS 2.0 / Google Shopping\n• Obsahuje: title, description, link, image, price, availability, gtin, brand\n• Aktualizácia: automatická pri zmene v e-shope\n• Použitie: Google Merchant Center, porovnávače cien, marketplace integrácie",
    links: [
      { label: "TronShop API Swagger", url: "https://api-ts-westeu.promotron.com/swagger/index.html" },
      { label: "Promotron API Dokumentácia", url: "https://support.promotron.com/hc/en-us/articles/16618416323473-TronShop-API-access-reading-data-from-orders-inquiries-and-customers" },
      { label: "E-shop Hauerland", url: "https://shop.hauerland.sk" },
      { label: "XML Product Feed", url: "https://feed.hauerland.sk/hau-feed.xml" },
    ],
  },
  PIPEDRIVE: {
    description: "CRM systém Pipedrive pre správu obchodných príležitostí (deals), kontaktov, firiem a aktivít. Pripojené konto: sedajsro (používateľ Rastislav Šedaj, rs@sedaj.com).\n\nPipedrive slúži ako centrálny nástroj obchodného tímu pre sledovanie obchodných prípadov od prvého kontaktu až po uzavretie. SyncHub ho prepája s ONIX ERP pre automatické vytváranie objednávok z vyhraných dealov a synchronizáciu zákazníckych dát.",
    apiInfo: "REST API v1 — kompletný prístup ku všetkým Pipedrive entitám cez HTTPS.\n\nHlavné entity:\n• Deals — obchodné prípady (pipeline, fáza, hodnota, mena, kontakt, organizácia)\n• Persons — kontaktné osoby (meno, email, telefón, organizácia)\n• Organizations — firmy (názov, adresa, sektor, vlastné polia)\n• Activities — aktivity (hovory, emaily, stretnutia, úlohy, deadliny)\n• Leads — leady (nequalifikované príležitosti pred konverziou na deal)\n• Products — produkty/služby pripojené k dealom (cena, množstvo)\n\nĎalšie dostupné endpointy:\n• Pipelines & Stages — obchodné procesy a ich fázy\n• Users — používatelia a tímy\n• Notes — poznámky k dealom a kontaktom\n• Files — prílohy a dokumenty\n• Filters — uložené filtre a zobrazenia\n\nFormát: JSON. Stránkovanie: start + limit parametre (max 500 záznamov/požiadavka).",
    endpoints: [
      "GET /v1/deals — zoznam dealov (filtrovanie, radenie, stránkovanie)",
      "GET /v1/deals/{id} — detail dealu (vrátane custom polí)",
      "GET /v1/persons — zoznam kontaktov",
      "GET /v1/persons/{id} — detail kontaktu (emaily, telefóny, dealy)",
      "GET /v1/organizations — zoznam organizácií",
      "GET /v1/organizations/{id} — detail organizácie",
      "GET /v1/activities — zoznam aktivít (hovory, stretnutia, úlohy)",
      "GET /v1/leads — zoznam leadov",
      "GET /v1/products — zoznam produktov/služieb",
      "GET /v1/pipelines — obchodné procesy (pipeline definície)",
      "GET /v1/stages — fázy v pipeline (poradie, pravdepodobnosť)",
      "GET /v1/users/me — aktuálny používateľ (overenie pripojenia)",
    ],
    authInfo: "Personal API Token autentifikácia — token sa pridáva ako query parameter ?api_token=... ku každej požiadavke.\n\nPripojené a overené konto:\n• Firma: sedajsro\n• Používateľ: Rastislav Šedaj (rs@sedaj.com)\n• Token: nakonfigurovaný v Settings\n\nToken sa nachádza v: Pipedrive → Settings → Personal preferences → API → Personal API Token.\n\nDôležité: Personal API Token má prístup ku všetkým dátam používateľa. Pre produkčné nasadenie zvážte OAuth 2.0 integráciu s obmedzenými scope.",
    dataFields: "Deals: názov, hodnota, mena, pipeline, fáza (stage), stav (open/won/lost), očakávaný dátum uzavretia, kontakt, organizácia, vlastník, custom polia\nPersons: meno, email(y), telefón(y), organizácia, poznámky, dealy, aktivity\nOrganizations: názov, adresa, vlastník, počet dealov, ľudia, custom polia\nActivities: typ (call/meeting/task/email), predmet, popis, dátum/čas, trvanie, kontakt, deal, stav (done/undone)\nLeads: názov, zdroj, kontakt, očakávaná hodnota, poznámky\nProducts: názov, kód, jednotková cena, mena, daň, kategória, viditeľnosť",
    notes: "Data Preview v SyncHub:\n6 zdrojov dát dostupných v dropdown menu — Deals, Contacts (Persons), Organizations, Activities, Leads, Products. Každý zdroj zobrazuje tabuľkový náhľad s prvými 20 záznamami.\n\nSynchronizačné scenáre:\n• Won deals → ONIX objednávky (automatické vytváranie)\n• Nové kontakty z e-shopu → Pipedrive persons\n• ONIX produkty → Pipedrive products (katalóg)\n• Aktivity: automatické logovanie e-mailov a hovorov\n\nPipeline štruktúra (sedajsro):\nDeal prechádza fázami podľa nastaveného pipeline v Pipedrive. Každá fáza má priradenú pravdepodobnosť úspechu.\n\nAPI limity:\n• 80 požiadaviek / 2 sekundy (štandardný plán)\n• Max 500 záznamov na stránku\n• Rate limiting: 429 Too Many Requests → automatický retry po pauze",
    links: [
      { label: "Pipedrive API Dokumentácia", url: "https://developers.pipedrive.com/docs/api/v1" },
      { label: "Pipedrive Dashboard", url: "https://sedajsro.pipedrive.com" },
      { label: "API Rate Limits", url: "https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting" },
    ],
  },
  GIVING: {
    description: "Dodávateľ reklamných predmetov Giving Europe B.V. (Holandsko). Jeden z najväčších európskych dodávateľov promo produktov s katalógom ~1 600 produktov.\n\nDebtor API poskytuje kompletný prístup pre odberateľov: produktový katalóg s obrázkami, kategórie, aktuálne skladové zásoby, cenové kalkulácie (vrátane potlače), metódy personalizácie a správu objednávok.\n\nAPI podporuje sandbox (testovacie) aj production prostredie s odlišnými tokenmi.",
    apiInfo: "REST Debtor API (v1) — JSON formát. Dva prostredia:\n\n• Sandbox: https://debtorapi-sandbox.givingeurope.com (testovanie, konto: hauerland)\n• Production: https://debtorapi.givingeurope.com (ostré dáta, konto: hau-web)\n\nHlavné skupiny endpointov:\n1. Products — katalóg (~1 600 produktov), obrázky, popisy, špecifikácie\n2. Categories — stromová štruktúra kategórií\n3. Stock Levels — aktuálne skladové zásoby v reálnom čase\n4. Price Breakdowns — cenové kalkulácie podľa množstva a potlačovej techniky\n5. Print Methods — dostupné metódy potlače (sieťotlač, tampónová tlač, laser, atď.)\n6. Print Handlings — manipulačné poplatky pre potlač\n7. Orders — vytváranie a sledovanie objednávok\n\nAPI vracia lokalizované dáta v 7 jazykoch: DE, EN, ES, FR, IT, NL, PT.",
    endpoints: [
      "GET /v1/products — kompletný katalóg produktov (stránkovaný)",
      "GET /v1/products/{code} — detail produktu podľa kódu",
      "GET /v1/products/{code}/prices/breakdown — cenová kalkulácia s potlačou",
      "GET /v1/categories — stromová štruktúra kategórií",
      "GET /v1/stock_levels — aktuálne skladové zásoby všetkých produktov",
      "GET /v1/stock_levels/{code} — sklad konkrétneho produktu",
      "GET /v1/print_methods — dostupné metódy personalizácie",
      "GET /v1/print_handlings — manipulačné poplatky potlače",
      "POST /v1/orders — vytvorenie novej objednávky",
      "GET /v1/orders — zoznam objednávok",
      "GET /v1/orders/{id} — detail objednávky",
    ],
    authInfo: "Bearer Token autentifikácia — token sa posiela v hlavičke Authorization: Bearer {token}.\n\nDva tokeny (sandbox/production):\n• Sandbox token: pre testovanie (konto hauerland) — nakonfigurovaný v Settings ako API Token\n• Production token: pre ostré dáta (konto hau-web) — nakonfigurovaný ako API Token Prod\n\nAktívne prostredie sa prepína v Settings (pole Environment: sandbox/production).\n\nTokeny sa získavajú od obchodného zástupcu Giving Europe alebo cez Debtor Portal.",
    dataFields: "Products: kód (napr. MO6555), názov, popis (lokalizovaný), kategória, materiál, rozmery, hmotnosť, balenie, MOQ, krajina pôvodu, colný kód, obrázky (viacero uhlov + lifestyle), farby, veľkosti\nStock Levels: kód produktu, aktuálny stav, dostupné množstvo, očakávané dodávky (dátum + množstvo)\nPrice Breakdowns: základná cena, cena s potlačou, cenové stupne podľa množstva (100/250/500/1000/2500/5000 ks), setup fee\nPrint Methods: názov techniky, popis, maximálne farby, pozície na produkte, veľkosti plochy\nOrders: číslo, dátum, stav, položky, doprava, celková suma",
    notes: "Praktické informácie:\n\n• Sandbox je plne funkčný na testovanie — rovnaké API ako produkcia\n• Objednávkové API je stále v testovacej fáze (rozhranie sa môže meniť)\n• Produktové obrázky sú vo vysokom rozlíšení (800×800 px a vyššie)\n• Cenové kalkulácie zahŕňajú: základnú cenu produktu + cenu potlače + setup poplatky\n• Skladové zásoby sa aktualizujú v reálnom čase\n\nSynchronizačné scenáre:\n• Produktový katalóg → ONIX skladové karty (import nových produktov)\n• Ceny → ONIX cenníky (nákupné ceny pre kalkulácie)\n• Sklady → kontrola dostupnosti pred objednávkou\n• Objednávky → automatické odoslanie cez API po schválení v ONIX\n\nData Preview v SyncHub:\nPodporuje sandbox aj production prostredie. Zobrazuje prvých 20 produktov s náhľadom všetkých dostupných polí.",
    links: [
      { label: "API Dokumentácia (Swagger)", url: "https://debtorapi-sandbox.givingeurope.com/spec/index.html" },
      { label: "Giving Europe Web", url: "https://www.givingeurope.com/global/en/" },
      { label: "Debtor Portal", url: "https://debtorportal.givingeurope.com" },
    ],
  },
  MID: {
    description: "Dodávateľ reklamných predmetov Midocean Brands B.V. (Holandsko). Jeden z najväčších európskych dodávateľov promo produktov s vlastnými skladmi v NL a PL.\n\nDva spôsoby integrácie:\n1. REST API — live dotazy s JSON/XML/CSV výstupom, zákaznícky špecifické ceny a objednávky\n2. SFTP — súbory na stiahnutie (XML v1.0/v1.1, CSV v2.0) na transfer.midocean.com\n\nSyncHub používa REST API pre real-time prístup k produktom, skladom, cenníkom, potlačovým dátam a objednávkam.\n\nDva prostredia:\n• Production: api.midocean.com (reálne dáta, reálne objednávky)\n• Test: apitest.midocean.com (na testovanie, vypnuté mimo pracovných hodín v EÚ)\n\nAktivované API subscriptions (stav k marcu 2026):\n✅ Pricelist — zákaznícky špecifické ceny\n✅ Printdata — potlačové techniky, pozície, veľkosti\n✅ Printpricelist — cenníky potlače s 5 typmi výpočtu\n✅ Products — kompletný katalóg (21 500+ SKU)\n✅ Stock — skladové zásoby (21 500+ položiek, aktualizácia každú hodinu)\n☐ Order — vytváranie objednávok (zatiaľ neaktivované)\n☐ Proof — schvaľovanie/zamietanie proofov a nahrávanie artworkov (zatiaľ neaktivované)",
    apiInfo: "REST API — Base URL: https://api.midocean.com\nDokumentácia: v1.10.1 (02-11-2023)\n\n5 informačných endpointov (aktívnych) + 2 servisné (neaktívne) + 1 proof:\n\n1. Products v2.0 — kompletný katalóg vrátane textilu\n   • Popis, obrázky, atribúty, varianty, kategórie, certifikáty\n   • 15 jazykov: EN, DE, ES, FR, IT, HU, NL, PL, PT, RO, RU, SV, NO, CS, DA, FI\n   • Parameter ?language=sk pre slovenčinu\n   • Formáty: JSON (application/json), XML (text/xml), CSV (text/csv)\n   • Aktualizácia: denne (v noci)\n\n2. Stock v2.0 — aktuálne skladové zásoby\n   • SKU, aktuálny stav, najbližšie 2 dodávky (dátum + množstvo)\n   • Agregát skladov NL + PL\n   • Formáty: JSON, XML, CSV\n   • Aktualizácia: každú hodinu\n\n3. Pricelist v2.0 — zákaznícky špecifické ceny\n   • Ceny podľa vašej partnerskej zmluvy (rovnaké ako na webshope)\n   • Množstevné stupne (scales) — minimum_quantity + price\n   • Formáty: JSON, XML, CSV\n   • Aktualizácia: denne\n\n4. Print Data v1.0 — potlačové informácie\n   • Pozície, techniky, maximálne veľkosti, max farby, šablóny (PDF URL)\n   • Preklady názvov techník v 15 jazykoch\n   • Formáty: JSON, XML (bez CSV)\n   • Aktualizácia: denne\n\n5. Print Pricelist v2.0 — ceny potlače\n   • Cenníky podľa techniky a manipulačnej skupiny (A-E, Z)\n   • 5 typov výpočtu: NumberOfPositions, NumberOfColours, Area, AreaRange, ColourAreaRange\n   • Formáty: JSON, XML, CSV\n   • Aktualizácia: denne\n\nServisné endpointy (neaktivované):\n6. Order v2.1 — vytváranie objednávok (NORMAL, PRINT, SAMPLE) + detail a tracking\n   • Formáty: JSON, XML\n7. Proof v1.0 — schvaľovanie/zamietanie proofov (/approve, /reject), nahrávanie artworkov (/addartwork)\n   • Formáty: JSON\n\nFormáty výstupu sa nastavujú cez Accept header:\n• application/json — JSON (predvolený, najpodrobnejší)\n• text/xml — XML\n• text/csv — CSV (nie pre Print Data a Proof)",
    endpoints: [
      "GET /gateway/products/2.0?language={lang} — produktový katalóg (JSON/XML/CSV)",
      "GET /gateway/stock/2.0 — skladové zásoby, aktualizácia každú hodinu (JSON/XML/CSV)",
      "GET /gateway/pricelist/2.0 — zákaznícky cenník, individuálne ceny (JSON/XML/CSV)",
      "GET /gateway/printdata/1.0 — potlačové dáta: pozície, techniky, plochy, šablóny (JSON/XML)",
      "GET /gateway/printpricelist/2.0 — cenník potlače, 5 typov výpočtu (JSON/XML/CSV)",
      "POST /gateway/order/2.1/create — vytvorenie objednávky NORMAL/PRINT/SAMPLE (JSON/XML) [neaktívne]",
      "GET /gateway/order/2.1/detail?order_number={num} — detail a tracking objednávky [neaktívne]",
      "POST /gateway/proof/1.0/approve — schválenie proofu (JSON) [neaktívne]",
      "POST /gateway/proof/1.0/reject — zamietnutie proofu (JSON) [neaktívne]",
      "POST /gateway/proof/1.0/addartwork — nahranie artwork súboru (JSON) [neaktívne]",
    ],
    authInfo: "API Key autentifikácia — kľúč sa posiela v HTTP hlavičke:\n   Key: x-Gateway-APIKey\n   Value: váš-api-kľúč\n\nVáš Production API Key: ✅ nakonfigurovaný v SyncHub (9cca...6783)\n\nAktivované subscriptions: Pricelist ✅, Printdata ✅, Printpricelist ✅, Products ✅, Stock ✅\nNeaktivované: Order ☐, Proof ☐\n\nZískanie API kľúča:\n1. Prihlásiť sa na www.midocean.com → Account → Customer API tab\n2. Váš REST API Key sa zobrazí okamžite\n3. Zaškrtnúť požadované API a kliknúť 'Update' na aktiváciu subscriptions\n\nDva prostredia:\n• Production key — z webshop účtu (reálne dáta, reálne objednávky)\n• Test key — vyžiadať od obchodného zástupcu (testovacie prostredie, vypnuté mimo EÚ pracovných hodín)\n\nDôležité: Ak dostanete chybu 'Unauthorized Application Request', overte:\n• Správne napísaný kľúč v hlavičke x-Gateway-APIKey\n• Aktivované subscriptions pre požadované API (Account → Customer API → checkboxy)\n• Ak kľúč nefunguje: Account → Customer API → Request new API key",
    dataFields: "Products v2.0 (najkompletnejší formát — JSON):\n• Identifikácia: master_code, sku, master_id, variant_id, product_name\n• Stav: plc_status (NEW = novinka, COLLECTION = štandard, OUTLET = vypredaj do 0)\n• Popis: short_description, long_description (viacjazyčný podľa ?language=)\n• Fyzické: dimensions, net_weight, gross_weight, gross_weight_unit\n• Farby: color_code, color_description, color_group, pms_color\n• Textil: size_textile (XS-5XL)\n• Materiál: material, green (eko produkt = true/false), printable\n• Značka: brand, category_code, product_class\n• Kategórie: category_level1/2/3 (hierarchia)\n• Obchod: commodity_code (Intrastat/HS kód), country_of_origin, gtin (EAN)\n• Dátumy: release_date, discontinued_date\n• Obrázky: digital_assets[] (URL, type=image, subtype: item_picture_front/back, item_ambiant_picture, item_picture_box, item_picture_print, item_picture_side — rozlíšenie 700×700 + original)\n• Balenie: packaging (inner_carton_qty, carton_qty, carton_length/width/height, carton_weight/volume, polybag)\n\nSFTP verzie (doplnkové):\n• v1.0 XML: základný formát bez obrázkov, textil v samostatnom súbore\n• v1.1 XML: + viacero obrázkov (digital_assets), textil v jednom súbore\n• v2.0 CSV: tabuľkový formát s rovnakými poliami ako REST API JSON\n\nStock v2.0:\n• sku — identifikátor produktu\n• qty — aktuálny počet kusov (NL + PL sklad dokopy)\n• first_arrival_date, first_arrival_qty — najbližšia dodávka (dátum + počet)\n• next_arrival_date, next_arrival_qty — druhá dodávka v poradí\n\nPricelist v2.0:\n• sku, variant_id — identifikácia\n• price — vaša zákaznícky špecifická cena (so všetkými zľavami)\n• valid_until — platnosť ceny\n• scale[] — množstevné stupne: minimum_quantity + price (čím viac kusov, tým nižšia cena)\n\nPrint Data v1.0:\n• master_code, master_id — identifikácia produktu\n• item_color_numbers — pre ktoré farby platí\n• print_manipulation — manipulačná skupina (A/B/C/D/E/Z)\n• printing_positions[] — pozície pre potlač:\n  - position_id — identifikátor pozície\n  - max_print_size_height, max_print_size_width — max veľkosť v mm\n  - printing_techniques[] — dostupné techniky (id, max_colours)\n• print_template — URL na PDF šablónu pozície\n\nPrint Pricelist v2.0:\n• currency, validity — mena a platnosť\n• print_manipulations[] — manipulačné príplatky (code A-Z, description, price)\n• print_techniques[] — cenníky techník:\n  - id, description — identifikácia techniky\n  - pricing_type — typ výpočtu (NumberOfPositions/NumberOfColours/Area/AreaRange/ColourAreaRange)\n  - setup — jednorazový poplatok za prípravu\n  - setup_repeat — poplatok za opakovanie\n  - var_costs[] — variabilné náklady so scales (quantity + price)\n\nOrder v2.1 (zatiaľ neaktívne):\n• Vstup: po_number, order_type (NORMAL/PRINT/SAMPLE), items[] (sku/master_code, quantity), shipping_address, printing_positions[]\n• Výstup: order_number, total_item_price, total_print_costs, freight_charge, tracking\n\nProof v1.0 (zatiaľ neaktívne):\n• /approve — schválenie proofu\n• /reject — zamietnutie proofu\n• /addartwork — nahranie nového artwork súboru",
    notes: "STAV: ✅ PRIPOJENÉ — API kľúč aktívny, 5 endpointov funkčných\n\nSFTP prístup (doplnkový):\n• Server: sftp://transfer.midocean.com\n• Súbory: stock.xml, stock_textile.xml, prodinfo_{lang}.xml (v1.0/v1.1), prodinfo_{lang}.csv (v2.0), printinfo.xml, USBprodinfo.xml, USBpricelist.xml\n• SFTP účet sa žiada od obchodného zástupcu\n\nFrekvencia aktualizácie REST API:\n• Stock: každú hodinu (aktuálne 21 500+ SKU)\n• Products: denne (v noci)\n• Pricelist: denne\n• Print Data: denne\n• Print Pricelist: denne\n\nObjednávky cez API (Order v2.1, zatiaľ neaktívne):\n• NORMAL — nepotlačený tovar, bez limitu množstva (okrem textilu — min 20 ks!)\n• PRINT — s potlačou, konfigurácia pozícií a farieb\n• SAMPLE — vzorky, max 5 ks na riadok (aj textil)\n• Max 50 položiek na objednávku\n• po_number musí byť unikátne (API blokuje duplikáty)\n• Po odoslaní sa dá zrušiť len cez Customer Care\n\nProof API v1.0 (zatiaľ neaktívne):\n• Schválenie/zamietnutie proofu priamo cez API bez prístupu na webshop\n• Nahranie nového artwork súboru cez /addartwork\n• Na aktiváciu: Account → Customer API → zaškrtnúť 'Proof'\n\nTypy výpočtu potlačových cien (Print Pricelist):\n• NumberOfPositions — cena × počet pozícií × množstvo\n• NumberOfColours — cena × počet farieb × množstvo\n• Area — cena × plocha (cm²) × množstvo\n• AreaRange — cena podľa rozsahu plochy × množstvo\n• ColourAreaRange — kombinácia plochy a farieb\n\nCDN obrázky: cdn1.midocean.com/image/{size}/{sku}.jpg\n• Veľkosti: 700X700 (štandard), 170X170 (thumbnail), original (hi-res)\n• Typy: front, back, ambient, box, print, side\n• Príklad: https://cdn1.midocean.com/image/700X700/ar1249-16.jpg\n\nPLC Status produktov:\n• NEW — novinka z posledného katalógu\n• COLLECTION — štandardná kolekcia\n• OUTLET — vypredaj, vyradený po dopredaní (cena sa automaticky znižuje)\n\nChybové kódy:\n• 401/403 Unauthorized — nesprávny kľúč alebo neaktivovaná subscription\n• 503 Service Unavailable — test server mimo pracovných hodín EÚ\n• 999 (order) — chyba objednávky (insufficient stock, invalid date, duplicate po_number)\n\nSynchronizačné scenáre:\n• Products v2.0 → ONIX skladové karty (import katalógu, rozmery, hmotnosti, EAN, kategórie)\n• Pricelist v2.0 → ONIX nákupné cenníky (zákaznícky špecifické ceny s množstevnými stupňami)\n• Stock v2.0 → kontrola dostupnosti pred objednávkou (každú hodinu, 21 500+ položiek)\n• Order v2.1 → automatické objednávky z ONIX (po aktivácii subscription)\n• Proof v1.0 → automatizácia schvaľovacieho procesu (po aktivácii subscription)\n• Print Data + Print Pricelist → kalkulácie potlače pre e-shop Promotron/TronShop\n• CDN obrázky → e-shop (700×700 pre produktové stránky, 170×170 pre náhľady)",
    links: [
      { label: "Midocean Webshop (API Key)", url: "https://www.midocean.com" },
      { label: "Customer API (subscriptions)", url: "https://www.midocean.com/account/api" },
      { label: "Test API Environment", url: "https://apitest.midocean.com" },
      { label: "SFTP server", url: "sftp://transfer.midocean.com" },
      { label: "CDN obrázky (príklad)", url: "https://cdn1.midocean.com/image/700X700/ar1249-16.jpg" },
    ],
  },
  STICKER: {
    description: "Dodávateľ reklamných predmetov Stricker Europe (Paul Stricker S.A., Portugalsko). Jeden z najväčších európskych výrobcov promo produktov s vlastnou výrobou.\n\nTri značky: hi!dea (štandard), Branve (premium), Ekston (eko/premium), Original Lanyards (šnúrky na krk). Dva katalógy ročne: hi!dea (hlavný) a Stockout (dopredaj).\n\nREST API v2.20 poskytuje kompletný prístup: produkty, varianty (optionals), sklady, personalizácia, ceny a objednávky. Dáta dostupné aj ako súbory na stiahnutie (JSON/XML/CSV).",
    apiInfo: "REST API v2.20 na ws.stricker-europe.com — JSON formát.\n\nDva typy prístupu k dátam:\n1. Live API endpointy — real-time dotazy s filtráciou\n2. File Downloads — kompletné datasety na stiahnutie (JSON/XML/CSV)\n\nHlavné skupiny:\n• Products — produkty (referencia, názov, popis, kategória, značka)\n• Optionals — varianty/SKU (farba, veľkosť, cena, EAN)\n• Optionals Complete — varianty s kompletnou potlačovou informáciou\n• Stocks — skladové zásoby (PT sklad + CZ sklad + očakávané dodávky)\n• Colors — farebná paleta s RGB kódmi\n• Customization Options — potlačové techniky a pozície\n• Customization Tables — cenníky personalizácie\n• Product Types — kategórie a podkategórie\n• Catalog Prices — katalógové predajné ceny\n• Stocks by Country — sklady podľa krajiny (PT, CZ)\n• Orders — vytváranie a sledovanie objednávok",
    endpoints: [
      "POST /api/v1/authenticateclient — autentifikácia, vracia session token (24h)",
      "GET /api/v1/products — produkty (filter: lang, modifiedSince)",
      "GET /api/v1/optionals — varianty SKU s cenami (YourPrice = vaša nákupná cena)",
      "GET /api/v1/optionalscomplete — varianty + kompletné potlačové info",
      "GET /api/v1/stocks — sklady (celkový + PT + CZ + NextQuantities)",
      "GET /api/v1/colors — farebná paleta (názov, hex, RGB)",
      "GET /api/v1/customizationOptions — potlačové techniky a pozície na produkte",
      "GET /api/v1/customizationTables — cenníky personalizácie (cena podľa techniky a množstva)",
      "GET /api/v1/productTypes — kategórie a podkategórie produktov",
      "GET /api/v1/catalogPrices — katalógové predajné ceny (MSRP)",
      "GET /api/v1/StocksByCountry — sklady podľa krajiny odoslania",
      "POST /api/v1/orders — vytvorenie objednávky",
      "GET /downloads/v1/file — stiahnutie kompletných datasetov (JSON/XML/CSV)",
    ],
    authInfo: "Dvoj-kroková autentifikácia:\n\n1. AuthenticateClient — pošlete Access Key, dostanete session token\n   POST /api/v1/authenticateclient s telom {\"accessKey\": \"váš-kľúč\"}\n   → Odpoveď: {\"token\": \"session-token-xyz\"}\n\n2. Všetky ďalšie požiadavky — session token v hlavičke Authorization\n\nSession token platí max 24 hodín (SyncHub ho cachuje 23h pre istotu).\n\nAccess Key získate od obchodného manažéra Stricker Europe (kontaktujte svojho sales rep).\n\nDôležité: Token sa obnoví automaticky — SyncHub sleduje expiráciu a požiada o nový pred vypršaním.",
    dataFields: "Products: referencia, názov (lokalizovaný), popis, farba, veľkosť, kapacita, kategória, podkategória, brand (hidea/Branve/Ekston), materiál, hmotnosť, rozmery, krajina pôvodu, colný kód, obrázky (500/1000px)\nOptionals (SKU): SKU kód, referencia, farba, veľkosť, EAN, MOQ, YourPrice (vaša nákupná cena), PVP (katalógová cena), stav (active/discontinued)\nStocks: celkový stav, PT sklad (Portugalsko), CZ sklad (Česko), NextQuantities (očakávané dodávky s dátumom a množstvom)\nCustomization: technika (screen print, digital, laser, embroidery...), pozícia na produkte, rozmery plochy, max farby, ceny podľa množstevných stupňov, setup fee\nColors: ID, názov, hex kód, RGB hodnoty, skupina\nCatalog Prices: MSRP ceny pre koncových zákazníkov",
    notes: "Technické detaily:\n\nLimit požiadaviek na API:\n• Autentifikácia a objednávky: neobmedzené\n• Stocks: max 48 požiadaviek/deň\n• Ostatné endpointy: 1 požiadavka/jazyk/deň (dáta sa menia max 1x denne)\n\nJazyky: lang=SK pre slovenčinu. Podporované: SK, CZ, EN, DE, FR, ES, IT, NL, PT, PL, RO, HU, SE, DK, NO, FI a ďalšie.\n\nObrázky:\n• Produktové: 500px a 1000px (components, locations, printing lines)\n• Cloud pre HR obrázky: cloud.stricker.pt:8085 (heslo: hideacloudfiles)\n• Typy: hlavný obrázok, komponenty, lokácie potlače, čiary potlače\n\nFile Downloads:\n• Kompletné datasety: JSON, XML alebo CSV formát\n• Endpoint: /downloads/v1/file?type={products|optionals|stocks}&format={json|xml|csv}\n• Vhodné pre počiatočný import a denné synchronizácie\n\nSynchronizačné scenáre:\n• Produkty + Optionals → ONIX skladové karty (import katalógu)\n• YourPrice → ONIX nákupné ceny\n• Stocks → kontrola dostupnosti pred objednávkou\n• Customization Tables → kalkulácie potlače pre e-shop\n• Orders → automatické objednávky z ONIX",
    links: [
      { label: "Stricker Europe Web", url: "https://www.stricker-europe.com" },
      { label: "SOAP WSDL (legacy)", url: "http://ws.stricker-europe.com/strickerservice.svc?WSDL" },
      { label: "Cloud HR obrázky", url: "http://cloud.stricker.pt:8085/index.php/s/7AtUI9DImV7LYeK" },
      { label: "Stricker Brand hi!dea", url: "https://www.stricker-europe.com/en/hidea" },
    ],
  },
  MACMA: {
    description: "Dod\u00e1vate\u013e reklamn\u00fdch predmetov MACMA Werbeartikel OHG (Nemecko). Tradi\u010dn\u00fd nemeck\u00fd dod\u00e1vate\u013e promo produktov \u2014 per\u00e1, elektronika, outdoorov\u00e9 potreby, kancel\u00e1rske doplnky a dar\u010dekov\u00e9 sety. Zna\u010dky: M-Collection (premium), Macma (\u0161tandard).\n\nD\u00e1ta s\u00fa dostupn\u00e9 cez JSON API v2 na macma.sk \u2014 tri hlavn\u00e9 feedy: SKU (3 169 produktov, 25 pol\u00ed vr\u00e1tane obr\u00e1zkov), Pricelist (3 103 cenn\u00edkov\u00fdch polo\u017eiek), Stock (2 806 skladov\u00fdch z\u00e1znamov).\n\nJazyk: SK (sloven\u010dina) \u2014 jazyk je s\u00fa\u010das\u0165ou URL. Rovnak\u00e1 platforma ako Easy Gifts (easygifts.sk).",
    apiInfo: "JSON Data Feeds v2 na macma.sk\n\nTri hlavn\u00e9 feedy:\n1. SKU Feed \u2014 kompletn\u00fd produktov\u00fd katal\u00f3g (~3 169 produktov)\n   \u2022 25 pol\u00ed: id, catalogcode, name, description, brand, size, weight, color (object), origin, tariff, newitem, chapter, img (array URL), material, print, packing, video\n   \u2022 Form\u00e1t: JSON\n   \u2022 URL: /api/v2/{apiKey}/{lang}/sku.json\n\n2. Pricelist Feed \u2014 cenn\u00edk (~3 103 polo\u017eiek)\n   \u2022 6 pol\u00ed: id, name, price, pricestr, webprice, webpricestr\n   \u2022 Ceny v EUR\n   \u2022 URL: /api/v2/{apiKey}/{lang}/pricelist.json\n\n3. Stock Feed \u2014 skladov\u00e9 z\u00e1soby (~2 806 polo\u017eiek)\n   \u2022 5 pol\u00ed: id, name, local, regional, international\n   \u2022 URL: /api/v2/{apiKey}/{lang}/stock.json",
    endpoints: [
      "GET /api/v2/{apiKey}/sk/sku.json \u2014 produktov\u00fd katal\u00f3g (3 169 SKU, 25 pol\u00ed)",
      "GET /api/v2/{apiKey}/sk/pricelist.json \u2014 cenn\u00edk (ceny EUR)",
      "GET /api/v2/{apiKey}/sk/stock.json \u2014 sklady (local/regional/international)",
    ],
    authInfo: "API k\u013e\u00fa\u010d v URL \u2014 k\u013e\u00fa\u010d je s\u00fa\u010das\u0165ou feed URL adresy.\n\nAktu\u00e1lny k\u013e\u00fa\u010d: KssO...f3 (nakonfigurovan\u00fd, akt\u00edvny \u2705)\n\nPrihl\u00e1senie na web: macma.sk\n\u2022 Meno: hauerland\n\u2022 Heslo: ulo\u017een\u00e9 vo Vault\n\nURL vzor: https://macma.sk/api/v2/{apiKey}/{lang}/{feed}.json\n\u2022 apiKey \u2014 V\u0161etky zna\u010dky\n\u2022 lang \u2014 sk (sloven\u010dina)\n\u2022 feed \u2014 sku / pricelist / stock",
    dataFields: "SKU Feed (25 pol\u00ed):\n\u2022 id \u2014 unik\u00e1tny k\u00f3d produktu\n\u2022 catalogcode \u2014 k\u00f3d katal\u00f3gu\n\u2022 name \u2014 n\u00e1zov produktu (SK)\n\u2022 description \u2014 dlh\u00fd popis\n\u2022 brand \u2014 zna\u010dka (M-Collection, Macma)\n\u2022 size \u2014 rozmery (text)\n\u2022 weight \u2014 hmotnos\u0165 (kg)\n\u2022 color \u2014 objekt: { code, name, rgb }\n\u2022 origin \u2014 krajina p\u00f4vodu\n\u2022 tariff \u2014 coln\u00fd k\u00f3d (HS/Intrastat)\n\u2022 newitem \u2014 boolean\n\u2022 chapter \u2014 kateg\u00f3ria|podkateg\u00f3ria\n\u2022 img \u2014 pole URL obr\u00e1zkov\n\u2022 mainpic \u2014 hlavn\u00fd obr\u00e1zok\n\u2022 material, print, packing, video\n\nPricelist (6 pol\u00ed): id, name, price (EUR net), pricestr, webprice, webpricestr\n\nStock (5 pol\u00ed): id, name, local (SK sklad), regional (EU), international (centr\u00e1lny)",
    notes: "STAV: \u2705 PRIPOJEN\u00c9 \u2014 3 feedy akt\u00edvne (SKU, Pricelist, Stock)\n\n\u0160tatistiky:\n\u2022 SKU: 3 169 produktov (kompletn\u00fd katal\u00f3g)\n\u2022 Pricelist: 3 103 cenn\u00edkov\u00fdch polo\u017eiek\n\u2022 Stock: 2 806 skladov\u00fdch z\u00e1znamov\n\nObr\u00e1zky: priame URL v poli img[]\n\u2022 Vzor: https://macma.sk/products/jpg/...\n\u2022 Viacero uhlov na produkt\n\nSkladov\u00e9 z\u00e1soby:\n\u2022 local = SK sklad\n\u2022 regional = EU region\u00e1lny sklad\n\u2022 international = centr\u00e1lny sklad\n\nSynchroniza\u010dn\u00e9 scen\u00e1re:\n\u2022 SKU Feed \u2192 ONIX skladov\u00e9 karty\n\u2022 Pricelist \u2192 ONIX n\u00e1kupn\u00e9 cenn\u00edky\n\u2022 Stock \u2192 kontrola dostupnosti pred objedn\u00e1vkou\n\u2022 Obr\u00e1zky (img[]) \u2192 e-shop Promotron/TronShop\n\nPlatforma: rovnak\u00e1 ako Easy Gifts (easygifts.sk) \u2014 rovnak\u00e9 API, rovnak\u00e1 \u0161trukt\u00fara d\u00e1t.",
    links: [
      { label: "Macma SK (B2B)", url: "https://macma.sk" },
      { label: "MACMA DE (hlavn\u00e1 str\u00e1nka)", url: "https://www.macma.de" },
      { label: "MACMA Katal\u00f3g", url: "https://www.macma.de/en/catalogue" },
    ],
  },
  XDCONNECT: {
    description: "Dodávateľ reklamných predmetov XD Connects (predtým Xindao, Holandsko). Prémiový dodávateľ s dôrazom na udržateľnosť, dizajn a transparentnú CO₂ stopu. Značky: XD Design (premium), XD Collection (štandard), Iqoniq (textil), Vinga (udržateľné).\n\nDáta sú dostupné cez 6 zákaznícky špecifických dátových feedov na serveri feeds.xindao.com. Každý odberateľ dostane unikátne URL linky po registrácii. Feedy sú dostupné vo formátoch: XML, CSV (Tab separated), JSON a Excel.\n\nJazyk feedov: CZ, DE, DK, EN-GB, ES, FI, FR, HU, IT, NL, NO, SE, SK — jazyk je súčasťou URL, pre viac jazykov treba samostatné linky.\n\nZodpovednosť za aktuálnosť dát je na strane odberateľa (podmienky používania feedov).",
    apiInfo: "Typ pripojenia: Data Feeds (priame URL linky na feeds.xindao.com)\n\nŽiadna API key autentifikácia — prístup cez unikátne zákaznícky špecifické URL adresy.\n\n6 dostupných feedov:\n• Product Data V5 — kompletný katalóg (100+ atribútov vrátane tech specs, ESG, textil, batérie, nebezpečný tovar)\n• Product Prices V2 — 6-stupňové tier ceny (net + gross), outlet ceny, NonStandardDiscount\n• Print Data V3 — všetky potlačové techniky a pozície, printing coordinates (VRP), line drawings\n• Print Prices V3 — ceny potlače (tier pricing), setup, sample, small order charge, VDP, sleeving\n• Stock V2 — aktuálne zásoby + 2 najbližšie dodávky + celkový budúci stock\n• Combined Data V5 — kombinácia všetkých 5 feedov v jednom súbore (default print + ceny)\n\nFormáty feedov: XML, CSV (Tab separated .txt), JSON, Excel\n\nAktualizačné frekvencie:\n• Product data: každú hodinu\n• Print data: denne o 02:00\n• Product prices: denne o 00:00\n• Print prices: denne o 00:00\n• Stock: každých 15 minút\n• Combined: závisí od typu dát\n\nDôležité: Neaktualizovať častejšie ako naše frekvencie — viac ako 1× za 5 minút spôsobí chybu!\n\nKaždý feed obsahuje pole FeedCreatedDateTime s dátumom/časom vytvorenia.\nVšetky feedy okrem stock obsahujú LastModifiedDateTime pre sledovanie zmien.",
    endpoints: [
      "Product Data V5 — https://feeds.xindao.com/Feeds/Download/.../Xindao.V5.ProductData",
      "Product Prices V2 — https://feeds.xindao.com/Feeds/Download/.../Xindao.V2.ProductPrices",
      "Print Data V3 — https://feeds.xindao.com/Feeds/Download/.../Xindao.V3.PrintData",
      "Print Prices V3 — https://feeds.xindao.com/Feeds/Download/.../Xindao.V3.PrintPrices",
      "Stock V2 — https://feeds.xindao.com/Feeds/Download/.../Xindao.V2.Stock",
      "Combined Data V5 — https://feeds.xindao.com/Feeds/Download/.../Xindao.V5.AllData",
      "Media FTP — ftp://media.xindao.com (anonymný prístup, obrázky 600/1024/3000px, videá, logá)",
    ],
    authInfo: "Bez API kľúča — prístup cez unikátne URL linky (zákaznícky špecifické).\n\nAko získať feed linky:\n1. Kontaktovať onlineclients@xdconnects.com alebo obchodný tím\n2. Uviesť: XD Connects debtor number, požadované feedy, formát (XML/CSV/JSON/Excel), jazyk(y)\n3. Obdržíte priame URL linky pre každý feed\n\nFeed linky sú dôverné a nesmú sa zdieľať s tretími stranami.\nXD Connects môže prístup zrušiť pri porušení podmienok.\n\nObrázky: Priame linky v feedoch (1024px JPG) alebo FTP server ftp://media.xindao.com (anonymný prístup).\nTypy obrázkov: B=blank, D=decoration, F=fit, G=group, M=mood, P=packaging, S=symbol(CO₂).",
    dataFields: "Product Data V5 (100+ atribútov):\n• Identifikácia: ModelCode, ItemCode, ProductLifeCycle (new/current/outlet), IntroDate, EANCode\n• Popis: ItemName, LongDescription (viacjazyčný), Brand, MainCategory, SubCategory\n• Fyzické: Material, Color, PMSColor1/2, HexColor1/2, rozmery (L/W/H/Diameter cm), hmotnosť (net/gross g)\n• Obchod: CommodityCode (HS kód), CountryOfOrigin, WEEE, DangerousGoods (UN kód)\n• Batérie: BatteryType, NrOfBatteries, BatteryWeightGr, BatteryChemicalComposition, IECCode\n• Balenie: PackagingTypeItem, ItemBox rozmery, OuterCarton rozmery/hmotnosť, InnerboxQty, OuterCartonQty\n• Tech: Bluetooth, WiFi, PlayTimeHours, WaterproofLevel, PowerbankCapacity, ChargingTimeHours, USB verzia\n• Textil: TextileSize, TextileStyle, CareInstruction, SleeveLength, Neckline, Fit, Fabric, grams/m²\n• ESG: Eco, PVCfree, RecycledContentPercent, Traceability, Charity, UsedPETBottles, DigitalPassport, SocialAudits\n• CO₂: Total CO2 emissions, LCA údaje (Material, Packaging, Transport, Electronics, EOL)\n• Media: MainImage, MainImageNeutral, 7x ExtraImage, ImagePrint, ImageGroupBlank/Print, 3x ImageMood, AllImages, VideoURL (Vimeo/YouTube)\n• Potlač (default): AllPrintCodes, PrintCodeDefault, PrintTechniqueDefault, PrintPositionDefault, MaxPrintWidth/HeightMM, MaxColorsDefault, FullColorDefault, LineDrawingDefault, VDP, CustomSleeve, GiftWrapping\n\nProduct Prices V2:\n• 6 tier cien (Qty1-Qty6) s Net a Gross cenami, NonStandardDiscount, Outlet flag\n\nPrint Data V3:\n• PrintCode, TechniqueName, Position, MaxPrintWidth/HeightMM, MaxColors, FullColor, MinQty, LineDrawing\n• Printing coordinates: VRP_X, VRP_Y, VRP_Width, VRP_Height, VRP_URL\n\nPrint Prices V3:\n• Tier ceny (net+gross), SetupNet, PrintSampleNet, SmallOrderChargeNet, VDP ceny, Sleeving ceny\n• Pôvodné production SKU pre jednoduchšie párovanie\n\nStock V2:\n• CurrentStock, FutureIncomingStockDate1/2, FutureIncomingStockQty1/2, TotalFutureIncoming\n• Aktualizácia každých 15 minút\n\nCombined V5:\n• Všetky produktové dáta + default print + všetky product ceny + default print ceny + all-in ceny + stock",
    notes: "Stav integrácie: ČAKÁ SA NA FEED LINKY\n\nKroky na aktiváciu:\n1. Napísať na onlineclients@xdconnects.com — uviesť debtor number, požadované feedy (Product Data, Prices, Print Data, Print Prices, Stock), formát (JSON/XML), jazyk SK\n2. Obdržíte 5-6 unikátnych URL liniek\n3. V SyncHub Settings tab vložiť URL pre každý feed\n4. Test Connection overí dostupnosť\n5. Data Preview zobrazí prvých 20 záznamov z každého feedu\n\nDôležité technické informácie:\n• Formát čísel produktov: štandardne X00.000, textil s veľkosťou T9100.004.XXL, Vinga produkty V4457\n• Ceny vždy spracovávať na úrovni ItemCode (nie ModelCode!) — farby v modeli môžu mať rôzne ceny\n• Stock: aktuálny stav + 2 najbližšie dodávky, bez MOQ — objednávka od 1 ks\n• Small order charge: pri potlačených objednávkach pod 50 ks (závisí od techniky)\n• Obrázky: priame linky v feedoch (1024px) alebo FTP ftp://media.xindao.com (3 veľkosti: 600/1024/3000px)\n\nSynchronizačné scenáre:\n• Product Data V5 → ONIX skladové karty (produkty, rozmery, hmotnosti, EAN, kategórie)\n• Product Prices V2 → ONIX nákupné cenníky (6 tier cien)\n• Stock V2 → kontrola dostupnosti pred objednávkou (každú hodinu)\n• Print Data V3 → potlačové techniky pre e-shop konfigurátor\n• Media (AllImages) → e-shop obrázky (TronShop)\n• Combined V5 → rýchly import všetkého v jednom (s obmedzenými print cenami)",
    links: [
      { label: "XD Connects Web", url: "https://www.xdconnects.com" },
      { label: "Kontakt pre feedy", url: "mailto:onlineclients@xdconnects.com" },
      { label: "XD Design (premium)", url: "https://www.xd-design.com" },
      { label: "Media FTP (obrázky)", url: "ftp://media.xindao.com" },
    ],
  },
  ANDA: {
    description: "Dodávateľ reklamných predmetov Anda Present Ltd. (Maďarsko). Stredoeurópsky dodávateľ s vlastným logistickým centrom a širokým katalógom promo produktov.\n\nAnda poskytuje individuálne generované XML a CSV feedy — každý odberateľ má unikátne Feed ID a dostáva feedy s vlastnými zľavovými cenami (discountPrice). Prístup vyžaduje whitelistovanie statickej IP adresy servera.\n\n9 typov feedov pokrýva kompletný produktový cyklus: katalóg, ceny, skladové zásoby, personalizácia, kategórie a cenníky potlače.",
    apiInfo: "XML/CSV Data Feeds v2.8 na xml.andapresent.com\n\n7 XML feedov:\n1. Products — kompletný katalóg (názov, popis, obrázky, špecifikácie, MOQ, farby)\n2. Prices — cenník (listPrice + discountPrice = vaša individuálna cena)\n3. Inventories — skladové zásoby (central + external + incoming s dátumami)\n4. Labeling — potlačové techniky (pozície, plochy, techniky na každý produkt)\n5. Categories — stromová štruktúra kategórií (hlavné + podkategórie)\n6. Labeling Prices — cenníky personalizácie (cena podľa techniky a množstva)\n7. Unique Product Prices — špeciálne ceny pre vybrané produkty\n\n2 CSV feedy:\n8. Products CSV — produktový katalóg v tabuľkovom formáte\n9. Prices CSV — cenník v tabuľkovom formáte\n\nFormáty: XML (UTF-8, štruktúrovaný) a CSV (oddelené bodkočiarkou alebo tabulátorom)\nBase URL: https://xml.andapresent.com",
    endpoints: [
      "/export/products/{lang}/{feedId} — produktový katalóg v danom jazyku (XML)",
      "/export/prices/{feedId} — cenník s listPrice a discountPrice (XML)",
      "/export/inventories/{feedId} — skladové zásoby: central + external + incoming (XML)",
      "/export/labeling/{lang}/{feedId} — potlačové techniky a pozície (XML)",
      "/export/categories/{lang}/{feedId} — stromová štruktúra kategórií (XML)",
      "/export/labeling-prices/{feedId} — cenníky personalizácie podľa techniky (XML)",
      "/export/unique-product-prices/{feedId} — špeciálne/akciové ceny (XML)",
      "/export/products-csv/{lang}/{csvId} — produktový katalóg (CSV)",
      "/export/prices-csv/{csvId} — cenník (CSV)",
    ],
    authInfo: "Autentifikácia cez unikátne Feed ID + IP whitelist.\n\nDva typy ID:\n• XML Feed ID — pre všetkých 7 XML feedov\n• CSV Feed ID — pre 2 CSV feedy (odlišné od XML ID!)\n\nBezpečnosť:\n• IP Whitelist — server musí mať statickú IP adresu, ktorú Anda pridá na whitelist\n• Bez správnej IP vráti server 403 Forbidden\n• Feedy sú verejne prístupné len z whitelistovaných IP adries\n\nAktivačný postup:\n1. Kontaktovať obchodného zástupcu Anda Present\n2. Požiadať o aktiváciu XML/CSV feedov\n3. Poskytnúť statickú IP adresu servera (SyncHub produkčný server)\n4. Obdržíte XML Feed ID a CSV Feed ID\n5. Nakonfigurovať v SyncHub Settings tab",
    dataFields: "Products: itemNumber, designName, primaryColor, secondaryColor, name (lokalizovaný), description, images (viacero URL), MOQ, netWeight, countryOfOrigin, tariffNumber, brand, eanCode, packaging, specification (materiál, veľkosť, kapacita, priemer)\nPrices: itemNumber, listPrice (katalógová cena), discountPrice (vaša zľavnená cena), currency\nInventories: itemNumber, stock (central = vlastný sklad, external = externý sklad, incoming = očakávané dodávky s dátumom a množstvom)\nLabeling: itemNumber, technique (screen print, pad print, digital, laser, embroidery...), position, area (šírka × výška mm), maxColors\nCategories: id, parentId, name, level (stromová hierarchia)\nLabeling Prices: technique, cena podľa množstevných stupňov, setup fee, handling fee\nUnique Prices: itemNumber, špeciálna cena, platnosť od/do",
    notes: "Frekvencia aktualizácie feedov:\n• Products: 3× týždenne (Po, St, Pi)\n• Prices: 1× týždenne (sobota 22:00)\n• Inventories: každých 30 minút (real-time zásoby!)\n• Labeling: 3× týždenne\n• Categories: 2× denne\n• Labeling Prices: 1× týždenne\n• Unique Prices: podľa potreby\n• CSV feedy: rovnaká frekvencia ako XML ekvivalenty\n\nDostupné jazyky (19): sk, cz, en, de, hu, it, fr, nl, pl, ro, no, se, dk, fi, gr, si, bg, es, pt\nPre slovenčinu použite: lang=sk\n\nDôležité upozornenia:\n• XML Feed ID ≠ CSV Feed ID — sú to dva odlišné identifikátory!\n• Bez whitelistovanej IP dostanete 403 Forbidden\n• discountPrice v cenníku je vaša individuálna cena (nie verejná)\n• Obrázky: CDN na data.cdn-andapresent.com (viacero veľkostí)\n• Inventories feed je najcennejší — aktualizácia každých 30 min\n\nSynchronizačné scenáre:\n• Products → ONIX skladové karty (import katalógu)\n• Prices (discountPrice) → ONIX nákupné ceny\n• Inventories → real-time kontrola dostupnosti (každých 30 min)\n• Labeling + Labeling Prices → kalkulácie potlače pre e-shop\n• Categories → kategorizácia v e-shope",
    links: [
      { label: "Anda Present Web", url: "https://andapresent.com" },
      { label: "Anda Present CDN (obrázky)", url: "https://data.cdn-andapresent.com" },
      { label: "Anda B2B portál", url: "https://b2b.andapresent.com" },
    ],
  },
  EASYGIFTS: {
    description: "Dodávateľ reklamných predmetov Easy Gifts (Poľsko). Stredne veľký dodávateľ so zameraním na cenovo dostupné promo produkty — perá, hrnčeky, tašky, USB, kancelárske potreby a outdoorové doplnky. Značky: MoLu (premium), Easy Gifts (štandard).\n\nDáta sú dostupné cez JSON/XML API v2 — tri hlavné feedy: SKU (13 400+ produktov, 25 polí vrátane obrázkov), Pricelist (13 100+ cenníkových položiek), Stock (12 300+ skladových záznamov vrátane budúcich dodávok).\n\nJazyk: SK (slovenčina) — jazyk je súčasťou URL.",
    apiInfo: "JSON/XML Data Feeds v2 na easygifts.sk\n\nTri hlavné feedy:\n1. SKU Feed — kompletný produktový katalóg (~13 400 produktov)\n   • 25 polí: id, catalogcode, name, description, brand, size, weight, color (object), origin, tariff, newitem, chapter, img (array URL), material, print, packing, video\n   • Formát: JSON alebo XML\n   • URL: /api/v2/{apiKey}/{lang}/sku.json\n\n2. Pricelist Feed — cenník (~13 100 položiek)\n   • 6 polí: id, name, price, pricestr, webprice, webpricestr\n   • Ceny v EUR\n   • URL: /api/v2/{apiKey}/{lang}/pricelist.json\n\n3. Stock Feed — skladové zásoby (~12 300 položiek)\n   • 6+ polí: id, name, local, regional, international, future[]\n   • future[] = budúce dodávky (year, week, stock)\n   • URL: /api/v2/{apiKey}/{lang}/stock.json\n\nFormáty: JSON (.json) a XML (.xml) — oba dostupné na rovnakej URL, len zmena prípony",
    endpoints: [
      "GET /api/v2/{apiKey}/sk/sku.json — produktový katalóg (13 400+ SKU, 25 polí)",
      "GET /api/v2/{apiKey}/sk/pricelist.json — cenník (ceny EUR)",
      "GET /api/v2/{apiKey}/sk/stock.json — sklady (local/regional/international + future)",
    ],
    authInfo: "API k\u013e\u00fa\u010d v URL \u2014 k\u013e\u00fa\u010d je s\u00fa\u010das\u0165ou feed URL adresy.\n\nAktu\u00e1lny k\u013e\u00fa\u010d: whrM...i_r (nakonfigurovan\u00fd, akt\u00edvny \u2705)\n\nPrihl\u00e1senie na web: easygifts.sk\n\u2022 Meno: Hauerland\n\u2022 Heslo: ulo\u017een\u00e9 vo Vault\n\nURL vzor: https://easygifts.sk/api/v2/{apiKey}/{lang}/{feed}.json\n\u2022 apiKey \u2014 V\u0161etky zna\u010dky\n\u2022 lang \u2014 sk (sloven\u010dina)\n\u2022 feed \u2014 sku / pricelist / stock",
    dataFields: "SKU Feed (25 polí):\n• id — unikátny kód produktu (6-miestne číslo)\n• catalogcode — kód katalógu\n• name — názov produktu (SK)\n• description — dlhý popis\n• brand — značka (MoLu, Easy Gifts...)\n• size — rozmery (text)\n• weight — hmotnosť (kg, desatinné)\n• color — objekt: { code, name, rgb } — napr. C_03/Čierna/#000000\n• origin — krajina pôvodu (2-písm. kód, napr. CN)\n• tariff — colný kód (HS/Intrastat)\n• newitem — boolean (nový produkt)\n• chapter — kategória|podkategória (pipe separated)\n• img — pole URL obrázkov (do 18+ fotiek na produkt)\n• mainpic — hlavný obrázok\n• capacity, pagex, pagey, sizes, material\n• print — objekt: { technology[] } — potlačové techniky\n• packing — objekt: { inner: {qty}, outer: {qty}, pallet: {} }\n• video — URL videa\n\nPricelist (6 polí): id, name, price (EUR net), pricestr, webprice, webpricestr\n\nStock (6+ polí): id, name, local (SK sklad), regional (EU), international (celkovo), future[] (rok/týždeň/množstvo)",
    notes: "STAV: ✅ PRIPOJENÉ — 3 feedy aktívne (SKU, Pricelist, Stock)\n\nŠtatistiky:\n• SKU: 13 400+ produktov (kompletný katalóg)\n• Pricelist: 13 100+ cenníkových položiek\n• Stock: 12 300+ skladových záznamov\n\nObrázky: priame URL v poli img[]\n• Vzor: https://easygifts.sk/products/jpg/E/{brand}/{id}.jpg\n• Viacero uhlov: _1, _2_box, _3, _4... (až 18 fotiek)\n\nSkladové zásoby:\n• local = SK sklad (Hauerland/Easy Gifts SK)\n• regional = EU regionálny sklad\n• international = centrálny sklad (Poľsko)\n• future[] = budúce dodávky (rok + týždeň + množstvo)\n\nSynchronizačné scenáre:\n• SKU Feed → ONIX skladové karty (import katalógu, obrázky, rozmery)\n• Pricelist → ONIX nákupné cenníky\n• Stock → kontrola dostupnosti pred objednávkou\n• Obrázky (img[]) → e-shop Promotron/TronShop",
    links: [
      { label: "Easy Gifts SK (B2B)", url: "https://easygifts.sk" },
      { label: "Easy Gifts PL (hlavná stránka)", url: "https://easygifts.com.pl" },
    ],
  },
  PFCONCEPT: {
    description: "Dodávateľ reklamných predmetov PF Concept International B.V. (Holandsko). Jeden z najväčších európskych dodávateľov promo produktov s portfóliom značiek: Bullet (štandard), Avenue (premium), Seasons (sezónne), US Basic (textil), Elevate Life (lifestyle).\n\nDáta sú dostupné cez Data Feeds Gateway — centralizovaný portál pre distribúciu produktových dát, cenníkov, skladových zásob a obrázkov. Prístup vyžaduje registráciu a prihlásenie.",
    apiInfo: "Data Feeds Gateway na www.pfconcept.com/data-feeds-gateway\n\nDostupné typy feedov:\n1. Product Feed — kompletný katalóg produktov (~5 000+ produktov)\n   • Názvy, popisy, špecifikácie v 20+ jazykoch\n   • Formát: XML alebo CSV\n\n2. Price Feed — nákupné cenníky\n   • Individuálne ceny podľa partnerskej zmluvy\n   • Mena: EUR\n\n3. Stock Feed — skladové zásoby v reálnom čase\n   • Aktualizácia niekoľkokrát denne\n   • Centrálny sklad: Holandsko\n\n4. Image Feed — URL adresy obrázkov\n   • Produktové, lifestyle, hi-res, packshot\n   • Viacero uhlov a veľkostí\n\n5. Print Data Feed — potlačové informácie\n   • Techniky, pozície, plochy, ceny personalizácie\n\nFormáty: XML, CSV (závisí od typu feedu)\nAktualizácia: sklady viackrát denne, produkty a ceny týždenne",
    endpoints: [
      "Data Feeds Gateway — Product Feed (katalóg produktov, XML/CSV)",
      "Data Feeds Gateway — Price Feed (nákupné cenníky)",
      "Data Feeds Gateway — Stock Feed (skladové zásoby, real-time)",
      "Data Feeds Gateway — Image Feed (URL obrázkov, viacero veľkostí)",
      "Data Feeds Gateway — Print Data Feed (potlačové techniky a ceny)",
    ],
    authInfo: "Username/Password autentifikácia pre Data Feeds Gateway.\n\nZískanie prístupu:\n1. Byť registrovaný partner PF Concept\n2. Kontaktovať customer service alebo obchodného zástupcu\n3. Požiadať o prístup k Data Feeds Gateway\n4. Obdržíte login (username) + heslo (password) + priame URL adresy feedov\n\nNiektoré feedy môžu vyžadovať HTTP Basic Auth alebo token v URL.\n\nDôležité: Prístupy sú viazané na partnerskú firmu a určujú cenové podmienky.",
    dataFields: "Products: kód produktu (masterCode + variantCode), názov (20+ jazykov), krátky/dlhý popis, materiál, rozmery (cm), hmotnosť (g/kg), objem (ml), farba (názov + Pantone/hex), veľkosť, kategória, podkategória, brand (Bullet/Avenue/Seasons/US Basic/Elevate Life), krajina pôvodu, HS kód, EAN, certifikáty, minimálne objednávacie množstvo\nPrices: nákupná cena (net), doporučená predajná cena, cenové stupne podľa množstva, mena (EUR)\nStock: aktuálny stav, dostupné množstvo, očakávané dodávky (dátum + množstvo), stav (in stock/limited/out of stock)\nPrint: technika (pad print, screen print, digital transfer, laser engraving, embroidery, doming, sublimation), pozícia, rozmery plochy (mm), max počet farieb, setup fee, cena za kus podľa množstva\nImages: hlavný obrázok, detaily, lifestyle, packshot, hi-res (rôzne veľkosti a formáty)",
    notes: "Stav integrácie: ČAKÁ SA NA PRÍSTUPOVÉ ÚDAJE\n\nKroky na aktiváciu:\n1. Kontaktovať PF Concept obchodného zástupcu alebo customer service\n2. Požiadať o prístup k Data Feeds Gateway\n3. Získať login + heslo + priame URL adresy feedov\n4. Nakonfigurovať v SyncHub: Username + Password + Feed URL\n5. Otestovať pripojenie a Data Preview\n\nDôležité informácie:\n• PF Concept je jeden z TOP 3 dodávateľov promo produktov v Európe\n• Katalóg: ~5 000+ produktov v 5 značkách\n• Sklad: centrálny v Holandsku, distribúcia do celej Európy\n• Obrázky: vysoké rozlíšenie, viacero uhlov, lifestyle fotky\n• Udržateľnosť: rastúci podiel eko produktov s certifikátmi\n\nSynchronizačné scenáre:\n• Product Feed → ONIX skladové karty (import katalógu)\n• Price Feed → ONIX nákupné cenníky\n• Stock Feed → real-time kontrola dostupnosti\n• Print Data → kalkulácie potlače pre e-shop\n• Image Feed → obrázky do e-shopu (TronShop)",
    links: [
      { label: "PF Concept Data Feeds Gateway", url: "https://www.pfconcept.com/cs_cz/data-feeds-gateway" },
      { label: "PF Concept Web", url: "https://www.pfconcept.com" },
      { label: "PF Concept Partner Portal", url: "https://www.pfconcept.com/login" },
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
    { key: "productFeedUrl", label: "Product Data Feed URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V5.ProductData" },
    { key: "pricesFeedUrl", label: "Product Prices Feed URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V2.ProductPrices" },
    { key: "printDataFeedUrl", label: "Print Data Feed URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V3.PrintData" },
    { key: "printPricesFeedUrl", label: "Print Prices Feed URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V3.PrintPrices" },
    { key: "stockFeedUrl", label: "Stock Feed URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V2.Stock" },
    { key: "combinedFeedUrl", label: "Combined Data Feed URL", type: "url", placeholder: "https://feeds.xindao.com/Feeds/Download/.../Xindao.V5.AllData" },
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
    { key: "apiType", label: "API Type", type: "text", placeholder: "data_feed" },
    { key: "authType", label: "Auth Type", type: "text", placeholder: "credentials" },
    { key: "username", label: "Username", type: "text", placeholder: "Enter PF Concept username", required: true },
    { key: "password", label: "Password", type: "password", placeholder: "Enter password", required: true },
    { key: "feedUrl", label: "Data Feed URL", type: "url", placeholder: "Enter feed gateway URL" },
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
                      PROMOTRON: [
                        { value: "auto", label: "Auto (API / Feed)" },
                        { value: "api", label: "REST API (Orders)" },
                        { value: "feed", label: "XML Feed (Products)" },
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
