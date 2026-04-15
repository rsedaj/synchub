# SyncHub — Hauerland Integration Platform

## Prehľad projektu

SyncHub je modulárna integračná platforma pre SEDAJ s.r.o. / Hauerland. Prepája interný ERP systém **ONIX** s 12 externými systémami (dodávatelia, e-shop, CRM) cez REST API, XML feedy a JSON feedy. Platforma umožňuje konfiguráciu, automatizovanú synchronizáciu a monitoring dátových tokov v reálnom čase.

**Verzia:** v1.25.0  
**Databáza:** PostgreSQL (Replit)  
**Autentifikácia:** session-based (Passport.js + bcrypt)  
**Predvolený login:** admin / admin123

---

## Technologický stack

| Vrstva | Technológia |
|--------|-------------|
| Frontend | React 18 + TypeScript + Vite |
| UI komponenty | Shadcn/ui + Tailwind CSS |
| Routing | Wouter |
| API klient | TanStack Query v5 |
| Backend | Express.js + TypeScript |
| Databáza | PostgreSQL + Drizzle ORM |
| Auth | Passport.js (session) + bcrypt |
| Zálohy | Google Drive (Replit Connectors SDK) |
| Jazyky | SK / EN (localStorage) |

---

## Štruktúra projektu

### Backend (`server/`)
- `index.ts` — Express server setup, port 5000
- `routes.ts` — Všetky API endpointy (~1400 riadkov)
- `auth.ts` — Passport.js setup, `requireAuth` / `requireRole` middleware
- `storage.ts` — IStorage interface + DatabaseStorage (Drizzle)
- `db.ts` — PostgreSQL connection pool + Drizzle instance
- `seed.ts` — Seed dáta: admin user + 12 modulov (sortOrder)
- `data-fetcher.ts` — Načítanie dát z externých API (XML, JSON, REST) + SSRF ochrana
- `sync-engine.ts` — 4-fázový sync engine (preflight→backup→fetch→sync), delta diff, cancellation
- `target-push.ts` — Push do cieľových API (ONIX, Pipedrive, Raynet), retry logika, latencia tracking
- `google-drive.ts` — Google Drive zálohy (upload, download, delete, rotate, štatistiky)

### Frontend (`client/src/`)
- `App.tsx` — Routing + auth guard + sidebar layout
- `lib/auth.tsx` — AuthProvider context (login/logout)
- `lib/i18n.ts` — SK/EN preklady (~800 kľúčov)
- `lib/module-help-data.ts` — Dokumentácia každého modulu
- `components/app-sidebar.tsx` — Navigácia, jazykový toggle, aktívny sync indikátor
- `components/language-provider.tsx` — SK/EN jazykový kontext
- `components/theme-provider.tsx` — Dark/light mode

### Pages (`client/src/pages/`)
- `login.tsx` — Login
- `dashboard.tsx` — Hlavný dashboard (stats, sieťová mapa, command center)
- `modules.tsx` — Zoznam modulov (grid, sortOrder, stav)
- `module-detail.tsx` — Detail modulu (Prehľad, Data Preview, Konfigurácia, Sync História, Help)
- `sync-config.tsx` — Sync konfigurácia (field mapping, scheduling, limity)
- `sync-dashboard.tsx` — Sync Dashboard (live progress, história, grafy, zálohy)
- `sync-logs.tsx` — Log viewer s filtrami
- `vault.tsx` — Trezor s API kľúčmi (iba admin)
- `users.tsx` — Správa používateľov (iba admin)
- `audit-log.tsx` — Audit trail (iba admin)
- `help.tsx` — Kompletná dokumentácia + changelog
- `shop-view.tsx` — E-shop simulátor produktov z feedov

### Shared (`shared/`)
- `schema.ts` — Drizzle schéma, Zod validátory, TypeScript typy
- `version.ts` — Centrálna verzia APP_VERSION

---

## Databázové tabuľky

| Tabuľka | Popis |
|---------|-------|
| `users` | Používatelia (admin/operator/viewer) |
| `api_modules` | Konfigurácie modulov (sortOrder, dataFields, docsUrl, config JSONB) |
| `sync_configs` | Sync páry (source↔target, field mappings, schedule, sourceRecordLimit) |
| `sync_runs` | História behov (status, progress, batch info, speed, ETA, cancellation) |
| `sync_baselines` | MD5 hashe posledného sync stavu (delta sync) — indexované (configId, recordKey) |
| `sync_backups` | Metadáta záloh (Google Drive fileId/URL, veľkosť, počet záznamov) |
| `sync_logs` | História import/export operácií |
| `audit_logs` | Audit trail používateľských akcií |
| `user_sessions` | Session storage (connect-pg-simple) |

