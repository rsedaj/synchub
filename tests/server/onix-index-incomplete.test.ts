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
 *
 * Case 3 additionally exercises the OTHER pagination branch in `buildOnixIndex`:
 * `@odata.nextLink` page-walking (server/target-push.ts ~lines 721-737). A real OData
 * v4 first response carries BOTH `@odata.count` (the true total) AND `@odata.nextLink`
 * (the URL of page 2). If that nextLink chain ends early — a page returns no further
 * `@odata.nextLink` while fewer cards than `@odata.count` were collected — the index is
 * just as incomplete as the `$skip` case, and `onixIndexComplete=false` must still be
 * surfaced. (The completeness check at ~line 890 needs a non-null `@odata.count` to
 * detect a short fetch, so the first page MUST include it; nextLink alone carries no
 * notion of "expected", so an absent count would be indistinguishable from complete.)
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

/**
 * Install a fetch stub that paginates the ONIX index via `@odata.nextLink` instead of
 * `$skip`. The first page returns ONE card, the real total via `@odata.count`, and a
 * `@odata.nextLink` pointing at page 2. Page 2 returns ONE more card and NO further
 * nextLink, so the chain ends with only 2 cards collected — fewer than `@odata.count`
 * — i.e. an INCOMPLETE index reached through the nextLink branch. Any `$skip=` URL would
 * mean the wrong (count/$skip) branch ran, so we throw on it to fail loudly.
 */
function installNextLinkFetchStub(odataCount: number) {
  const calls: string[] = [];
  const nextLinkUrl =
    "https://onix-api.hauerland.sk/ONIX_API/api/v1/stockitems?$skiptoken=PAGE2";
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    // Wrong branch guard: the $skip/$top walker must NOT run when nextLink is present.
    if (url.includes("$skip=")) {
      throw new Error(`Unexpected $skip fetch — nextLink branch should have been used: ${url}`);
    }
    // Page 2 (followed via @odata.nextLink): one more card, chain ENDS (no nextLink).
    if (url.includes("$skiptoken=PAGE2")) {
      return new Response(JSON.stringify({ value: [{ Id: 2, Ns_Number: "BBB" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // First index page: one card + the real total (@odata.count) + a nextLink to page 2.
    if (url.includes("$count=true")) {
      const body = {
        value: [{ Id: 1, Ns_Number: "AAA" }],
        "@odata.count": odataCount,
        "@odata.nextLink": nextLinkUrl,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
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

  // --- Case 3: INCOMPLETE index via @odata.nextLink chain that ends early ---
  // First page (count=5) + nextLink → page 2 (1 card, no further nextLink) → 2 indexed < 5.
  clearOnixIndexCache();
  calls = installNextLinkFetchStub(5);
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => u.includes("$skiptoken=PAGE2")),
    true,
    "expected the @odata.nextLink page to be followed (nextLink branch exercised)",
  );
  assert.equal(
    calls.some((u) => u.includes("$skip=")),
    false,
    "the $skip/$top walker must NOT run when @odata.nextLink is present",
  );
  assert.equal(
    calls.some((u) => !u.includes("$count=true") && !u.includes("$skiptoken=PAGE2")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  assert.equal(result.onixIndexComplete, false, "nextLink chain ending early must surface onixIndexComplete=false");
  assert.equal(result.onixIndexRecordCount, 2, "onixIndexRecordCount must be the cards collected across the nextLink chain (2)");
  assert.equal(result.onixIndexExpectedCount, 5, "onixIndexExpectedCount must be the @odata.count (5)");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ incomplete nextLink chain → onixIndexComplete=false, recordCount=2, expectedCount=5");

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
