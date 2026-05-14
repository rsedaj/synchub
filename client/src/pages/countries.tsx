import { useState, useMemo } from "react";
import { useLanguage } from "@/components/language-provider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { COUNTRIES } from "@shared/countries";
import { Search, Globe } from "lucide-react";

export default function CountriesPage() {
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [euFilter, setEuFilter] = useState<"all" | "eu" | "non-eu">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter(c => {
      if (euFilter === "eu" && !c.eu) return false;
      if (euFilter === "non-eu" && c.eu) return false;
      if (!q) return true;
      return (
        c.iso3.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.nameSk.toLowerCase().includes(q) ||
        c.vatCode.toLowerCase().includes(q)
      );
    });
  }, [search, euFilter]);

  const t = (sk: string, en: string) => language === "sk" ? sk : en;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Globe className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("Číselník krajín", "Country Reference Table")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t(
              `${COUNTRIES.length} krajín · zdroj: ONIX Intrastat · použité pri transformácii polí krajiny`,
              `${COUNTRIES.length} countries · source: ONIX Intrastat · used for country field transformation`
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("Hľadať podľa názvu, kódu…", "Search by name, code…")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-country-search"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "eu", "non-eu"] as const).map(f => (
            <button
              key={f}
              onClick={() => setEuFilter(f)}
              data-testid={`button-eu-filter-${f}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                euFilter === f
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {f === "all" ? t("Všetky", "All") : f === "eu" ? "EÚ" : t("Mimo EÚ", "Non-EU")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground w-16">
                  {t("Kód ISO3", "ISO3 Code")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                  {t("Názov SK", "SK Name")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                  {t("Názov EN", "EN Name")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground w-20">
                  {t("Kód DPH", "VAT Code")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground w-16">
                  EÚ
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                    {t("Žiadne záznamy", "No results found")}
                  </td>
                </tr>
              ) : (
                filtered.map((c, i) => (
                  <tr
                    key={c.iso3}
                    data-testid={`row-country-${c.iso3}`}
                    className={`border-t transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{c.iso3}</td>
                    <td className="px-3 py-2 text-xs">{c.nameSk}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.nameEn}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.vatCode || "—"}</td>
                    <td className="px-3 py-2">
                      {c.eu ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                          EÚ
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t bg-muted/30 text-[11px] text-muted-foreground">
          {t(`Zobrazených ${filtered.length} z ${COUNTRIES.length} krajín`, `Showing ${filtered.length} of ${COUNTRIES.length} countries`)}
        </div>
      </div>
    </div>
  );
}
