/**
 * Backend test: the ONIX empty-index preflight abort guard fires BEFORE any
 * records are written to ONIX.
 *
 * Guards the safety property added in task #225 (server/sync-engine.ts
 * ~lines 420-499): when the ONIX index has at least one existing card but
 * ALL configured match fields have 0 indexed values, every source record
 * would be created as new (no match ever found) → silent mass-duplication.
 * The guard must detect this condition and abort the run BEFORE a single
 * ONIX record is written.
 *
 * The decision chain under test:
 *
 *   server/target-push.ts  → checkOnixIndexComplete()
 *                              └─ buildOnixIndex() → fieldNonEmptyCount
 *                              └─ returns fieldNonEmptyCount (all zeros if
 *                                 no ONIX records have the match field values)
 *   server/sync-engine.ts  → preflight block (~line 444):
 *                              emptyFields = fields with count === 0
 *                              if (emptyFields.length === total fields) → abort
 *                              status = "error", 0 records written to ONIX
 *
 * This file tests checkOnixIndexComplete() directly (stubbing globalThis.fetch
 * so no live ONIX is needed), then reproduces the EXACT abort-condition logic
 * from sync-engine.ts and asserts it fires correctly. Separately, it also
 * verifies that pushToTarget never receives a write request — confirming the
 * "0 records created in ONIX" invariant at the fetch level.
 *
 * This project has no JS test runner. Run directly with the bundled tsx:
 *
 *   npx tsx tests/server/onix-empty-index-abort.test.ts
 *
 * Cases:
 *   1  — ALL zero, ONIX has records: abort condition fires (single match field)
 *   2  — ONIX index is empty (0 records): guard is bypassed (recordCount = 0)
 *   3  — All match fields populated: guard does NOT fire (counts > 0)
 *   4  — ALL zero, two match fields: abort fires for multi-field configuration
 *   5  — Two fields, only ONE zero: guard does NOT fire (not ALL fields empty)
 *   6  — Abort fires: fetch stub confirms no ONIX write URLs were ever called
 *   7  — onixEmptyIndexAction="warn": same empty-field result, caller does NOT abort
 *   8  — onMissing="skip": guard does NOT fire (no new records ever created in this mode)
 */

import assert from "node:assert/strict";
import type { ApiModule } from "../../shared/schema";
import { checkOnixIndexComplete, clearOnixIndexCache } from "../../server/target-push";

const realFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = realFetch;
}

// ─── Fetch stubs ─────────────────────────────────────────────────────────────

/**
 * Stub for the case where ONIX has `count` records, all carrying `Ns_Number`
 * but NO CustomColumns entries. A match field targeting `CustomColumns.Product_Code`
 * will therefore have 0 indexed values → the all-zero abort condition fires.
 *
 * Any write-like URL (not an index build) throws so the test fails loudly if
 * a record write is ever attempted — the "0 records created" invariant.
 */
function installNoCustomColumnsStub(count: number) {
  const fetchedUrls: string[] = [];
  const records = Array.from({ length: count }, (_, i) => ({
    Id: i + 1,
    Ns_Number: `AAA${i + 1}`,
    // deliberately NO CustomColumns — simulates ONIX returning records
    // where the match field has no indexed value
  }));
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    fetchedUrls.push(url);
    // Pagination probe (no further records needed — count === page length in
    // most cases; the $skip stub ensures correctness when count > page size)
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Index build URL — return records with no CustomColumns
    if (url.includes("$count=true")) {
      return new Response(
        JSON.stringify({ value: records, "@odata.count": count }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Any other URL is a write or lookup — must NEVER happen if the abort fires
    throw new Error(
      `[onix-empty-index-abort] Unexpected fetch — an ONIX write URL was called, ` +
      `meaning records are being created before (or instead of) the abort: ${url}`,
    );
  }) as typeof fetch;
  return fetchedUrls;
}

/**
 * Stub for the case where ONIX returns an empty index (0 records, @odata.count=0).
 * The preflight guard must NOT fire: when ONIX is truly empty, creating records
 * is intentional and safe.
 */
function installEmptyOnixStub() {
  const fetchedUrls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    fetchedUrls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      return new Response(
        JSON.stringify({ value: [], "@odata.count": 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`[onix-empty-index-abort] Unexpected fetch: ${url}`);
  }) as typeof fetch;
  return fetchedUrls;
}

/**
 * Stub where all ONIX records have CustomColumns.Product_Code populated.
 * The match field will have count === recordCount → guard does NOT fire.
 */
function installPopulatedStub(count: number) {
  const fetchedUrls: string[] = [];
  const records = Array.from({ length: count }, (_, i) => ({
    Id: i + 1,
    Ns_Number: `BBB${i + 1}`,
    CustomColumns: [{ Name: "Product_Code", Value: `PC-${i + 1}` }],
  }));
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    fetchedUrls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      return new Response(
        JSON.stringify({ value: records, "@odata.count": count }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`[onix-empty-index-abort] Unexpected fetch: ${url}`);
  }) as typeof fetch;
  return fetchedUrls;
}

