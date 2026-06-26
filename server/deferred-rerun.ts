/**
 * Pure decision logic for the targeted "re-run deferred records" flow.
 *
 * The deferred re-run spans three layers that previously had no automated
 * coverage:
 *   1. The HTTP gate in server/routes.ts (POST /api/sync-runs/:id/rerun-deferred)
 *      that derives the deferred record scope and refuses to proceed unless the
 *      ONIX index is now both available AND complete.
 *   2. The forced full-sync decision in server/sync-engine.ts (a deferred re-run
 *      must bypass delta so the known set is actually re-attempted).
 *   3. The restriction filter in server/sync-engine.ts that narrows the fetched
 *      source set down to ONLY the previously-deferred records.
 *
 * These helpers are extracted as side-effect-free functions so both the route
 * and the sync engine call the SAME logic the tests exercise — there is no
 * duplicated copy that could silently drift. They take no live ONIX / DB /
 * network dependency, so tests/server/deferred-rerun.test.ts can drive every
 * branch with a mocked index-check result and plain in-memory records.
 */
import { deriveRecordKey } from "./target-push";

export type DeferredItem = { recordKey?: string; nsNumber?: string; reason?: string };

/**
 * Reduce the raw deferred items recorded on a sync run into the de-duplicated,
 * trimmed scope the re-run operates on: canonical record keys (primary) plus
 * Ns_Numbers (fallback for deferred items that have an assigned number but no
 * resolvable record key). When BOTH lists come back empty the route has nothing
 * to target and must answer 400.
 */
export function deriveDeferredScope(items: DeferredItem[]): { recordKeys: string[]; nsNumbers: string[] } {
  const recordKeys = Array.from(new Set(
    items
      .map((d) => (d.recordKey ?? "").trim())
      .filter((k) => k !== ""),
  ));
  const nsNumbers = Array.from(new Set(
    items
      .map((d) => (d.nsNumber ?? "").trim())
      .filter((n) => n !== ""),
  ));
  return { recordKeys, nsNumbers };
}

/** Shape of the relevant fields from `checkOnixIndexComplete`'s result. */
export interface DeferredIndexCheck {
  available: boolean;
  complete: boolean;
  recordCount?: number;
  expectedCount?: number | null;
  message?: string;
}

export type IndexGateResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Turn an ONIX index-completeness check into the HTTP gate decision. Re-syncing
 * deferred records against a still-incomplete (or unavailable) index would just
 * defer them again — and risks creating duplicate ONIX cards — so both cases are
 * refused with 409. Only a confirmed available AND complete index passes.
 */
export function evaluateIndexGate(indexCheck: DeferredIndexCheck): IndexGateResult {
  if (!indexCheck.available) {
    return {
      ok: false,
      status: 409,
      body: {
        message: indexCheck.message || "The ONIX index could not be validated.",
        indexAvailable: false,
        indexComplete: false,
      },
    };
  }
  if (!indexCheck.complete) {
    return {
      ok: false,
      status: 409,
      body: {
        message: "The ONIX index is still incomplete. Wait until a full index is available before re-running deferred records.",
        indexAvailable: true,
        indexComplete: false,
        recordCount: indexCheck.recordCount,
        expectedCount: indexCheck.expectedCount,
      },
    };
  }
  return { ok: true };
}

/**
 * A deferred re-run only re-attempts a known set of records, whose baselines
 * were already updated by the original run; delta would therefore see "no
 * change" and skip them. Forcing full-sync whenever a restriction set is present
 * guarantees the targeted records are actually re-processed.
 */
export function computeEffectiveFullSync(
  fullSync: boolean,
  restrictSet?: Set<string>,
  restrictNsSet?: Set<string>,
): boolean {
  const hasKeys = !!restrictSet && restrictSet.size > 0;
  const hasNs = !!restrictNsSet && restrictNsSet.size > 0;
  return hasKeys || hasNs ? true : fullSync;
}

/**
 * Narrow a fetched source set down to ONLY the previously-deferred records.
 * Primary scoping is by the canonical record key (`deriveRecordKey`, honouring
 * the config's match fields); as a fallback a record also passes if its
 * source-side Ns_Number value (read via `nsSourceField`) is in the deferred
 * Ns_Number set. With no restriction set present the input is returned
 * unchanged.
 */
export function restrictToDeferredSet<T extends Record<string, any>>(
  records: T[],
  opts: {
    restrictToRecordKeys?: Set<string>;
    restrictToNsNumbers?: Set<string>;
    matchFields?: string[];
    nsSourceField?: string;
  },
): T[] {
  const keySet = opts.restrictToRecordKeys;
  const nsSet = opts.restrictToNsNumbers;
  const hasKeys = !!keySet && keySet.size > 0;
  const hasNs = !!nsSet && nsSet.size > 0;
  if (!hasKeys && !hasNs) return records;

  return records.filter((rec) => {
    if (hasKeys) {
      const k = deriveRecordKey(rec, opts.matchFields);
      if (k != null && keySet!.has(String(k))) return true;
    }
    if (hasNs && opts.nsSourceField) {
      const ns = rec?.[opts.nsSourceField];
      if (ns != null && String(ns).trim() !== "" && nsSet!.has(String(ns).trim())) return true;
    }
    return false;
  });
}
