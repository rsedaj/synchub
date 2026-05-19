import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Activity, TrendingUp, CheckCircle2, Clock, Database } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from "recharts";

interface PerDay {
  day: string;
  runs: number;
  processed: number;
  failed: number;
  skipped: number;
  success: number;
  errors: number;
  partial: number;
  avgDurationSec: number | null;
}

interface AnalyticsOverview {
  perDay: PerDay[];
  allTime: {
    totalRuns: number;
    totalProcessed: number;
    totalFailed: number;
    successCount: number;
    avgDurationSec: number | null;
  };
  topConfigs: Array<{ configId: string; configName: string; totalRuns: number; totalProcessed: number }>;
}

function durationShort(sec: number | null): string {
  if (!sec) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const DARK_FULL  = "hsl(var(--foreground))";
const DARK_MED   = "hsl(var(--foreground) / 0.45)";
const DARK_LIGHT = "hsl(var(--foreground) / 0.18)";

export default function SyncAnalyticsTab({ language }: { language: string }) {
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", days],
    queryFn: () =>
      fetch(`/api/analytics/overview?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const t = (sk: string, en: string) => language === "sk" ? sk : en;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { allTime, perDay = [], topConfigs = [] } = data ?? {};
  const successRate = allTime?.totalRuns
    ? Math.round(((allTime.successCount ?? 0) / allTime.totalRuns) * 100)
    : 0;

  const chartData = perDay.map(d => ({
    ...d,
    day: d.day.slice(5),
  }));

  return (
    <div className="space-y-5">
      {/* Header + period selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {t("Prehľad synchronizácií", "Sync Analytics")}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("Posledných", "Last")}</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-28 h-8" data-testid="select-analytics-days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("7 dní", "7 days")}</SelectItem>
              <SelectItem value="14">{t("14 dní", "14 days")}</SelectItem>
              <SelectItem value="30">{t("30 dní", "30 days")}</SelectItem>
              <SelectItem value="60">{t("60 dní", "60 days")}</SelectItem>
              <SelectItem value="90">{t("90 dní", "90 days")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* All-time stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs">{t("Celkom behov", "Total runs")}</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-analytics-total-runs">
              {(allTime?.totalRuns ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">{t("Spracovaných záznamov", "Records processed")}</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-analytics-total-processed">
              {(allTime?.totalProcessed ?? 0).toLocaleString()}
            </p>
            {(allTime?.totalFailed ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {(allTime?.totalFailed ?? 0).toLocaleString()} {t("chýb", "failed")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">{t("Úspešnosť", "Success rate")}</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-analytics-success-rate">
              {successRate}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              {(allTime?.successCount ?? 0)} / {(allTime?.totalRuns ?? 0)} {t("behov", "runs")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">{t("Priemerná doba", "Avg duration")}</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-analytics-avg-duration">
              {durationShort(allTime?.avgDurationSec ?? null)}
            </p>
          </CardContent>
        </Card>
      </div>

      {chartData.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/25 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("Žiadne behy v tomto období.", "No sync runs in this period.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Runs per day — stacked bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("Behy synchronizácie podľa dňa", "Sync runs per day")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="success" name={t("Úspešné", "Success")} stackId="s" fill={DARK_FULL} radius={[0,0,0,0]} />
                  <Bar dataKey="partial" name={t("Čiastočné", "Partial")} stackId="s" fill={DARK_MED} radius={[0,0,0,0]} />
                  <Bar dataKey="errors" name={t("Chyby", "Errors")} stackId="s" fill={DARK_LIGHT} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Records per day — area chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("Spracované záznamy podľa dňa", "Records processed per day")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area
                    type="monotone"
                    dataKey="processed"
                    name={t("Spracované", "Processed")}
                    stroke={DARK_FULL}
                    fill="hsl(var(--foreground) / 0.07)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    name={t("Zlyhalo", "Failed")}
                    stroke={DARK_MED}
                    fill="hsl(var(--foreground) / 0.03)"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Avg duration per day */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("Priemerná doba trvania (sekundy)", "Average run duration (seconds)")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid hsl(var(--border))" }} />
                  <Area
                    type="monotone"
                    dataKey="avgDurationSec"
                    name={t("Sek.", "Sec.")}
                    stroke={DARK_FULL}
                    fill="hsl(var(--foreground) / 0.06)"
                    strokeWidth={1.5}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Top configs */}
      {topConfigs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              {t("Top integrácie podľa aktivity", "Top integrations by activity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm">
              {topConfigs.map((cfg, i) => {
                const maxRuns = topConfigs[0]?.totalRuns ?? 1;
                const pct = Math.round((cfg.totalRuns / maxRuns) * 100);
                return (
                  <div key={cfg.configId} className="px-4 py-2.5" data-testid={`row-analytics-config-${i}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}.</span>
                        <span className="font-medium text-sm">{cfg.configName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{cfg.totalRuns} {t("behov", "runs")}</span>
                        <span className="font-mono tabular-nums">
                          {cfg.totalProcessed.toLocaleString()} {t("záz.", "rec.")}
                        </span>
                      </div>
                    </div>
                    <div className="ml-7 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-foreground/60 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
