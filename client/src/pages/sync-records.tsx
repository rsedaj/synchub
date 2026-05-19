import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Database, X, ChevronLeft, ChevronRight, Tag, AlertTriangle, CheckCircle2, SkipForward, RefreshCcw } from "lucide-react";
import { format } from "date-fns";

interface SnapshotStat {
  syncConfigId: string;
  configName: string;
  total: number;
  created: number;
  updated: number;
  errors: number;
  skipped: number;
  withHCode: number;
  lastSyncedAt: string | null;
}

interface SnapshotRow {
  id: string;
  record_key: string;
  h_code: string | null;
  onix_ns_number: string | null;
  onix_record_id: string | null;
  sync_status: string;
  error_message: string | null;
  sync_run_id: string | null;
  first_synced_at: string | null;
  last_synced_at: string | null;
  field_hash: string;
  source_data: Record<string, any> | null;
  target_data: Record<string, any> | null;
}

const STATUS_BADGES: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  created: { label: "Created", icon: <CheckCircle2 className="h-3 w-3" />, cls: "bg-black text-white dark:bg-white dark:text-black" },
  updated: { label: "Updated", icon: <RefreshCcw className="h-3 w-3" />, cls: "border border-current" },
  error: { label: "Error", icon: <AlertTriangle className="h-3 w-3" />, cls: "border border-current text-red-600 dark:text-red-400" },
  skipped: { label: "Skipped", icon: <SkipForward className="h-3 w-3" />, cls: "border border-current opacity-60" },
};

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const def = STATUS_BADGES[status] || { label: status, icon: null, cls: "border border-current" };
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs font-mono ${def.cls}`} data-testid={`badge-status-${status}`}>
      {def.icon}
      {t(`syncRecords.${status}`) !== `syncRecords.${status}` ? t(`syncRecords.${status}`) : def.label}
    </Badge>
  );
}

function JsonViewer({ data, label }: { data: Record<string, any> | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!data || typeof data !== "object") return <span className="text-xs text-muted-foreground">—</span>;
  const entries = Object.entries(data).slice(0, 3);
  return (
    <span className="flex items-center gap-1">
      <button
        className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        data-testid="btn-open-json"
      >
        {entries.map(([k]) => k).join(", ")}{Object.keys(data).length > 3 ? ` +${Object.keys(data).length - 3}` : ""}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{label}</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </span>
  );
}

const PAGE_SIZE = 50;

export default function SyncRecordsPage() {
  const { t } = useLanguage();
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState<SnapshotRow | null>(null);

  const debounce = useCallback((val: string) => {
    setSearch(val);
    const t = setTimeout(() => { setDebouncedSearch(val); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<SnapshotStat[]>({
    queryKey: ["/api/sync-records/stats"],
  });

  const { data: rows, isLoading: rowsLoading } = useQuery<{ rows: SnapshotRow[]; total: number }>({
    queryKey: ["/api/sync-records", selectedConfigId, debouncedSearch, statusFilter, page],
    enabled: !!selectedConfigId,
    queryFn: async () => {
      const params = new URLSearchParams({
        configId: selectedConfigId,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        search: debouncedSearch,
        status: statusFilter === "all" ? "" : statusFilter,
      });
      const res = await fetch(`/api/sync-records?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const totalPages = rows ? Math.ceil(rows.total / PAGE_SIZE) : 0;
  const selectedStat = stats?.find(s => s.syncConfigId === selectedConfigId);

  function fmtDate(d: string | null) {
    if (!d) return "—";
    try { return format(new Date(d), "dd.MM.yyyy HH:mm"); } catch { return d; }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <Database className="h-6 w-6" />
            {t("syncRecords.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("syncRecords.subtitle")}</p>
        </div>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(n => <Skeleton key={n} className="h-20 rounded-md" />)}
        </div>
      ) : !stats || stats.length === 0 ? (
        <div className="border rounded-md p-6 text-center">
          <p className="text-sm font-medium">{t("syncRecords.noStats")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("syncRecords.noStatsDesc")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map(s => (
            <button
              key={s.syncConfigId}
              data-testid={`card-stat-${s.syncConfigId}`}
              onClick={() => { setSelectedConfigId(s.syncConfigId); setPage(0); }}
              className={`border rounded-md p-4 text-left hover:bg-muted/50 transition-colors ${selectedConfigId === s.syncConfigId ? "border-foreground bg-muted/30" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm truncate" data-testid={`text-config-name-${s.syncConfigId}`}>{s.configName}</span>
                {s.withHCode > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-hcode-count-${s.syncConfigId}`}>
                    <Tag className="h-3 w-3" />{s.withHCode}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span data-testid={`text-total-${s.syncConfigId}`}>{t("syncRecords.total")}: <strong className="text-foreground">{s.total.toLocaleString()}</strong></span>
                {s.errors > 0 && <span className="text-red-600 dark:text-red-400" data-testid={`text-errors-${s.syncConfigId}`}>{s.errors} chýb</span>}
              </div>
              {s.lastSyncedAt && (
                <p className="text-xs text-muted-foreground mt-1" data-testid={`text-last-sync-${s.syncConfigId}`}>{fmtDate(s.lastSyncedAt)}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Records table */}
      {!selectedConfigId ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground text-sm" data-testid="text-select-config-hint">
          {t("syncRecords.selectConfigFirst")}
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          {/* Selected config info + filters */}
          <div className="flex items-center justify-between gap-3 p-3 border-b bg-muted/30 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm" data-testid="text-selected-config">{selectedStat?.configName || selectedConfigId}</span>
              {selectedStat && (
                <span className="text-xs text-muted-foreground">— {selectedStat.total.toLocaleString()} {t("syncRecords.total").toLowerCase()}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  data-testid="input-search"
                  placeholder={t("syncRecords.search")}
                  value={search}
                  onChange={e => debounce(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
                {search && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => { setSearch(""); setDebouncedSearch(""); setPage(0); }}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-status-all">{t("syncRecords.all")}</SelectItem>
                  <SelectItem value="created" data-testid="option-status-created">{t("syncRecords.created")}</SelectItem>
                  <SelectItem value="updated" data-testid="option-status-updated">{t("syncRecords.updated")}</SelectItem>
                  <SelectItem value="error" data-testid="option-status-error">{t("syncRecords.errors")}</SelectItem>
                  <SelectItem value="skipped" data-testid="option-status-skipped">{t("syncRecords.skipped")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {rowsLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
            </div>
          ) : !rows || rows.rows.length === 0 ? (
            <div className="p-10 text-center" data-testid="text-no-records">
              <p className="text-sm font-medium">{t("syncRecords.noData")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("syncRecords.noDataDesc")}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-records">
                  <thead>
                    <tr className="border-b bg-muted/20 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.recordKey")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.hCode")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.nsNumber")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.status")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.lastSynced")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.sourceData")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("syncRecords.targetData")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.rows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setDetailRow(row)}
                        data-testid={`row-record-${idx}`}
                      >
                        <td className="px-3 py-2 font-mono max-w-[160px] truncate" data-testid={`text-record-key-${idx}`}>{row.record_key}</td>
                        <td className="px-3 py-2 font-mono" data-testid={`text-h-code-${idx}`}>
                          {row.h_code ? (
                            <span className="inline-flex items-center gap-1">
                              <Tag className="h-3 w-3 shrink-0" />
                              {row.h_code}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground" data-testid={`text-ns-number-${idx}`}>{row.onix_ns_number || "—"}</td>
                        <td className="px-3 py-2" data-testid={`text-status-${idx}`}>
                          <StatusBadge status={row.sync_status} t={t} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap" data-testid={`text-last-synced-${idx}`}>{fmtDate(row.last_synced_at)}</td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <JsonViewer data={row.source_data} label={t("syncRecords.sourceData")} />
                        </td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <JsonViewer data={row.target_data} label={t("syncRecords.targetData")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground" data-testid="pagination-controls">
                  <span>{rows.total.toLocaleString()} záznamov</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={page === 0}
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      data-testid="btn-prev-page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-2">{page + 1} / {totalPages}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      data-testid="btn-next-page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!detailRow} onOpenChange={o => { if (!o) setDetailRow(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-record-detail">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              {t("syncRecords.detail")}
              {detailRow && <StatusBadge status={detailRow.sync_status} t={t} />}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-4">
              {/* Meta fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs border rounded-md p-3 bg-muted/20">
                <div><span className="text-muted-foreground">{t("syncRecords.recordKey")}:</span> <span className="font-mono ml-1" data-testid="text-detail-record-key">{detailRow.record_key}</span></div>
                <div><span className="text-muted-foreground">{t("syncRecords.hCode")}:</span> <span className="font-mono ml-1" data-testid="text-detail-h-code">{detailRow.h_code || "—"}</span></div>
                <div><span className="text-muted-foreground">{t("syncRecords.nsNumber")}:</span> <span className="font-mono ml-1" data-testid="text-detail-ns-number">{detailRow.onix_ns_number || "—"}</span></div>
                <div><span className="text-muted-foreground">ONIX ID:</span> <span className="font-mono ml-1" data-testid="text-detail-onix-id">{detailRow.onix_record_id || "—"}</span></div>
                <div><span className="text-muted-foreground">{t("syncRecords.firstSynced")}:</span> <span className="ml-1" data-testid="text-detail-first-synced">{fmtDate(detailRow.first_synced_at)}</span></div>
                <div><span className="text-muted-foreground">{t("syncRecords.lastSynced")}:</span> <span className="ml-1" data-testid="text-detail-last-synced">{fmtDate(detailRow.last_synced_at)}</span></div>
                {detailRow.error_message && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t("syncRecords.errorMsg")}:</span>
                    <span className="ml-1 text-red-600 dark:text-red-400 break-all" data-testid="text-detail-error">{detailRow.error_message}</span>
                  </div>
                )}
              </div>

              {/* Source data */}
              <div>
                <p className="text-xs font-medium mb-1.5 text-muted-foreground uppercase tracking-wider">{t("syncRecords.sourceData")}</p>
                {detailRow.source_data ? (
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-56" data-testid="pre-source-data">
                    {JSON.stringify(detailRow.source_data, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-source">{t("syncRecords.noSnapshot")}</p>
                )}
              </div>

              {/* Target data */}
              <div>
                <p className="text-xs font-medium mb-1.5 text-muted-foreground uppercase tracking-wider">{t("syncRecords.targetData")}</p>
                {detailRow.target_data ? (
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-56" data-testid="pre-target-data">
                    {JSON.stringify(detailRow.target_data, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-target">{t("syncRecords.noSnapshot")}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setDetailRow(null)} data-testid="btn-close-detail">
                  {t("syncRecords.close")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
