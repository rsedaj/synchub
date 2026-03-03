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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ApiModule, SyncLog } from "@shared/schema";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

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
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [dataPreview, setDataPreview] = useState<DataPreviewResult | null>(null);

  useEffect(() => {
    if (mod) {
      setName(mod.name);
      setDescription(mod.description || "");
      setBaseUrl(mod.baseUrl || "");
      setStatus(mod.status);
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
      const res = await apiRequest("GET", `/api/modules/${moduleId}/data-preview?limit=20`);
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
    updateMutation.mutate({ name, description, baseUrl, status: status as any });
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
                                  {dataPreview.fields.slice(0, 10).map((field) => (
                                    <TableCell key={field} className="text-xs max-w-[200px] truncate">
                                      {row[field] || ""}
                                    </TableCell>
                                  ))}
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
              <h2 className="text-sm font-medium">Module Configuration</h2>
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

              {config && Object.keys(config).length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <Label>API Configuration</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(config).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-md bg-muted/50 text-sm">
                        <span className="text-muted-foreground text-xs">{key}</span>
                        <span className="text-xs font-mono truncate max-w-[150px]">
                          {typeof value === "string" ? value : JSON.stringify(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
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
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  );
}