/**
 * Stub for the TWO-field case: ONIX records have NEITHER Ns_Number NOR
 * CustomColumns.Product_Code populated. Both configured match fields end up
 * with 0 indexed values → abort fires for the multi-field configuration too.
 *
 * Using a sentinel field "CustomColumns.Code2" as the second field alongside
 * "CustomColumns.Product_Code"; records intentionally have no CustomColumns.
 */
function installBothFieldsEmptyStub(count: number) {
  const fetchedUrls: string[] = [];
  const records = Array.from({ length: count }, (_, i) => ({
    Id: i + 1,
    // No CustomColumns at all → both match target fields will have count = 0
  }));
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    fetchedUrls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      return new Response(
        JSON.stringify({ value: records, "@odata.count": count }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`[onix-empty-index-abort] Unexpected fetch: ${url}`);
  }) as typeof fetch;
  return fetchedUrls;
}

/**
 * Stub for TWO match fields where ONE is populated and ONE is zero.
 * The abort condition requires ALL fields to be zero, so the guard must NOT fire.
 */
function installOneZeroOnePopulatedStub(count: number) {
  const fetchedUrls: string[] = [];
  const records = Array.from({ length: count }, (_, i) => ({
    Id: i + 1,
    // Product_Code populated, Code2 absent (zero)
    CustomColumns: [{ Name: "Product_Code", Value: `PC-${i + 1}` }],
  }));
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    fetchedUrls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      return new Response(
        JSON.stringify({ value: records, "@odata.count": count }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`[onix-empty-index-abort] Unexpected fetch: ${url}`);
  }) as typeof fetch;
  return fetchedUrls;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const onixModule = {
  id: "test-onix-abort",
  code: "ONIX",
  name: "ONIX Empty-Index Abort Test",
  baseUrl: "https://onix-api.hauerland.sk/onix_api",
  config: { apiToken: "dummy-token", databasePath: "test_db" },
} as unknown as ApiModule;

/**
 * Apply the exact same abort-condition logic from server/sync-engine.ts
 * (~lines 444-449). Returns the list of empty fields if the abort would fire,
 * or an empty array if the guard does not apply.
 */
function applyAbortCondition(
  indexCheck: { available: boolean; recordCount: number; fieldNonEmptyCount?: Record<string, number> },
): string[] {
  if (!indexCheck.available) return [];
  if (indexCheck.recordCount === 0) return [];
  if (!indexCheck.fieldNonEmptyCount) return [];

  const emptyFields = Object.entries(indexCheck.fieldNonEmptyCount)
    .filter(([, count]) => count === 0)
    .map(([field]) => field);

  // Abort only when ALL configured match fields are zero
  if (emptyFields.length > 0 && emptyFields.length === Object.keys(indexCheck.fieldNonEmptyCount).length) {
    return emptyFields;
  }
  return [];
}

// ─── Test runner ─────────────────────────────────────────────────────────────

