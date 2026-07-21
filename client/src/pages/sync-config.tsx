import { useState, useMemo, useEffect, useRef } from "react";
import { COUNTRY_FIELD_KEYWORDS } from "@shared/countries";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GitBranch,
  Plus,
  Trash2,
  ArrowRight,
  Save,
  X,
  Pencil,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Eye,
  Database,
  Shield,
  Download,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ClipboardCheck,
  Percent,
  RefreshCw,
  FileText,
  GripVertical,
  History,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { sk as skLocale } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";
import type { ApiModule, SyncConfig } from "@shared/schema";

const TARGET_MODULE_CODES = ["ONIX", "PIPEDRIVE", "RAYNET"];

const FREQUENCY_OPTIONS = [
  { value: "15min", labelSk: "Každých 15 minút", labelEn: "Every 15 minutes" },
  { value: "hourly", labelSk: "Každú hodinu", labelEn: "Every hour" },
  { value: "6hours", labelSk: "Každých 6 hodín", labelEn: "Every 6 hours" },
  { value: "daily", labelSk: "Denne", labelEn: "Daily" },
  { value: "weekly", labelSk: "Týždenne", labelEn: "Weekly" },
];

const DAY_OPTIONS = [
  { value: "1", labelSk: "Pondelok", labelEn: "Monday" },
  { value: "2", labelSk: "Utorok", labelEn: "Tuesday" },
  { value: "3", labelSk: "Streda", labelEn: "Wednesday" },
  { value: "4", labelSk: "Štvrtok", labelEn: "Thursday" },
  { value: "5", labelSk: "Piatok", labelEn: "Friday" },
  { value: "6", labelSk: "Sobota", labelEn: "Saturday" },
  { value: "0", labelSk: "Nedeľa", labelEn: "Sunday" },
];

const SOURCE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  PROMOTRON: [
    { value: "auto", label: "Auto (XML Feed)" },
    { value: "feed", label: "XML Feed (produkty)" },
    { value: "api", label: "Promotron API (objednávky/produkty)" },
  ],
  MID: [
    { value: "auto", label: "Auto (Products)" },
    { value: "products", label: "Products v2.0" },
    { value: "stock", label: "Stock Levels" },
    { value: "pricelist", label: "Pricelist" },
    { value: "printdata", label: "Print Data" },
    { value: "printpricelist", label: "Print Pricelist" },
  ],
  PIPEDRIVE: [
    { value: "deals", label: "Deals" },
    { value: "persons", label: "Persons" },
    { value: "organizations", label: "Organizations" },
    { value: "activities", label: "Activities" },
    { value: "leads", label: "Leads" },
    { value: "products", label: "Products" },
  ],
  RAYNET: [
    { value: "company", label: "Klienti (Companies)" },
    { value: "person", label: "Kontakty (Persons)" },
    { value: "businessCase", label: "Obchodné prípady (Deals)" },
    { value: "lead", label: "Leady" },
    { value: "activity", label: "Aktivity" },
    { value: "invoice", label: "Faktúry" },
    { value: "product", label: "Produkty" },
  ],
  GIVING: [
    { value: "products", label: "Products (Debtor API)" },
  ],
  STICKER: [
    { value: "auto", label: "Auto (Products)" },
    { value: "products", label: "Products" },
    { value: "optionals", label: "Optionals (SKUs)" },
    { value: "optionalscomplete", label: "Optionals Complete" },
    { value: "stocks", label: "Stocks" },
    { value: "stocksCz", label: "Stocks CZ" },
    { value: "stocksPt", label: "Stocks PT" },
    { value: "colors", label: "Colors" },
    { value: "catalogprices", label: "Catalog Prices" },
    { value: "customizationOptions", label: "Customization Options" },
    { value: "customizationTables", label: "Customization Tables" },
    { value: "producttypes", label: "Product Types" },
  ],
  MACMA: [
    { value: "sku", label: "SKU (Products)" },
    { value: "pricelist", label: "Pricelist" },
    { value: "stock", label: "Stock" },
  ],
  XDCONNECT: [
    { value: "products", label: "Product Data V5" },
    { value: "prices", label: "Product Prices V2" },
    { value: "printdata", label: "Print Data V3" },
    { value: "printprices", label: "Print Prices V3" },
    { value: "stock", label: "Stock V2" },
    { value: "combined", label: "Combined Data V5" },
  ],
  EASYGIFTS: [
    { value: "sku", label: "SKU (Products)" },
    { value: "pricelist", label: "Pricelist" },
    { value: "stock", label: "Stock" },
  ],
  ANDA: [
    { value: "auto", label: "Auto (Products)" },
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
  PFCONCEPT: [
    { value: "products", label: "Product Feed" },
    { value: "prices", label: "Price Feed" },
    { value: "printprices", label: "Print Price Feed" },
    { value: "stock", label: "Stock Feed" },
  ],
  PROMOLOG: [
    { value: "auto", label: "Auto (Products)" },
    { value: "products", label: "Product Feed" },
    { value: "stock", label: "Stock Feed" },
  ],
  ONIX: [
    { value: "auto", label: "Auto (Skladové karty)" },
    { value: "stockitems", label: "Skladové karty" },
    { value: "stocks", label: "Sklady" },
    { value: "balances", label: "Stav zásob" },
    { value: "partners", label: "Partneri" },
    { value: "catalogprices", label: "Cenníky (partnerské ceny)" },
    { value: "stockitemgroups", label: "Skupiny kariet" },
    { value: "documents", label: "Typy dokladov" },
  ],
};

type FieldMapping = { sourceField: string; targetField: string; transform?: string };
type Schedule = { enabled: boolean; frequency: string; timeOfDay?: string; dayOfWeek?: string };
type EnrichedSyncConfig = SyncConfig & {
  targetModule?: { code: string; name: string; status: string; environment?: "test" | "production" | null } | null;
  sourceModule?: { code: string; name: string; status: string; environment?: "test" | "production" | null } | null;
  successRate?: number;
  totalProcessed?: number;
  totalFailed?: number;
  runCount?: number;
};

interface SourceFilter {
  field: string;
  operator: "starts_with" | "ends_with" | "contains" | "not_contains" | "equals" | "not_equals";
  value: string;
}

const SOURCE_FILTER_OPERATORS: Array<{ value: SourceFilter["operator"]; labelSk: string; labelEn: string }> = [
  { value: "starts_with",  labelSk: "začína na",        labelEn: "starts with" },
  { value: "ends_with",    labelSk: "končí na",          labelEn: "ends with" },
  { value: "contains",     labelSk: "obsahuje",          labelEn: "contains" },
  { value: "not_contains", labelSk: "neobsahuje",        labelEn: "does not contain" },
  { value: "equals",       labelSk: "rovná sa (=)",      labelEn: "equals (=)" },
  { value: "not_equals",   labelSk: "nerovná sa (≠)",    labelEn: "not equals (≠)" },
];

interface HKodConfig {
  enabled: boolean;
  prefix: string;
  detectionPrefix: string;
  nextNumber: number;
  field: string;
  padding: number;
}

interface OnixFixedField {
  field: string;
  value: string;
  condition: "always" | "if_empty";
}

interface MatchNormalization {
  stripLeadingZeros: boolean;
  caseInsensitive: boolean;
  stripDiacritics: boolean;
  collapseWhitespace: boolean;
  normalizeDecimals: boolean;
}

const emptyMatchNormalization: MatchNormalization = {
  stripLeadingZeros: false,
  caseInsensitive: false,
  stripDiacritics: false,
  collapseWhitespace: false,
  normalizeDecimals: false,
};

interface EditorState {
  id?: string;
  name: string;
  targetModuleId: string;
  targetDataSource: string;
  sourceModuleId: string;
  sourceDataSource: string;
  sourceRecordLimit: number;
  fieldMappings: FieldMapping[];
  matchFields: string[];
  matchOperator: "and" | "or";
  matchNormalization: MatchNormalization;
  onMissing: "create" | "skip" | "force";
  targetStock: string;
  sourceFilters: SourceFilter[];
  hKodConfig: HKodConfig;
  onixFixedFields: OnixFixedField[];
  schedule: Schedule;
  isEnabled: boolean;
  backupBeforeSync: boolean;
  autoRetry: boolean;
  retryDelayMin: number;
  notes: string;
}

const emptyEditor: EditorState = {
  name: "",
  targetModuleId: "",
  targetDataSource: "",
  sourceModuleId: "",
  sourceDataSource: "",
  sourceRecordLimit: 120000,
  fieldMappings: [],
  matchFields: [],
  matchOperator: "and",
  matchNormalization: { ...emptyMatchNormalization },
  onMissing: "create",
  targetStock: "",
  sourceFilters: [],
  hKodConfig: { enabled: false, prefix: "H20", detectionPrefix: "H20", nextNumber: 125892, field: "Ns_Number", padding: 0 },
  onixFixedFields: [],
  schedule: { enabled: false, frequency: "daily", timeOfDay: "06:00" },
  isEnabled: true,
  backupBeforeSync: true,
  autoRetry: false,
  retryDelayMin: 3,
  notes: "",
};

const SEMANTIC_ALIASES: Record<string, string[]> = {
  "ns_name": ["name", "title", "product_name", "productname", "item_name", "itemname", "designation", "description_short", "article_name", "articlename", "nazov", "popis", "bezeichnung"],
  "ns_number": ["sku", "code", "article_number", "articlenumber", "item_code", "itemcode", "product_code", "productcode", "external_id", "externalid", "articlecode", "article_code", "material_number", "materialnumber", "cislo", "kod", "ean", "gtin", "upc", "barcode"],
  "default_price": ["price", "unit_price", "unitprice", "sell_price", "sellprice", "retail_price", "retailprice", "sales_price", "salesprice", "cena", "preis", "base_price", "baseprice", "net_price", "netprice", "listprice", "list_price"],
  "purchaseprice": ["cost", "cost_price", "costprice", "purchase_price", "buy_price", "buyprice", "nakupna_cena", "einkaufspreis", "wholesale_price", "wholesaleprice", "supplier_price"],
  "vat": ["tax", "tax_rate", "taxrate", "vat_rate", "vatrate", "dph", "mwst", "tax_percent", "taxpercent", "tax_percentage"],
  "quantity": ["stock", "stock_quantity", "stockquantity", "qty", "inventory", "available", "available_quantity", "availablequantity", "mnozstvo", "bestand", "on_hand", "onhand", "stock_level", "stocklevel", "freestock", "free_stock"],
  "weight": ["weight", "net_weight", "netweight", "gross_weight", "grossweight", "hmotnost", "gewicht", "mass", "item_weight", "product_weight"],
  "id": ["id", "product_id", "productid", "item_id", "itemid", "stockitemid", "stock_item_id", "record_id"],
  "recordexternalidentificator": ["external_id", "externalid", "ext_id", "extid", "external_code", "externalcode", "source_id", "sourceid", "ref", "reference", "foreignid", "foreign_id"],
  "ns_text": ["description", "long_description", "longdescription", "full_description", "fulldescription", "body", "text", "content", "details", "product_description"],
  "ns_note": ["note", "notes", "comment", "comments", "remark", "remarks", "poznamka", "internal_note", "memo"],
  "unit": ["unit", "uom", "unit_of_measure", "unitofmeasure", "measure_unit", "measureunit", "einzelheit", "jednotka", "packaging_unit"],
  "color": ["color", "colour", "farba", "farbe", "product_color", "productcolor"],
  "size": ["size", "velkost", "grosse", "dimension", "product_size", "productsize"],
  "brand": ["brand", "manufacturer", "vendor", "supplier", "znacka", "marke", "hersteller", "make"],
  "category": ["category", "group", "product_group", "productgroup", "kategoria", "kategorie", "type", "product_type", "producttype", "classification"],
  "image": ["image", "image_url", "imageurl", "photo", "picture", "thumbnail", "img", "foto", "bild", "main_image", "mainimage"],
  "ean": ["ean", "ean13", "ean_code", "eancode", "gtin", "upc", "barcode"],
  "minorderquantity": ["moq", "min_order", "minorder", "minimum_order", "minimumorder", "min_qty", "minqty", "minimum_quantity"],
};

const CRITICAL_TARGET_FIELDS: Record<string, string[]> = {
  stockitems: ["Ns_Number", "Default_Price"],
  partners: ["Ns_Name"],
  stocks: ["Quantity"],
  catalogprices: ["Default_Price"],
};

type MappingSuggestion = {
  sourceField: string;
  targetField: string;
  confidence: number;
  reason: string;
  reasonSk: string;
  transform?: string;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[_\-\s]/g, "");
}

const NORM_ALIAS_MAP: Map<string, string[]> = new Map(
  Object.entries(SEMANTIC_ALIASES).map(([k, v]) => [norm(k), v.map(norm)])
);

