/**
 * Backend test: `pushToTarget` surfaces ONIX-index completeness diagnostics.
 *
 * Guards the producer side of the duplicate-risk warning chain (see
 * `tests/ui/onix-index-incomplete-warning.md` for the consumer/UI side):
 *
 *   server/target-push.ts  → PushResult.onixIndexComplete / onixIndexRecordCount /
 *                             onixIndexExpectedCount
 *
 * When the in-memory ONIX card index is built from fewer records than ONIX reports
 * via `@odata.count`, `buildOnixIndex` marks the index incomplete and `pushToTarget`
 * must return `onixIndexComplete: false` along with the indexed / expected counts.
 * `server/sync-engine.ts` then turns `onixIndexComplete === false` into
 * `details.onixIndex = { incomplete: true, recordCount, expectedCount }`, which the
 * sync dashboard renders as the amber duplicate-risk banner. A regression here would
 * silently hide that risk from operators.
 *
 * This project has no JS test runner. Run this file directly with the bundled tsx:
 *
 *   npx tsx tests/server/onix-index-incomplete.test.ts
 *
 * It stubs `globalThis.fetch` so it makes NO network calls and needs no live ONIX:
 *   - With `onMissing: "skip"` and a source value that is absent from the stubbed
 *     index, every record is skipped cleanly, so the ONLY fetch is the index build.
 *   - The stub returns `@odata.count` GREATER than the page it serves to force the
 *     "incomplete index" branch, and EQUAL to force the "complete index" branch.
 */

import assert from "node:assert/strict";
import type { ApiModule } from "../../shared/schema";
import { pushToTarget, clearOnixIndexCache } from "../../server/target-push";

const realFetch = globalThis.fetch;

/**
 * Install a fetch stub that answers the ONIX index pre-fetch with a single-record
 * page plus a configurable `@odata.count`. Any unexpected URL throws so the test
 * fails loudly instead of hitting the network.
 */
function installFetchStub(odataCount: number) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    // Pagination pages (the engine appends $skip=/$top= to walk @odata.count): return an
    // EMPTY page so the index pagination terminates while fewer records than @odata.count
    // have been collected — i.e. an INCOMPLETE index.
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // First index page: a single card plus the (larger) @odata.count.
    if (url.includes("$count=true")) {
      const body = {
        value: [{ Id: 1, Ns_Number: "AAA" }],
        "@odata.count": odataCount,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Any non-index URL would be a per-record write/lookup, which must NOT happen
    // when the record is skipped (onMissing:"skip").
    throw new Error(`Unexpected fetch in test (no writes expected): ${url}`);
  }) as typeof fetch;
  return calls;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

const onixModule = {
  id: "test-onix",
  code: "ONIX",
  name: "ONIX Test",
  baseUrl: "https://onix-api.hauerland.sk/onix_api",
  config: { apiToken: "dummy-token", databasePath: "test_db" },
} as unknown as ApiModule;

// Source value "ZZZ" never matches the stubbed index card "AAA", so with
// onMissing:"skip" the record is skipped (no write fetch) and we can read the
// index-completeness diagnostics off the PushResult.
const records = [{ Ns_Number: "ZZZ" }];
const sourceRecords = [{ src: "ZZZ" }];
const matchOptions = {
  matchFields: ["src"],
  matchOperator: "and" as const,
  onMissing: "skip" as const,
  mappings: [{ sourceField: "src", targetField: "Ns_Number" }],
};

async function run() {
  // --- Case 1: INCOMPLETE index (indexed 1 < @odata.count 5) ---
  clearOnixIndexCache();
  let calls = installFetchStub(5);
  let result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => !u.includes("$count=true")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  assert.equal(result.onixIndexComplete, false, "incomplete index must surface onixIndexComplete=false");
  assert.equal(result.onixIndexRecordCount, 1, "onixIndexRecordCount must be the number of indexed cards (1)");
  assert.equal(result.onixIndexExpectedCount, 5, "onixIndexExpectedCount must be the @odata.count (5)");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ incomplete index → onixIndexComplete=false, recordCount=1, expectedCount=5");

  // --- Case 2: COMPLETE index (indexed 1 === @odata.count 1) ---
  clearOnixIndexCache();
  calls = installFetchStub(1);
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(result.onixIndexComplete, true, "complete index must surface onixIndexComplete=true");
  assert.equal(result.onixIndexRecordCount, 1, "onixIndexRecordCount must be 1");
  assert.equal(result.onixIndexExpectedCount, 1, "onixIndexExpectedCount must be 1");
  console.log("✓ complete index → onixIndexComplete=true, recordCount=1, expectedCount=1");

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
