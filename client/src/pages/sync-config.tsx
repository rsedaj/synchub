import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
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
    { value: "auto", label: "Auto" },
    { value: "orders", label: "Orders" },
    { value: "products", label: "Products (XML)" },
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
    { value: "products", label: "Products" },
    { value: "stock", label: "Stock" },
  ],
  STRICKER: [
    { value: "auto", label: "Auto (Products)" },
    { value: "products", label: "Products" },
    { value: "stocks", label: "Stocks" },
    { value: "colors", label: "Colors" },
    { value: "catalogprices", label: "Catalog Prices" },
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
    { value: "products", label: "Products" },
    { value: "prices", label: "Prices" },
    { value: "stock", label: "Inventories" },
  ],
  PFCONCEPT: [
    { value: "products", label: "Product Feed" },
    { value: "prices", label: "Price Feed" },
    { value: "printprices", label: "Print Price Feed" },
    { value: "stock", label: "Stock Feed" },
  ],
  ONIX: [
    { value: "auto", label: "Auto" },
  ],
};

type FieldMapping = { sourceField: string; targetField: string; transform?: string };
type Schedule = { enabled: boolean; frequency: string; timeOfDay?: string; dayOfWeek?: string };
type EnrichedSyncConfig = SyncConfig & {
  targetModule?: { code: string; name: string; status: string } | null;
  sourceModule?: { code: string; name: string; status: string } | null;
};

interface EditorState {
  id?: string;
  name: string;
  targetModuleId: string;
  targetDataSource: string;
  sourceModuleId: string;
  sourceDataSource: string;
  fieldMappings: FieldMapping[];
  schedule: Schedule;
  isEnabled: boolean;
  backupBeforeSync: boolean;
}

const emptyEditor: EditorState = {
  name: "",
  targetModuleId: "",
  targetDataSource: "",
  sourceModuleId: "",
  sourceDataSource: "",
  fieldMappings: [],
  schedule: { enabled: false, frequency: "daily", timeOfDay: "06:00" },
  isEnabled: true,
  backupBeforeSync: true,
};

function autoMapFields(sourceFields: string[], targetFields: string[]): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedTarget = new Set<string>();
  for (const sf of sourceFields) {
    const sfLower = sf.toLowerCase().replace(/[_\-\s]/g, "");
    let best: string | null = null;
    let bestScore = 0;
    for (const tf of targetFields) {
      if (usedTarget.has(tf)) continue;
      const tfLower = tf.toLowerCase().replace(/[_\-\s]/g, "");
      if (sfLower === tfLower) {
        best = tf;
        bestScore = 100;
        break;
      }
      if (sfLower.includes(tfLower) || tfLower.includes(sfLower)) {
        const score = Math.min(sfLower.length, tfLower.length) / Math.max(sfLower.length, tfLower.length) * 80;
        if (score > bestScore) {
          best = tf;
          bestScore = score;
        }
      }
    }
    if (best && bestScore >= 40) {
      mappings.push({ sourceField: sf, targetField: best });
      usedTarget.add(best);
    }
  }
  return mappings;
}

export default function SyncConfigPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ ...emptyEditor });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSide, setPreviewSide] = useState<"source" | "target">("source");

  const { data: modules } = useQuery<ApiModule[]>({ queryKey: ["/api/modules"] });
  const { data: configs, isLoading: configsLoading } = useQuery<EnrichedSyncConfig[]>({ queryKey: ["/api/sync-configs"] });

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

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/sync-configs/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
    },
  });

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
      fieldMappings: (config.fieldMappings || []) as FieldMapping[],
      schedule,
      isEnabled: config.isEnabled,
      backupBeforeSync: (config.schedule as any)?.backupBeforeSync !== false,
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

    const payload = {
      name: editor.name.trim(),
      targetModuleId: editor.targetModuleId,
      sourceModuleId: editor.sourceModuleId,
      targetDataSource: editor.targetDataSource || null,
      sourceDataSource: editor.sourceDataSource || null,
      fieldMappings: validMappings,
      schedule: { ...editor.schedule, backupBeforeSync: editor.backupBeforeSync },
      isEnabled: editor.isEnabled,
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

  function updateMapping(index: number, field: "sourceField" | "targetField", value: string) {
    setEditor(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((m, i) => i === index ? { ...m, [field]: value } : m),
    }));
  }

  function handleAutoMap() {
    if (!fieldsReady) return;
    const mapped = autoMapFields(sourceFields, targetFields);
    if (mapped.length === 0) {
      toast({ title: language === "sk" ? "Žiadne zhodné polia" : "No matching fields found", variant: "destructive" });
      return;
    }
    setEditor(prev => ({ ...prev, fieldMappings: mapped }));
    toast({ title: language === "sk" ? `Auto-mapovaných ${mapped.length} polí` : `Auto-mapped ${mapped.length} fields` });
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
      <div className="flex items-center justify-between">
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
            <div className="flex items-center justify-between">
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
                      setEditor(prev => ({ ...prev, targetModuleId: val, targetDataSource: defaultTarget, sourceModuleId: "", sourceDataSource: "", fieldMappings: [] }));
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
                            onValueChange={val => setEditor(prev => ({ ...prev, targetDataSource: val, fieldMappings: [] }))}
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
                <Separator />

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
                      {editor.fieldMappings.map((mapping, idx) => (
                        <div
                          key={idx}
                          className={`grid grid-cols-[1fr_40px_1fr_40px] items-center px-3 py-2 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"} border-t`}
                          data-testid={`row-mapping-${idx}`}
                        >
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
                      ))}
                    </div>
                  )}
                </div>

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
                        {language === "sk" ? "Zálohovať cieľové dáta pred synchronizáciou" : "Backup target data before synchronization"}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === "sk"
                          ? "Pred každým spustením synchronizácie sa vytvorí záloha existujúcich dát v cieľovom module. Zálohy umožňujú obnoviť pôvodné dáta v prípade problémov."
                          : "A backup of existing data in the target module will be created before each sync run. Backups allow restoring original data if issues arise."}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

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
                              {language === "sk" ? "Záloha" : "Backup"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{config.sourceModule?.code || "?"}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-mono">{config.targetModule?.code || "?"}</span>
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
                      <h4 className="text-xs font-semibold mb-2">
                        {language === "sk" ? "Mapovanie polí" : "Field Mappings"}
                      </h4>
                      {mappingCount === 0 ? (
                        <p className="text-xs text-muted-foreground">{language === "sk" ? "Žiadne mapovania" : "No mappings"}</p>
                      ) : (
                        <div className="grid grid-cols-[1fr_30px_1fr] gap-1 text-xs max-w-2xl">
                          {(config.fieldMappings as FieldMapping[]).map((m, idx) => (
                            <div key={idx} className="contents">
                              <span className="font-mono bg-muted px-2 py-1 rounded truncate">{m.sourceField}</span>
                              <span className="flex items-center justify-center"><ArrowRight className="h-3 w-3 text-muted-foreground" /></span>
                              <span className="font-mono bg-muted px-2 py-1 rounded truncate">{m.targetField}</span>
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
                          {language === "sk" ? "Zálohovanie pred synchronizáciou: aktívne" : "Backup before sync: active"}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

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
                    let csv = fields.join("\t") + "\n";
                    for (const row of rows) {
                      csv += fields.map(f => {
                        const v = row[f];
                        if (v === undefined || v === null) return "";
                        if (typeof v === "object") return JSON.stringify(v);
                        return String(v);
                      }).join("\t") + "\n";
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
