/**
 * Backend test: ONIX missing-main-stock (ID_STOCKS_DEFAULT) auto-retry.
 *
 * Guards `server/target-push.ts` ONIX send loop: the first production MACMA→ONIX run
 * had 3 records rejected by ONIX with
 *   "ID_STOCKS_DEFAULT - Nie je zadaný hlavný sklad skladovej karty".
 * Root cause: `Default_Stock` was only auto-filled for records classified as CREATES
 * (`!isUpdate`). When a record is classified as an UPDATE (matched in the index) but
 * ONIX cannot find the sent `Ns_Number` on its side, ONIX's upsert takes the CREATE
 * path — and a create without a main stock is rejected.
 *
 * The fix is two-fold:
 *  1. A post-transform safety net re-asserts `Default_Stock` on creates after fixed
 *     fields / key-removal transformations.
 *  2. A one-shot send retry: when ONIX rejects with the ID_STOCKS_DEFAULT / "hlavný
 *     sklad" error, the same body is re-POSTed once with `Default_Stock` set to
 *     targetStock || config.defaultStock || "SYN".
 *
 * This project has no JS test runner. Run this file directly with the bundled tsx:
 *
 *   npx tsx tests/server/onix-main-stock-retry.test.ts
 *
 * It stubs `globalThis.fetch` so it makes NO network calls:
 *  - Case 1: record matches an indexed card (UPDATE classification). First POST is
 *    rejected with the main-stock error; the stub then expects a SECOND POST whose
 *    body contains Default_Stock="T" and accepts it. Result must be a success, not
 *    an error, and exactly one retry warning must be logged.
 *  - Case 2: a rejection with an UNRELATED message must NOT trigger a retry — only
 *    one POST fires and the record errors out (no infinite/incorrect retry loop).
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
  const realError = console.error;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  console.warn = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  console.error = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  return {
    lines,
    restore() {
      console.log = realLog;
      console.warn = realWarn;
      console.error = realError;
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
 * Fetch stub. Index pre-fetch returns one card (Sku "AAA" ↔ the source record, so the
 * record is classified as an UPDATE). Write POSTs are answered from `postResponses`
 * in order; every sent body is captured.
 */
function installStub(postResponses: Array<(body: any) => any>) {
  const sentBodies: any[] = [];
  let postCount = 0;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      const indexCards = [{ Id: 41, Sku: "AAA", Ns_Number: "H2000041" }];
      return new Response(JSON.stringify({ value: indexCards, "@odata.count": indexCards.length }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/v1/stockitems") && init?.method === "POST") {
      const body = JSON.parse(init.body);
      sentBodies.push(body);
      const responder = postResponses[Math.min(postCount, postResponses.length - 1)];
      postCount++;
      return new Response(JSON.stringify(responder(body)), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  return { sentBodies };
}

const MAIN_STOCK_ERR = {
  Result: 3,
  Errors: [{ Message: "ID_STOCKS_DEFAULT - Nie je zadaný hlavný sklad skladovej karty." }],
};

const records = [{ Sku: "AAA", Name: "Testovacia karta" }];
const sourceRecords = [{ src: "AAA" }];
const matchOptions = {
  matchFields: ["src"],
  matchOperator: "and" as const,
  mappings: [{ sourceField: "src", targetField: "Sku" }],
  targetStock: "T",
};

async function run() {
  // --- Case 1: main-stock rejection on an UPDATE-classified record → retry with Default_Stock ---
  clearOnixIndexCache();
  const stub1 = installStub([
    () => MAIN_STOCK_ERR,          // 1st POST: ONIX rejects (create path, missing main stock)
    () => ({ Id: 999 }),           // 2nd POST: accepted
  ]);
  const cap1 = captureLogs();
  const result1 = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions as any);
  cap1.restore();
  restoreFetch();

  assert.equal(stub1.sentBodies.length, 2, "expected exactly 2 POSTs (original + one retry)");
  assert.ok(!("Default_Stock" in stub1.sentBodies[0]), "update-classified body must not carry Default_Stock on the first POST");
  assert.equal(stub1.sentBodies[1].Default_Stock, "T", "retry POST must set Default_Stock to targetStock");
  assert.equal(result1.errorCount, 0, "retried record must not count as an error");
  assert.equal(result1.updatedCount, 1, "retried record must be reported as successful");
  assert.equal(
    cap1.lines.filter(l => l.includes("chýbajúci hlavný sklad")).length,
    1,
    "expected exactly one main-stock retry warning",
  );
  console.log("✓ ID_STOCKS_DEFAULT rejection → one retry with Default_Stock=\"T\" → success");

  // --- Case 2: unrelated rejection → NO retry, record errors out after a single POST ---
  clearOnixIndexCache();
  const stub2 = installStub([
    () => ({ Result: 3, Errors: [{ Message: "Iná chyba: neplatná merná jednotka." }] }),
  ]);
  const cap2 = captureLogs();
  const result2 = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions as any);
  cap2.restore();
  restoreFetch();

  assert.equal(stub2.sentBodies.length, 1, "unrelated rejection must NOT trigger a retry");
  assert.equal(result2.errorCount, 1, "unrelated rejection must surface as an error");
  assert.ok(
    result2.records[0]?.errorMsg?.includes("Iná chyba"),
    "original ONIX error message must be preserved",
  );
  console.log("✓ unrelated ONIX rejection → single POST, surfaced as error (no retry)");

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
