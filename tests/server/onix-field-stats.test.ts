/**
 * Backend test: `pushToTarget` surfaces per-field ONIX index stats
 * (`onixIndexFieldStats`) including zero counts for match fields that have
 * no indexed values.
 *
 * Guards the producer side of the ⚠/✓ per-field display chain (see
 * `tests/ui/onix-field-stats-zero-match.md` for the consumer/UI side):
 *
 *   server/target-push.ts  → PushResult.onixIndexFieldStats
 *   server/sync-engine.ts  → details.onixIndex.fieldStats
 *   client/src/pages/sync-dashboard.tsx → ⚠ / ✓ per field row
 *
 * `onixIndexFieldStats` is built from `onixIndex.fieldNonEmptyCount` — a
 * Map populated during `buildOnixIndex` that counts, per configured match
 * target field, how many indexed ONIX records had a non-empty value for that
 * field. A count of 0 means the field is never populated on ONIX cards and
 * matching will always fail → new cards would be created instead of updating
 * existing ones, risking silent duplicates. The sync-engine aggregates the
 * first available batch's stats into `details.onixIndex.fieldStats`:
 *
 *   sync-engine.ts line ~1056: if (pushResult.onixIndexFieldStats && !onixIndexFieldStats)
 *                                onixIndexFieldStats = pushResult.onixIndexFieldStats;
 *
 *   sync-engine.ts line ~1465: onixIndex: (onixIndexIncomplete || onixIndexFieldStats)
 *                                 ? { ..., fieldStats: onixIndexFieldStats }
 *                                 : undefined
 *
 * This file exercises three cases:
 *   Case 1 — ALL zero: all match fields have 0 indexed values (the worst-case
 *             scenario: every record would be created as new regardless of ONIX
 *             having existing data).
 *   Case 2 — MIXED: some fields populated, some zero (partial index coverage,
 *             still risky for zero-count fields).
 *   Case 3 — ALL populated: all match fields have ≥ 1 indexed values (healthy
 *             index: onixIndexFieldStats still present but no zeroes).
 *
 * This project has no JS test runner. Run this file directly with the bundled tsx:
 *
 *   npx tsx tests/server/onix-field-stats.test.ts
 *
 * It stubs `globalThis.fetch` so it makes NO network calls and needs no live ONIX.
 * All cases use `onMissing: "skip"` so no write fetch ever occurs; the ONLY fetches
 * are the index build (with `?tables=CustomColumns&$count=true` in the URL, since
 * `CustomColumns.Product_Code` is a configured match field).
 */

import assert from "node:assert/strict";
import type { ApiModule } from "../../shared/schema";
import { pushToTarget, clearOnixIndexCache } from "../../server/target-push";

const realFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = realFetch;
}

/**
 * Stubs globalThis.fetch so `buildOnixIndex` sees the provided `indexRecords` as the
 * only ONIX page. Returns `@odata.count` equal to `indexRecords.length` so the index
 * is always COMPLETE (completeness is not under test here; field stats are).
 *
 * Because `CustomColumns.Product_Code` is a configured match field, the index URL
 * contains `?tables=CustomColumns&$count=true`. The stub asserts that and throws on any
 * URL it does not recognise (no write fetches, no pagination, etc.).
 */
