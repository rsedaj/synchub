/**
 * Backend test: H-kód counter self-heal on collision (cause 8).
 *
 * Guards `server/target-push.ts` H-kód auto-assignment block (~lines 1655-1677):
 * when a NEW record needs a fresh H kód, the code takes `sync_configs.h_kod_config.nextNumber`
 * and increments a local counter starting there. If that stored counter has fallen behind
 * H kódy that ALREADY exist as `Ns_Number` values on ONIX cards — e.g. after a manual DB
 * reset, a run that never persisted the advanced counter, or two configs sharing a prefix
 * range — blindly using the stale counter would generate an H kód identical to one already
 * assigned to a DIFFERENT existing card. Because ONIX upserts by `Ns_Number`, that collision
 * would silently overwrite/corrupt the unrelated existing card instead of creating a fresh one.
 *
 * The fix builds `OnixIndexEntry.usedHKodValues` (a `Set<string>` of every `Ns_Number`/H-kód
 * field value already seen in the ONIX index) at index-build time, then the assignment loop
 * skips forward past any generated value already in that set before using it — regardless of
 * how far behind the stored counter is.
 *
 * This project has no JS test runner. Run this file directly with the bundled tsx:
 *
 *   npx tsx tests/server/hkod-counter-collision.test.ts
 *
 * It stubs `globalThis.fetch` so it makes NO network calls:
 *   - Case 1: the stored `nextNumber` (14442) collides with TWO already-existing ONIX cards
 *     (H2014442, H2014443). The self-heal loop must skip both and assign H2014444 — and log a
 *     collision warning for each skip.
 *   - Case 2: no collision (stored `nextNumber` is already past every existing card) — the
 *     counter's first value must be used as-is, with NO collision warning logged, confirming
 *     the self-heal loop is a no-op (not an off-by-one shift) when there is nothing to skip.
 */

import assert from "node:assert/strict";
import type { ApiModule } from "../../shared/schema";
import { pushToTarget, clearOnixIndexCache } from "../../server/target-push";

const realFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = realFetch;
}

function captureLogs() {
  const realLog = console.log;
  const realWarn = console.warn;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  console.warn = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  return {
    lines,
    restore() {
      console.log = realLog;
      console.warn = realWarn;
    },
  };
}

const onixModule = {
  id: "test-onix",
  code: "ONIX",
  name: "ONIX Test",
  baseUrl: "https://onix-api.hauerland.sk/onix_api",
  config: { apiToken: "dummy-token", databasePath: "test_db" },
} as unknown as ApiModule;

/**
 * Install a fetch stub: the index pre-fetch returns `indexCards` (Sku + Ns_Number pairs) with
 * `@odata.count` equal to their length (COMPLETE index, so the collision loop is exercised in
 * isolation from the unrelated "incomplete index" skip guard). The write POST to
 * `/api/v1/stockitems` (no `$count=true`/`$skip=` query, since it carries no index-walk params)
 * succeeds with a fresh Id, and the sent body is captured for assertions.
 */
function installStub(indexCards: Array<{ Id: number; Sku: string; Ns_Number: string }>) {
  const calls: string[] = [];
  let sentBody: any = null;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      return new Response(JSON.stringify({ value: indexCards, "@odata.count": indexCards.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/v1/stockitems") && init?.method === "POST") {
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ Id: 999 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  return { calls, getSentBody: () => sentBody };
}

// Source "src"="ZZZ" never matches indexed Sku values "AAA"/"BBB" → no match → new record
// (onMissing defaults to "create") → the H-kód assignment block runs for a brand-new card.
const records = [{ Sku: "ZZZ" }];
const sourceRecords = [{ src: "ZZZ" }];
const baseMatchOptions = {
  matchFields: ["src"],
  matchOperator: "and" as const,
  mappings: [{ sourceField: "src", targetField: "Sku" }],
};

async function run() {
  // --- Case 1: stored nextNumber (14442) collides with TWO existing ONIX H-kódy ---
  clearOnixIndexCache();
  const indexCards1 = [
    { Id: 1, Sku: "AAA", Ns_Number: "H2014442" },
    { Id: 2, Sku: "BBB", Ns_Number: "H2014443" },
  ];
  const stub1 = installStub(indexCards1);
  const matchOptions1 = {
    ...baseMatchOptions,
    hKodConfig: { enabled: true, prefix: "H20", nextNumber: 14442, field: "Ns_Number" },
  };
  const cap1 = captureLogs();
  const result1 = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions1 as any);
  cap1.restore();
  restoreFetch();

  const sentBody1 = stub1.getSentBody();
  assert.ok(sentBody1, "expected a write POST to have fired");
  assert.equal(
    sentBody1.Ns_Number,
    "H2014444",
    "self-heal must skip PAST both existing H2014442/H2014443 and assign the next free value",
  );
  assert.equal(result1.createdCount, 1, "the non-colliding record must still be created");
  assert.equal(
    cap1.lines.filter(l => l.includes("H kód kolízia")).length,
    2,
    "expected exactly 2 collision warnings (one per skipped already-used value)",
  );
  console.log("✓ stale counter colliding with 2 existing H-kódy → self-heals to H2014444, 2 warnings logged");

  // --- Case 2: stored nextNumber is already past every existing card → no collision, no-op ---
  clearOnixIndexCache();
  const indexCards2 = [
    { Id: 1, Sku: "AAA", Ns_Number: "H2010000" },
    { Id: 2, Sku: "BBB", Ns_Number: "H2010001" },
  ];
  const stub2 = installStub(indexCards2);
  const matchOptions2 = {
    ...baseMatchOptions,
    hKodConfig: { enabled: true, prefix: "H20", nextNumber: 14442, field: "Ns_Number" },
  };
  const cap2 = captureLogs();
  const result2 = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions2 as any);
  cap2.restore();
  restoreFetch();

  const sentBody2 = stub2.getSentBody();
  assert.ok(sentBody2, "expected a write POST to have fired");
  assert.equal(
    sentBody2.Ns_Number,
    "H2014442",
    "with no collision the counter's first value must be used as-is (no off-by-one shift)",
  );
  assert.equal(result2.createdCount, 1, "the record must be created");
  assert.equal(
    cap2.lines.filter(l => l.includes("H kód kolízia")).length,
    0,
    "no collision warning expected when the counter is already ahead of every existing card",
  );
  console.log("✓ non-colliding counter → assigns H2014442 as-is, 0 warnings logged (self-heal is a no-op)");

  console.log("\nALL TESTS PASSED");
}

run()
  .catch((err) => {
    restoreFetch();
    console.error("\nTEST FAILED:", err);
    process.exit(1);
  })
  .finally(() => {
    restoreFetch();
  });
