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
 * Case 3 exercises the `@odata.nextLink` page-walking branch in `buildOnixIndex`
 * (server/target-push.ts ~lines 721-737). A real OData v4 first response carries BOTH
 * `@odata.count` (the true total) AND `@odata.nextLink` (the URL of page 2). If that
 * nextLink chain ends early — a page returns no further `@odata.nextLink` while fewer
 * cards than `@odata.count` were collected — the index is just as incomplete as the
 * `$skip` case, and `onixIndexComplete=false` must still be surfaced. (The completeness
 * check at ~line 890 needs a non-null `@odata.count` to detect a short fetch, so the
 * first page MUST include it; nextLink alone carries no notion of "expected", so an
 * absent count would be indistinguishable from complete.)
 *
 * Cases 4 & 5 exercise the THIRD pagination branch in `buildOnixIndex`: the non-OData
 * `$skip/$top` fallback (server/target-push.ts ~lines 762-806), reached when the first page
 * carries NEITHER `@odata.count` NOR `@odata.nextLink` but is non-empty. Case 4 models an
 * ONIX endpoint that IGNORES `$skip` and re-serves the same first page — the walker's
 * "same first record ID" guard must stop after one probe so the duplicate page is neither
 * looped on nor double-counted (the core duplicate-creation risk this family guards). Case 5
 * models an endpoint that DOES honour paging (full page → short page) and asserts every
 * record across the walk is indexed. Because the fallback never sees an `@odata.count`, the
 * expected count is unknowable, so `onixIndexComplete` stays true and `onixIndexExpectedCount`
 * is null in both — the duplicate-risk signal here is correct termination, not a count mismatch.
 *
 * Cases 6-9 cover the FAILURE paths of both OData pagination loops: a follow-up page that
 * fails mid-chain. Both loops `break` on a non-200 response (server/target-push.ts
 * ~lines 730 / 751) and on a thrown fetch error (~lines 735 / 756), keeping whatever
 * was collected so far. Because the first page already carried `@odata.count`, that
 * partial result MUST still surface `onixIndexComplete=false` with the partial
 * `recordCount` and the `expectedCount` from `@odata.count` — a regression that swallows
 * the partial fetch and reports the index as complete would hide duplicate-creation risk:
 *   - Case 6: nextLink chain, page 2 responds HTTP 500.
 *   - Case 7: nextLink chain, page 2 fetch throws.
 *   - Case 8: $skip/$top walker, the $skip page responds HTTP 500.
 *   - Case 9: $skip/$top walker, the $skip page fetch throws.
 *
 * Case 10 covers the FAILURE path of the non-OData `$skip/$top` fallback walker (no
 * `@odata.count`): the follow-up `$skip` page responds HTTP 500. The fallback's HTTP-error
 * guard (server/target-push.ts ~line 784) must set `pageFailed` and break after a single
 * probe, leaving ONLY the first-page records indexed — no loop, no throw, no double-counting.
 * Because no `@odata.count` was ever served the expected total is unknowable, so the index
 * stays `onixIndexComplete=true` with `onixIndexExpectedCount=null` (unlike Cases 6-9): the
 * duplicate-risk signal here is correct termination, not a count mismatch.
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

/**
 * Install a fetch stub for the THIRD pagination branch in `buildOnixIndex`: the
 * non-OData `$skip/$top` fallback (server/target-push.ts ~lines 762-806), reached when
 * the first page carries NEITHER `@odata.count` NOR `@odata.nextLink` but is non-empty.
 *
 * This variant models an ONIX endpoint that IGNORES `$skip` and re-serves the same first
 * page forever. The fallback walker compares the follow-up page's first record ID to the
 * first page's; when they match it concludes "single-response endpoint" and stops, so the
 * SAME records are never pushed twice. We re-serve the identical first page on every
 * `$skip=` request — a naive walker would loop/duplicate; the guard must stop after one.
 */
