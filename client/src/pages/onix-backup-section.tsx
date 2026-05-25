import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Database, HardDrive, Cloud, Download, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface OnixBackup {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  endpoints: string[] | null;
  localFilePath: string | null;
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
  totalRecords: number;
  fileSize: number;
  errorMessage: string | null;
  triggeredBy: string | null;
  details: Record<string, any> | null;
  createdAt: string;
}

export default function OnixBackupSection({ t, language }: { t: (key: string) => string; language: string }) {
  const { toast } = useToast();

  const { data: backups = [], isLoading, refetch } = useQuery<OnixBackup[]>({
    queryKey: ["/api/onix-backups"],
    refetchInterval: (data) => {
      const arr = Array.isArray(data) ? data : [];
      return arr.some((b: OnixBackup) => b.status === "running") ? 3000 : false;
    },
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onix-backup/run"),
    onSuccess: () => {
      toast({ title: t("syncDash.onixBackupSection"), description: language === "sk" ? "ONIX záloha spustená." : "ONIX backup started." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/onix-backups"] });
      }, 1000);
    },
    onError: (err: any) => {
      toast({ title: t("syncDash.error") || "Error", description: err.message, variant: "destructive" });
    },
  });

  const hasRunning = backups.some(b => b.status === "running");

  const statusBadge = (status: string) => {
    if (status === "success") return <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600 dark:text-green-400"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{language === "sk" ? "OK" : "OK"}</Badge>;
    if (status === "error") return <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-600 dark:text-red-400"><XCircle className="h-2.5 w-2.5 mr-0.5" />{language === "sk" ? "Chyba" : "Error"}</Badge>;
    if (status === "running") return <Badge variant="outline" className="text-[10px] animate-pulse"><Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />{language === "sk" ? "Beží" : "Running"}</Badge>;
    return <Badge variant="outline" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            {t("syncDash.onixBackupSection")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => refetch()}
              data-testid="button-onix-backup-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="default" size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || hasRunning}
              data-testid="button-start-onix-backup"
            >
              {(runMutation.isPending || hasRunning) ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 mr-1.5" />
              )}
              {(runMutation.isPending || hasRunning) ? t("syncDash.onixBackupRunning") : t("syncDash.startOnixBackup")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("syncDash.onixBackupDesc")}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <HardDrive className="h-3 w-3" />
            {language === "sk" ? "Hetzner (primárne)" : "Hetzner (primary)"}
          </span>
          <span>→</span>
          <span className="flex items-center gap-1.5">
            <Cloud className="h-3 w-3" />
            {language === "sk" ? "SEDAJ Cloud (sekundárne)" : "SEDAJ Cloud (secondary)"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(n => <Skeleton key={n} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t("syncDash.onixBackupNoHistory")}</p>
        ) : (
          <div className="space-y-2">
            {backups.slice(0, 10).map((backup) => (
              <div key={backup.id} className="flex items-start justify-between p-3 rounded-lg border gap-3" data-testid={`row-onix-backup-${backup.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {statusBadge(backup.status)}
                    <span className="text-xs text-muted-foreground">
                      {backup.startedAt ? formatDistanceToNow(new Date(backup.startedAt), { addSuffix: true }) : "—"}
                    </span>
                    {backup.totalRecords > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · {backup.totalRecords.toLocaleString()} {language === "sk" ? "záznamov" : "records"}
                      </span>
                    )}
                    {backup.fileSize > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · {formatBytes(backup.fileSize)}
                      </span>
                    )}
                  </div>
                  {backup.endpoints && backup.endpoints.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {backup.endpoints.map(ep => (
                        <Badge key={ep} variant="secondary" className="text-[10px] px-1.5 py-0">{ep}</Badge>
                      ))}
                    </div>
                  )}
                  {backup.localFilePath && (
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
                      <HardDrive className="h-2.5 w-2.5 inline mr-1" />
                      {backup.localFilePath}
                    </p>
                  )}
                  {backup.errorMessage && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 truncate">{backup.errorMessage}</p>
                  )}
                  {backup.details && typeof backup.details === "object" && Object.keys(backup.details).length > 0 && backup.status === "success" && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {Object.entries(backup.details).map(([ep, info]: [string, any]) => (
                        <span key={ep} className="text-[10px] text-muted-foreground">
                          {ep}: {info.count ?? 0}
                          {info.error && <span className="text-red-500 ml-0.5">!</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {backup.localFilePath && backup.status === "success" && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/onix-backups/${backup.id}/download`, { credentials: "include" });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = backup.localFilePath!.split("/").pop() || "onix_backup.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                    data-testid={`button-download-onix-backup-${backup.id}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
