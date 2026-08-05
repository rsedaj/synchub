// Tests for ONIX duplicate-match auto-resolution (pick newest card, log, continue)
// Covers: index path (single + AND), same-Ns_Number unresolvable skip, and
// duplicateResolutions audit trail in PushResult.
import { pushToTarget, clearOnixIndexCache } from "../../server/target-push";

let failures = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    failures++;
    console.error(`✗ ${name}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 400) : "");
  }
}

const realFetch = globalThis.fetch;

// Build a fake ONIX GET /stockitems response with duplicate Product_Code cards.
function onixIndexResponse(items: any[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ "@odata.count": items.length, value: items }),
    text: async () => "",
  } as any;
}

function card(id: number, ns: string, productCode: string) {
  return {
    IdRecord: id,
    Ns_Number: ns,
    RecordExternalIdentificator: `EXT-${id}`,
    CustomColumns: [{ Name: "STOCK_ITEMS_Product_Code", Value: productCode }],
  };
}

async function runPush(indexCards: any[], sourceRecords: any[], posted: any[]) {
  clearOnixIndexCache();
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    if (init?.method === "POST") {
      posted.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ IdRecord: 999999 }), text: async () => "" } as any;
    }
    return onixIndexResponse(indexCards);
  }) as any;

  const mapped = sourceRecords.map(r => ({ "CustomColumns.Product_Code": r.id, Name: r.name }));
  return pushToTarget(
    { code: "ONIX", baseUrl: "https://onix-api.hauerland.sk/onix_api", config: { apiToken: "t" } } as any,
    "stockitems",
    mapped,
    0,
    sourceRecords,
    {
      matchFields: ["id"],
      matchOperator: "and",
      onMissing: "skip",
      mappings: [{ sourceField: "id", targetField: "CustomColumns.Product_Code" }],
    } as any,
  );
}

async function main() {
  // ── Case 1: duplicate Product_Code, DISTINCT Ns_Numbers → newest card chosen, update not skip ──
  {
    const posted: any[] = [];
    const res = await runPush(
      [card(100, "H1103194", "6898805"), card(250, "H1107331", "6898805")],
      [{ id: "6898805", name: "Vianočná taška Osorno" }],
      posted,
    );
    check("case1: record updated, not skipped", res.updatedCount === 1 && (res.skippedCount ?? 0) === 0, res);
    check("case1: update targets NEWEST card Ns_Number=H1107331", posted.length === 1 && posted[0].Ns_Number === "H1107331", posted);
    check("case1: duplicateResolutions audit present", Array.isArray(res.duplicateResolutions) && res.duplicateResolutions.length === 1);
    const dr = res.duplicateResolutions?.[0];
    check("case1: audit has both candidates + chosen", dr?.chosenId === 250 && dr?.chosenNsNumber === "H1107331" && dr?.candidates.length === 2, dr);
  }

  // ── Case 2: duplicates share the SAME Ns_Number → still skipped (unresolvable) ──
  {
    const posted: any[] = [];
    const res = await runPush(
      [card(10, "H1100001", "555"), card(20, "H1100001", "555")],
      [{ id: "555", name: "Duplicitná karta" }],
      posted,
    );
    check("case2: same-Ns_Number duplicate is skipped", (res.skippedCount ?? 0) === 1 && res.updatedCount === 0 && res.createdCount === 0, res);
    check("case2: nothing POSTed", posted.length === 0);
    check("case2: no resolution audit (was not resolvable)", !res.duplicateResolutions);
  }

  // ── Case 3: no duplicates → normal single match unaffected ──
  {
    const posted: any[] = [];
    const res = await runPush(
      [card(1, "H1100061", "95417"), card(2, "H1100062", "95418")],
      [{ id: "95417", name: "Multifunkčný nástroj" }],
      posted,
    );
    check("case3: normal match still updates", res.updatedCount === 1 && posted[0]?.Ns_Number === "H1100061", { res, posted });
    check("case3: no duplicateResolutions", !res.duplicateResolutions);
  }

  // ── Case 4: OR-match, repeated SAME unresolvable key across records → consistently skipped ──
  // Guards the cache fix: an ambiguous outcome must NOT be cached as a plain no-match,
  // otherwise the 2nd record with the same key would silently create a duplicate.
  {
    const posted: any[] = [];
    clearOnixIndexCache();
    globalThis.fetch = (async (url: any, init?: any) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => ({ IdRecord: 999999 }), text: async () => "" } as any;
      }
      return onixIndexResponse([card(10, "H1100001", "555"), card(20, "H1100001", "555")]);
    }) as any;
    const sourceRecords = [
      { id: "555", name: "Duplicitná karta A" },
      { id: "555", name: "Duplicitná karta B" },
    ];
    const mapped = sourceRecords.map(r => ({ "CustomColumns.Product_Code": r.id, Name: r.name }));
    const res = await pushToTarget(
      { code: "ONIX", baseUrl: "https://onix-api.hauerland.sk/onix_api", config: { apiToken: "t" } } as any,
      "stockitems",
      mapped,
      0,
      sourceRecords,
      {
        matchFields: ["id"],
        matchOperator: "or",
        onMissing: "create",
        mappings: [{ sourceField: "id", targetField: "CustomColumns.Product_Code" }],
      } as any,
    );
    check("case4: BOTH records with same ambiguous OR key skipped", (res.skippedCount ?? 0) === 2 && res.createdCount === 0, res);
    check("case4: nothing POSTed despite onMissing:create", posted.length === 0, posted);
  }

  globalThis.fetch = realFetch;
  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
  }
  console.log("\n✅ All onix-duplicate-resolution tests passed.");
}

main().catch(e => { console.error(e); process.exit(1); });