---

## Integračné moduly

| Kód | Názov | Typ | Popis |
|-----|-------|-----|-------|
| ONIX | ONIX ERP | **CIEĽ** (primárny) | ERP systém, produkty, ceny, sklad, partneri |
| PROMOTRON | Promotron E-shop | Zdroj | E-shop shop.hauerland.sk, ~100k produktov (121MB XML feed) |
| PIPEDRIVE | Pipedrive CRM | Zdroj/Cieľ | CRM — deals, contacts, organizations, activities, products |
| RAYNET | Raynet CRM | Zdroj | CRM REST API v2, Basic Auth + X-Instance-Name |
| GIVING | Giving Europe | Zdroj | Dodávateľ promo predmetov, Debtor API REST |
| MID | Midocean | Zdroj | Dodávateľ, REST API v2.0, x-Gateway-APIKey |
| STICKER | Stricker Europe | Zdroj | Dodávateľ, REST API v2.20, AccessKey session |
| MACMA | Macma | Zdroj | Dodávateľ, JSON API v2 (SKU/Pricelist/Stock) |
| XDCONNECT | XD Connects | Zdroj | Dodávateľ, 6 feedov (XML/CSV/JSON) |
| ANDA | Anda Present | Zdroj | Dodávateľ, XML/CSV feedy, 9 zdrojov |
| EASYGIFTS | Easy Gifts | Zdroj | Dodávateľ, XML/JSON feedy |
| PFCONCEPT | PF Concept | Zdroj | Dodávateľ, Data Feeds Gateway v3 (XML), 4 feedy |

---

## Sync Engine — detailná dokumentácia

### 4-fázový pipeline

```
FÁZA 1: PREFLIGHT
  - Overenie sync konfigurácie (mappings, source/target moduly)
  - Kontrola či je konfigurácia validná

FÁZA 2: BACKUP (voliteľné, predvolené: zapnuté)
  - Stiahnutie aktuálnych dát z cieľového API (napr. existujúce ONIX karty)
  - Upload na Google Drive (SyncHub_Backups/Data/{YYYY-MM-DD}/{ModuleName}/)
  - Rotácia: max 10 záloh na konfiguráciu, najstaršie sa automaticky mažú

FÁZA 3: FETCH
  - Stiahnutie zdrojových dát (napr. Promotron XML feed 121MB)
  - 3 pokusy s 2s oneskorením pri zlyhaní
  - Limit: config.sourceRecordLimit (predvolené: 120 000)

FÁZA 3.5: DELTA DIFF (pri delta móde)
  - Načítanie baseline hashov z DB (tabuľka sync_baselines)
  - Výpočet MD5 hashu mapovaných polí pre každý záznam
  - Filter: odosielaj len záznamy kde hash ≠ baseline
  - Štatistiky: totalFetched, totalChanged, totalSkipped

FÁZA 4: SYNC
  - Dávkové spracovanie: 50 záznamov na dávku
  - Sekvenčné volania API (1 request naraz, ONIX to vyžaduje)
  - Retry: 3x pri HTTP 503/504/429 (backoff 3-9s), 3x pri timeout
  - Live update progress každú dávku (%, batch, speed, ETA)
  - Early stop: 3 po sebe idúce 100% chybové dávky → zastavenie

POST-SYNC:
  - Uloženie nových baseline hashov do DB
  - Audit log záznamu
  - Čistenie activeRuns mapy
```

### Delta sync (od v1.25.0)

**Problém:** Sync 100k produktov trvá 50+ hodín sekvenčne (1 request ≈ 1.8s).  
**Riešenie:** Porovnanie MD5 hashov mapovaných polí s posledným syncom.

```
MD5 hash = md5(price|title|description|gtin|availability|image_link)
                 ↑ len polia definované v field mappings

Príklad:
  Produkt ID=12345: hash "abc123" → baseline "abc123" → PRESKOČIŤ
  Produkt ID=67890: hash "xyz789" → baseline "abc000" → ODOSLAŤ
```

**Prvý beh:** Žiadna baseline → všetky záznamy sa považujú za nové → pošle sa všetko → baseline sa vytvorí.  
**Druhý+ beh:** Porovnanie → odosielajú sa len zmeny → dramatická úspora času.

**Full sync:** Zaškrtnutie "Full sync" v UI ignoruje baseline a pošle všetko.

### ONIX-špecifická logika (target-push.ts)