function installFallbackIgnoredSkipStub() {
  const calls: string[] = [];
  const firstPage = [
    { Id: 1, Ns_Number: "AAA" },
    { Id: 2, Ns_Number: "BBB" },
  ];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    // NB: the fallback page URL is `...?$count=true&$skip=N&$top=M`, so it ALSO contains
    // `$count=true` — the `$skip=` check MUST come first to classify it correctly.
    if (url.includes("$skip=")) {
      // ONIX ignores $skip: re-serve the identical first page (same first record Id=1).
      return new Response(JSON.stringify({ value: firstPage }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // First index page: two cards, NO @odata.count, NO @odata.nextLink → fallback branch.
    if (url.includes("$count=true")) {
      return new Response(JSON.stringify({ value: firstPage }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in test (no writes expected): ${url}`);
  }) as typeof fetch;
  return calls;
}

/**
 * Install a fetch stub for the SAME `$skip/$top` fallback branch, but modelling an ONIX
 * endpoint that DOES honour paging: the first page (no `@odata.count`, no `@odata.nextLink`)
 * is followed by a full-size page, then a short page that ends the walk. The walker must
 * collect every record across all pages so the index is built from the FULL set.
 *
 * Page plan (PAGE_SIZE = first page length = 2):
 *   first page  → Id 1,2 (no count/nextLink)
 *   $skip=2     → Id 3,4 (full page → keep going)
 *   $skip=4     → Id 5   (short page → last page, stop)
 * Total indexed = 5. Any `$skip` beyond 4 means the walker failed to stop, so we throw.
 */
function installFallbackGrowingPagesStub() {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    if (url.includes("$skip=")) {
      const skip = Number(url.match(/\$skip=(\d+)/)?.[1] ?? "-1");
      if (skip === 2) {
        // Full-size page (length === PAGE_SIZE) → walker continues.
        return new Response(
          JSON.stringify({ value: [{ Id: 3, Ns_Number: "CCC" }, { Id: 4, Ns_Number: "DDD" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (skip === 4) {
        // Short page (length < PAGE_SIZE) → last page, walker stops after pushing it.
        return new Response(JSON.stringify({ value: [{ Id: 5, Ns_Number: "EEE" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected $skip=${skip} — walker should have stopped at the short page`);
    }
    // First index page: two cards, NO @odata.count, NO @odata.nextLink → fallback branch.
    if (url.includes("$count=true")) {
      return new Response(
        JSON.stringify({ value: [{ Id: 1, Ns_Number: "AAA" }, { Id: 2, Ns_Number: "BBB" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch in test (no writes expected): ${url}`);
  }) as typeof fetch;
  return calls;
}

/**
 * Install a fetch stub that paginates via `@odata.nextLink` but whose page 2 FAILS
 * mid-chain — either with a non-200 response (`mode: "http500"`) or a thrown fetch
 * error (`mode: "throw"`). The first page still returns ONE card plus the real total
 * via `@odata.count`, so when the nextLink loop breaks on the failure the index is
 * INCOMPLETE (1 collected < `@odata.count`) and must surface `onixIndexComplete=false`.
 * Any `$skip=` URL means the wrong branch ran, so we throw on it to fail loudly.
 */
function installNextLinkFailFetchStub(odataCount: number, mode: "http500" | "throw") {
  const calls: string[] = [];
  const nextLinkUrl =
    "https://onix-api.hauerland.sk/ONIX_API/api/v1/stockitems?$skiptoken=PAGE2";
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    if (url.includes("$skip=")) {
      throw new Error(`Unexpected $skip fetch — nextLink branch should have been used: ${url}`);
    }
    // Page 2 (followed via @odata.nextLink) FAILS mid-chain.
    if (url.includes("$skiptoken=PAGE2")) {
      if (mode === "throw") {
        throw new Error("simulated network failure on @odata.nextLink page 2");
      }
      return new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
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

/**
 * Install a fetch stub that paginates via the `$skip`/`$top` walker (first page carries
 * `@odata.count` but NO `@odata.nextLink`) whose follow-up `$skip` page FAILS mid-chain —
 * either with a non-200 response (`mode: "http500"`) or a thrown fetch error
 * (`mode: "throw"`). The first page returns ONE card plus the real total, so when the
 * `$skip` loop breaks on the failure the index is INCOMPLETE (1 collected < `@odata.count`)
 * and must surface `onixIndexComplete=false`.
 */
function installSkipFailFetchStub(odataCount: number, mode: "http500" | "throw") {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    // Follow-up $skip page FAILS mid-chain.
    if (url.includes("$skip=")) {
      if (mode === "throw") {
        throw new Error("simulated network failure on $skip page");
      }
      return new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // First index page: one card + the real total (@odata.count), NO nextLink → $skip branch.
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
    throw new Error(`Unexpected fetch in test (no writes expected): ${url}`);
  }) as typeof fetch;
  return calls;
}

/**
 * Install a fetch stub for the non-OData `$skip/$top` fallback branch, modelling a TRANSIENT
 * ONIX failure on the follow-up page: the first page (no `@odata.count`, no `@odata.nextLink`,
 * non-empty) triggers the fallback walker, and the first `$skip` probe returns HTTP 500.
 *
 * The walker's HTTP-error guard (server/target-push.ts ~line 784) must set `pageFailed` and
 * break, leaving ONLY the first-page records indexed — no loop, no throw, no double-counting.
 * A regression that ignored the bad status would turn a transient error into a partial/looping
 * index build, feeding the duplicate-creation risk this family guards against. We return HTTP
 * 500 on EVERY `$skip=` request so a walker that failed to break would keep probing (and the
 * single-probe assertion below would catch it).
 */
function installFallbackPageErrorStub() {
  const calls: string[] = [];
  const firstPage = [
    { Id: 1, Ns_Number: "AAA" },
    { Id: 2, Ns_Number: "BBB" },
  ];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    // Follow-up page: transient server error. The `$skip=` check MUST come first because the
    // fallback page URL is `...?$count=true&$skip=N&$top=M` and also contains `$count=true`.
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // First index page: two cards, NO @odata.count, NO @odata.nextLink → fallback branch.
    if (url.includes("$count=true")) {
      return new Response(JSON.stringify({ value: firstPage }), {
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

/**
 * Capture everything written to `console.log` / `console.warn` while `pushToTarget`
 * runs so the test can assert WHICH no-match classification path executed. The
 * consumer-side guard is observable here: `classifyNoMatch` (server/target-push.ts
 * ~line 1168) emits `PRÍČINA: neúplný ONIX index …` (the CAUTIOUS, cause-6 path) when
 * the index is known-incomplete, versus `PRÍČINA: … vytvorí sa nový záznam` (the
 * CONFIDENT create path) when the index is complete. Restore the originals via the
 * returned `restore()` immediately after the call so the test's own logs are unaffected.
 */
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

  // --- Case 4: $skip/$top FALLBACK where ONIX ignores $skip (single-response endpoint) ---
  // First page has no @odata.count and no @odata.nextLink, so the fallback walker runs and
  // probes with $skip. ONIX re-serves the SAME first page (first record Id matches), which the
  // walker must detect and stop on — WITHOUT looping or double-counting the re-served records.
  clearOnixIndexCache();
  calls = installFallbackIgnoredSkipStub();
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  const skipProbes = calls.filter((u) => u.includes("$skip=")).length;
  assert.equal(
    skipProbes,
    1,
    `ignored-$skip detection must stop after a single probe, not loop (saw ${skipProbes} $skip fetches)`,
  );
  assert.equal(
    calls.some((u) => !u.includes("$count=true")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  // No @odata.count was served, so completeness is unknowable → treated as complete (not flagged).
  assert.equal(result.onixIndexComplete, true, "single-response fallback must surface onixIndexComplete=true");
  assert.equal(
    result.onixIndexRecordCount,
    2,
    "the re-served duplicate page must NOT be counted — index holds only the original 2 cards",
  );
  assert.equal(result.onixIndexExpectedCount, null, "no @odata.count served → onixIndexExpectedCount must be null");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ fallback ignored-$skip → stops after 1 probe, onixIndexComplete=true, recordCount=2 (no duplicates)");

  // --- Case 5: $skip/$top FALLBACK where ONIX honours paging (full set indexed) ---
  // First page (no count/nextLink) → full page → short page ends the walk. The walker must
  // collect every record across all pages so the index reflects the FULL set (5 cards).
  clearOnixIndexCache();
  calls = installFallbackGrowingPagesStub();
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => /\$skip=2(\b|&)/.test(u)),
    true,
    "expected the fallback walker to fetch the second page ($skip=2)",
  );
  assert.equal(
    calls.some((u) => /\$skip=4(\b|&)/.test(u)),
    true,
    "expected the fallback walker to fetch the third (short) page ($skip=4)",
  );
  assert.equal(
    calls.some((u) => !u.includes("$count=true")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  assert.equal(result.onixIndexComplete, true, "paged fallback (no @odata.count) must surface onixIndexComplete=true");
  assert.equal(
    result.onixIndexRecordCount,
    5,
    "all cards across the fallback page walk must be indexed (2 + 2 + 1 = 5)",
  );
  assert.equal(result.onixIndexExpectedCount, null, "no @odata.count served → onixIndexExpectedCount must be null");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ fallback paged walk → onixIndexComplete=true, recordCount=5 (full set indexed)");

  // --- Case 6: INCOMPLETE index — nextLink page 2 responds HTTP 500 ---
  // First page (count=5) + nextLink → page 2 fails HTTP 500 → loop breaks with 1 card < 5.
  clearOnixIndexCache();
  calls = installNextLinkFailFetchStub(5, "http500");
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => u.includes("$skiptoken=PAGE2")),
    true,
    "expected the @odata.nextLink page to be attempted before it failed",
  );
  assert.equal(
    calls.some((u) => !u.includes("$count=true") && !u.includes("$skiptoken=PAGE2")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  assert.equal(result.onixIndexComplete, false, "nextLink HTTP 500 mid-chain must surface onixIndexComplete=false");
  assert.equal(result.onixIndexRecordCount, 1, "onixIndexRecordCount must be the partial cards collected before the failure (1)");
  assert.equal(result.onixIndexExpectedCount, 5, "onixIndexExpectedCount must be the @odata.count (5)");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ nextLink page HTTP 500 → onixIndexComplete=false, recordCount=1, expectedCount=5");

  // --- Case 7: INCOMPLETE index — nextLink page 2 fetch throws ---
  // First page (count=5) + nextLink → page 2 fetch throws → loop breaks with 1 card < 5.
  clearOnixIndexCache();
  calls = installNextLinkFailFetchStub(5, "throw");
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => u.includes("$skiptoken=PAGE2")),
    true,
    "expected the @odata.nextLink page to be attempted before it threw",
  );
  assert.equal(result.onixIndexComplete, false, "nextLink thrown error mid-chain must surface onixIndexComplete=false");
  assert.equal(result.onixIndexRecordCount, 1, "onixIndexRecordCount must be the partial cards collected before the throw (1)");
  assert.equal(result.onixIndexExpectedCount, 5, "onixIndexExpectedCount must be the @odata.count (5)");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ nextLink page throws → onixIndexComplete=false, recordCount=1, expectedCount=5");

  // --- Case 8: INCOMPLETE index — $skip page responds HTTP 500 ---
  // First page (count=5, no nextLink) → $skip page fails HTTP 500 → loop breaks with 1 card < 5.
  clearOnixIndexCache();
  calls = installSkipFailFetchStub(5, "http500");
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => u.includes("$skip=")),
    true,
    "expected the $skip/$top walker to be attempted before it failed",
  );
  assert.equal(
    calls.some((u) => !u.includes("$count=true") && !u.includes("$skip=")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  assert.equal(result.onixIndexComplete, false, "$skip HTTP 500 mid-chain must surface onixIndexComplete=false");
  assert.equal(result.onixIndexRecordCount, 1, "onixIndexRecordCount must be the partial cards collected before the failure (1)");
  assert.equal(result.onixIndexExpectedCount, 5, "onixIndexExpectedCount must be the @odata.count (5)");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ $skip page HTTP 500 → onixIndexComplete=false, recordCount=1, expectedCount=5");

  // --- Case 9: INCOMPLETE index — $skip page fetch throws ---
  // First page (count=5, no nextLink) → $skip page fetch throws → loop breaks with 1 card < 5.
  clearOnixIndexCache();
  calls = installSkipFailFetchStub(5, "throw");
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.equal(
    calls.some((u) => u.includes("$skip=")),
    true,
    "expected the $skip/$top walker to be attempted before it threw",
  );
  assert.equal(result.onixIndexComplete, false, "$skip thrown error mid-chain must surface onixIndexComplete=false");
  assert.equal(result.onixIndexRecordCount, 1, "onixIndexRecordCount must be the partial cards collected before the throw (1)");
  assert.equal(result.onixIndexExpectedCount, 5, "onixIndexExpectedCount must be the @odata.count (5)");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ $skip page throws → onixIndexComplete=false, recordCount=1, expectedCount=5");

  // --- Case 10: $skip/$top FALLBACK where the follow-up page returns HTTP 500 ---
  // First page (no count/nextLink) triggers the fallback walker; the first $skip probe fails with
  // HTTP 500. The walker's HTTP-error guard must set pageFailed and break, leaving ONLY the
  // first-page records indexed — no loop, no throw, no double-counting of a failed page.
  clearOnixIndexCache();
  calls = installFallbackPageErrorStub();
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  const errProbes = calls.filter((u) => u.includes("$skip=")).length;
  assert.equal(
    errProbes,
    1,
    `HTTP-error guard must stop after a single failed probe, not loop (saw ${errProbes} $skip fetches)`,
  );
  assert.equal(
    calls.some((u) => !u.includes("$count=true")),
    false,
    "expected only ONIX index fetches (no per-record write/lookup; record should be skipped)",
  );
  // No @odata.count was served, so completeness is unknowable → treated as complete (not flagged).
  assert.equal(result.onixIndexComplete, true, "failed-follow-up-page fallback must surface onixIndexComplete=true");
  assert.equal(
    result.onixIndexRecordCount,
    2,
    "the failed page must NOT be counted — index holds only the original 2 first-page cards",
  );
  assert.equal(result.onixIndexExpectedCount, null, "no @odata.count served → onixIndexExpectedCount must be null");
  assert.equal(result.skippedCount, 1, "the unmatched record should be skipped, not created");
  console.log("✓ fallback page HTTP 500 → stops after 1 probe, onixIndexComplete=true, recordCount=2 (no loop/throw)");

  // --- Case 11: CONSUMER guard — AND-match no-match against a KNOWN-INCOMPLETE index ---
  // This is the actual safety payoff the whole completeness chain exists for. The index is
  // incomplete (indexed 1 < @odata.count 5) AND the source value ("ZZZ") is absent from the
  // partial index. The record MUST NOT be blindly created off a possibly-stale "not found":
  //   - NO write/lookup fetch fires (only index fetches) — nothing is created.
  //   - createdCount === 0 and the record is skipped instead.
  //   - The no-match is classified via the CAUTIOUS cause-6 path ("neúplný ONIX index …"),
  //     NOT the CONFIDENT create path ("… vytvorí sa nový záznam"). That classification is
  //     the observable guard: a regression that treats an incomplete-index miss as a
  //     confident "card doesn't exist → create" would re-introduce duplicate-creation risk.
  clearOnixIndexCache();
  calls = installFetchStub(5);
  let cap = captureLogs();
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  cap.restore();
  restoreFetch();

  assert.equal(
    calls.some((u) => !u.includes("$count=true")),
    false,
    "no write/lookup fetch may fire — an incomplete-index AND-match miss must NOT create a card",
  );
  assert.equal(result.createdCount, 0, "incomplete-index AND-match no-match must create ZERO cards");
  assert.equal(result.skippedCount, 1, "the unmatched record must be skipped, not created");
  assert.equal(result.onixIndexComplete, false, "index must be reported incomplete so the cautious path is reachable");
  assert.equal(
    cap.lines.some((l) => l.includes("PRÍČINA:") && l.includes("neúplný ONIX index")),
    true,
    "no-match against an incomplete index must be classified via the CAUTIOUS cause-6 path",
  );
  assert.equal(
    cap.lines.some((l) => l.includes("PRÍČINA:") && l.includes("vytvorí sa nový záznam")),
    false,
    "an incomplete index must NOT take the CONFIDENT create classification",
  );
  console.log("✓ incomplete index + AND-match miss → 0 created, skipped, classified cautiously (no confident create)");

  // --- Case 12: CONTRAST — same config + same absent value, but a COMPLETE index ---
  // Only the index completeness differs (indexed 1 === @odata.count 1). Holding everything
  // else constant proves it is the completeness flag — not merely the absent value — that
  // drives the cautious classification. With a complete index the same miss is classified
  // via the CONFIDENT create path ("… vytvorí sa nový záznam"); under onMissing:"skip" the
  // record is still skipped, so no card is created in EITHER branch (the guard's job is the
  // classification, which downstream onMissing:"create"/"force" configs act on).
  clearOnixIndexCache();
  calls = installFetchStub(1);
  cap = captureLogs();
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  cap.restore();
  restoreFetch();

  assert.equal(result.createdCount, 0, "onMissing:skip still creates no card with a complete index");
  assert.equal(result.skippedCount, 1, "the unmatched record is skipped under onMissing:skip");
  assert.equal(result.onixIndexComplete, true, "index must be reported complete in the contrast case");
  assert.equal(
    cap.lines.some((l) => l.includes("PRÍČINA:") && l.includes("vytvorí sa nový záznam")),
    true,
    "no-match against a COMPLETE index must be classified via the CONFIDENT create path",
  );
  assert.equal(
    cap.lines.some((l) => l.includes("PRÍČINA:") && l.includes("neúplný ONIX index")),
    false,
    "a complete index must NOT take the cautious incomplete-index classification",
  );
  console.log("✓ complete index + same miss → confident create classification (proves completeness drives caution)");

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