function computeMappingSuggestions(sourceFields: string[], targetFields: string[]): MappingSuggestion[] {
  const suggestions: MappingSuggestion[] = [];
  const usedSource = new Set<string>();

  for (const tf of targetFields) {
    const tfN = norm(tf);
    let bestSrc: string | null = null;
    let bestScore = 0;
    let bestReason = "";
    let bestReasonSk = "";
    let bestTransform: string | undefined;

    for (const sf of sourceFields) {
      if (usedSource.has(sf)) continue;
      const sfN = norm(sf);

      if (sfN === tfN) {
        bestSrc = sf;
        bestScore = 100;
        bestReason = "Exact match";
        bestReasonSk = "Presná zhoda";
        break;
      }

      const aliases = NORM_ALIAS_MAP.get(tfN);
      if (aliases && aliases.includes(sfN)) {
        const score = 90;
        if (score > bestScore) {
          bestSrc = sf;
          bestScore = score;
          bestReason = `Semantic match: "${sf}" → "${tf}"`;
          bestReasonSk = `Sémantická zhoda: „${sf}" → „${tf}"`;
        }
        continue;
      }

      for (const [aliasKey, srcAliases] of Array.from(NORM_ALIAS_MAP.entries())) {
        if (aliasKey === tfN) {
          if (srcAliases.includes(sfN)) {
            const score = 85;
            if (score > bestScore) {
              bestSrc = sf;
              bestScore = score;
              bestReason = `Known alias: "${sf}" maps to "${tf}"`;
              bestReasonSk = `Známy alias: „${sf}" → „${tf}"`;
            }
          }
        }
      }

      if (sfN.includes(tfN) || tfN.includes(sfN)) {
        const score = Math.min(sfN.length, tfN.length) / Math.max(sfN.length, tfN.length) * 75;
        if (score > bestScore) {
          bestSrc = sf;
          bestScore = score;
          bestReason = `Partial match: "${sf}" ~ "${tf}"`;
          bestReasonSk = `Čiastočná zhoda: „${sf}" ~ „${tf}"`;
        }
      }

      const sfTokens = sf.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().split(/[_\-\s]+/).filter(t => t.length > 2);
      const tfTokens = tf.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().split(/[_\-\s]+/).filter(t => t.length > 2);
      const commonTokens = sfTokens.filter(t => tfTokens.some(tt => tt.includes(t) || t.includes(tt)));
      if (commonTokens.length > 0) {
        const score = (commonTokens.length / Math.max(sfTokens.length, tfTokens.length)) * 65;
        if (score > bestScore) {
          bestSrc = sf;
          bestScore = score;
          bestReason = `Token match: shared "${commonTokens.join(", ")}"`;
          bestReasonSk = `Zhoda tokenov: spoločné „${commonTokens.join(", ")}"`;
        }
      }
    }

    if (bestSrc && bestScore >= 35) {
      const tfLower = tf.toLowerCase();
      if (tfLower.includes("price") || tfLower.includes("amount") || tfLower.includes("cost")) {
        bestTransform = "price";
      } else if (tfLower.includes("quantity") || tfLower.includes("stock")) {
        bestTransform = "number";
      }

      suggestions.push({
        sourceField: bestSrc,
        targetField: tf,
        confidence: Math.round(bestScore),
        reason: bestReason,
        reasonSk: bestReasonSk,
        transform: bestTransform,
      });
      usedSource.add(bestSrc);
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

type MappingValidation = {
  status: "ok" | "warning" | "error";
  message: string;
  messageSk: string;
};

function validateMappings(
  mappings: FieldMapping[],
  targetDataSource: string,
  sourceFields: string[],
  targetFields: string[],
  onixFixedFields?: OnixFixedField[],
  onMissing?: "create" | "skip" | "force"
): MappingValidation[] {
  const results: MappingValidation[] = [];

  if (mappings.length === 0) {
    results.push({
      status: "error",
      message: "No field mappings configured — sync will not transfer any data",
      messageSk: "Žiadne mapovanie polí — synchronizácia neprenesie žiadne dáta",
    });
    return results;
  }

  const dsKey = targetDataSource === "auto" ? "stockitems" : targetDataSource;
  const critical = CRITICAL_TARGET_FIELDS[dsKey] || [];
  const mappedTargetsNorm = new Set(mappings.map(m => norm(m.targetField)));

  // SupplierCode is required for ONIX stockitems when new records may be created.
  // If onMissing = "skip", no new records are ever created so this check is skipped.
  if (dsKey === "stockitems" && onMissing !== "skip") {
    const supplierInMappings = mappings.some(m => m.targetField === "SupplierCode");
    const supplierInFixed = (onixFixedFields || []).some(ff => ff.field === "SupplierCode" && ff.value && ff.value.trim() !== "");
    if (!supplierInMappings && !supplierInFixed) {
      results.push({
        status: "error",
        message: "SupplierCode is not configured — new ONIX cards created via sync will have no supplier and won't appear in the purchase price list. Add it as a fixed field value (e.g. 'H-0001') or via field mapping.",
        messageSk: "SupplierCode nie je nakonfigurovaný — nové ONIX karty vytvorené cez sync nebudú mať dodávateľa a nebudú v nákupnom cenníku. Pridajte ho ako pevnú hodnotu (napr. 'H-0001') alebo cez mapovanie polí.",
      });
    }
  }

  for (const cf of critical) {
    if (!mappedTargetsNorm.has(norm(cf))) {
      const cfN = norm(cf);
      const aliases = NORM_ALIAS_MAP.get(cfN) || [];
      const aliasHint = aliases.slice(0, 3).join(", ");
      results.push({
        status: "warning",
        message: `Critical field "${cf}" is not mapped. Look for source fields like: ${aliasHint || cf}`,
        messageSk: `Dôležité pole „${cf}" nie je namapované. Hľadajte zdrojové polia ako: ${aliasHint || cf}`,
      });
    }
  }

  const dupTargets = mappings.map(m => m.targetField).filter((t, i, arr) => arr.indexOf(t) !== i);
  if (dupTargets.length > 0) {
    results.push({
      status: "error",
      message: `Duplicate target fields: ${Array.from(new Set(dupTargets)).join(", ")} — each target field should be mapped only once`,
      messageSk: `Duplicitné cieľové polia: ${Array.from(new Set(dupTargets)).join(", ")} — každé cieľové pole by malo byť namapované iba raz`,
    });
  }

  if (sourceFields.length > 0 && targetFields.length > 0) {
    const invalidSrc = mappings.filter(m => m.sourceField && !sourceFields.includes(m.sourceField));
    const invalidTgt = mappings.filter(m => m.targetField && !targetFields.includes(m.targetField));
    if (invalidSrc.length > 0) {
      results.push({
        status: "warning",
        message: `Source fields not recognized: ${invalidSrc.map(m => m.sourceField).join(", ")}`,
        messageSk: `Zdrojové polia sa nerozpoznali: ${invalidSrc.map(m => m.sourceField).join(", ")}`,
      });
    }
    if (invalidTgt.length > 0) {
      results.push({
        status: "warning",
        message: `Target fields not recognized: ${invalidTgt.map(m => m.targetField).join(", ")}`,
        messageSk: `Cieľové polia sa nerozpoznali: ${invalidTgt.map(m => m.targetField).join(", ")}`,
      });
    }
  }

  const emptyMappings = mappings.filter(m => !m.sourceField || !m.targetField);
  if (emptyMappings.length > 0) {
    results.push({
      status: "error",
      message: `${emptyMappings.length} mapping(s) have empty source or target field`,
      messageSk: `${emptyMappings.length} mapovanie(a) majú prázdne zdrojové alebo cieľové pole`,
    });
  }

  const ID_NORMS = new Set(["id", "recordexternalidentificator", "nsnumber"]);
  const hasIdMapping = mappings.some(m => ID_NORMS.has(norm(m.targetField)));
  if (!hasIdMapping) {
    results.push({
      status: "warning",
      message: "No ID/identifier field mapped — system will generate auto IDs (SYNCHUB_1, SYNCHUB_2, ...). Consider mapping a unique identifier for better tracking.",
      messageSk: "Žiadne ID/identifikátor pole nie je namapované — systém automaticky vygeneruje ID (SYNCHUB_1, SYNCHUB_2, ...). Zvážte namapovanie unikátneho identifikátora pre lepšie sledovanie.",
    });
  }

  if (results.length === 0) {
    results.push({
      status: "ok",
      message: `Mapping looks good — ${mappings.length} field(s) configured, all critical fields covered`,
      messageSk: `Mapovanie vyzerá dobre — ${mappings.length} pole(í) nakonfigurovaných, všetky kľúčové polia pokryté`,
    });
  }

  return results;
}

function autoMapFields(sourceFields: string[], targetFields: string[]): FieldMapping[] {
  const suggestions = computeMappingSuggestions(sourceFields, targetFields);
  return suggestions
    .filter(s => s.confidence >= 50)
    .map(s => ({ sourceField: s.sourceField, targetField: s.targetField, transform: s.transform }));
}

interface HintItem {
  type: "info" | "auto" | "warning";
  sk: string;
  en: string;
}

const MODULE_HINTS: Record<string, (ds: string, srcCode: string) => HintItem[]> = {
  ONIX: (ds, srcCode) => {
    const hints: HintItem[] = [];
    if (ds === "auto" || ds === "stockitems") {
      hints.push(
        { type: "auto", sk: "Systém automaticky nastaví povinné pole Type = 1 (Tovar). Nemusíte ho mapovať.", en: "The system will automatically set required field Type = 1 (Product). No need to map it." },
        { type: "auto", sk: "Číslo skladu (Ns_Code = \"SK\") a merná jednotka (\"ks\") sa nastavia automaticky, ak ich nenamapujete.", en: "Stock number code (Ns_Code = \"SK\") and measure unit (\"ks\") are set automatically if you don't map them." },
        { type: "auto", sk: "Cieľový sklad (Default_Stock) vyberiete priamo vo výbere 'Cieľový sklad' vyššie. Ak nie je nastavený, použije sa sklad z konfigurácie modulu.", en: "Target warehouse (Default_Stock) is selected via the 'Target Warehouse' dropdown above. If not set, the module config warehouse is used." },
        { type: "auto", sk: "Identifikátor záznamu (RecordExternalIdentificator) sa vygeneruje z kódu produktu, ak ho nenamapujete.", en: "Record identifier (RecordExternalIdentificator) is auto-generated from product code if not mapped." },
        { type: "info", sk: "Ceny (Default_Price) musia byť čísla. Text ako \"8.44 EUR\" sa automaticky prevedie na číslo 8.44.", en: "Prices (Default_Price) must be numbers. Text like \"8.44 EUR\" is automatically converted to 8.44." },
        { type: "info", sk: "CustomColumns (vlastné stĺpce) sa automaticky prevedú do správneho formátu pre ONIX.", en: "CustomColumns are automatically converted to the correct format for ONIX." },
        { type: "warning", sk: "Polia ako StockItemBalance, StockItemGroups a ďalšie \"len na čítanie\" polia sa automaticky odstránia z odosielaných dát.", en: "Fields like StockItemBalance, StockItemGroups and other read-only fields are automatically removed from sent data." },
        { type: "warning", sk: "Nové karty vytvorené cez sync NEMAJÚ priradenie dodávateľa (SupplierCode). Nastavte ho ako pevnú hodnotu v sekcii 'Pevné hodnoty polí' - inak karta nebude v nákupnom cenníku.", en: "New cards created via sync do NOT have a supplier (SupplierCode) assigned. Set it as a fixed field value - otherwise the card won't appear in the purchase price list." },
      );
      if (srcCode) {
        hints.push({ type: "info", sk: `Namapujte minimálne: názov produktu (Name), číslo (Ns_Number) a cenu (Default_Price). Ostatné polia sú voliteľné.`, en: `Map at minimum: product name (Name), number (Ns_Number) and price (Default_Price). Other fields are optional.` });
      }
    }
    if (ds === "partners") {
      hints.push(
        { type: "info", sk: "Pre partnerov je povinné pole Ns_Name (názov partnera).", en: "For partners, the required field is Ns_Name (partner name)." },
      );
    }
    return hints;
  },
  PIPEDRIVE: (ds) => {
    const hints: HintItem[] = [];
    if (ds === "products") {
      hints.push(
        { type: "info", sk: "Ceny v Pipedrive musia byť vo formáte [{currency: \"EUR\", price: 10}]. Ak namapujete číslo, systém ho automaticky zabalí do tohto formátu.", en: "Prices in Pipedrive must be [{currency: \"EUR\", price: 10}]. If you map a number, the system wraps it automatically." },
        { type: "auto", sk: "Pole category musí byť číslo (ID kategórie v Pipedrive) alebo null. Neplatné hodnoty sa automaticky vynulujú.", en: "Category field must be a number (Pipedrive category ID) or null. Invalid values are auto-cleared." },
      );
    }
    if (ds === "deals" || ds === "persons" || ds === "organizations") {
      hints.push(
        { type: "info", sk: "Pole owner_id musí byť platné ID používateľa v Pipedrive. Neplatné hodnoty sa automaticky odstránia.", en: "owner_id must be a valid Pipedrive user ID. Invalid values are auto-removed." },
      );
    }
    hints.push(
      { type: "info", sk: "Ak záznam v Pipedrive už existuje (podľa ID), bude aktualizovaný. Inak sa vytvorí nový.", en: "If a record already exists in Pipedrive (by ID), it will be updated. Otherwise a new one is created." },
    );
    return hints;
  },
  RAYNET: (ds) => {
    const hints: HintItem[] = [
      { type: "info", sk: "Raynet má limit API volaní. Ak sa dosiahne limit, systém automaticky počká a pokračuje.", en: "Raynet has API call limits. If the limit is reached, the system automatically waits and continues." },
      { type: "info", sk: "Číselné polia (rating, price, totalAmount) sa automaticky konvertujú na čísla.", en: "Numeric fields (rating, price, totalAmount) are automatically converted to numbers." },
    ];
    if (ds === "company" || ds === "person") {
      hints.push(
        { type: "info", sk: "Pole owner sa automaticky prevedie z objektu na ID, ak je to potrebné.", en: "The owner field is automatically converted from object to ID if needed." },
      );
    }
    return hints;
  },
};

function ModuleHints({ targetCode, sourceCode, targetDataSource, language }: {
  targetCode: string; sourceCode: string; targetDataSource: string; language: string;
}) {
  const hintFn = MODULE_HINTS[targetCode];
  if (!hintFn) return null;
  const hints = hintFn(targetDataSource, sourceCode);
  if (hints.length === 0) return null;

  const icons = {
    info: <Lightbulb className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />,
    auto: <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />,
  };
  const bgColors = {
    info: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
    auto: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
    warning: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800",
  };
  const textColors = {
    info: "text-blue-700 dark:text-blue-300",
    auto: "text-green-700 dark:text-green-300",
    warning: "text-yellow-700 dark:text-yellow-300",
  };

  return (
    <div className="rounded-lg border p-4 space-y-2 bg-muted/10" data-testid="section-module-hints">
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4" />
        {language === "sk"
          ? `Dôležité informácie pre ${targetCode}`
          : `Important information for ${targetCode}`}
      </h4>
      <div className="grid gap-1.5">
        {hints.map((hint, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs border ${bgColors[hint.type]}`}
            data-testid={`hint-${hint.type}-${idx}`}
          >
            {icons[hint.type]}
            <span className={textColors[hint.type]}>
              {language === "sk" ? hint.sk : hint.en}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ConfigSnapshot {
  id: string;
  syncConfigId: string;
  configName: string;
  snapshotJson: Record<string, any>;
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
  createdBy: string | null;
  createdAt: string;
}

export default function SyncConfigPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "operator";
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ ...emptyEditor });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearHkodConfirmId, setClearHkodConfirmId] = useState<string | null>(null);
  const [clearBaselinesConfirmId, setClearBaselinesConfirmId] = useState<string | null>(null);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);
  const [vatPopover, setVatPopover] = useState<{ configId: string; rate: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSide, setPreviewSide] = useState<"source" | "target">("source");
  const [snapshotExpandedConfig, setSnapshotExpandedConfig] = useState<string | null>(null);

  const { data: modules } = useQuery<ApiModule[]>({ queryKey: ["/api/modules"] });
  const { data: configs, isLoading: configsLoading } = useQuery<EnrichedSyncConfig[]>({ queryKey: ["/api/sync-configs"] });
  const { data: allSnapshots } = useQuery<ConfigSnapshot[]>({ queryKey: ["/api/config-snapshots"] });

  const snapshotsByConfig = useMemo(() => {
    const map = new Map<string, ConfigSnapshot[]>();
    (allSnapshots || []).forEach(s => {
      const arr = map.get(s.syncConfigId) || [];
      arr.push(s);
      map.set(s.syncConfigId, arr);
    });
    map.forEach((arr, key) => {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      map.set(key, arr);
    });
    return map;
  }, [allSnapshots]);

  const { data: liveEditedConfig } = useQuery<EnrichedSyncConfig>({
    queryKey: ["/api/sync-configs", editor.id],
    enabled: !!editor.id && editorOpen,
    refetchInterval: editorOpen && !!editor.id ? 4000 : false,
  });

  const targetModules = useMemo(() =>
    (modules || []).filter(m => TARGET_MODULE_CODES.includes(m.code)).sort((a, b) => a.sortOrder - b.sortOrder),
    [modules]
  );

  const sourceModules = useMemo(() => {
    if (!editor.targetModuleId || !modules) return [];
    return modules.filter(m => m.id !== editor.targetModuleId).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [modules, editor.targetModuleId]);

  const selectedSourceModule = useMemo(() =>
    modules?.find(m => m.id === editor.sourceModuleId),
    [modules, editor.sourceModuleId]
  );

  const selectedTargetModule = useMemo(() =>
    modules?.find(m => m.id === editor.targetModuleId),
    [modules, editor.targetModuleId]
  );

  const sourceDataSourceOptions = useMemo(() => {
    if (!selectedSourceModule) return [];
    return SOURCE_OPTIONS[selectedSourceModule.code] || [{ value: "auto", label: "Auto" }];
  }, [selectedSourceModule]);

  const targetDataSourceOptions = useMemo(() => {
    if (!selectedTargetModule) return [];
    return SOURCE_OPTIONS[selectedTargetModule.code] || [{ value: "auto", label: "Auto" }];
  }, [selectedTargetModule]);

  const { data: sourceFieldsData, isLoading: sourceFieldsLoading } = useQuery<{ fields: string[]; sample: any[]; error?: string }>({
    queryKey: ["/api/modules", editor.sourceModuleId, "source-fields", editor.sourceDataSource],
    enabled: !!editor.sourceModuleId && !!editor.sourceDataSource && editorOpen,
    queryFn: async () => {
      const res = await fetch(`/api/modules/${editor.sourceModuleId}/source-fields?source=${editor.sourceDataSource}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch fields");
      return res.json();
    },
  });

  const activeFilters = useMemo(() =>
    editor.sourceFilters.filter(f => f.field && f.value && String(f.value).trim() !== ""),
    [editor.sourceFilters]
  );

  const [debouncedFilterKey, setDebouncedFilterKey] = useState("");
  useEffect(() => {
    const key = JSON.stringify(activeFilters);
    const timer = setTimeout(() => setDebouncedFilterKey(key), 400);
    return () => clearTimeout(timer);
  }, [activeFilters]);

  const { data: filterCountData, isFetching: filterCountFetching } = useQuery<{ total: number; matched: number; capped?: boolean }>({
    queryKey: ["/api/modules", editor.sourceModuleId, "filter-count", editor.sourceDataSource, editor.sourceRecordLimit, debouncedFilterKey],
    enabled: !!editor.sourceModuleId && !!editor.sourceDataSource && editorOpen && activeFilters.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({
        source: editor.sourceDataSource || "",
        limit: String(editor.sourceRecordLimit || 5000),
        filters: debouncedFilterKey,
      });
      const res = await fetch(`/api/modules/${editor.sourceModuleId}/filter-count?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filter count");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: targetFieldsData, isLoading: targetFieldsLoading } = useQuery<{ fields: string[]; sample: any[]; error?: string }>({
    queryKey: ["/api/modules", editor.targetModuleId, "source-fields", editor.targetDataSource],
    enabled: !!editor.targetModuleId && !!editor.targetDataSource && editorOpen,
    queryFn: async () => {
      const res = await fetch(`/api/modules/${editor.targetModuleId}/source-fields?source=${editor.targetDataSource}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch fields");
      return res.json();
    },
  });

  const sourceFields = sourceFieldsData?.fields || [];
  const targetFields = targetFieldsData?.fields || [];
  const fieldsReady = sourceFields.length > 0 && targetFields.length > 0;

  const isOnixStockItems = selectedTargetModule?.code === "ONIX" &&
    (!editor.targetDataSource || editor.targetDataSource === "auto" || editor.targetDataSource === "stockitems");

  const { data: onixStocksData, isLoading: onixStocksLoading } = useQuery<{ preview: any[]; recordCount: number; error?: string }>({
    queryKey: ["/api/modules", editor.targetModuleId, "data-preview", "stocks"],
    enabled: isOnixStockItems && !!editor.targetModuleId && editorOpen,
    queryFn: async () => {
      const res = await fetch(`/api/modules/${editor.targetModuleId}/data-preview?source=stocks&limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stocks");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const onixStocks = (onixStocksData?.preview || []).map((item: any) => {
    const code = item.Ns_Code ?? item.Code ?? item.code ?? item.Id ?? "";
    const name = item.Ns_Name ?? item.Name ?? item.name ?? "";
    return { code: String(code), name: String(name) };
  }).filter(s => s.code);

  const [snapshottingConfigId, setSnapshottingConfigId] = useState<string | null>(null);

  async function handleSnapshotConfig(configId: string) {
    setSnapshottingConfigId(configId);
    try {
      await apiRequest("POST", `/api/config-snapshots/${configId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/config-snapshots"] });
      toast({ title: language === "sk" ? "Záloha konfigurácie vytvorená" : "Config snapshot created" });
    } catch (e: any) {
      toast({ title: e.message || (language === "sk" ? "Chyba pri zálohe" : "Snapshot failed"), variant: "destructive" });
    } finally {
      setSnapshottingConfigId(null);
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sync-configs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
      toast({ title: language === "sk" ? "Konfigurácia vytvorená" : "Configuration created" });
      closeEditor();
    },
    onError: () => {
      toast({ title: language === "sk" ? "Chyba pri vytváraní" : "Failed to create", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/sync-configs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
      toast({ title: language === "sk" ? "Konfigurácia uložená" : "Configuration saved" });
      closeEditor();
    },
    onError: () => {
      toast({ title: language === "sk" ? "Chyba pri ukladaní" : "Failed to save", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sync-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
      toast({ title: language === "sk" ? "Konfigurácia vymazaná" : "Configuration deleted" });
      setDeleteId(null);
    },
    onError: () => {
      setDeleteId(null);
      toast({ title: language === "sk" ? "Chyba pri mazaní" : "Failed to delete", variant: "destructive" });
    },
  });

  const clearBaselinesMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sync-configs/${id}/clear-baselines`),
    onSuccess: () => {
      setClearBaselinesConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
      toast({
        title: language === "sk" ? "Sync história vymazaná" : "Sync history cleared",
        description: language === "sk"
          ? "Všetky baselines a H-kód priradenia sú zmazané. Ďalší beh synchronizácie spracuje všetky záznamy odznova."
          : "All baselines and H-kód assignments cleared. The next sync run will process all records from scratch.",
      });
    },
    onError: () => {
      setClearBaselinesConfirmId(null);
      toast({ title: language === "sk" ? "Chyba pri mazaní histórie" : "Failed to clear history", variant: "destructive" });
    },
  });

  const clearHkodMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sync-configs/${id}/clear-hkod-history`),
    onSuccess: (data: any) => {
      setClearHkodConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
      toast({
        title: language === "sk" ? "H-kód história vymazaná" : "H-kód history cleared",
        description: language === "sk"
          ? `Vymazaných ${data?.clearedCount ?? 0} záznamov. Ďalší beh vytvorí záznamy nanovo.`
          : `Cleared ${data?.clearedCount ?? 0} records. Next run will recreate them.`,
      });
    },
    onError: () => {
      setClearHkodConfirmId(null);
      toast({ title: language === "sk" ? "Chyba pri mazaní H-kód histórie" : "Failed to clear H-kód history", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/sync-configs/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
    },
  });

  const vatToggleMutation = useMutation({
    mutationFn: ({ id, fieldMappings }: { id: string; fieldMappings: FieldMapping[] }) =>
      apiRequest("PATCH", `/api/sync-configs/${id}`, { fieldMappings }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
      const nowHasVat = vars.fieldMappings.some(m => m.transform?.startsWith("price_excl_vat"));
      toast({
        title: nowHasVat
          ? (language === "sk" ? "Delenie DPH zapnuté" : "VAT divider enabled")
          : (language === "sk" ? "Delenie DPH vypnuté" : "VAT divider disabled"),
      });
    },
  });

  function toggleVat(config: EnrichedSyncConfig) {
    const mappings = (config.fieldMappings as FieldMapping[] || []);
    const hasVat = mappings.some(m => m.transform?.startsWith("price_excl_vat"));
    if (hasVat) {
      const updatedMappings = mappings.map(m =>
        m.transform?.startsWith("price_excl_vat") ? { ...m, transform: undefined } : m
      );
      vatToggleMutation.mutate({ id: config.id, fieldMappings: updatedMappings });
    } else {
      setVatPopover({ configId: String(config.id), rate: "23" });
    }
  }

  function applyVatRate(config: EnrichedSyncConfig, rate: string) {
    const mappings = (config.fieldMappings as FieldMapping[] || []);
    const priceIdx = mappings.findIndex(m => m.targetField === "Default_Price");
    if (priceIdx === -1) {
      toast({
        title: language === "sk"
          ? "Nenašlo sa mapovanie pre pole Default_Price"
          : "No mapping found for Default_Price field",
        variant: "destructive",
      });
      setVatPopover(null);
      return;
    }
    const parsedRate = parseFloat(rate);
    const clampedRate = isNaN(parsedRate) ? 23 : Math.min(100, Math.max(1, parsedRate));
    const safeRate = Math.round(clampedRate * 100) / 100;
    const updatedMappings = mappings.map((m, i) =>
      i === priceIdx ? { ...m, transform: `price_excl_vat:${safeRate}` } : m
    );
    vatToggleMutation.mutate({ id: config.id, fieldMappings: updatedMappings });
    setVatPopover(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditor({ ...emptyEditor });
  }

  function openNewEditor() {
    setEditor({ ...emptyEditor });
    setEditorOpen(true);
  }

  function openEditEditor(config: EnrichedSyncConfig) {
    const schedule = (config.schedule || { enabled: false, frequency: "daily" }) as Schedule & { backupBeforeSync?: boolean };
    const targetMod = modules?.find(m => m.id === config.targetModuleId);
    const targetOpts = targetMod ? (SOURCE_OPTIONS[targetMod.code] || []) : [];
    const defaultTargetDs = targetOpts.length > 0 ? targetOpts[0].value : "auto";
    setEditor({
      id: config.id,
      name: config.name,
      targetModuleId: config.targetModuleId,
      targetDataSource: config.targetDataSource || defaultTargetDs,
      sourceModuleId: config.sourceModuleId,
      sourceDataSource: config.sourceDataSource || "",
      sourceRecordLimit: config.sourceRecordLimit ?? 120000,
      fieldMappings: (config.fieldMappings || []) as FieldMapping[],
      matchFields: (config as any).matchFields || [],
      matchOperator: ((config as any).matchOperator as "and" | "or") || "and",
      matchNormalization: { ...emptyMatchNormalization, ...((config as any).matchNormalization || {}) },
      onMissing: ((config as any).onMissing as "create" | "skip") || "create",
      targetStock: (config as any).targetStock || "",
      sourceFilters: (config as any).sourceFilters || [],
      hKodConfig: (config as any).hKodConfig
        ? { enabled: false, prefix: "H20", detectionPrefix: "H20", nextNumber: 125892, field: "Ns_Number", padding: 0, ...(config as any).hKodConfig }
        : { enabled: false, prefix: "H20", detectionPrefix: "H20", nextNumber: 125892, field: "Ns_Number", padding: 0 },
      onixFixedFields: Array.isArray((config as any).onixFixedFields) ? (config as any).onixFixedFields : [],
      schedule,
      isEnabled: config.isEnabled,
      backupBeforeSync: (config.schedule as any)?.backupBeforeSync !== false,
      autoRetry: (config as any).autoRetry || false,
      retryDelayMin: (config as any).retryDelayMin || 3,
      notes: (config as any).notes || "",
    });
    setEditorOpen(true);
  }

  function handleSave() {
    if (!editor.name.trim()) {
      toast({ title: language === "sk" ? "Zadajte názov konfigurácie" : "Enter configuration name", variant: "destructive" });
      return;
    }
    if (!editor.targetModuleId || !editor.sourceModuleId) {
      toast({ title: language === "sk" ? "Vyberte oba moduly" : "Select both modules", variant: "destructive" });
      return;
    }
    if (editor.fieldMappings.length === 0) {
      toast({ title: language === "sk" ? "Pridajte aspoň 1 mapovanie polí" : "Add at least 1 field mapping", variant: "destructive" });
      return;
    }
    const validMappings = editor.fieldMappings.filter(m => m.sourceField && m.targetField);
    if (validMappings.length === 0) {
      toast({ title: language === "sk" ? "Žiadne platné mapovanie polí" : "No valid field mappings", variant: "destructive" });
      return;
    }

    const emptyFixedIndices: number[] = (editor.onixFixedFields || []).reduce<number[]>((acc, ff, idx) => {
      if (ff.field.trim() !== "" && ff.value.trim() === "") acc.push(idx);
      return acc;
    }, []);
    if (emptyFixedIndices.length > 0) {
      setHighlightedFixedFields(new Set(emptyFixedIndices));
      toast({
        title: language === "sk" ? "Pevné polia majú prázdne hodnoty" : "Fixed fields have empty values",
        description: language === "sk"
          ? `${emptyFixedIndices.length === 1 ? "Pole" : "Polia"} ${emptyFixedIndices.map(i => editor.onixFixedFields[i].field).join(", ")} ${emptyFixedIndices.length === 1 ? "je pridané" : "sú pridané"} ako pevná hodnota, ale ${emptyFixedIndices.length === 1 ? "zostalo" : "zostali"} prázdne. Vyplňte ${emptyFixedIndices.length === 1 ? "hodnotu" : "hodnoty"} v sekcii Pevné hodnoty polí.`
          : `${emptyFixedIndices.map(i => editor.onixFixedFields[i].field).join(", ")} ${emptyFixedIndices.length === 1 ? "is" : "are"} added as fixed ${emptyFixedIndices.length === 1 ? "field" : "fields"} but ${emptyFixedIndices.length === 1 ? "its value is" : "their values are"} empty. Please fill in the value(s) in the Fixed Field Values section.`,
        variant: "destructive",
      });
      setTimeout(() => {
        const firstRef = fixedFieldValueRefs.current.get(emptyFixedIndices[0]);
        if (firstRef) {
          firstRef.scrollIntoView({ behavior: "smooth", block: "center" });
          firstRef.focus();
        }
      }, 100);
      return;
    }

    const validation = validateMappings(validMappings, editor.targetDataSource, sourceFields, targetFields, editor.onixFixedFields, editor.onMissing);
    const hasErrors = validation.some(v => v.status === "error");
    if (hasErrors) {
      setShowValidation(true);
      toast({
        title: language === "sk" ? "Mapovanie má chyby" : "Mapping has errors",
        description: language === "sk" ? "Opravte chyby pred uložením (viď Vyhodnotenie mapovania)" : "Fix errors before saving (see Mapping Evaluation)",
        variant: "destructive",
      });
      return;
    }

    setShowValidation(true);

    if (duplicateFixedFieldIndices.size > 0 || mappingOverlapFixedFieldIndices.size > 0) {
      setShowDuplicateFixedWarning(true);
      return;
    }

    performSave();
  }

  function performSave() {
    const validMappings = editor.fieldMappings.filter(m => m.sourceField && m.targetField);
    const payload = {
      name: editor.name.trim(),
      targetModuleId: editor.targetModuleId,
      sourceModuleId: editor.sourceModuleId,
      targetDataSource: editor.targetDataSource || null,
      sourceDataSource: editor.sourceDataSource || null,
      sourceRecordLimit: editor.sourceRecordLimit || 120000,
      fieldMappings: validMappings,
      matchFields: editor.matchFields.filter(f => f && f.trim()),
      matchOperator: editor.matchOperator,
      matchNormalization: editor.matchNormalization,
      onMissing: editor.onMissing,
      targetStock: editor.targetStock || null,
      sourceFilters: editor.sourceFilters.filter(f => f.field && f.value),
      hKodConfig: editor.hKodConfig,
      onixFixedFields: editor.onixFixedFields.filter(f => f.field.trim()),
      schedule: { ...editor.schedule, backupBeforeSync: editor.backupBeforeSync },
      isEnabled: editor.isEnabled,
      autoRetry: editor.autoRetry,
      retryDelayMin: editor.retryDelayMin,
      notes: editor.notes || null,
    };

    if (editor.id) {
      updateMutation.mutate({ id: editor.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function addMapping() {
    setEditor(prev => ({
      ...prev,
      fieldMappings: [...prev.fieldMappings, { sourceField: "", targetField: "" }],
    }));
  }

  function removeMapping(index: number) {
    setEditor(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index),
    }));
  }

  function updateMapping(index: number, field: "sourceField" | "targetField" | "transform", value: string) {
    setEditor(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((m, i) => i === index ? { ...m, [field]: value || undefined } : m),
    }));
  }

  function getTransformType(transform?: string) {
    if (!transform) return "none";
    const idx = transform.indexOf(":");
    return idx >= 0 ? transform.substring(0, idx) : transform;
  }

  function getVatRate(transform?: string) {
    if (!transform) return "23";
    const idx = transform.indexOf(":");
    return idx >= 0 ? transform.substring(idx + 1) : "23";
  }

  function getMultiplyCoeff(transform?: string) {
    if (!transform) return "1";
    const idx = transform.indexOf(":");
    return idx >= 0 ? transform.substring(idx + 1) : "1";
  }

  function getPadLength(transform?: string) {
    if (!transform) return "8";
    const parts = transform.split(":");
    return parts[1] || "8";
  }

  function getPadChar(transform?: string, defaultChar = "0") {
    if (!transform) return defaultChar;
    const parts = transform.split(":");
    return parts[2] !== undefined ? parts[2] : defaultChar;
  }

  function getTruncateLength(transform?: string) {
    if (!transform) return "8";
    const parts = transform.split(":");
    return parts[1] || "8";
  }

  function handleTransformTypeChange(mappingIdx: number, newType: string) {
    if (newType === "none" || newType === "") {
      updateMapping(mappingIdx, "transform", "");
    } else if (newType === "price_excl_vat") {
      const currentRate = getVatRate(editor.fieldMappings[mappingIdx].transform);
      updateMapping(mappingIdx, "transform", `price_excl_vat:${currentRate}`);
    } else if (newType === "multiply") {
      const currentCoeff = getMultiplyCoeff(editor.fieldMappings[mappingIdx].transform);
      const coeff = currentCoeff === "1" ? "1" : currentCoeff;
      updateMapping(mappingIdx, "transform", `multiply:${coeff}`);
    } else if (newType === "pad_left") {
      updateMapping(mappingIdx, "transform", "pad_left:8:0");
    } else if (newType === "pad_right") {
      updateMapping(mappingIdx, "transform", "pad_right:8: ");
    } else if (newType === "truncate") {
      updateMapping(mappingIdx, "transform", "truncate:8");
    } else if (newType === "country") {
      updateMapping(mappingIdx, "transform", "country:name_sk");
    } else {
      updateMapping(mappingIdx, "transform", newType);
    }
  }

  function handleVatRateChange(mappingIdx: number, rate: string) {
    const num = rate.replace(/[^\d.]/g, "");
    updateMapping(mappingIdx, "transform", `price_excl_vat:${num || "23"}`);
  }

  function handleMultiplyCoeffChange(mappingIdx: number, coeff: string) {
    const num = coeff.replace(/[^\d.]/g, "");
    updateMapping(mappingIdx, "transform", `multiply:${num || "1"}`);
  }

  function handlePadLengthChange(mappingIdx: number, len: string, isRight: boolean) {
    const type = isRight ? "pad_right" : "pad_left";
    const currentTransform = editor.fieldMappings[mappingIdx].transform || "";
    const currentChar = getPadChar(currentTransform, isRight ? " " : "0");
    const l = len.replace(/[^\d]/g, "") || "8";
    updateMapping(mappingIdx, "transform", `${type}:${l}:${currentChar}`);
  }

  function handlePadCharChange(mappingIdx: number, char: string, isRight: boolean) {
    const type = isRight ? "pad_right" : "pad_left";
    const currentTransform = editor.fieldMappings[mappingIdx].transform || "";
    const currentLen = getPadLength(currentTransform) || "8";
    updateMapping(mappingIdx, "transform", `${type}:${currentLen}:${char}`);
  }

  function handleTruncateLengthChange(mappingIdx: number, len: string) {
    const l = len.replace(/[^\d]/g, "") || "8";
    updateMapping(mappingIdx, "transform", `truncate:${l}`);
  }

  function getCountryFormat(transform?: string) {
    if (!transform) return "name_sk";
    const idx = transform.indexOf(":");
    return idx >= 0 ? transform.substring(idx + 1) : "name_sk";
  }

  function isCountrySourceField(fieldName: string): boolean {
    const lower = fieldName.toLowerCase().replace(/[_\-\.]/g, "");
    return COUNTRY_FIELD_KEYWORDS.some(kw => lower.includes(kw.toLowerCase().replace(/[_\-\.]/g, "")));
  }

  const ONIX_FIELD_HINTS: Record<string, { sk: string; en: string }> = {
    "Ist_Code": {
      sk: "Musí mať presne 8 znakov. Ak je hodnota kratšia, použite transformáciu 'Doplniť zľava' (dĺžka 8, znak 0).",
      en: "Must be exactly 8 characters. If shorter, use \"Pad left\" transform (length 8, char 0).",
    },
    "Ist_Dmj": {
      sk: "Kód mernej jednotky — zvyčajne číslo (napr. 0 = ks). Môžete použiť pevnú hodnotu v sekcii Pevné hodnoty polí.",
      en: "Unit of measure code — usually numeric (e.g. 0 = piece). Use fixed fields section for a constant.",
    },
    "Ns_Code": {
      sk: "Kód dodávateľa v ONIX (napr. H = Hauerland). Zvyčajne pevná hodnota, nie z mapovania.",
      en: "Supplier code in ONIX (e.g. H = Hauerland). Usually a fixed value, not from mapping.",
    },
    "VatRate": {
      sk: "Sadzba DPH ako celé číslo bez znaku % (napr. 20). Môžete použiť pevnú hodnotu.",
      en: "VAT rate as integer without % sign (e.g. 20). Can be set as a fixed value.",
    },
    "SupplierCode": {
      sk: "Kód dodávateľa v ONIX (napr. H-0001). Bez tohto poľa karta nebude v nákupnom cenníku. Nastavte ako pevnú hodnotu.",
      en: "Supplier code in ONIX (e.g. H-0001). Without this field the card won't appear in the purchase price list. Set as a fixed value.",
    },
    "Default_Price": {
      sk: "Predajná cena. Ak zdroj obsahuje cenu s DPH, použite transformáciu 'Cena bez DPH'.",
      en: "Selling price. If source includes VAT, use the \"Price excl. VAT\" transform.",
    },
  };

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [highlightedFixedFields, setHighlightedFixedFields] = useState<Set<number>>(new Set());
  const [showDuplicateFixedWarning, setShowDuplicateFixedWarning] = useState(false);
  const fixedFieldValueRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const dragFixedFieldIdx = useRef<number | null>(null);
  const [dragOverFixedFieldIdx, setDragOverFixedFieldIdx] = useState<number | null>(null);

  const suggestions = useMemo(() => {
    if (!fieldsReady) return [];
    return computeMappingSuggestions(sourceFields, targetFields);
  }, [sourceFields, targetFields, fieldsReady]);

  const validationResults = useMemo(() => {
    if (editor.fieldMappings.length === 0 && !showValidation) return [];
    return validateMappings(editor.fieldMappings, editor.targetDataSource, sourceFields, targetFields, editor.onixFixedFields, editor.onMissing);
  }, [editor.fieldMappings, editor.targetDataSource, sourceFields, targetFields, editor.onixFixedFields, editor.onMissing, showValidation]);

  const duplicateFixedFieldIndices = useMemo(() => {
    const counts = new Map<string, number>();
    editor.onixFixedFields.forEach(ff => {
      const name = ff.field.trim().toLowerCase();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    const dups = new Set<number>();
    editor.onixFixedFields.forEach((ff, idx) => {
      const name = ff.field.trim().toLowerCase();
      if (name && (counts.get(name) || 0) > 1) dups.add(idx);
    });
    return dups;
  }, [editor.onixFixedFields]);

  const mappingOverlapFixedFieldIndices = useMemo(() => {
    const mappedTargets = new Set<string>();
    editor.fieldMappings.forEach(m => {
      if (m.sourceField && m.targetField) {
        const t = m.targetField.trim().toLowerCase();
        if (t) mappedTargets.add(t);
      }
    });
    const overlap = new Set<number>();
    editor.onixFixedFields.forEach((ff, idx) => {
      const name = ff.field.trim().toLowerCase();
      if (name && mappedTargets.has(name)) overlap.add(idx);
    });
    return overlap;
  }, [editor.onixFixedFields, editor.fieldMappings]);

  function handleAutoMap() {
    if (!fieldsReady) return;
    const mapped = autoMapFields(sourceFields, targetFields);
    if (mapped.length === 0) {
      toast({ title: language === "sk" ? "Žiadne zhodné polia" : "No matching fields found", variant: "destructive" });
      return;
    }
    setEditor(prev => ({ ...prev, fieldMappings: mapped }));
    setShowValidation(true);
    toast({ title: language === "sk" ? `Auto-mapovaných ${mapped.length} polí` : `Auto-mapped ${mapped.length} fields` });
  }

  function applySuggestion(sug: MappingSuggestion) {
    setEditor(prev => {
      const exists = prev.fieldMappings.some(m => m.targetField === sug.targetField);
      if (exists) {
        return {
          ...prev,
          fieldMappings: prev.fieldMappings.map(m =>
            m.targetField === sug.targetField
              ? { sourceField: sug.sourceField, targetField: sug.targetField, transform: sug.transform }
              : m
          ),
        };
      }
      return {
        ...prev,
        fieldMappings: [...prev.fieldMappings, { sourceField: sug.sourceField, targetField: sug.targetField, transform: sug.transform }],
      };
    });
  }

  function applyAllSuggestions() {
    const high = suggestions.filter(s => s.confidence >= 50);
    if (high.length === 0) return;
    setEditor(prev => ({ ...prev, fieldMappings: high.map(s => ({ sourceField: s.sourceField, targetField: s.targetField, transform: s.transform })) }));
    setShowValidation(true);
    toast({ title: language === "sk" ? `Aplikovaných ${high.length} návrhov` : `Applied ${high.length} suggestions` });
  }

  function openPreview(side: "source" | "target") {
    setPreviewSide(side);
    setPreviewOpen(true);
  }

  const previewData = previewSide === "source" ? sourceFieldsData : targetFieldsData;
  const previewFields = previewSide === "source" ? sourceFields : targetFields;
  const previewModule = previewSide === "source" ? selectedSourceModule : selectedTargetModule;

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6" data-testid="page-sync-config">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-sync-title">
            <GitBranch className="h-6 w-6" />
            {language === "sk" ? "Sync Konfigurácia" : "Sync Configuration"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-sync-subtitle">
            {language === "sk"
              ? "Nastavte synchronizáciu dát medzi modulmi — mapovanie polí a plánovanie"
              : "Configure data synchronization between modules — field mapping and scheduling"}
          </p>
        </div>
        {!editorOpen && (
          <Button onClick={openNewEditor} data-testid="button-new-config">
            <Plus className="h-4 w-4 mr-2" />
            {language === "sk" ? "Nová konfigurácia" : "New Configuration"}
          </Button>
        )}
      </div>

      {editorOpen && (
        <Card className="border-2 border-primary/20" data-testid="card-config-editor">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-1">
              <CardTitle className="text-lg">
                {editor.id
                  ? (language === "sk" ? "Upraviť konfiguráciu" : "Edit Configuration")
                  : (language === "sk" ? "Nová synchronizačná konfigurácia" : "New Sync Configuration")}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={closeEditor} data-testid="button-close-editor">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="max-w-md">
              <Label htmlFor="config-name">{language === "sk" ? "Názov konfigurácie" : "Configuration Name"}</Label>
              <Input
                id="config-name"
                data-testid="input-config-name"
                value={editor.name}
                onChange={e => setEditor(prev => ({ ...prev, name: e.target.value }))}
                placeholder={language === "sk" ? "napr. MidOcean Produkty → ONIX" : "e.g. MidOcean Products → ONIX"}
                className="mt-1"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
              <Card className="bg-muted/30 border-2" data-testid="card-source-module">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-orange-500" />
                    {language === "sk" ? "ZDROJ (export z)" : "SOURCE (export from)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!editor.targetModuleId && (
                    <p className="text-xs text-muted-foreground italic">
                      {language === "sk" ? "Najprv vyberte cieľový modul vpravo →" : "First select a target module on the right →"}
                    </p>
                  )}
                  {editor.targetModuleId && (
                    <>
                      <Select
                        value={editor.sourceModuleId}
                        onValueChange={val => {
                          const mod = modules?.find(m => m.id === val);
                          const opts = mod ? (SOURCE_OPTIONS[mod.code] || []) : [];
                          const defaultSource = opts.length > 0 ? opts[0].value : "auto";
                          setEditor(prev => ({ ...prev, sourceModuleId: val, sourceDataSource: defaultSource, fieldMappings: [] }));
                        }}
                      >
                        <SelectTrigger data-testid="select-source-module">
                          <SelectValue placeholder={language === "sk" ? "Vyberte zdrojový modul..." : "Select source module..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceModules.map(m => (
                            <SelectItem key={m.id} value={m.id} data-testid={`option-source-${m.code}`}>
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">{String(m.sortOrder).padStart(2, "0")}.</span>
                                {m.name}
                                <Badge variant={m.status === "connected" ? "default" : "secondary"} className="ml-1 text-[10px] h-4">
                                  {m.status === "connected" ? "●" : "○"}
                                </Badge>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedSourceModule && sourceDataSourceOptions.length > 0 && (
                        <div>
                          <Label className="text-xs">{language === "sk" ? "Zdroj dát" : "Data Source"}</Label>
                          <Select
                            value={editor.sourceDataSource}
                            onValueChange={val => setEditor(prev => ({ ...prev, sourceDataSource: val, fieldMappings: [] }))}
                          >
                            <SelectTrigger className="mt-1" data-testid="select-data-source">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceDataSourceOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {selectedSourceModule && (
                        <div>
                          <Label className="text-xs">{t("syncConfig.recordLimit")}</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number"
                              min={0}
                              step={1000}
                              value={editor.sourceRecordLimit}
                              onChange={e => setEditor(prev => ({ ...prev, sourceRecordLimit: parseInt(e.target.value) || 0 }))}
                              className="w-32 h-8 text-sm"
                              data-testid="input-record-limit"
                            />
                            <span className="text-xs text-muted-foreground">
                              {editor.sourceRecordLimit === 0
                                ? (language === "sk" ? "bez limitu" : "no limit")
                                : (language === "sk" ? `max ${editor.sourceRecordLimit.toLocaleString()} záznamov` : `max ${editor.sourceRecordLimit.toLocaleString()} records`)}
                            </span>
                          </div>
                        </div>
                      )}

                      {selectedSourceModule && (
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground" data-testid="text-source-info">
                            <span className="font-mono">{selectedSourceModule.code}</span>
                            {editor.sourceDataSource && ` → ${editor.sourceDataSource}`}
                            {" — "}
                            {sourceFieldsLoading ? (language === "sk" ? "načítavam..." : "loading...") :
                              sourceFields.length > 0 ? `${sourceFields.length} ${language === "sk" ? "polí" : "fields"}` :
                                (sourceFieldsData?.error || (language === "sk" ? "žiadne polia" : "no fields"))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => openPreview("source")}
                            disabled={sourceFieldsLoading}
                            data-testid="button-preview-source"
                          >
                            {sourceFieldsLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                            {language === "sk" ? "Náhľad" : "Preview"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="hidden lg:flex items-center justify-center pt-16">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              <Card className="bg-muted/30 border-2" data-testid="card-target-module">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ArrowDownToLine className="h-4 w-4 text-primary" />
                    {language === "sk" ? "CIEĽ (import do)" : "TARGET (import to)"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={editor.targetModuleId}
                    onValueChange={val => {
                      const mod = modules?.find(m => m.id === val);
                      const opts = mod ? (SOURCE_OPTIONS[mod.code] || []) : [];
                      const defaultTarget = opts.length > 0 ? opts[0].value : "auto";
                      setEditor(prev => {
                        const isStockItems = mod?.code === "ONIX" && (!defaultTarget || defaultTarget === "auto" || defaultTarget === "stockitems");
                        const hasSupplierCode = prev.onixFixedFields.some(ff => ff.field === "SupplierCode");
                        const newFixedFields = (isStockItems && !hasSupplierCode && !prev.id)
                          ? [{ field: "SupplierCode", value: "", condition: "if_empty" as const }, ...prev.onixFixedFields]
                          : prev.onixFixedFields;
                        return { ...prev, targetModuleId: val, targetDataSource: defaultTarget, sourceModuleId: "", sourceDataSource: "", fieldMappings: [], onixFixedFields: newFixedFields };
                      });
                      setHighlightedFixedFields(new Set());
                    }}
                  >
                    <SelectTrigger data-testid="select-target-module">
                      <SelectValue placeholder={language === "sk" ? "Vyberte cieľový modul..." : "Select target module..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetModules.map(m => (
                        <SelectItem key={m.id} value={m.id} data-testid={`option-target-${m.code}`}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{String(m.sortOrder).padStart(2, "0")}.</span>
                            {m.name}
                            <Badge variant={m.status === "connected" ? "default" : "secondary"} className="ml-1 text-[10px] h-4">
                              {m.status === "connected" ? "●" : "○"}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedTargetModule && (
                    <p className="text-xs text-muted-foreground italic mt-3" data-testid="text-target-hint">
                      {language === "sk" ? "Vyberte cieľový modul pre začatie konfigurácie" : "Select a target module to start configuring"}
                    </p>
                  )}
                  {selectedTargetModule && (
                    <div className="space-y-3 mt-3">
                      {targetDataSourceOptions.length > 1 && (
                        <div>
                          <Label className="text-xs">{language === "sk" ? "Cieľové dáta" : "Target Data"}</Label>
                          <Select
                            value={editor.targetDataSource}
                            onValueChange={val => {
                              setEditor(prev => {
                                const isStockItems = selectedTargetModule?.code === "ONIX" && (!val || val === "auto" || val === "stockitems");
                                const hasSupplierCode = prev.onixFixedFields.some(ff => ff.field === "SupplierCode");
                                const newFixedFields = (isStockItems && !hasSupplierCode && !prev.id)
                                  ? [{ field: "SupplierCode", value: "", condition: "if_empty" as const }, ...prev.onixFixedFields]
                                  : prev.onixFixedFields;
                                return { ...prev, targetDataSource: val, fieldMappings: [], onixFixedFields: newFixedFields };
                              });
                              setHighlightedFixedFields(new Set());
                            }}
                          >
                            <SelectTrigger className="mt-1" data-testid="select-target-data-source">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {targetDataSourceOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {isOnixStockItems && (
                        <div>
                          <Label className="text-xs">{language === "sk" ? "Cieľový sklad" : "Target Warehouse"}</Label>
                          <Select
                            value={editor.targetStock || "__auto__"}
                            onValueChange={val => setEditor(prev => ({ ...prev, targetStock: val === "__auto__" ? "" : val }))}
                          >
                            <SelectTrigger className="mt-1" data-testid="select-target-stock">
                              {onixStocksLoading
                                ? <span className="text-xs text-muted-foreground">{language === "sk" ? "Načítavam sklady..." : "Loading warehouses..."}</span>
                                : <SelectValue placeholder={language === "sk" ? "Automaticky (podľa modulu)" : "Automatic (from module)"} />
                              }
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">
                                {language === "sk" ? "— Automaticky (podľa konfigurácie modulu) —" : "— Automatic (from module config) —"}
                              </SelectItem>
                              {onixStocks.length > 0 ? onixStocks.map(s => (
                                <SelectItem key={s.code} value={s.code}>
                                  <span className="font-mono font-semibold">{s.code}</span>
                                  {s.name && s.name !== s.code && <span className="text-muted-foreground ml-2">— {s.name}</span>}
                                </SelectItem>
                              )) : !onixStocksLoading && (
                                <SelectItem value="__none__" disabled>{language === "sk" ? "Sklady sa nenačítali" : "No warehouses loaded"}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          {editor.targetStock && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {language === "sk" ? "Záznamy sa zapíšu do skladu: " : "Records will be written to warehouse: "}
                              <span className="font-mono font-semibold">{editor.targetStock}</span>
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground" data-testid="text-target-info">
                          <span className="font-mono">{selectedTargetModule.code}</span>
                          {editor.targetDataSource && editor.targetDataSource !== "auto" && ` → ${editor.targetDataSource}`}
                          {" — "}
                          {targetFieldsLoading ? (language === "sk" ? "načítavam..." : "loading...") :
                            targetFields.length > 0 ? `${targetFields.length} ${language === "sk" ? "polí" : "fields"}` :
                              (targetFieldsData?.error || (language === "sk" ? "žiadne polia" : "no fields"))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => openPreview("target")}
                          disabled={targetFieldsLoading}
                          data-testid="button-preview-target"
                        >
                          {targetFieldsLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                          {language === "sk" ? "Náhľad" : "Preview"}
                        </Button>
                      </div>
                      {!editor.sourceModuleId && (
                        <p className="text-xs text-muted-foreground italic" data-testid="text-target-next-step">
                          {language === "sk" ? "Teraz vyberte zdrojový modul vľavo ←" : "Now select a source module on the left ←"}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {editor.targetModuleId && editor.sourceModuleId && editor.sourceDataSource && (
              <>
                {selectedTargetModule && (
                  <ModuleHints
                    targetCode={selectedTargetModule.code}
                    sourceCode={selectedSourceModule?.code || ""}
                    targetDataSource={editor.targetDataSource}
                    language={language}
                  />
                )}

                <Separator />

                <div data-testid="section-source-filters">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                      <Database className="h-4 w-4" />
                      {language === "sk" ? "Filtre zdrojových záznamov" : "Source Record Filters"}
                      {activeFilters.length > 0 && (
                        filterCountFetching ? (
                          <span className="text-xs font-normal text-muted-foreground animate-pulse">
                            {language === "sk" ? "počítam…" : "counting…"}
                          </span>
                        ) : filterCountData ? (
                          <Badge
                            variant="outline"
                            className={`text-xs font-normal ${filterCountData.matched === 0 ? "border-red-500/40 text-red-600 dark:text-red-400" : filterCountData.matched < filterCountData.total ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : "border-green-500/40 text-green-700 dark:text-green-400"}`}
                            data-testid="badge-filter-count"
                          >
                            {filterCountData.matched} {language === "sk" ? "z" : "of"} {filterCountData.total}{filterCountData.capped ? "+" : ""} {language === "sk" ? "záznamov" : "records"}
                          </Badge>
                        ) : null
                      )}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditor(prev => ({
                        ...prev,
                        sourceFilters: [...prev.sourceFilters, { field: "", operator: "starts_with", value: "" }]
                      }))}
                      data-testid="button-add-source-filter"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {language === "sk" ? "Pridať filter" : "Add Filter"}
                    </Button>
                  </div>
                  {editor.sourceFilters.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {language === "sk"
                        ? "Žiadne filtre — synchronizujú sa všetky záznamy. Pridajte filter pre obmedzenie podľa hodnoty poľa (napr. custom_label_1 začína na 'H')."
                        : "No filters — all records are synchronized. Add a filter to limit by field value (e.g. custom_label_1 starts with 'H')."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editor.sourceFilters.map((sf, idx) => (
                        <div key={idx} className="flex gap-2 items-start" data-testid={`source-filter-row-${idx}`}>
                          <div className="flex-1 min-w-0">
                            {sourceFields.length > 0 ? (
                              <Select
                                value={sf.field || "__none__"}
                                onValueChange={val => setEditor(prev => {
                                  const next = [...prev.sourceFilters];
                                  next[idx] = { ...next[idx], field: val === "__none__" ? "" : val };
                                  return { ...prev, sourceFilters: next };
                                })}
                              >
                                <SelectTrigger className="h-8 text-xs" data-testid={`source-filter-field-${idx}`}>
                                  <SelectValue placeholder={language === "sk" ? "Pole..." : "Field..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">{language === "sk" ? "— Vybrať pole —" : "— Select field —"}</SelectItem>
                                  {sourceFields.map(f => (
                                    <SelectItem key={f} value={f}><span className="font-mono text-xs">{f}</span></SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="h-8 text-xs font-mono"
                                placeholder={language === "sk" ? "Názov poľa..." : "Field name..."}
                                value={sf.field}
                                onChange={e => setEditor(prev => {
                                  const next = [...prev.sourceFilters];
                                  next[idx] = { ...next[idx], field: e.target.value };
                                  return { ...prev, sourceFilters: next };
                                })}
                                data-testid={`source-filter-field-input-${idx}`}
                              />
                            )}
                          </div>
                          <div className="w-36 shrink-0">
                            <Select
                              value={sf.operator}
                              onValueChange={val => setEditor(prev => {
                                const next = [...prev.sourceFilters];
                                next[idx] = { ...next[idx], operator: val as SourceFilter["operator"] };
                                return { ...prev, sourceFilters: next };
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`source-filter-op-${idx}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SOURCE_FILTER_OPERATORS.map(op => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {language === "sk" ? op.labelSk : op.labelEn}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1 min-w-0">
                            <Input
                              className="h-8 text-xs"
                              placeholder={language === "sk" ? "Hodnota..." : "Value..."}
                              value={sf.value}
                              onChange={e => setEditor(prev => {
                                const next = [...prev.sourceFilters];
                                next[idx] = { ...next[idx], value: e.target.value };
                                return { ...prev, sourceFilters: next };
                              })}
                              data-testid={`source-filter-value-${idx}`}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 shrink-0"
                            onClick={() => setEditor(prev => ({
                              ...prev,
                              sourceFilters: prev.sourceFilters.filter((_, i) => i !== idx)
                            }))}
                            data-testid={`button-remove-source-filter-${idx}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {editor.sourceFilters.filter(f => f.field && f.value).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === "sk"
                            ? "Všetky filtre musia byť splnené naraz (AND logika)."
                            : "All filters must match simultaneously (AND logic)."}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div data-testid="section-field-mappings">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">
                      {language === "sk" ? "Mapovanie polí" : "Field Mapping"}
                      {editor.fieldMappings.length > 0 && (
                        <span className="ml-2 text-muted-foreground font-normal">({editor.fieldMappings.length})</span>
                      )}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAutoMap}
                        disabled={!fieldsReady || sourceFieldsLoading || targetFieldsLoading}
                        data-testid="button-auto-map"
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        {language === "sk" ? "Auto-mapovanie" : "Auto-Map"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={addMapping} data-testid="button-add-mapping">
                        <Plus className="h-3 w-3 mr-1" />
                        {language === "sk" ? "Pridať" : "Add"}
                      </Button>
                    </div>
                  </div>

                  {(sourceFieldsLoading || targetFieldsLoading) && (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  )}

                  {!sourceFieldsLoading && !targetFieldsLoading && editor.fieldMappings.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg" data-testid="text-no-mappings">
                      <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">
                        {language === "sk"
                          ? "Žiadne mapovania polí. Kliknite \"Auto-mapovanie\" alebo \"Pridať\" pre vytvorenie."
                          : "No field mappings. Click \"Auto-Map\" or \"Add\" to create mappings."}
                      </p>
                    </div>
                  )}

                  {editor.fieldMappings.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-[1fr_40px_1fr_40px] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>{language === "sk" ? "Zdrojové pole" : "Source Field"} ({selectedSourceModule?.code})</span>
                        <span />
                        <span>{language === "sk" ? "Cieľové pole" : "Target Field"} ({selectedTargetModule?.code})</span>
                        <span />
                      </div>
                      {editor.fieldMappings.map((mapping, idx) => {
                        const transformType = getTransformType(mapping.transform);
                        const vatRate = getVatRate(mapping.transform);
                        return (
                        <div
                          key={idx}
                          className={`flex flex-col ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"} border-t`}
                          data-testid={`row-mapping-${idx}`}
                        >
                          <div className="grid grid-cols-[1fr_40px_1fr_40px] items-center px-3 pt-2 pb-1">
                            <Select
                              value={mapping.sourceField}
                              onValueChange={val => updateMapping(idx, "sourceField", val)}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-source-field-${idx}`}>
                                <SelectValue placeholder="..." />
                              </SelectTrigger>
                              <SelectContent>
                                {sourceFields.map(f => (
                                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex justify-center">
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <Select
                              value={mapping.targetField}
                              onValueChange={val => updateMapping(idx, "targetField", val)}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-target-field-${idx}`}>
                                <SelectValue placeholder="..." />
                              </SelectTrigger>
                              <SelectContent>
                                {targetFields.map(f => (
                                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex justify-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => removeMapping(idx)}
                                data-testid={`button-remove-mapping-${idx}`}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <div className="px-3 pb-2 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground shrink-0 w-20">
                              {language === "sk" ? "Transformácia:" : "Transform:"}
                            </span>
                            <Select
                              value={transformType}
                              onValueChange={val => handleTransformTypeChange(idx, val)}
                            >
                              <SelectTrigger className="h-6 text-[11px] w-52" data-testid={`select-transform-${idx}`}>
                                <SelectValue placeholder={language === "sk" ? "— žiadna —" : "— none —"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-xs">{language === "sk" ? "— žiadna —" : "— none —"}</SelectItem>
                                <SelectItem value="price" className="text-xs">{language === "sk" ? "Cena (parsovanie)" : "Price (parse)"}</SelectItem>
                                <SelectItem value="price_excl_vat" className="text-xs">{language === "sk" ? "Cena bez DPH (÷ 1+sadzba%)" : "Price excl. VAT (÷ 1+rate%)"}</SelectItem>
                                <SelectItem value="multiply" className="text-xs">{language === "sk" ? "× Koeficient (násobiť)" : "× Coefficient (multiply)"}</SelectItem>
                                <SelectItem value="number" className="text-xs">{language === "sk" ? "Číslo" : "Number"}</SelectItem>
                                <SelectItem value="integer" className="text-xs">{language === "sk" ? "Celé číslo" : "Integer"}</SelectItem>
                                <SelectItem value="string" className="text-xs">{language === "sk" ? "Reťazec (text)" : "String (text)"}</SelectItem>
                                <SelectItem value="uppercase" className="text-xs">UPPERCASE</SelectItem>
                                <SelectItem value="lowercase" className="text-xs">lowercase</SelectItem>
                                <SelectItem value="trim" className="text-xs">Trim</SelectItem>
                                <SelectItem value="boolean" className="text-xs">Boolean</SelectItem>
                                <SelectItem value="pad_left" className="text-xs">{language === "sk" ? "Doplniť zľava (pad left)" : "Pad left"}</SelectItem>
                                <SelectItem value="pad_right" className="text-xs">{language === "sk" ? "Doplniť zprava (pad right)" : "Pad right"}</SelectItem>
                                <SelectItem value="truncate" className="text-xs">{language === "sk" ? "Skrátiť na N znakov" : "Truncate to N chars"}</SelectItem>
                                <SelectItem value="country" className="text-xs">{language === "sk" ? "Krajina — preklad / kód" : "Country — translate / code"}</SelectItem>
                              </SelectContent>
                            </Select>
                            {transformType === "price_excl_vat" && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{language === "sk" ? "Sadzba DPH:" : "VAT rate:"}</span>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={vatRate}
                                  onChange={e => handleVatRateChange(idx, e.target.value)}
                                  className="h-6 w-14 text-xs text-center px-1"
                                  data-testid={`input-vat-rate-${idx}`}
                                />
                                <span className="text-[10px] text-muted-foreground">%</span>
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {(() => {
                                    const r = parseFloat(vatRate || "23");
                                    return Number.isFinite(r) ? `(÷ ${(1 + r / 100).toFixed(2)})` : "";
                                  })()}
                                </span>
                              </div>
                            )}
                            {transformType === "multiply" && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{language === "sk" ? "Koeficient:" : "Coefficient:"}</span>
                                <span className="text-[10px] text-muted-foreground">×</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={getMultiplyCoeff(mapping.transform)}
                                  onChange={e => handleMultiplyCoeffChange(idx, e.target.value)}
                                  className="h-6 w-16 text-xs text-center px-1"
                                  data-testid={`input-multiply-coeff-${idx}`}
                                />
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {(() => {
                                    const c = parseFloat(getMultiplyCoeff(mapping.transform) || "1");
                                    return Number.isFinite(c) ? `(hodnota × ${c})` : "";
                                  })()}
                                </span>
                              </div>
                            )}
                            {(transformType === "pad_left" || transformType === "pad_right") && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">{language === "sk" ? "Dĺžka:" : "Length:"}</span>
                                <Input
                                  type="number"
                                  min="1"
                                  max="50"
                                  value={getPadLength(mapping.transform)}
                                  onChange={e => handlePadLengthChange(idx, e.target.value, transformType === "pad_right")}
                                  className="h-6 w-12 text-xs text-center px-1"
                                  data-testid={`input-pad-length-${idx}`}
                                />
                                <span className="text-[10px] text-muted-foreground">{language === "sk" ? "Znak:" : "Char:"}</span>
                                <Input
                                  type="text"
                                  maxLength={1}
                                  value={getPadChar(mapping.transform, transformType === "pad_right" ? " " : "0")}
                                  onChange={e => handlePadCharChange(idx, e.target.value, transformType === "pad_right")}
                                  className="h-6 w-10 text-xs text-center px-1 font-mono"
                                  placeholder={transformType === "pad_right" ? "SP" : "0"}
                                  data-testid={`input-pad-char-${idx}`}
                                />
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {(() => {
                                    const l = parseInt(getPadLength(mapping.transform) || "8", 10);
                                    const c = getPadChar(mapping.transform, transformType === "pad_right" ? " " : "0") || (transformType === "pad_right" ? " " : "0");
                                    const ex = transformType === "pad_left" ? `"1234".padStart(${l}, "${c}")` : `"1234".padEnd(${l}, "${c}")`;
                                    const res = transformType === "pad_left" ? "1234".padStart(l, c) : "1234".padEnd(l, c);
                                    return `→ "${res}"`;
                                  })()}
                                </span>
                              </div>
                            )}
                            {transformType === "truncate" && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">{language === "sk" ? "Max. znakov:" : "Max chars:"}</span>
                                <Input
                                  type="number"
                                  min="1"
                                  max="500"
                                  value={getTruncateLength(mapping.transform)}
                                  onChange={e => handleTruncateLengthChange(idx, e.target.value)}
                                  className="h-6 w-12 text-xs text-center px-1"
                                  data-testid={`input-truncate-length-${idx}`}
                                />
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {`(napr. "ABCDEFGHIJ" → "${"ABCDEFGHIJ".substring(0, parseInt(getTruncateLength(mapping.transform) || "8", 10))}")`}
                                </span>
                              </div>
                            )}
                            {transformType === "country" && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground shrink-0">{language === "sk" ? "Výstupný formát:" : "Output format:"}</span>
                                <Select
                                  value={getCountryFormat(mapping.transform)}
                                  onValueChange={val => updateMapping(idx, "transform", `country:${val}`)}
                                >
                                  <SelectTrigger className="h-6 text-[11px] w-52" data-testid={`select-country-format-${idx}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="name_sk" className="text-xs">{language === "sk" ? "Názov SK (napr. Čína)" : "Name SK (e.g. Čína)"}</SelectItem>
                                    <SelectItem value="name_en" className="text-xs">{language === "sk" ? "Názov EN (napr. China)" : "Name EN (e.g. China)"}</SelectItem>
                                    <SelectItem value="iso3" className="text-xs">{language === "sk" ? "Medzinárodný kód štátu (napr. CHN)" : "International code (e.g. CHN)"}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {(() => {
                                    const fmt = getCountryFormat(mapping.transform);
                                    const examples: Record<string, string> = {
                                      name_sk: "China → Čína",
                                      name_en: "Čína → China",
                                      iso3: "China → CHN",
                                    };
                                    return examples[fmt] || "";
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Country auto-hint when source field looks like a country field */}
                          {mapping.sourceField && isCountrySourceField(mapping.sourceField) && transformType !== "country" && (
                            <div className="px-3 pb-1.5 flex items-start gap-1.5" data-testid={`country-hint-${idx}`}>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">⚑</span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">
                                {language === "sk"
                                  ? `Pole "${mapping.sourceField}" vyzerá ako krajina. Použite transformáciu "Krajina — preklad / kód" pre prevod na Názov SK, EN, ISO kód alebo kód IČ DPH.`
                                  : `Field "${mapping.sourceField}" looks like a country field. Use "Country — translate / code" transform to convert to SK name, EN name, ISO code or VAT code.`}
                              </span>
                            </div>
                          )}
                          {/* Field hint for known ONIX fields */}
                          {mapping.targetField && ONIX_FIELD_HINTS[mapping.targetField] && (
                            <div className="px-3 pb-2 flex items-start gap-1.5" data-testid={`field-hint-${idx}`}>
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">ℹ</span>
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 leading-tight">
                                {language === "sk"
                                  ? ONIX_FIELD_HINTS[mapping.targetField].sk
                                  : ONIX_FIELD_HINTS[mapping.targetField].en}
                              </span>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {fieldsReady && suggestions.length > 0 && (
                  <div data-testid="section-suggestions" className="mt-4">
                    <button
                      onClick={() => setShowSuggestions(!showSuggestions)}
                      className="flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors w-full text-left"
                      data-testid="button-toggle-suggestions"
                    >
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      {language === "sk"
                        ? `Návrhy mapovania (${suggestions.length})`
                        : `Mapping Suggestions (${suggestions.length})`}
                      {showSuggestions ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>

                    {showSuggestions && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">
                            {language === "sk"
                              ? "Systém analyzoval zdrojové a cieľové polia a navrhuje tieto prepojenia:"
                              : "System analyzed source and target fields and suggests these connections:"}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={applyAllSuggestions}
                            data-testid="button-apply-all-suggestions"
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            {language === "sk" ? "Aplikovať všetky" : "Apply All"}
                          </Button>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[1fr_40px_1fr_80px_60px] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                            <span>{language === "sk" ? "Zdrojové pole" : "Source Field"}</span>
                            <span />
                            <span>{language === "sk" ? "Cieľové pole" : "Target Field"}</span>
                            <span className="text-center">{language === "sk" ? "Dôvera" : "Confidence"}</span>
                            <span />
                          </div>
                          {suggestions.map((sug, idx) => {
                            const isAlreadyMapped = editor.fieldMappings.some(
                              m => m.sourceField === sug.sourceField && m.targetField === sug.targetField
                            );
                            return (
                              <div
                                key={idx}
                                className={`grid grid-cols-[1fr_40px_1fr_80px_60px] items-center px-3 py-2 border-t ${isAlreadyMapped ? "bg-green-50 dark:bg-green-950/20" : idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                                data-testid={`row-suggestion-${idx}`}
                              >
                                <span className="text-xs font-mono truncate" title={sug.sourceField}>{sug.sourceField}</span>
                                <div className="flex justify-center">
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <span className="text-xs font-mono truncate" title={sug.targetField}>{sug.targetField}</span>
                                <div className="flex justify-center">
                                  <Badge
                                    variant={sug.confidence >= 85 ? "default" : sug.confidence >= 60 ? "secondary" : "outline"}
                                    className={`text-[10px] h-5 ${sug.confidence >= 85 ? "bg-green-600" : sug.confidence >= 60 ? "bg-yellow-600 text-white" : ""}`}
                                  >
                                    {sug.confidence}%
                                  </Badge>
                                </div>
                                <div className="flex justify-center">
                                  {isAlreadyMapped ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => applySuggestion(sug)}
                                      title={language === "sk" ? sug.reasonSk : sug.reason}
                                      data-testid={`button-apply-suggestion-${idx}`}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editor.fieldMappings.length > 0 && (
                  <div data-testid="section-validation" className="mt-4">
                    <button
                      onClick={() => setShowValidation(!showValidation)}
                      className="flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors w-full text-left"
                      data-testid="button-toggle-validation"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      {language === "sk" ? "Vyhodnotenie mapovania" : "Mapping Evaluation"}
                      {validationResults.length > 0 && (
                        <span className="ml-1">
                          {validationResults.some(v => v.status === "error") ? (
                            <XCircle className="h-3.5 w-3.5 text-red-500 inline" />
                          ) : validationResults.some(v => v.status === "warning") ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 inline" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 inline" />
                          )}
                        </span>
                      )}
                      {showValidation ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>

                    {showValidation && validationResults.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {validationResults.map((vr, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                              vr.status === "error" ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800" :
                              vr.status === "warning" ? "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800" :
                              "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                            }`}
                            data-testid={`validation-result-${idx}`}
                          >
                            {vr.status === "error" ? (
                              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            ) : vr.status === "warning" ? (
                              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            )}
                            <span className={
                              vr.status === "error" ? "text-red-700 dark:text-red-300" :
                              vr.status === "warning" ? "text-yellow-700 dark:text-yellow-300" :
                              "text-green-700 dark:text-green-300"
                            }>
                              {language === "sk" ? vr.messageSk : vr.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                <div data-testid="section-matching">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {language === "sk" ? "Párovanie záznamov" : "Record Matching"}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {language === "sk"
                      ? "Vyberte 1–2 zdrojové polia, podľa ktorých sa zistí, či záznam v cieľovom systéme už existuje. Ak nie sú nastavené žiadne polia, použije sa štandardná identifikácia (napr. interné ID)."
                      : "Choose 1–2 source fields used to detect if a record already exists in the target. If none are set, the default identification (e.g. internal ID) is used."}
                  </p>
                  <div className="flex items-end gap-2 mb-4">
                    {[0, 1].map(idx => {
                      const value = editor.matchFields[idx] || "__none__";
                      const usedSourceFields = editor.fieldMappings
                        .map(m => m.sourceField)
                        .filter(f => f && f.trim());
                      const bothFilled = editor.matchFields.filter(f => f && f.trim()).length >= 2;
                      return (
                        <>
                          <div key={`key-${idx}`} className="flex-1 min-w-0">
                            <Label className="text-xs mb-1 block">
                              {language === "sk" ? `Kľúč ${idx + 1}` : `Key ${idx + 1}`}
                            </Label>
                            <Select
                              value={value}
                              onValueChange={(val) => {
                                setEditor(prev => {
                                  const next = [...prev.matchFields];
                                  if (val === "__none__") {
                                    next[idx] = "";
                                  } else {
                                    next[idx] = val;
                                  }
                                  return { ...prev, matchFields: next.filter((v, i) => v || i < idx) };
                                });
                              }}
                            >
                              <SelectTrigger data-testid={`select-match-field-${idx}`}>
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{language === "sk" ? "— žiadne —" : "— none —"}</SelectItem>
                                {Array.from(new Set(usedSourceFields)).map(f => (
                                  <SelectItem key={f} value={f}>{f}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {idx === 0 && (
                            <div key="operator" className="flex flex-col items-center gap-1 pb-0.5 flex-shrink-0">
                              <Label className="text-xs text-muted-foreground">{language === "sk" ? "Operátor" : "Operator"}</Label>
                              <div className={`flex rounded-md border overflow-hidden h-9 transition-opacity ${bothFilled ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                                <button
                                  type="button"
                                  onClick={() => setEditor(prev => ({ ...prev, matchOperator: "and" }))}
                                  className={`px-3 text-xs font-semibold transition-colors ${editor.matchOperator === "and" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"}`}
                                  data-testid="button-match-operator-and"
                                >AND</button>
                                <button
                                  type="button"
                                  onClick={() => setEditor(prev => ({ ...prev, matchOperator: "or" }))}
                                  className={`px-3 text-xs font-semibold transition-colors border-l ${editor.matchOperator === "or" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"}`}
                                  data-testid="button-match-operator-or"
                                >OR</button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })}
                  </div>
                  <div>
                    <Label className="text-xs mb-2 block">
                      {language === "sk" ? "Ak záznam v cieli neexistuje" : "If record does not exist in target"}
                    </Label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="on-missing"
                          value="create"
                          checked={editor.onMissing === "create"}
                          onChange={() => setEditor(prev => ({ ...prev, onMissing: "create" }))}
                          className="mt-1"
                          data-testid="radio-on-missing-create"
                        />
                        <div className="text-sm">
                          <div>{language === "sk" ? "Vytvoriť ako nový" : "Create as new"}</div>
                          <div className="text-xs text-muted-foreground">
                            {language === "sk" ? "Ak sa nenájde zhoda, založí sa nový záznam." : "If no match is found, a new record is created."}
                          </div>
                        </div>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="on-missing"
                          value="skip"
                          checked={editor.onMissing === "skip"}
                          onChange={() => setEditor(prev => ({ ...prev, onMissing: "skip" }))}
                          className="mt-1"
                          data-testid="radio-on-missing-skip"
                        />
                        <div className="text-sm">
                          <div>{language === "sk" ? "Preskočiť" : "Skip"}</div>
                          <div className="text-xs text-muted-foreground">
                            {language === "sk" ? "Ak sa nenájde zhoda, záznam sa preskočí (len aktualizácie existujúcich)." : "If no match is found, the record is skipped (updates only)."}
                          </div>
                        </div>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="on-missing"
                          value="force"
                          checked={editor.onMissing === "force"}
                          onChange={() => setEditor(prev => ({ ...prev, onMissing: "force" }))}
                          className="mt-1"
                          data-testid="radio-on-missing-force"
                        />
                        <div className="text-sm">
                          <div className="flex items-center gap-1.5">
                            {language === "sk" ? "Vždy prepísať (bez kontroly existencie)" : "Always overwrite (no existence check)"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {language === "sk"
                              ? "Preskočí vyhľadávanie v cieľovom systéme — každý záznam sa odošle priamo. ONIX urobí upsert podľa Ns_Number automaticky."
                              : "Skips the lookup in the target system — every record is sent directly. ONIX will upsert by Ns_Number automatically."}
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="mt-4" data-testid="section-match-normalization">
                    <Label className="text-xs mb-1 block">
                      {language === "sk" ? "Normalizácia párovacích hodnôt" : "Match value normalization"}
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      {language === "sk"
                        ? "Aplikuje sa rovnako na zdrojové aj cieľové hodnoty pri párovaní — zabraňuje vzniku duplicít z rozdielov, ktoré nesúvisia s identitou produktu. Orezanie medzier je vždy aktívne."
                        : "Applied identically to source and target values during matching — prevents duplicates caused by differences unrelated to product identity. Whitespace trimming is always on."}
                    </p>
                    <div className="flex flex-col gap-2">
                      {([
                        ["stripLeadingZeros", language === "sk" ? "Ignorovať vedúce nuly" : "Ignore leading zeros", "0012345 = 12345"],
                        ["caseInsensitive", language === "sk" ? "Ignorovať veľkosť písmen" : "Case-insensitive", "ABC-1 = abc-1"],
                        ["stripDiacritics", language === "sk" ? "Ignorovať diakritiku" : "Ignore diacritics", "Čierna = Cierna"],
                        ["collapseWhitespace", language === "sk" ? "Zhutniť vnútorné medzery" : "Collapse inner whitespace", "AB   12 = AB 12"],
                        ["normalizeDecimals", language === "sk" ? "Normalizovať desatinné čísla" : "Normalize decimals", "12.50 = 12,5"],
                      ] as [keyof MatchNormalization, string, string][]).map(([key, label, example]) => (
                        <label key={key} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editor.matchNormalization[key]}
                            onChange={e => setEditor(prev => ({ ...prev, matchNormalization: { ...prev.matchNormalization, [key]: e.target.checked } }))}
                            className="mt-1"
                            data-testid={`checkbox-norm-${key}`}
                          />
                          <div className="text-sm">
                            <div>{label}</div>
                            <div className="text-xs text-muted-foreground font-mono">{example}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ONIX pevné polia + H kód — zobrazí sa len keď je cieľ ONIX */}
                {selectedTargetModule?.code === "ONIX" && (
                  <>
                    <Separator />
                    <div data-testid="section-onix-fixed-fields">
                      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">ONIX</span>
                        {language === "sk" ? "Pevné hodnoty polí (ONIX)" : "Fixed field values (ONIX)"}
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        {language === "sk"
                          ? "Polia, ktoré sa zapíšu do každého záznamu v ONIX — bez ohľadu na mapovanie. Napr. Ns_Code = \"H\", Ist_Dmj = 0."
                          : "Fields written to every ONIX record — regardless of mappings. E.g. Ns_Code = \"H\", Ist_Dmj = 0."}
                      </p>
                      <div className="space-y-2">
                        {editor.onixFixedFields.map((ff, idx) => {
                          const isHighlighted = highlightedFixedFields.has(idx);
                          const isDragOver = dragOverFixedFieldIdx === idx;
                          const isDuplicate = duplicateFixedFieldIndices.has(idx);
                          const isMappingOverlap = mappingOverlapFixedFieldIndices.has(idx);
                          const hasNameConflict = isDuplicate || isMappingOverlap;
                          return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 flex-wrap transition-opacity${isDragOver ? " opacity-50" : ""}`}
                            data-testid={`row-fixed-field-${idx}`}
                            draggable
                            onDragStart={() => { dragFixedFieldIdx.current = idx; }}
                            onDragOver={e => { e.preventDefault(); setDragOverFixedFieldIdx(idx); }}
                            onDragLeave={() => setDragOverFixedFieldIdx(null)}
                            onDrop={() => {
                              const from = dragFixedFieldIdx.current;
                              setDragOverFixedFieldIdx(null);
                              dragFixedFieldIdx.current = null;
                              if (from === null || from === idx) return;
                              setEditor(prev => {
                                const arr = [...prev.onixFixedFields];
                                const [moved] = arr.splice(from, 1);
                                arr.splice(idx, 0, moved);
                                return { ...prev, onixFixedFields: arr };
                              });
                              setHighlightedFixedFields(prev => {
                                const next = new Set<number>();
                                prev.forEach(i => {
                                  if (i === from) {
                                    next.add(idx);
                                  } else if (from < idx) {
                                    if (i > from && i <= idx) next.add(i - 1);
                                    else next.add(i);
                                  } else {
                                    if (i >= idx && i < from) next.add(i + 1);
                                    else next.add(i);
                                  }
                                });
                                return next;
                              });
                            }}
                            onDragEnd={() => { dragFixedFieldIdx.current = null; setDragOverFixedFieldIdx(null); }}
                          >
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium text-muted-foreground tabular-nums"
                              title={language === "sk" ? "Poradie" : "Order"}
                              data-testid={`rank-fixed-field-${idx}`}
                            >
                              {idx + 1}
                            </span>
                            <span
                              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                              title={language === "sk" ? "Presunúť" : "Drag to reorder"}
                              data-testid={`handle-fixed-field-${idx}`}
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title={language === "sk" ? "Vložiť riadok pred" : "Insert row before"}
                              onClick={() => {
                                setEditor(prev => {
                                  const arr = [...prev.onixFixedFields];
                                  arr.splice(idx, 0, { field: "", value: "", condition: "if_empty" });
                                  return { ...prev, onixFixedFields: arr };
                                });
                                setHighlightedFixedFields(prev => {
                                  const next = new Set<number>();
                                  prev.forEach(i => {
                                    next.add(i >= idx ? i + 1 : i);
                                  });
                                  return next;
                                });
                              }}
                              data-testid={`button-insert-fixed-field-${idx}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              className={`h-8 text-xs font-mono w-44${hasNameConflict ? " border-destructive ring-1 ring-destructive" : ""}`}
                              placeholder="Ns_Code"
                              value={ff.field}
                              title={
                                isDuplicate
                                  ? (language === "sk" ? "Toto pole je nastavené viackrát" : "This field is set more than once")
                                  : isMappingOverlap
                                    ? (language === "sk" ? "Toto pole už vypĺňa mapovanie" : "This field is already filled by a mapping")
                                    : undefined
                              }
                              onChange={e => setEditor(prev => {
                                const arr = [...prev.onixFixedFields];
                                arr[idx] = { ...arr[idx], field: e.target.value };
                                return { ...prev, onixFixedFields: arr };
                              })}
                              data-testid={`input-fixed-field-name-${idx}`}
                            />
                            <span className="text-muted-foreground text-xs">=</span>
                            <Input
                              ref={el => {
                                if (el) fixedFieldValueRefs.current.set(idx, el);
                                else fixedFieldValueRefs.current.delete(idx);
                              }}
                              className={`h-8 text-xs font-mono w-36${isHighlighted ? " border-destructive ring-1 ring-destructive" : ""}`}
                              placeholder="H"
                              value={ff.value}
                              onChange={e => {
                                if (isHighlighted) {
                                  setHighlightedFixedFields(prev => {
                                    const next = new Set(prev);
                                    next.delete(idx);
                                    return next;
                                  });
                                }
                                setEditor(prev => {
                                  const arr = [...prev.onixFixedFields];
                                  arr[idx] = { ...arr[idx], value: e.target.value };
                                  return { ...prev, onixFixedFields: arr };
                                });
                              }}
                              data-testid={`input-fixed-field-value-${idx}`}
                            />
                            <Select
                              value={ff.condition}
                              onValueChange={val => setEditor(prev => {
                                const arr = [...prev.onixFixedFields];
                                arr[idx] = { ...arr[idx], condition: val as "always" | "if_empty" };
                                return { ...prev, onixFixedFields: arr };
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs w-48" data-testid={`select-fixed-field-condition-${idx}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="if_empty">
                                  {language === "sk" ? "Ak nie je nastavené" : "If not set by mapping"}
                                </SelectItem>
                                <SelectItem value="always">
                                  {language === "sk" ? "Vždy prepísať" : "Always override"}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setEditor(prev => ({
                                  ...prev,
                                  onixFixedFields: prev.onixFixedFields.filter((_, i) => i !== idx),
                                }));
                                setHighlightedFixedFields(prev => {
                                  const next = new Set<number>();
                                  prev.forEach(i => {
                                    if (i < idx) next.add(i);
                                    else if (i > idx) next.add(i - 1);
                                  });
                                  return next;
                                });
                              }}
                              data-testid={`button-delete-fixed-field-${idx}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          );
                        })}
                        {duplicateFixedFieldIndices.size > 0 && (
                          <div
                            className="flex items-start gap-1.5 text-xs text-destructive mt-1"
                            data-testid="hint-fixed-field-duplicate"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                              {language === "sk"
                                ? "Niektoré polia sú nastavené viackrát. Vyšší riadok (nižšie číslo) má prednosť."
                                : "Some fields are set more than once. The higher row (lower number) takes precedence."}
                            </span>
                          </div>
                        )}
                        {mappingOverlapFixedFieldIndices.size > 0 && (
                          <div
                            className="flex items-start gap-1.5 text-xs text-destructive mt-1"
                            data-testid="hint-fixed-field-mapping-overlap"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                              {language === "sk"
                                ? "Niektoré pevné polia majú rovnaký názov ako cieľové pole vypĺňané mapovaním. Pevné pole môže prepísať namapovanú hodnotu."
                                : "Some fixed fields share a name with a target field filled by a mapping. The fixed field may override the mapped value."}
                            </span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs mt-1"
                          onClick={() => setEditor(prev => ({
                            ...prev,
                            onixFixedFields: [...prev.onixFixedFields, { field: "", value: "", condition: "if_empty" }],
                          }))}
                          data-testid="button-add-fixed-field"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {language === "sk" ? "Pridať pole" : "Add field"}
                        </Button>
                        {editor.onixFixedFields.length === 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { field: "SupplierCode", value: "" },
                              { field: "Ns_Code", value: "H" },
                              { field: "Ist_Dmj", value: "0" },
                              { field: "Ist_Code", value: "" },
                              { field: "VatRate", value: "23" },
                            ].map(hint => (
                              <button
                                key={hint.field}
                                className="text-[10px] border rounded px-1.5 py-0.5 font-mono text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                                onClick={() => setEditor(prev => ({
                                  ...prev,
                                  onixFixedFields: [...prev.onixFixedFields, { field: hint.field, value: hint.value, condition: "if_empty" }],
                                }))}
                                data-testid={`button-hint-fixed-${hint.field}`}
                              >
                                + {hint.field}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Separator />
                    <div data-testid="section-hkod">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">H</span>
                        {language === "sk" ? "H kód (automatické prideľovanie)" : "H Code (auto-assignment)"}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="hkod-enabled"
                            className="h-4 w-4 rounded border border-input"
                            checked={editor.hKodConfig.enabled}
                            onChange={e => setEditor(prev => ({
                              ...prev,
                              hKodConfig: { ...prev.hKodConfig, enabled: e.target.checked },
                            }))}
                            data-testid="checkbox-hkod-enabled"
                          />
                          <label htmlFor="hkod-enabled" className="text-sm cursor-pointer select-none">
                            {language === "sk" ? "Povoliť automatické prideľovanie H kódu" : "Enable automatic H code assignment"}
                          </label>
                        </div>
                        {editor.hKodConfig.enabled && (
                          <div className="ml-7 space-y-4 border-l-2 border-muted pl-4">
                            {/* Pole pre H kód */}
                            <div className="flex flex-col gap-1">
                              <label className="text-xs text-muted-foreground font-medium">
                                {language === "sk" ? "ONIX pole pre H kód" : "ONIX field for H code"}
                              </label>
                              <Select
                                value={editor.hKodConfig.field || "Ns_Number"}
                                onValueChange={val => setEditor(prev => ({
                                  ...prev,
                                  hKodConfig: { ...prev.hKodConfig, field: val },
                                }))}
                              >
                                <SelectTrigger className="h-8 text-xs font-mono w-52" data-testid="select-hkod-field">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[
                                    "Ns_Number", "Ns_Code", "Ist_Code", "Ist_Code2",
                                    "Name", "RecordExternalIdentificator",
                                  ].map(f => (
                                    <SelectItem key={f} value={f}>
                                      <span className="font-mono text-xs">{f}</span>
                                      {f === "Ns_Number" && (
                                        <span className="ml-2 text-muted-foreground text-[10px]">
                                          {language === "sk" ? "(odporúčané)" : "(recommended)"}
                                        </span>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {language === "sk"
                                  ? "Do tohto poľa sa zapíše H kód. Ak existujúci záznam v ONIX toto pole nezačína prefixom, H kód sa priradí automaticky."
                                  : "The H code will be written to this field. If an existing ONIX record's field doesn't start with the prefix, the H code is auto-assigned."}
                              </p>
                            </div>

                            {/* ── Detekčný prefix ── */}
                            <div className="flex flex-col gap-1">
                              <label className="text-xs text-muted-foreground font-semibold">
                                {language === "sk" ? "Detekčný prefix (čítanie z ONIX)" : "Detection prefix (read from ONIX)"}
                              </label>
                              <Input
                                className="h-8 text-xs font-mono w-40"
                                placeholder="H20"
                                value={editor.hKodConfig.detectionPrefix ?? editor.hKodConfig.prefix}
                                onChange={e => setEditor(prev => ({
                                  ...prev,
                                  hKodConfig: { ...prev.hKodConfig, detectionPrefix: e.target.value },
                                }))}
                                data-testid="input-hkod-detection-prefix"
                              />
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {language === "sk"
                                  ? `Ak Ns_Number v ONIX ZAČÍNA týmto prefixom → záznam už má H kód → zachová sa, nový sa NEPRIRADÍ. Príklad: "H20" rozpozná "H200001", "H200002"...`
                                  : `If Ns_Number in ONIX STARTS WITH this prefix → record already has H code → preserved, no new code assigned. Example: "H20" recognises "H200001", "H200002"...`}
                              </p>
                            </div>

                            {/* ── Generovanie: prefix + číslo ── */}
                            <div className="flex flex-col gap-1">
                              <label className="text-xs text-muted-foreground font-semibold">
                                {language === "sk" ? "Generovanie nových H kódov" : "New H code generation"}
                              </label>
                              <div className="flex gap-3 flex-wrap items-end">
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-muted-foreground">
                                    {language === "sk" ? "Prefix generovania" : "Generation prefix"}
                                  </label>
                                  <Input
                                    className="h-8 text-xs font-mono w-28"
                                    placeholder="H20"
                                    value={editor.hKodConfig.prefix}
                                    onChange={e => setEditor(prev => ({
                                      ...prev,
                                      hKodConfig: { ...prev.hKodConfig, prefix: e.target.value },
                                    }))}
                                    data-testid="input-hkod-prefix"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-muted-foreground">
                                    {language === "sk" ? "Min. dĺžka čísla (0 = žiadna)" : "Min. number length (0 = none)"}
                                  </label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    className="h-8 text-xs font-mono w-24"
                                    placeholder="0"
                                    value={editor.hKodConfig.padding ?? 0}
                                    onChange={e => setEditor(prev => ({
                                      ...prev,
                                      hKodConfig: { ...prev.hKodConfig, padding: parseInt(e.target.value) || 0 },
                                    }))}
                                    data-testid="input-hkod-padding"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-muted-foreground">
                                    {language === "sk" ? "Ďalšie číslo" : "Next number"}
                                  </label>
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      type="number"
                                      className="h-8 text-xs font-mono w-32"
                                      placeholder="45120"
                                      value={editor.hKodConfig.nextNumber}
                                      onChange={e => setEditor(prev => ({
                                        ...prev,
                                        hKodConfig: { ...prev.hKodConfig, nextNumber: parseInt(e.target.value) || 0 },
                                      }))}
                                      data-testid="input-hkod-next-number"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs px-2 whitespace-nowrap"
                                      onClick={() => setEditor(prev => ({
                                        ...prev,
                                        hKodConfig: { ...prev.hKodConfig, nextNumber: 0 },
                                      }))}
                                      data-testid="button-hkod-reset"
                                      title={language === "sk" ? "Resetovať počítadlo na 0" : "Reset counter to 0"}
                                    >
                                      {language === "sk" ? "Reset na 0" : "Reset to 0"}
                                    </Button>
                                  </div>
                                  {editor.id && (() => {
                                    const liveCfg = liveEditedConfig ?? configs?.find(c => c.id === editor.id);
                                    const savedNext = (liveCfg as any)?.hKodConfig?.nextNumber;
                                    if (savedNext === undefined) return null;
                                    const savedPrefix = (liveCfg as any)?.hKodConfig?.prefix || "H20";
                                    return (
                                      <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="text-hkod-saved-value">
                                        {language === "sk" ? "Uložené v DB:" : "Saved in DB:"}
                                        {" "}
                                        <span className="font-mono font-semibold text-foreground">{savedPrefix}{savedNext}</span>
                                      </p>
                                    );
                                  })()}
                                </div>
                                <div className="flex flex-col gap-1 pb-0.5">
                                  <label className="text-xs text-muted-foreground">
                                    {language === "sk" ? "Ukážka výstupu" : "Output preview"}
                                  </label>
                                  <div className="h-8 flex items-center text-xs font-mono bg-muted/50 border rounded px-2">
                                    <span className="font-semibold text-foreground">
                                      {editor.hKodConfig.prefix || "H20"}
                                      {editor.hKodConfig.padding > 0
                                        ? String(editor.hKodConfig.nextNumber || 1).padStart(editor.hKodConfig.padding, "0")
                                        : (editor.hKodConfig.nextNumber || 1)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="bg-muted/40 border rounded p-2.5 text-[11px] text-muted-foreground space-y-0.5">
                              <p className="font-semibold text-foreground text-xs mb-1">{language === "sk" ? "Logika pri synchu:" : "Sync logic:"}</p>
                              <p>1. {language === "sk" ? `ONIX záznam nájdený → Ns_Number ZAČÍNA "${editor.hKodConfig.detectionPrefix || editor.hKodConfig.prefix || "H20"}" → H kód zachovaný, žiadny nový sa nepriradí.` : `ONIX record found → Ns_Number STARTS WITH "${editor.hKodConfig.detectionPrefix || editor.hKodConfig.prefix || "H20"}" → H code preserved, no new one assigned.`}</p>
                              <p>2. {language === "sk" ? `ONIX záznam nájdený, Ns_Number NEZAČÍNA "${editor.hKodConfig.detectionPrefix || editor.hKodConfig.prefix || "H20"}" → Ns_Number ZACHOVANÝ (H kód sa nepriradí — zmena Ns_Number by vytvorila duplikát, lebo ONIX upsertuje práve podľa Ns_Number).` : `ONIX record found, Ns_Number does NOT start with "${editor.hKodConfig.detectionPrefix || editor.hKodConfig.prefix || "H20"}" → Ns_Number PRESERVED (no H code assigned — changing Ns_Number would create a duplicate, as ONIX upserts by Ns_Number).`}</p>
                              <p>3. {language === "sk" ? `ONIX záznam nenájdený (nový produkt) → priradí sa nový H kód: "${editor.hKodConfig.prefix || "H20"}" + číslo.` : `ONIX record not found (new product) → new H code assigned: "${editor.hKodConfig.prefix || "H20"}" + number.`}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div data-testid="section-schedule">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {language === "sk" ? "Plánovanie" : "Scheduling"}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={editor.schedule.enabled}
                        onCheckedChange={val => setEditor(prev => ({
                          ...prev,
                          schedule: { ...prev.schedule, enabled: val },
                        }))}
                        data-testid="switch-schedule-enabled"
                      />
                      <Label className="text-sm">
                        {language === "sk" ? "Automatická synchronizácia" : "Automatic synchronization"}
                      </Label>
                    </div>

                    {editor.schedule.enabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-10">
                        <div>
                          <Label className="text-xs">{language === "sk" ? "Frekvencia" : "Frequency"}</Label>
                          <Select
                            value={editor.schedule.frequency}
                            onValueChange={val => setEditor(prev => ({
                              ...prev,
                              schedule: { ...prev.schedule, frequency: val },
                            }))}
                          >
                            <SelectTrigger className="mt-1" data-testid="select-frequency">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FREQUENCY_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {language === "sk" ? opt.labelSk : opt.labelEn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {(editor.schedule.frequency === "daily" || editor.schedule.frequency === "weekly") && (
                          <div>
                            <Label className="text-xs">{language === "sk" ? "Čas" : "Time"}</Label>
                            <Input
                              type="time"
                              className="mt-1"
                              value={editor.schedule.timeOfDay || "06:00"}
                              onChange={e => setEditor(prev => ({
                                ...prev,
                                schedule: { ...prev.schedule, timeOfDay: e.target.value },
                              }))}
                              data-testid="input-time-of-day"
                            />
                          </div>
                        )}

                        {editor.schedule.frequency === "weekly" && (
                          <div>
                            <Label className="text-xs">{language === "sk" ? "Deň" : "Day"}</Label>
                            <Select
                              value={editor.schedule.dayOfWeek || "1"}
                              onValueChange={val => setEditor(prev => ({
                                ...prev,
                                schedule: { ...prev.schedule, dayOfWeek: val },
                              }))}
                            >
                              <SelectTrigger className="mt-1" data-testid="select-day-of-week">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DAY_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {language === "sk" ? opt.labelSk : opt.labelEn}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div data-testid="section-backup">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {language === "sk" ? "Zálohovanie" : "Backup"}
                  </h3>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="backup-before-sync"
                      checked={editor.backupBeforeSync}
                      onCheckedChange={(val) => setEditor(prev => ({ ...prev, backupBeforeSync: !!val }))}
                      data-testid="checkbox-backup-before-sync"
                    />
                    <div>
                      <Label htmlFor="backup-before-sync" className="text-sm cursor-pointer">
                        {language === "sk" ? "Zálohovať cieľové dáta aj na Google Drive" : "Also back up target data to Google Drive"}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === "sk"
                          ? "Záloha na SEDAJ Cloud prebieha vždy automaticky. Ak je táto možnosť zapnutá, záloha sa odošle aj na Google Drive ako druhá kópia."
                          : "Backup to SEDAJ Cloud runs automatically every time. If enabled, a second copy is also sent to Google Drive."}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div data-testid="section-auto-retry">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {language === "sk" ? "Automatická obnova po zlyhaní" : "Auto-retry on failure"}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={editor.autoRetry}
                        onCheckedChange={val => setEditor(prev => ({ ...prev, autoRetry: val }))}
                        data-testid="switch-auto-retry"
                      />
                      <Label className="text-sm">
                        {language === "sk" ? "Automaticky obnoviť synchronizáciu po zlyhaní" : "Automatically retry sync after failure"}
                      </Label>
                    </div>
                    {editor.autoRetry && (
                      <div className="pl-10 space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          {language === "sk" ? "Pauza pred obnovením (minúty)" : "Pause before retry (minutes)"}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={editor.retryDelayMin}
                            onChange={e => setEditor(prev => ({ ...prev, retryDelayMin: Math.max(1, Math.min(120, parseInt(e.target.value) || 3)) }))}
                            className="w-24 h-8 text-sm"
                            data-testid="input-retry-delay-min"
                          />
                          <span className="text-xs text-muted-foreground">
                            {language === "sk" ? "min" : "min"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {language === "sk"
                            ? "Po zlyhaní synchronizácie sa automaticky pokúsi o obnovu. Ak existuje uložený pokrok (checkpoint), pokračuje od miesta prerušenia."
                            : "After a sync failure, the system will automatically attempt to retry. If a saved checkpoint exists, it will resume from where it stopped."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {language === "sk" ? "Poznámky" : "Notes"}
              </Label>
              <Textarea
                value={editor.notes}
                onChange={e => setEditor(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={language === "sk" ? "Vlastné poznámky k tejto konfigurácii…" : "Your notes for this configuration…"}
                rows={3}
                className="text-sm resize-y"
                data-testid="textarea-config-notes"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={editor.isEnabled}
                  onCheckedChange={val => setEditor(prev => ({ ...prev, isEnabled: val }))}
                  data-testid="switch-config-enabled"
                />
                <Label className="text-sm">
                  {language === "sk" ? "Konfigurácia aktívna" : "Configuration active"}
                </Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeEditor} data-testid="button-cancel-editor">
                  {language === "sk" ? "Zrušiť" : "Cancel"}
                </Button>
                <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-config">
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {language === "sk" ? "Uložiť" : "Save"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div data-testid="section-config-list">
        <h2 className="text-lg font-semibold mb-4">
          {language === "sk" ? "Uložené konfigurácie" : "Saved Configurations"}
          {configs && configs.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal text-sm">({configs.length})</span>
          )}
        </h2>

        {configsLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!configsLoading && (!configs || configs.length === 0) && !editorOpen && (
          <Card className="border-dashed" data-testid="card-no-configs">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GitBranch className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-sm">
                {language === "sk"
                  ? "Žiadne synchronizačné konfigurácie. Kliknite \"Nová konfigurácia\" pre vytvorenie."
                  : "No sync configurations. Click \"New Configuration\" to create one."}
              </p>
            </CardContent>
          </Card>
        )}

        {configs && configs.length > 0 && (
          <div className="space-y-3">
            {configs.map(config => {
              const isExpanded = expandedConfig === config.id;
              const mappingCount = (config.fieldMappings as FieldMapping[] || []).length;
              const schedule = config.schedule as Schedule & { backupBeforeSync?: boolean };
              const freqLabel = FREQUENCY_OPTIONS.find(f => f.value === schedule?.frequency);

              return (
                <Card key={config.id} className="overflow-hidden" data-testid={`card-config-${config.id}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <Switch
                        checked={config.isEnabled}
                        onCheckedChange={val => toggleMutation.mutate({ id: config.id, isEnabled: val })}
                        data-testid={`switch-toggle-${config.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate" data-testid={`text-config-name-${config.id}`}>{config.name}</span>
                          {!config.isEnabled && (
                            <Badge variant="secondary" className="text-[10px]">
                              {language === "sk" ? "Neaktívna" : "Disabled"}
                            </Badge>
                          )}
                          {schedule?.backupBeforeSync !== false && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Shield className="h-2.5 w-2.5" />
                              {language === "sk" ? "GDrive záloha" : "GDrive backup"}
                            </Badge>
                          )}
                          {(config as any).autoRetry && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-blue-700 dark:text-blue-300 border-blue-400/40" data-testid={`badge-auto-retry-${config.id}`}>
                              <RefreshCw className="h-2.5 w-2.5" />
                              {language === "sk" ? "Auto-obnova" : "Auto-retry"}
                            </Badge>
                          )}
                          {(config.fieldMappings as FieldMapping[] || []).some(m => m.transform?.startsWith("price_excl_vat")) && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30" data-testid={`badge-vat-${config.id}`}>
                              <Percent className="h-2.5 w-2.5" />
                              {language === "sk" ? "Bez DPH" : "Excl. VAT"}
                            </Badge>
                          )}
                          {(() => {
                            const counts = new Map<string, number>();
                            ((config as any).onixFixedFields as OnixFixedField[] || []).forEach(ff => {
                              const name = (ff?.field || "").trim();
                              if (name) counts.set(name, (counts.get(name) || 0) + 1);
                            });
                            const hasDuplicate = Array.from(counts.values()).some(c => c > 1);
                            if (!hasDuplicate) return null;
                            return (
                              <Badge
                                variant="outline"
                                className="text-[10px] gap-1 text-destructive border-destructive/40"
                                title={language === "sk"
                                  ? "Niektoré pevné polia sú nastavené viackrát. Vyšší riadok (nižšie číslo) má prednosť."
                                  : "Some fixed fields are set more than once. The higher row (lower number) takes precedence."}
                                data-testid={`badge-duplicate-fixed-field-${config.id}`}
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {language === "sk" ? "Konflikt polí" : "Field conflict"}
                              </Badge>
                            );
                          })()}
                          {(() => {
                            const rate = config.successRate ?? 100;
                            const colorClass = rate >= 95
                              ? "border-green-500/40 text-green-700 dark:text-green-400"
                              : rate >= 70
                                ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                                : "border-red-500/40 text-red-600 dark:text-red-400";
                            return (
                              <Badge
                                variant="outline"
                                className={`text-[10px] gap-1 ${colorClass}`}
                                title={`${config.totalProcessed ?? 0} ${language === "sk" ? "spracovaných" : "processed"}, ${config.totalFailed ?? 0} ${language === "sk" ? "chýb" : "failed"}`}
                                data-testid={`badge-success-rate-${config.id}`}
                              >
                                {rate}%
                              </Badge>
                            );
                          })()}
                          {(() => {
                            const snaps = snapshotsByConfig.get(config.id);
                            if (!snaps || snaps.length === 0) return null;
                            const latest = snaps[0];
                            const isSnapshotExpanded = snapshotExpandedConfig === config.id;
                            return (
                              <Badge
                                variant="outline"
                                className="text-[10px] gap-1 cursor-pointer hover:bg-muted/50 select-none"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSnapshotExpandedConfig(isSnapshotExpanded ? null : config.id);
                                  if (!isExpanded) setExpandedConfig(config.id);
                                }}
                                title={language === "sk" ? "Zobraziť históriu konfigurácií" : "View config snapshot history"}
                                data-testid={`badge-snapshot-${config.id}`}
                              >
                                <History className="h-2.5 w-2.5" />
                                {language === "sk" ? "Záloha" : "Backup"}: {formatDistanceToNow(new Date(latest.createdAt), { addSuffix: false, locale: language === "sk" ? skLocale : undefined })}
                              </Badge>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{config.sourceModule?.code || "?"}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-mono">{config.targetModule?.code || "?"}</span>
                          {config.targetModule?.code === "ONIX" && config.targetModule?.environment && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 gap-1 ${
                                config.targetModule.environment === "production"
                                  ? "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5"
                                  : "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                              }`}
                              title={
                                config.targetModule.environment === "production"
                                  ? (language === "sk" ? "Cieľ: ostrá (produkčná) ONIX databáza" : "Target: production ONIX database")
                                  : (language === "sk" ? "Cieľ: testovacia ONIX databáza" : "Target: test ONIX database")
                              }
                              data-testid={`badge-onix-env-${config.id}`}
                            >
                              <Database className="h-2.5 w-2.5" />
                              {config.targetModule.environment === "production"
                                ? (language === "sk" ? "OSTRÁ DB" : "PROD DB")
                                : (language === "sk" ? "TEST DB" : "TEST DB")}
                            </Badge>
                          )}
                          {config.sourceDataSource && (
                            <span className="text-muted-foreground">({config.sourceDataSource})</span>
                          )}
                          <span className="mx-1">·</span>
                          <span>{mappingCount} {language === "sk" ? "polí" : "fields"}</span>
                          {schedule?.enabled && (
                            <>
                              <span className="mx-1">·</span>
                              <Clock className="h-3 w-3" />
                              <span>{language === "sk" ? freqLabel?.labelSk : freqLabel?.labelEn}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {vatPopover?.configId === String(config.id) ? (
                        <div className="flex items-center gap-1" data-testid={`vat-rate-picker-${config.id}`}>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={vatPopover.rate}
                            onChange={e => setVatPopover({ ...vatPopover, rate: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === "Enter") applyVatRate(config, vatPopover.rate);
                              if (e.key === "Escape") setVatPopover(null);
                            }}
                            className="h-7 w-14 text-xs px-1 text-center"
                            autoFocus
                            data-testid={`input-vat-rate-${config.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-primary"
                            onClick={() => applyVatRate(config, vatPopover.rate)}
                            disabled={vatToggleMutation.isPending}
                            title={language === "sk" ? "Potvrdiť sadzbu DPH" : "Confirm VAT rate"}
                            data-testid={`button-vat-confirm-${config.id}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => setVatPopover(null)}
                            title={language === "sk" ? "Zrušiť" : "Cancel"}
                            data-testid={`button-vat-cancel-${config.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${(config.fieldMappings as FieldMapping[] || []).some(m => m.transform?.startsWith("price_excl_vat")) ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground"}`}
                          onClick={() => toggleVat(config)}
                          disabled={vatToggleMutation.isPending}
                          title={language === "sk" ? "Prepnúť delenie DPH (Default_Price)" : "Toggle VAT divider (Default_Price)"}
                          data-testid={`button-vat-toggle-${config.id}`}
                        >
                          <Percent className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedConfig(isExpanded ? null : config.id)}
                        data-testid={`button-expand-${config.id}`}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditEditor(config)}
                        data-testid={`button-edit-${config.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteId(config.id)}
                        data-testid={`button-delete-${config.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/20" data-testid={`detail-config-${config.id}`}>
                      {user?.role === "admin" && (
                        <div className="mb-3 pb-3 border-b space-y-1.5" data-testid={`section-admin-reset-${config.id}`}>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <RotateCcw className="h-3 w-3" />
                            {language === "sk" ? "Správa histórie synchronizácie" : "Sync history management"}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                            onClick={e => { e.stopPropagation(); setClearBaselinesConfirmId(config.id); }}
                            data-testid={`button-clear-baselines-${config.id}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {language === "sk" ? "Vymazať celú sync históriu (plný reset)" : "Clear all sync history (full reset)"}
                          </Button>
                          {(config.hKodConfig as any)?.enabled && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                              onClick={e => { e.stopPropagation(); setClearHkodConfirmId(config.id); }}
                              data-testid={`button-clear-hkod-${config.id}`}
                            >
                              <RotateCcw className="h-3 w-3" />
                              {language === "sk" ? "Resetovať iba H-kód históriu" : "Reset H-kód history only"}
                            </Button>
                          )}
                        </div>
                      )}
                      <h4 className="text-xs font-semibold mb-2">
                        {language === "sk" ? "Mapovanie polí" : "Field Mappings"}
                      </h4>
                      {mappingCount === 0 ? (
                        <p className="text-xs text-muted-foreground">{language === "sk" ? "Žiadne mapovania" : "No mappings"}</p>
                      ) : (
                        <div className="grid grid-cols-[1fr_30px_1fr_auto] gap-1 text-xs max-w-2xl">
                          {(config.fieldMappings as FieldMapping[]).map((m, idx) => (
                            <div key={idx} className="contents">
                              <span className="font-mono bg-muted px-2 py-1 rounded truncate">{m.sourceField}</span>
                              <span className="flex items-center justify-center"><ArrowRight className="h-3 w-3 text-muted-foreground" /></span>
                              <span className="font-mono bg-muted px-2 py-1 rounded truncate">{m.targetField}</span>
                              <span className="flex items-center">
                                {m.transform?.startsWith("price_excl_vat") ? (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 text-amber-600 dark:text-amber-400 border-amber-500/30 whitespace-nowrap" data-testid={`badge-transform-vat-${idx}`}>
                                    <Percent className="h-2.5 w-2.5" />
                                    {`÷ VAT ${m.transform.split(":")[1] || "23"}%`}
                                  </Badge>
                                ) : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {schedule?.enabled && (
                        <div className="mt-3">
                          <h4 className="text-xs font-semibold mb-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {language === "sk" ? "Plánovanie" : "Schedule"}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {language === "sk" ? freqLabel?.labelSk : freqLabel?.labelEn}
                            {schedule.timeOfDay && ` o ${schedule.timeOfDay}`}
                            {schedule.dayOfWeek && ` (${DAY_OPTIONS.find(d => d.value === schedule.dayOfWeek)?.[language === "sk" ? "labelSk" : "labelEn"]})`}
                          </p>
                        </div>
                      )}

                      {schedule?.backupBeforeSync !== false && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <Shield className="h-3 w-3" />
                          {language === "sk" ? "Google Drive záloha: aktívna" : "Google Drive backup: active"}
                        </div>
                      )}

                      {(() => {
                        const snaps = snapshotsByConfig.get(config.id) ?? [];
                        const hasSnaps = snaps.length > 0;
                        if (!hasSnaps && !canEdit) return null;
                        const isSnapshotExpanded = snapshotExpandedConfig === config.id;
                        const snapshotBtn = canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 w-full"
                            disabled={snapshottingConfigId === config.id}
                            onClick={e => { e.stopPropagation(); handleSnapshotConfig(config.id); }}
                            data-testid={`button-snapshot-now-${config.id}`}
                          >
                            {snapshottingConfigId === config.id
                              ? <RefreshCw className="h-3 w-3 animate-spin" />
                              : <Save className="h-3 w-3" />}
                            {language === "sk" ? "Zálohovať teraz" : "Snapshot now"}
                          </Button>
                        );
                        return (
                          <div className="mt-3" data-testid={`snapshot-section-${config.id}`}>
                            {!hasSnaps ? (
                              <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <History className="h-3 w-3" />
                                  {language === "sk" ? "Zatiaľ žiadne zálohy konfigurácie" : "No config snapshots yet"}
                                </p>
                                {snapshotBtn}
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="flex items-center gap-1.5 text-xs font-semibold hover:text-foreground text-muted-foreground transition-colors w-full text-left"
                                  onClick={() => setSnapshotExpandedConfig(isSnapshotExpanded ? null : config.id)}
                                  data-testid={`button-snapshot-toggle-${config.id}`}
                                >
                                  <History className="h-3 w-3" />
                                  {language === "sk" ? "Zálohy konfigurácie" : "Config snapshots"}
                                  <span className="text-[10px] ml-1 font-normal">({snaps.length})</span>
                                  {isSnapshotExpanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                                </button>
                                {!isSnapshotExpanded && (
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    {language === "sk" ? "Posledná záloha:" : "Last backup:"}
                                    {" "}
                                    <span className="font-medium">
                                      {formatDistanceToNow(new Date(snaps[0].createdAt), { addSuffix: true, locale: language === "sk" ? skLocale : undefined })}
                                    </span>
                                    {snaps[0].googleDriveUrl && (
                                      <a
                                        href={snaps[0].googleDriveUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground ml-1"
                                        onClick={e => e.stopPropagation()}
                                        data-testid={`link-snapshot-drive-latest-${config.id}`}
                                      >
                                        <ExternalLink className="h-2.5 w-2.5" />
                                        Drive
                                      </a>
                                    )}
                                  </p>
                                )}
                                {isSnapshotExpanded && (
                                  <div className="mt-2 space-y-1" data-testid={`snapshot-list-${config.id}`}>
                                    {snaps.slice(0, 5).map((snap, idx) => (
                                      <div
                                        key={snap.id}
                                        className="flex flex-col gap-0.5 text-xs bg-muted/40 rounded px-2 py-1.5"
                                        data-testid={`snapshot-item-${config.id}-${idx}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <History className="h-3 w-3 shrink-0 text-muted-foreground" />
                                            <span className="font-mono text-muted-foreground shrink-0">
                                              {format(new Date(snap.createdAt), "dd.MM.yyyy HH:mm")}
                                            </span>
                                            <span className="text-muted-foreground truncate hidden sm:block">
                                              — {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true, locale: language === "sk" ? skLocale : undefined })}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            {snap.googleDriveFileId ? (
                                              <Badge variant="outline" className="text-[9px] gap-0.5 px-1">
                                                <CheckCircle2 className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                                                Drive
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-[9px] gap-0.5 px-1 text-muted-foreground">
                                                {language === "sk" ? "Lokálne" : "Local"}
                                              </Badge>
                                            )}
                                            {snap.googleDriveUrl && (
                                              <a
                                                href={snap.googleDriveUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                                                onClick={e => e.stopPropagation()}
                                                data-testid={`link-snapshot-drive-${config.id}-${idx}`}
                                              >
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                        {snap.configName !== config.name && (
                                          <p
                                            className="text-[10px] text-muted-foreground italic pl-4"
                                            data-testid={`snapshot-historic-name-${config.id}-${idx}`}
                                          >
                                            {language === "sk"
                                              ? `Názov pri zálohe: ${snap.configName}`
                                              : `Name at backup time: ${snap.configName}`}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                    {snaps.length > 5 && (
                                      <p className="text-[10px] text-muted-foreground text-center pt-0.5">
                                        {language === "sk"
                                          ? `+ ${snaps.length - 5} ďalších — zobraziť všetky v Správe záloh`
                                          : `+ ${snaps.length - 5} more — view all in Backup Management`}
                                      </p>
                                    )}
                                    {canEdit && <div className="pt-1">{snapshotBtn}</div>}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}

                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={showDuplicateFixedWarning} onOpenChange={setShowDuplicateFixedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "sk" ? "Konflikt pevných polí" : "Conflicting fixed fields"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {duplicateFixedFieldIndices.size > 0 && (
                <span className="block">
                  {language === "sk"
                    ? "Niektoré pevné polia sú nastavené viackrát. Vyšší riadok (nižšie číslo) má prednosť, nižší riadok bude pri synchronizácii ignorovaný."
                    : "Some fixed fields are set more than once. The higher row (lower number) takes precedence; the lower row will be ignored during sync."}
                </span>
              )}
              {mappingOverlapFixedFieldIndices.size > 0 && (
                <span className="block">
                  {language === "sk"
                    ? "Niektoré pevné polia majú rovnaký názov ako cieľové pole, ktoré už vypĺňa mapovanie. Pevné pole môže prepísať namapovanú hodnotu (podľa podmienky)."
                    : "Some fixed fields have the same name as a target field already filled by a field mapping. The fixed field may override the mapped value (depending on its condition)."}
                </span>
              )}
              <span className="block">
                {language === "sk"
                  ? "Chcete konfiguráciu uložiť aj tak?"
                  : "Do you want to save the configuration anyway?"}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-duplicate-fixed">
              {language === "sk" ? "Späť a opraviť" : "Go back and fix"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDuplicateFixedWarning(false);
                performSave();
              }}
              data-testid="button-confirm-duplicate-fixed"
            >
              {language === "sk" ? "Uložiť aj tak" : "Save anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!clearBaselinesConfirmId} onOpenChange={() => setClearBaselinesConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "sk" ? "Vymazať celú sync históriu?" : "Clear all sync history?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "sk"
                ? "Tým sa vymažú VŠETKY baselines aj H-kód priradenia pre tento config (delta hashe aj H-kódy). Ďalší beh synchronizácie spracuje všetky záznamy odznova ako nové — záznamy, ktoré neexistujú v cieľovom systéme, budú vytvorené. Táto akcia je nevratná."
                : "This will delete ALL baselines and H-kód assignments for this config (delta hashes and H-kódy). The next sync run will process all records from scratch as new — records not found in the target system will be created. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-baselines">
              {language === "sk" ? "Zrušiť" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearBaselinesConfirmId && clearBaselinesMutation.mutate(clearBaselinesConfirmId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-clear-baselines"
            >
              {language === "sk" ? "Áno, vymazať všetko" : "Yes, clear all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!clearHkodConfirmId} onOpenChange={() => setClearHkodConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "sk" ? "Resetovať H-kód históriu?" : "Reset H-kód history?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "sk"
                ? "Tým sa vymažú všetky predchádzajúce priradenia H-kódov pre tento config. Ďalší beh synchronizácie bude tieto záznamy považovať za nové a vytvorí ich v ONIX-e (s novými H-kódmi). Ak tie záznamy v ONIX-e skutočne neexistujú, je to správna voľba. Ak existujú pod iným kódom, môžu vzniknúť duplikáty."
                : "This will clear all previous H-kód assignments for this config. The next sync run will treat these records as new and create them in ONIX (with new H-kódy). If those records genuinely don't exist in ONIX, this is the correct choice. If they exist under a different code, duplicates may be created."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-hkod">
              {language === "sk" ? "Zrušiť" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearHkodConfirmId && clearHkodMutation.mutate(clearHkodConfirmId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-clear-hkod"
            >
              {language === "sk" ? "Áno, resetovať" : "Yes, reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "sk" ? "Vymazať konfiguráciu?" : "Delete configuration?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "sk"
                ? "Táto akcia je nevratná. Konfigurácia a všetky súvisiace behy budú vymazané."
                : "This action cannot be undone. The configuration and all related runs will be deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {language === "sk" ? "Zrušiť" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {language === "sk" ? "Vymazať" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-data-preview">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                {language === "sk" ? "Náhľad dát" : "Data Preview"} — {previewModule?.name || ""}
                {previewSide === "source" && editor.sourceDataSource && (
                  <Badge variant="outline" className="ml-2 text-xs">{editor.sourceDataSource}</Badge>
                )}
              </DialogTitle>
              {previewData?.sample && previewData.sample.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  className="ml-4 flex-shrink-0"
                  onClick={() => {
                    const rows = previewData.sample.slice(0, 5);
                    const fields = previewFields;
                    const escapeCell = (val: any): string => {
                      if (val === undefined || val === null) return "";
                      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
                      if (str.includes("\t") || str.includes("\n") || str.includes("\"")) {
                        return "\"" + str.replace(/"/g, "\"\"") + "\"";
                      }
                      return str;
                    };
                    let csv = fields.map(escapeCell).join("\t") + "\n";
                    for (const row of rows) {
                      csv += fields.map(f => escapeCell(row[f])).join("\t") + "\n";
                    }
                    const BOM = "\uFEFF";
                    const blob = new Blob([BOM + csv], { type: "text/tab-separated-values;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${previewModule?.name || "data"}_preview.xls`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="button-download-excel"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t("syncConfig.downloadExcel")}
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="overflow-auto flex-1 -mx-6 px-6">
            {previewFields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {language === "sk" ? "Žiadne dáta k dispozícii" : "No data available"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    {language === "sk" ? `Dostupné polia (${previewFields.length})` : `Available fields (${previewFields.length})`}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {previewFields.map(f => (
                      <Badge key={f} variant="secondary" className="font-mono text-xs" data-testid={`badge-field-${f}`}>
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>

                {previewData?.sample && previewData.sample.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                      {language === "sk"
                        ? `Ukážka dát (${Math.min(previewData.sample.length, 5)} ${previewData.sample.length === 1 ? "záznam" : "záznamov"}) — ${previewFields.length} ${t("syncConfig.allColumns").toLowerCase()}`
                        : `Sample data (${Math.min(previewData.sample.length, 5)} ${previewData.sample.length === 1 ? "record" : "records"}) — ${previewFields.length} ${t("syncConfig.allColumns").toLowerCase()}`}
                    </h4>
                    <div className="border rounded-lg overflow-auto max-h-[50vh]">
                      <table className="text-xs" data-testid="table-sample-data">
                        <thead className="sticky top-0">
                          <tr className="bg-muted/50 border-b">
                            {previewFields.map(f => (
                              <th key={f} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{f}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.sample.slice(0, 5).map((row: any, rowIdx: number) => (
                            <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                              {previewFields.map(f => (
                                <td key={f} className="px-3 py-1.5 whitespace-nowrap max-w-[300px] truncate border-t">
                                  {row[f] !== undefined && row[f] !== null
                                    ? (typeof row[f] === "object" ? JSON.stringify(row[f]).slice(0, 100) : String(row[f]).slice(0, 150))
                                    : <span className="text-muted-foreground italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {previewData.sample.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        {language === "sk"
                          ? `Zobrazených 5 z ${previewData.sample.length} záznamov`
                          : `Showing 5 of ${previewData.sample.length} records`}
                      </p>
                    )}
                  </div>
                )}

                {(!previewData?.sample || previewData.sample.length === 0) && (
                  <div className="border border-dashed rounded-lg py-6 text-center text-muted-foreground">
                    <Eye className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">
                      {language === "sk"
                        ? "Polia sú známe, ale vzorové dáta nie sú k dispozícii. Modul nemusí byť pripojený alebo nemá dáta."
                        : "Fields are known, but sample data is not available. The module may not be connected or has no data."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