**Povinné polia (auto-fill ak chýbajú pri POST):**
- `RecordExternalIdentificator` — externý identifikátor (napr. product id z e-shopu)
- `Ns_Number` — číslo karty (= RecordExternalIdentificator ak nie je zadané)
- `Ns_Code` = "SK"
- `Type` = 1 (Tovar)
- `Measure_Units_Default_Name` = "ks"
- `Default_Stock` = "SYN" (Sklad_SyncHub)
- `Default_Price` = 0 (ak nie je zadaná cena)

**Read-only polia (automaticky odstránené z POST body):**
- `StockItemBalance`, `StockItemGroups`, `StockItemParams`
- `StockItemCodes`, `StockItemAccessories`, `StockItemAlternatives`
- `StockItemPartners`, `StockItemMeasureUnits`, `Enclosures`

**CustomColumns formát:**
```json
{"CustomColumns": [{"Name": "STOCK_ITEMS_Z_HAUE_SK001_URL_TXT", "Value": "https://..."}]}
```

**Retry logika:**
- HTTP 503/504/429 → retry 3x, backoff 3s/6s/9s
- HTTP 401/408 "timed out" → retry 3x, backoff 2s/4s/6s
- AbortError (30s timeout) → retry 3x, backoff 2s/4s/6s

**Concurrency:** 2 paralelné (env `ONIX_CONCURRENCY`, rozsah 1–8) — predvolene 2. Nastaviť na 1 ak ONIX vracia 503 pri paralelných requestoch.

### Zombie run cleanup (od v1.25.0)

Pri reštarte servera sa automaticky nájdu a ukončia všetky sync runy s `status='running'` alebo `status='pending'` ktoré nemajú aktívny proces. Nastavia sa na `status='error'` s `errorMessage='Server restarted — sync process lost'`.

### Resilientné DB zápisy (od v1.24.x)

Funkcia `resilientDbUpdate()` — 5 pokusov s exponenciálnym backoffom (3s × pokus) pre kritické DB zápisy počas dlhých sync behov (kde PostgreSQL môže ukončiť spojenie).

---

## API endpointy

### Moduly
- `GET /api/modules` — Zoznam modulov
- `GET /api/modules/:id` — Detail modulu
- `PUT /api/modules/:id` — Update modulu
- `GET /api/modules/:id/source-fields` — Dátové polia (pre field mapping)
- `POST /api/modules/:id/test-connection` — Test pripojenia
- `GET /api/modules/:id/data-preview` — Náhľad dát

### Sync konfigurácie
- `GET /api/sync-configs` — Zoznam konfigurácií
- `POST /api/sync-configs` — Vytvorenie
- `PUT /api/sync-configs/:id` — Update
- `DELETE /api/sync-configs/:id` — Zmazanie
- `POST /api/sync-configs/:id/run` — Spustenie sync (body: `{fullSync?: boolean}`)
- `GET /api/sync-configs/:id/runs` — História behov pre konfiguráciu

### Sync runy
- `GET /api/sync-runs` — História behov
- `GET /api/sync-runs/active` — Aktívne beh (z pamäte + DB)
- `GET /api/sync-runs/:id` — Detail behu
- `GET /api/sync-runs/:id/progress` — Live progress
- `POST /api/sync-runs/:id/cancel` — Zrušenie (aj zombie runov)

### Zálohy
- `GET /api/sync-backups` — Zoznam záloh
- `POST /api/sync-backups/:id/restore` — Obnova zálohy
- `DELETE /api/sync-backups/:id` — Zmazanie zálohy
- `POST /api/sync-configs/:id/backup` — Manuálna záloha
- `POST /api/backups/cleanup-stale` — Cleanup starých záloh

### Špeciálne
- `GET /api/my-ip` — Odchádzajúca IP adresy servera (pre ESET whitelisting)
- `GET /api/dashboard-stats` — Štatistiky pre dashboard
- `GET /api/audit-logs` — Audit trail

---

## Sync konfigurácia — mapovanie polí

Aktuálna produkčná konfigurácia (Eshop → ONIX):

| E-shop pole | ONIX pole | Popis |
|-------------|-----------|-------|
| price | Default_Price | Základná cena produktu |
| title | Name | Názov produktu |
| description | Description | Popis (HTML) |
| description | Ist_Description | Interný popis |
| id | Ist_Code | Interný kód |
| gtin | Ns_Number | EAN/číslo karty |
| availability | StockItemBalance[0].Available | Dostupnosť (read-only, ignorované) |
| image_link | CustomColumns.STOCK_ITEMS_Z_HAUE_SK001_URL_TXT | URL obrázku |

---

## ONIX API — technické informácie

