/**
 * Backend test: the targeted "re-run deferred records" decision logic.
 *
 * The deferred re-run (POST /api/sync-runs/:id/rerun-deferred → executeSyncRun)
 * spans three layers that previously had NO automated coverage, so a regression
 * could silently re-defer records or, worse, re-sync the wrong set:
 *
 *   1. HTTP gate (server/routes.ts): derive the deferred scope from the run, and
 *      refuse to proceed unless the ONIX index is now available AND complete.
 *   2. Forced full-sync (server/sync-engine.ts): a deferred re-run must bypass
 *      delta so the known set is actually re-attempted.
 *   3. Restriction filter (server/sync-engine.ts): narrow the fetched source set
 *      down to ONLY the previously-deferred records (by canonical record key,
 *      with an Ns_Number fallback).
 *
 * That logic now lives in server/deferred-rerun.ts as pure functions that BOTH
 * the route and the sync engine call, so this test drives the real code paths —
 * not a duplicate that could drift. It needs no live ONIX / DB / network: the
 * index check is passed in as a plain object (mocked) and records are in-memory.
 *
 * This project's offline tests run directly with the bundled tsx:
 *   npx tsx --test tests/server/deferred-rerun.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveDeferredScope,
  evaluateIndexGate,
  computeEffectiveFullSync,
  restrictToDeferredSet,
} from "../../server/deferred-rerun.ts";

// --- Layer 1a: deferred scope derivation (feeds the route's 400 gate) --------

test("deriveDeferredScope: trims, drops empties, de-duplicates record keys and Ns_Numbers", () => {
  const { recordKeys, nsNumbers } = deriveDeferredScope([
    { recordKey: " K1 ", nsNumber: "N1" },
    { recordKey: "K1", nsNumber: " N1 " }, // duplicates of the first (after trim)
    { recordKey: "", nsNumber: "N2" }, // empty key contributes only an Ns_Number
    { recordKey: "K2", nsNumber: "   " }, // whitespace-only Ns_Number is dropped
    { reason: "no key, no number" }, // contributes nothing
  ]);
  assert.deepEqual(recordKeys, ["K1", "K2"], "record keys should be trimmed + de-duplicated");
  assert.deepEqual(nsNumbers, ["N1", "N2"], "Ns_Numbers should be trimmed + de-duplicated");
});

test("deriveDeferredScope: no resolvable scope → both lists empty (route answers 400)", () => {
  const { recordKeys, nsNumbers } = deriveDeferredScope([
    { recordKey: "", nsNumber: "" },
    { recordKey: "   ", nsNumber: "  " },
    { reason: "deferred but unidentifiable" },
  ]);
  assert.equal(recordKeys.length, 0);
  assert.equal(nsNumbers.length, 0);
  // The route returns 400 precisely when BOTH are empty.
  assert.equal(recordKeys.length === 0 && nsNumbers.length === 0, true);
});

// --- Layer 1b: ONIX index gate (the route's 409 vs proceed decision) ---------

test("evaluateIndexGate: unavailable index → 409 with indexAvailable=false", () => {
  const gate = evaluateIndexGate({
    available: false,
    complete: false,
    message: "ONIX API token not configured",
  });
  assert.equal(gate.ok, false);
  if (gate.ok) return; // narrow for the type checker
  assert.equal(gate.status, 409);
  assert.equal(gate.body.indexAvailable, false);
  assert.equal(gate.body.indexComplete, false);
  assert.equal(gate.body.message, "ONIX API token not configured", "the index check's message must surface to the caller");
});

test("evaluateIndexGate: unavailable index without a message → 409 with a default message", () => {
  const gate = evaluateIndexGate({ available: false, complete: false });
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.equal(gate.status, 409);
  assert.equal(gate.body.message, "The ONIX index could not be validated.");
});

test("evaluateIndexGate: available but incomplete index → 409 carrying the counts", () => {
  const gate = evaluateIndexGate({
    available: true,
    complete: false,
    recordCount: 80000,
    expectedCount: 100000,
  });
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.equal(gate.status, 409);
  assert.equal(gate.body.indexAvailable, true);
  assert.equal(gate.body.indexComplete, false);
  assert.equal(gate.body.recordCount, 80000, "operators need the indexed count to judge progress");
  assert.equal(gate.body.expectedCount, 100000, "operators need the expected count to judge progress");
});

test("evaluateIndexGate: available AND complete index → proceed (ok)", () => {
  const gate = evaluateIndexGate({
    available: true,
    complete: true,
    recordCount: 100000,
    expectedCount: 100000,
  });
  assert.equal(gate.ok, true);
});

// --- Layer 2: forced full-sync for a deferred re-run -------------------------

test("computeEffectiveFullSync: a record-key restriction forces full-sync even when fullSync=false", () => {
  const restrictSet = new Set(["K1", "K2"]);
  assert.equal(
    computeEffectiveFullSync(false, restrictSet, undefined),
    true,
    "deferred re-run must bypass delta so the targeted records are actually re-attempted",
  );
});

test("computeEffectiveFullSync: an Ns_Number-only restriction also forces full-sync", () => {
  const restrictNsSet = new Set(["N1"]);
  assert.equal(computeEffectiveFullSync(false, undefined, restrictNsSet), true);
});

test("computeEffectiveFullSync: no restriction → the caller's fullSync flag is passed through", () => {
  assert.equal(computeEffectiveFullSync(false, undefined, undefined), false);
  assert.equal(computeEffectiveFullSync(true, undefined, undefined), true);
  // Empty (but present) sets are treated as "no restriction".
  assert.equal(computeEffectiveFullSync(false, new Set(), new Set()), false);
});

// --- Layer 3: restrict the fetched set down to the deferred records ----------

test("restrictToDeferredSet: keeps only records whose canonical record key is in the set", () => {
  const records = [
    { id: "K1", name: "keep" },
    { id: "K2", name: "keep" },
    { id: "K3", name: "drop" },
    { id: "K4", name: "drop" },
  ];
  const filtered = restrictToDeferredSet(records, {
    restrictToRecordKeys: new Set(["K1", "K2"]),
  });
  assert.deepEqual(
    filtered.map((r) => r.id),
    ["K1", "K2"],
    "only the two deferred record keys should survive the filter",
  );
});

test("restrictToDeferredSet: honours config match fields when deriving the record key", () => {
  // deriveRecordKey prefers the configured match field over the id/code fallbacks.
  const records = [
    { id: "ignored-1", sku: "SKU-1" },
    { id: "ignored-2", sku: "SKU-2" },
  ];
  const filtered = restrictToDeferredSet(records, {
    restrictToRecordKeys: new Set(["SKU-1"]),
    matchFields: ["sku"],
  });
  assert.deepEqual(filtered.map((r) => r.sku), ["SKU-1"], "the match field, not id, must define the key");
});

test("restrictToDeferredSet: Ns_Number fallback matches records with no resolvable key", () => {
  const records = [
    { Ns_Number_src: "N1", note: "keep via ns" },
    { Ns_Number_src: "N2", note: "drop" },
  ];
  const filtered = restrictToDeferredSet(records, {
    restrictToRecordKeys: new Set(), // no key scope
    restrictToNsNumbers: new Set(["N1"]),
    nsSourceField: "Ns_Number_src",
  });
  assert.deepEqual(filtered.map((r) => r.note), ["keep via ns"]);
});

test("restrictToDeferredSet: a record passes if EITHER the key OR the Ns_Number matches", () => {
  const records = [
    { id: "K1", ns: "Nx" }, // matches by key
    { id: "Kx", ns: "N2" }, // matches by Ns_Number fallback
    { id: "Ky", ns: "Nz" }, // matches neither → dropped
  ];
  const filtered = restrictToDeferredSet(records, {
    restrictToRecordKeys: new Set(["K1"]),
    restrictToNsNumbers: new Set(["N2"]),
    nsSourceField: "ns",
  });
  assert.deepEqual(filtered.map((r) => r.id), ["K1", "Kx"]);
});

test("restrictToDeferredSet: Ns_Number values are trimmed before comparison", () => {
  const records = [{ id: "Kx", ns: "  N1  " }];
  const filtered = restrictToDeferredSet(records, {
    restrictToNsNumbers: new Set(["N1"]),
    nsSourceField: "ns",
  });
  assert.equal(filtered.length, 1, "a whitespace-padded source Ns_Number must still match");
});

test("restrictToDeferredSet: with no restriction set the fetched records pass through unchanged", () => {
  const records = [{ id: "K1" }, { id: "K2" }];
  const filtered = restrictToDeferredSet(records, {});
  assert.deepEqual(filtered, records);
});