function installFieldStatsFetchStub(indexRecords: Record<string, any>[]) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    calls.push(url);

    // Pagination probes: should never fire because @odata.count == page length,
    // but guard against the fallback $skip/$top walker triggering unexpectedly.
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Index build: the URL must include both tables=CustomColumns (needed to read
    // CustomColumns fields) and $count=true (required for OData count).
    if (url.includes("$count=true")) {
      assert.ok(
        url.includes("tables=CustomColumns"),
        `ONIX index URL must include ?tables=CustomColumns when CustomColumns.* is a match field (got: ${url})`,
      );
      return new Response(
        JSON.stringify({
          value: indexRecords,
          "@odata.count": indexRecords.length,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Any other URL means a per-record write/lookup fired — should not happen with onMissing:"skip".
    throw new Error(
      `Unexpected fetch in field-stats test (no writes expected with onMissing:"skip"): ${url}`,
    );
  }) as typeof fetch;
  return calls;
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

const onixModule = {
  id: "test-onix-fs",
  code: "ONIX",
  name: "ONIX Field Stats Test",
  baseUrl: "https://onix-api.hauerland.sk/onix_api",
  config: { apiToken: "dummy-token", databasePath: "test_db" },
} as unknown as ApiModule;

// Source records that will NOT match any indexed ONIX card (value "ZZZ" never
// appears in the stubs), so onMissing:"skip" prevents any write fetch.
const sourceRecords = [{ src_code: "ZZZ", src_product: "ZZZ-PROD" }];

// Mapped records (after field-mapping): the engine maps src_code → Ns_Number,
// src_product → CustomColumns.Product_Code.
const records = [{ Ns_Number: "ZZZ", "CustomColumns.Product_Code": "ZZZ-PROD" }];

const matchOptions = {
  matchFields: ["src_code", "src_product"],
  matchOperator: "and" as const,
  onMissing: "skip" as const,
  mappings: [
    { sourceField: "src_code",    targetField: "Ns_Number" },
    { sourceField: "src_product", targetField: "CustomColumns.Product_Code" },
  ],
};

// ─── Cases ──────────────────────────────────────────────────────────────────

async function run() {
  // ── Case 1: ALL ZERO — all match fields have 0 indexed values ──────────────
  // The ONIX index has records (Ns_Number is present on each) but the
  // CustomColumns array is absent entirely — so both match fields end up with
  // 0 non-empty indexed values when matched against their mapped target fields.
  //
  // NOTE: Ns_Number IS indexed (the index unconditionally adds it for H kód
  // fallback lookups), but it is only counted in fieldNonEmptyCount for the
  // target fields that appear in the *configured* matchFields mappings. Here
  // both target fields (Ns_Number from src_code AND CustomColumns.Product_Code)
  // must appear in fieldNonEmptyCount. Ns_Number gets count=3 because the records
  // have it; CustomColumns.Product_Code gets count=0 because none do.
  // "ALL zero" in the test name refers to CustomColumns fields only — see Case 1b.
  clearOnixIndexCache();
  installFieldStatsFetchStub([
    { Id: 1, Ns_Number: "AAA" },
    { Id: 2, Ns_Number: "BBB" },
    { Id: 3, Ns_Number: "CCC" },
  ]);
  let result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.ok(
    result.onixIndexFieldStats != null,
    "onixIndexFieldStats must be present when match fields are configured",
  );
  assert.equal(
    result.onixIndexFieldStats!["Ns_Number"],
    3,
    "Ns_Number must have count=3 (all 3 index records have Ns_Number)",
  );
  assert.equal(
    result.onixIndexFieldStats!["CustomColumns.Product_Code"],
    0,
    "CustomColumns.Product_Code must have count=0 when no ONIX record has that column",
  );
  assert.equal(
    result.onixIndexComplete,
    true,
    "index should be complete (3 indexed == @odata.count 3)",
  );
  assert.equal(result.skippedCount, 1, "unmatched record must be skipped, not created");
  console.log(
    "✓ Case 1: Ns_Number=3, CustomColumns.Product_Code=0 — zero field correctly surfaced",
  );

  // ── Case 1b: ALL ZERO CustomColumns — empty CustomColumns arrays ────────────
  // Same as Case 1 but records have an explicit empty CustomColumns array rather
  // than a missing one. The field-value extractor must handle both identically.
  clearOnixIndexCache();
  installFieldStatsFetchStub([
    { Id: 1, Ns_Number: "AAA", CustomColumns: [] },
    { Id: 2, Ns_Number: "BBB", CustomColumns: [] },
    { Id: 3, Ns_Number: "CCC", CustomColumns: [] },
  ]);
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.ok(result.onixIndexFieldStats != null, "onixIndexFieldStats must be present");
  assert.equal(
    result.onixIndexFieldStats!["Ns_Number"],
    3,
    "Ns_Number must still be 3 with empty CustomColumns arrays",
  );
  assert.equal(
    result.onixIndexFieldStats!["CustomColumns.Product_Code"],
    0,
    "CustomColumns.Product_Code must be 0 with empty CustomColumns arrays",
  );
  console.log(
    "✓ Case 1b: empty CustomColumns arrays → CustomColumns.Product_Code=0, same as absent",
  );

  // ── Case 2: MIXED — some fields populated, some zero ──────────────────────
  // Two of the three ONIX records have CustomColumns.Product_Code populated;
  // all three have Ns_Number. Result: Ns_Number=3, Product_Code=2.
  clearOnixIndexCache();
  installFieldStatsFetchStub([
    { Id: 1, Ns_Number: "AAA", CustomColumns: [{ Name: "Product_Code", Value: "PC-001" }] },
    { Id: 2, Ns_Number: "BBB" },
    { Id: 3, Ns_Number: "CCC", CustomColumns: [{ Name: "Product_Code", Value: "PC-003" }] },
  ]);
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.ok(result.onixIndexFieldStats != null, "onixIndexFieldStats must be present");
  assert.equal(
    result.onixIndexFieldStats!["Ns_Number"],
    3,
    "Ns_Number must still be 3 in mixed case",
  );
  assert.equal(
    result.onixIndexFieldStats!["CustomColumns.Product_Code"],
    2,
    "CustomColumns.Product_Code must be 2 (only 2 of 3 records have it)",
  );
  console.log(
    "✓ Case 2: Ns_Number=3, CustomColumns.Product_Code=2 — mixed counts correctly surfaced",
  );

  // ── Case 3: ALL POPULATED — every match field has values on every card ─────
  // All three records have both Ns_Number and CustomColumns.Product_Code.
  // onixIndexFieldStats must be present (it is always emitted when the index was
  // built) and both counts must equal 3.
  clearOnixIndexCache();
  installFieldStatsFetchStub([
    { Id: 1, Ns_Number: "AAA", CustomColumns: [{ Name: "Product_Code", Value: "PC-001" }] },
    { Id: 2, Ns_Number: "BBB", CustomColumns: [{ Name: "Product_Code", Value: "PC-002" }] },
    { Id: 3, Ns_Number: "CCC", CustomColumns: [{ Name: "Product_Code", Value: "PC-003" }] },
  ]);
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  assert.ok(result.onixIndexFieldStats != null, "onixIndexFieldStats must be present for healthy index");
  assert.equal(
    result.onixIndexFieldStats!["Ns_Number"],
    3,
    "Ns_Number must be 3 in all-populated case",
  );
  assert.equal(
    result.onixIndexFieldStats!["CustomColumns.Product_Code"],
    3,
    "CustomColumns.Product_Code must be 3 when all records have it",
  );
  console.log(
    "✓ Case 3: Ns_Number=3, CustomColumns.Product_Code=3 — healthy index, no zeroes",
  );

  // ── Case 4: ONLY ONE MATCH FIELD (no CustomColumns) ───────────────────────
  // When only Ns_Number is a match field (no CustomColumns in the URL) the
  // index URL must NOT include `tables=CustomColumns`, and only Ns_Number should
  // appear in onixIndexFieldStats.
  const singleFieldMatchOptions = {
    matchFields: ["src_code"],
    matchOperator: "and" as const,
    onMissing: "skip" as const,
    mappings: [{ sourceField: "src_code", targetField: "Ns_Number" }],
  };
  const singleFieldRecords = [{ Ns_Number: "ZZZ" }];

  clearOnixIndexCache();
  let singleFieldCalls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    singleFieldCalls.push(url);
    if (url.includes("$skip=")) {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("$count=true")) {
      // Must NOT contain tables=CustomColumns when no CustomColumns field is configured
      assert.ok(
        !url.includes("tables=CustomColumns"),
        `Index URL must NOT include tables=CustomColumns when no CustomColumns match field is configured (got: ${url})`,
      );
      return new Response(
        JSON.stringify({
          value: [{ Id: 1, Ns_Number: "AAA" }, { Id: 2, Ns_Number: "BBB" }],
          "@odata.count": 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch in single-field test: ${url}`);
  }) as typeof fetch;

  result = await pushToTarget(
    onixModule, "stockitems", singleFieldRecords, 0,
    [{ src_code: "ZZZ" }], singleFieldMatchOptions,
  );
  restoreFetch();

  assert.ok(result.onixIndexFieldStats != null, "onixIndexFieldStats must be present even with single match field");
  assert.equal(
    result.onixIndexFieldStats!["Ns_Number"],
    2,
    "Ns_Number must be 2 (both records have it)",
  );
  assert.ok(
    !("CustomColumns.Product_Code" in result.onixIndexFieldStats!),
    "CustomColumns.Product_Code must NOT appear in fieldStats when not configured as a match field",
  );
  console.log(
    "✓ Case 4: single match field (Ns_Number only) — URL has no tables=CustomColumns, fieldStats has only Ns_Number=2",
  );

  // ── Case 5: sync-engine aggregation shape ─────────────────────────────────
  // Verify that the PushResult shape that sync-engine expects is correct:
  //   - onixIndexFieldStats is a plain Record<string, number> (not a Map)
  //   - All configured match target fields appear as keys, even those with count=0
  // This guards the sync-engine lines:
  //   if (pushResult.onixIndexFieldStats && !onixIndexFieldStats)
  //     onixIndexFieldStats = pushResult.onixIndexFieldStats;   // ← must be a plain object
  //   ...
  //   details.onixIndex = { ..., fieldStats: onixIndexFieldStats }  // ← stored in DB as JSONB
  clearOnixIndexCache();
  installFieldStatsFetchStub([{ Id: 1, Ns_Number: "AAA" }]); // CustomColumns.Product_Code count=0
  result = await pushToTarget(onixModule, "stockitems", records, 0, sourceRecords, matchOptions);
  restoreFetch();

  const fs = result.onixIndexFieldStats!;
  assert.ok(
    fs !== null && typeof fs === "object" && !Array.isArray(fs),
    "onixIndexFieldStats must be a plain object (not null, not array, not Map)",
  );
  // Both configured target fields must be present as string keys
  assert.ok(
    Object.prototype.hasOwnProperty.call(fs, "Ns_Number"),
    "onixIndexFieldStats must include 'Ns_Number' key (it is a configured match target field)",
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(fs, "CustomColumns.Product_Code"),
    "onixIndexFieldStats must include 'CustomColumns.Product_Code' key even when count=0",
  );
  // Values must be numbers (not undefined/null) — DB JSONB round-trip requires this
  assert.equal(
    typeof fs["Ns_Number"],
    "number",
    "Ns_Number value must be a number",
  );
  assert.equal(
    typeof fs["CustomColumns.Product_Code"],
    "number",
    "CustomColumns.Product_Code value must be a number (0 is valid)",
  );
  console.log(
    "✓ Case 5: onixIndexFieldStats is a plain Record<string, number> with all match target fields present (including zero-count ones)",
  );

  console.log("\n✅ All onix-field-stats tests passed.");
}

run().catch((err) => {
  console.error("\n✗ onix-field-stats test FAILED:", err.message || err);
  restoreFetch();
  process.exit(1);
});
