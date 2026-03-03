import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ApiModule, SyncLog } from "@shared/schema";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

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

  const handleSave = () => {
    updateMutation.mutate({ name, description, baseUrl, status: status as any });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-80 rounded-lg" />
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </div>
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
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-module-name">
              {mod.name}
            </h1>
            <Badge variant="outline">{mod.code}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Module configuration and sync history
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-medium">Configuration</h2>
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Sync History</h2>
              </div>
            </CardHeader>
            <CardContent>
              {!syncLogs || syncLogs.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <ArrowLeftRight className="h-6 w-6 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No sync history</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {syncLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 py-2 px-2 rounded-md"
                      data-testid={`row-sync-${log.id}`}
                    >
                      <SyncStatusIcon status={log.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {log.direction === "import" ? (
                            <ArrowDownToLine className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ArrowUpFromLine className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="text-xs capitalize">{log.direction}</span>
                          <span className="text-xs text-muted-foreground">
                            {log.recordsProcessed} records
                          </span>
                        </div>
                        {log.errorMessage && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                            {log.errorMessage}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.startedAt
                          ? formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