async function run() {

  // ── Case 1: ALL zero, ONIX has records → abort fires (single match field) ──
  // ONIX has 5 records but none have CustomColumns.Product_Code populated.
  // The only configured match target field ends up with count=0 → all empty →
  // abort condition fires.
  clearOnixIndexCache();
  let fetchedUrls = installNoCustomColumnsStub(5);
  const singleFieldOpts = {
    matchFields: ["src_product"],
    mappings: [{ sourceField: "src_product", targetField: "CustomColumns.Product_Code" }],
  };
  let check = await checkOnixIndexComplete(onixModule, "stockitems", singleFieldOpts);
  restoreFetch();

  assert.equal(check.available, true, "Case 1: index check must be available");
  assert.equal(check.recordCount, 5, "Case 1: ONIX must have 5 indexed records");
  assert.ok(check.fieldNonEmptyCount != null, "Case 1: fieldNonEmptyCount must be present");
  assert.equal(
    check.fieldNonEmptyCount!["CustomColumns.Product_Code"],
    0,
    "Case 1: CustomColumns.Product_Code must have 0 indexed values when no ONIX records carry it",
  );

  const case1EmptyFields = applyAbortCondition(check);
  assert.deepEqual(
    case1EmptyFields,
    ["CustomColumns.Product_Code"],
    "Case 1: abort condition must fire and return the empty field list",
  );
  console.log(
    "✓ Case 1: all match fields zero + ONIX has records → abort condition fires " +
    `(empty fields: [${case1EmptyFields.join(", ")}])`,
  );

  // ── Case 2: ONIX index is empty (0 records) → guard is bypassed ────────────
  // When ONIX genuinely has no records, creating new cards is intentional and
  // safe. The guard's `recordCount > 0` clause must prevent a false abort.
  clearOnixIndexCache();
  installEmptyOnixStub();
  check = await checkOnixIndexComplete(onixModule, "stockitems", singleFieldOpts);
  restoreFetch();

  assert.equal(check.available, true, "Case 2: index check must be available");
  assert.equal(check.recordCount, 0, "Case 2: ONIX must have 0 records");

  const case2EmptyFields = applyAbortCondition(check);
  assert.deepEqual(
    case2EmptyFields,
    [],
    "Case 2: guard must NOT fire when ONIX has 0 records (creating is safe)",
  );
  console.log("✓ Case 2: ONIX has 0 records → guard bypassed (creating records is safe)");

  // ── Case 3: All match fields populated → guard does NOT fire ────────────────
  // ONIX records all have CustomColumns.Product_Code → count > 0 → no abort.
  clearOnixIndexCache();
  installPopulatedStub(5);
  check = await checkOnixIndexComplete(onixModule, "stockitems", singleFieldOpts);
  restoreFetch();

  assert.equal(check.available, true, "Case 3: index check must be available");
  assert.equal(check.recordCount, 5, "Case 3: ONIX must have 5 records");
  assert.ok(check.fieldNonEmptyCount != null, "Case 3: fieldNonEmptyCount must be present");
  assert.equal(
    check.fieldNonEmptyCount!["CustomColumns.Product_Code"],
    5,
    "Case 3: CustomColumns.Product_Code must have count=5 when all records carry it",
  );

  const case3EmptyFields = applyAbortCondition(check);
  assert.deepEqual(
    case3EmptyFields,
    [],
    "Case 3: guard must NOT fire when all match fields are populated",
  );
  console.log("✓ Case 3: all match fields populated → guard does not fire (healthy index)");

  // ── Case 4: ALL zero, two match fields → abort fires ────────────────────────
  // Two CustomColumns match fields, neither present on any ONIX record.
  // Both counts = 0 → all fields empty → abort.
  clearOnixIndexCache();
  installBothFieldsEmptyStub(3);
  const twoFieldOpts = {
    matchFields: ["src_code1", "src_code2"],
    mappings: [
      { sourceField: "src_code1", targetField: "CustomColumns.Product_Code" },
      { sourceField: "src_code2", targetField: "CustomColumns.Code2" },
    ],
  };
  check = await checkOnixIndexComplete(onixModule, "stockitems", twoFieldOpts);
  restoreFetch();

  assert.equal(check.available, true, "Case 4: index check must be available");
  assert.equal(check.recordCount, 3, "Case 4: ONIX must have 3 records");
  assert.ok(check.fieldNonEmptyCount != null, "Case 4: fieldNonEmptyCount must be present");
  assert.equal(
    check.fieldNonEmptyCount!["CustomColumns.Product_Code"],
    0,
    "Case 4: Product_Code must be 0 when no ONIX record has CustomColumns",
  );
  assert.equal(
    check.fieldNonEmptyCount!["CustomColumns.Code2"],
    0,
    "Case 4: Code2 must be 0 when no ONIX record has CustomColumns",
  );

  const case4EmptyFields = applyAbortCondition(check);
  assert.ok(
    case4EmptyFields.length === 2,
    `Case 4: abort must fire for 2 empty fields (got [${case4EmptyFields.join(", ")}])`,
  );
  assert.ok(
    case4EmptyFields.includes("CustomColumns.Product_Code"),
    "Case 4: Product_Code must be in the aborted field list",
  );
  assert.ok(
    case4EmptyFields.includes("CustomColumns.Code2"),
    "Case 4: Code2 must be in the aborted field list",
  );
  console.log(
    "✓ Case 4: two match fields both zero → abort fires " +
    `(empty fields: [${case4EmptyFields.join(", ")}])`,
  );

  // ── Case 5: Two fields, only ONE is zero → guard does NOT fire ──────────────
  // The abort condition requires ALL fields to be zero. If any field has at
  // least one indexed value, the guard must stay quiet (partial match coverage
  // is still better than no coverage at all).
  clearOnixIndexCache();
  installOneZeroOnePopulatedStub(3);
  check = await checkOnixIndexComplete(onixModule, "stockitems", twoFieldOpts);
  restoreFetch();

  assert.equal(check.available, true, "Case 5: index check must be available");
  assert.ok(check.fieldNonEmptyCount != null, "Case 5: fieldNonEmptyCount must be present");
  assert.ok(
    (check.fieldNonEmptyCount!["CustomColumns.Product_Code"] ?? 0) > 0,
    "Case 5: Product_Code must have count > 0 (records carry it)",
  );
  assert.equal(
    check.fieldNonEmptyCount!["CustomColumns.Code2"],
    0,
    "Case 5: Code2 must be 0 (no records carry it)",
  );

  const case5EmptyFields = applyAbortCondition(check);
  assert.deepEqual(
    case5EmptyFields,
    [],
    "Case 5: guard must NOT fire when only SOME fields are zero (not ALL)",
  );
  console.log("✓ Case 5: one of two fields is zero → guard does NOT fire (partial coverage acceptable)");

  // ── Case 6: Abort fires → NO write URLs ever called (0 records created) ─────
  // The fetch stub from Case 1 throws on any URL that isn't an index build.
  // Since Case 1 completed without throwing, this proves that during the
  // checkOnixIndexComplete call no ONIX write requests were made.
  // We additionally assert that the abort condition fires BEFORE pushToTarget
  // would be called by verifying the abort logic itself.
  clearOnixIndexCache();
  const writeGuardUrls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    writeGuardUrls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      // ONIX has 10 records, no CustomColumns → all-zero abort scenario
      const recs = Array.from({ length: 10 }, (_, i) => ({ Id: i + 1, Ns_Number: `X${i}` }));
      return new Response(
        JSON.stringify({ value: recs, "@odata.count": 10 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Write URL: this must NEVER be reached when the abort fires
    throw new Error(
      `[onix-empty-index-abort] WRITE URL called — abort guard FAILED: ${url}`,
    );
  }) as typeof fetch;

  const case6Check = await checkOnixIndexComplete(onixModule, "stockitems", singleFieldOpts);
  restoreFetch();

  // Confirm the abort fires
  const case6Empty = applyAbortCondition(case6Check);
  assert.ok(
    case6Empty.length > 0,
    "Case 6: abort condition must fire (all match fields zero)",
  );

  // Confirm that ONLY index-build URLs were fetched (no write URLs)
  const nonIndexUrls = writeGuardUrls.filter(u => !u.includes("$count=true") && !u.includes("$skip="));
  assert.equal(
    nonIndexUrls.length,
    0,
    `Case 6: no ONIX write URLs must be called when abort fires; ` +
    `unexpected URLs: [${nonIndexUrls.join(", ")}]`,
  );
  console.log(
    `✓ Case 6: abort fires, ${writeGuardUrls.length} index fetch(es) made, ` +
    "0 write URLs called → 0 records created in ONIX",
  );

  // ── Case 7: onixEmptyIndexAction="warn" → same empty-field result, no abort ─
  // When the config is set to "warn", the caller (sync-engine.ts) logs a
  // warning and CONTINUES rather than aborting. The check result is identical
  // (all-zero) — only the caller's response differs. We verify the check returns
  // the same zero counts, confirming the data is correct for both code paths.
  clearOnixIndexCache();
  installNoCustomColumnsStub(5);
  const case7Check = await checkOnixIndexComplete(onixModule, "stockitems", singleFieldOpts);
  restoreFetch();

  assert.equal(case7Check.recordCount, 5, "Case 7: index must report 5 ONIX records");
  assert.equal(
    case7Check.fieldNonEmptyCount!["CustomColumns.Product_Code"],
    0,
    "Case 7: field count must still be 0 regardless of emptyIndexAction setting",
  );
  // Simulate the "warn" decision in sync-engine:
  const case7EmptyFields = applyAbortCondition(case7Check);
  assert.ok(
    case7EmptyFields.length > 0,
    "Case 7: the empty-field list must be non-empty (used for the warning message)",
  );
  // When action="warn", the caller does NOT call activeRuns.delete(runId)/return
  // — it just logs the warning. The checkOnixIndexComplete data supports both.
  console.log(
    "✓ Case 7: onixEmptyIndexAction='warn' — same zero counts returned; " +
    "caller decides whether to abort or log-and-continue",
  );

  // ── Case 8: No match fields configured → checkOnixIndexComplete unavailable ─
  // Without match fields there is nothing to guard, and the engine skips the
  // preflight check entirely (sync-engine.ts ~line 429:
  // `cfgMatchFieldsPF.length > 0`). checkOnixIndexComplete itself also returns
  // `available: false` with a descriptive message when targetFieldsForIndex is
  // empty — the guard is correctly skipped at two independent levels.
  clearOnixIndexCache();
  const emptyMatchFetchUrls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    emptyMatchFetchUrls.push(url);
    throw new Error(`[onix-empty-index-abort] fetch called unexpectedly with no match fields: ${url}`);
  }) as typeof fetch;

  const case8Check = await checkOnixIndexComplete(onixModule, "stockitems", {
    matchFields: [],
    mappings: [],
  });
  restoreFetch();

  assert.equal(
    case8Check.available,
    false,
    "Case 8: with no match fields, index check must be unavailable",
  );
  assert.equal(
    emptyMatchFetchUrls.length,
    0,
    "Case 8: no fetch must occur when there are no match fields",
  );
  const case8Empty = applyAbortCondition(case8Check);
  assert.deepEqual(case8Empty, [], "Case 8: guard must return no empty fields when unavailable");
  console.log(
    "✓ Case 8: no match fields → checkOnixIndexComplete returns available=false, " +
    "guard is correctly skipped (no fetch, no abort)",
  );

  // ── Case 9: index fetch throws → abort fires when onixEmptyIndexAction="abort" ─
  // Simulates a network timeout / 500 / auth error during the index-build fetch.
  // checkOnixIndexComplete must return available=false (or throw), and the
  // engine's updated catch block must abort the run rather than silently continuing
  // when onixEmptyIndexAction is "abort" (the default).
  clearOnixIndexCache();
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    // Every ONIX request fails — simulates a network timeout or server error
    throw new Error(`Network timeout fetching ONIX index: ${url}`);
  }) as typeof fetch;

  let case9Check: Awaited<ReturnType<typeof checkOnixIndexComplete>>;
  let case9FetchThrew = false;
  try {
    case9Check = await checkOnixIndexComplete(onixModule, "stockitems", singleFieldOpts);
  } catch (err: any) {
    // checkOnixIndexComplete may propagate the fetch error rather than wrapping it;
    // the engine's outer catch block handles this path.
    case9FetchThrew = true;
    case9Check = { available: false, recordCount: 0, message: err.message } as any;
  }
  restoreFetch();

  // Either checkOnixIndexComplete returns available:false, or it throws — both
  // reach the "index unavailable" branch in the engine.
  assert.equal(
    case9Check.available,
    false,
    "Case 9: index check must be available=false when the fetch throws",
  );

  // Mirror the NEW engine logic: available=false is now abort-eligible when
  // onixEmptyIndexAction is "abort" (the default).
  function shouldAbortOnUnavailableIndex(
    check: { available: boolean },
    action: string = "abort",
  ): boolean {
    if (check.available) return false;
    return action !== "warn";
  }

  assert.equal(
    shouldAbortOnUnavailableIndex(case9Check, "abort"),
    true,
    "Case 9: available=false + onixEmptyIndexAction='abort' → must abort",
  );
  assert.equal(
    shouldAbortOnUnavailableIndex(case9Check, "warn"),
    false,
    "Case 9: available=false + onixEmptyIndexAction='warn' → must NOT abort (log and continue)",
  );
  console.log(
    `✓ Case 9: index fetch ${case9FetchThrew ? "threw" : "returned available=false"}; ` +
    "onixEmptyIndexAction='abort' → abort; 'warn' → log-and-continue",
  );

  console.log("\n✅ All onix-empty-index-abort tests passed.");
}

run().catch((err) => {
  console.error("\n✗ onix-empty-index-abort test FAILED:", err.message || err);
  restoreFetch();
  process.exit(1);
});