- **URL:** `https://onix-api.hauerland.sk/ONIX_API`
- **Swagger (Hauerland):** `https://onix-api.hauerland.sk/onix_api/swagger/ui/index`
- **Swagger (KROS DEMO):** `http://195.146.148.139/onix_api/swagger/ui/index`
- **Databáza:** `testovacia_hauerland` (env: `ONIX_DATABASE_PATH`)
- **Token:** env `ONIX_API_TOKEN`
- **PostgreSQL port:** 20457
- **Výrobca:** KROS a.s. (servis.onix@kros.sk)
- **Priemerná latencia:** ~1.8s/záznam

Sklady v testovacej DB:

| Kód | Názov | ID |
|-----|-------|----|
| **SYN** | Sklad_SyncHub (predvolený) | 1000036 |
| SK1 | SKLAD 1 | 1000030 |
| OPP | Sklad OPP | 1000034 |
| VOS | Voľný sklad | 1000016 |
| VZ | Vzorky | 1000011 |
| T | Viazaný sklad | 1000007 |

---

## Google Drive zálohy

- **Shared Drive ID:** `0AJCiYKbj09exUk9PVA`
- **Dátové zálohy:** `SyncHub_Backups/Data/{YYYY-MM-DD}/{ModuleName}/`
- **Config zálohy:** `SyncHub_Backups/Config/`
- **Rotácia:** max 10 záloh na konfiguráciu
- **Formát:** JSON (rozdelené na súbory ak >50MB — chunking)

---

## Roly a oprávnenia

| Akcia | Admin | Operator | Viewer |
|-------|-------|----------|--------|
| Dashboard | ✅ | ✅ | ✅ |
| Moduly | ✅ | ✅ | ✅ |
| Spustiť sync | ✅ | ✅ | ❌ |
| Sync konfigurácie | ✅ | ✅ | ❌ |
| Zálohy | ✅ | ✅ | ❌ |
| Správa používateľov | ✅ | ❌ | ❌ |
| Trezor (API kľúče) | ✅ | ❌ | ❌ |
| Audit Log | ✅ | ❌ | ❌ |

---

## Bezpečnosť

- **SSRF ochrana:** Allowlist povolených hostov v `data-fetcher.ts`
- **ONIX host allowlist:** `onix-api.hauerland.sk`, `195.146.148.139`
- **Session secret:** env `SESSION_SECRET`
- **Heslo:** bcrypt hashing
- **Audit log:** Všetky kritické akcie (sync, login, config zmeny, zálohy)

---

## Changelog

### v1.25.0 (apríl 2026)
- **Delta sync** — porovnanie MD5 hashov, odosielajú sa len zmenené záznamy
- Tabuľka `sync_baselines` s unikátnym indexom (configId, recordKey)
- "Full sync" checkbox v Quick Sync UI
- DELTA/FULL badge + štatistiky v run paneli (stiahnuté / zmenené / preskočené)
- Komplexná in-app dokumentácia (help.tsx) + update replit.md
- Verzia na v1.25.0

### v1.24.x (apríl 2026)
- Endpoint `/api/my-ip` — zistenie odchádzajúcej IP produkcie (ESET whitelisting)
- Zombie run cleanup pri štarte servera
- `/api/sync-runs/active` — vracia aj DB running runy (nielen in-memory)
- Force-stop cez cancel endpoint aj pre zombie runy
- Odstránená 300ms zbytočná pauza medzi POST requestmi (-8h na 100k sync)
- Resilientné DB zápisy (`resilientDbUpdate`) — 5 pokusov s backoffom
- Znížená concurrency na 1 (ONIX nepodporuje paralelné POST)
- Paralelný ONIX push — 8 súbežných API volaní (pre podporované API)
- Sliding-window ETA (5-batch rolling average)
- Globálny sync indikátor v sidebar (pulzujúci zelený bod, polling každých 5s)
- Formát dĺžky trvania zobrazuje hodiny (napr. "2h 15m")

### v1.23.0 (apríl 2026)
- Editovateľný limit záznamov (predvolené: 120 000)
- Nový predvolený sklad: Sklad_SyncHub (SYN)
- Rozšírená ONIX dokumentácia

### v1.22.0 (apríl 2026)
- ModuleHints — kontextové nápovedy pri konfigurácii sync

### v1.21.x (apríl 2026)
- Multi-file zálohy (chunking >50MB)
- SpeedGauge — vizuálna latencia ONIX API
- Úspešný sync 10 000+ záznamov PROMOTRON → ONIX

---

## Preferencie projektu

- Čistý čierno-biely dizajn, bez zbytočných farieb
- Modulárna architektúra (každý modul v separátnom súbore)
- Responzívne a moderné UI
- Security-first prístup s audit logovaním
- Slovenský interface (default), prepínanie SK/EN
- Copyright: SEDAJ s.r.o.
- GitHub: `rsedaj/synchub` (private), git user: `admin@hauerland.sk`
