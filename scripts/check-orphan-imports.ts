import { build as esbuild } from "esbuild";
import path from "path";
import fs from "fs";
import { COMMON_IMPORT_CHECK_OPTIONS, ROOT } from "./import-check-config.ts";

// Fast, scoped import-resolution smoke check for ORPHANED TS/TSX files.
//
// Why this exists:
//   scripts/check-server-imports.ts resolves the import graph reachable from
//   server/index.ts and scripts/check-client-imports.ts covers client/src/
//   main.tsx. Files that are NOT reachable from either of those two entries —
//   the test files under tests/server/** and tests/api/**, standalone config
//   and script files (vite.config.ts, drizzle.config.ts, scripts/*.ts, ...),
//   and unused-but-committed components — are never resolved by those checks.
//   Such a file can reference a missing/renamed local module and only fail at
//   runtime when that specific test executes (or, for an unused component,
//   never get caught at all). This check closes that remaining gap.
//
// Why not full `tsc --noEmit`:
//   The project has pre-existing, unrelated type errors and compiles via
//   esbuild/tsx (which does not type-check), so the full type-check is
//   deliberately excluded from the gate (see scripts/run-tests.sh). This check
//   does NOT type-check — esbuild only resolves and parses the import graph, so
//   it stays green unless a referenced local module is actually missing/renamed.
//
// How it works:
//   1. esbuild bundles the two existing entries (server/index.ts and
//      client/src/main.tsx) with `metafile: true` to learn which local files
//      are ALREADY covered by the other two checks.
//   2. It walks the repo for every local .ts/.tsx file and subtracts the
//      already-reachable set (plus *.d.ts) — what remains are the "orphans".
//   3. It esbuild-bundles every orphan as an entry point. Both esbuild calls
//      use the shared import-check options (see ./import-check-config.ts:
//      bundle + packages:"external", the @ / @shared / @assets aliases,
//      resolvable extensions, and the empty CSS/asset loaders), so this check
//      resolves imports identically to the server and client checks. Output is
//      discarded — we only care that resolution succeeds.

// Directories we never want to walk into when collecting candidate files.
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".cache",
  ".local",
  ".config",
  ".upm",
  ".agents",
  "attached_assets",
]);

const EXISTING_ENTRIES = [
  path.join(ROOT, "server/index.ts"),
  path.join(ROOT, "client/src/main.tsx"),
];

// esbuild requires an outdir when there are multiple entry points, even though
// `write: false` means nothing is ever actually written to disk.
const ORPHAN_CHECK_OUTDIR = path.join(
  ROOT,
  "node_modules/.cache/orphan-import-check",
);

// Recursively collect every local .ts/.tsx file under ROOT, skipping ignored
// directories, dot-directories, and TypeScript declaration files (*.d.ts).
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      collectSourceFiles(full, out);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(full);
      }
    }
  }
  return out;
}

// Resolve the local import graph of the two existing entries and return the
// absolute paths of every local file they already cover.
async function getReachableFiles(): Promise<Set<string>> {
  const result = await esbuild({
    ...COMMON_IMPORT_CHECK_OPTIONS,
    entryPoints: EXISTING_ENTRIES,
    outdir: ORPHAN_CHECK_OUTDIR,
    platform: "node",
    metafile: true,
    logLevel: "silent",
  });
  const reachable = new Set<string>();
  for (const input of Object.keys(result.metafile.inputs)) {
    reachable.add(path.resolve(ROOT, input));
  }
  return reachable;
}

async function checkOrphanImports() {
  const reachable = await getReachableFiles();
  const allFiles = collectSourceFiles(ROOT);

  const orphans = allFiles.filter(
    (f) => !reachable.has(f) && !EXISTING_ENTRIES.includes(f),
  );

  if (orphans.length === 0) {
    console.log("✓ no orphaned TS files to check (everything is reachable)");
    return;
  }

  await esbuild({
    ...COMMON_IMPORT_CHECK_OPTIONS,
    entryPoints: orphans,
    outdir: ORPHAN_CHECK_OUTDIR,
    platform: "node",
    logLevel: "warning",
  });

  console.log(
    `✓ orphan import graph resolves — ${orphans.length} non-entry file(s) checked, no missing/renamed modules`,
  );
}

checkOrphanImports()
  .then(() => {})
  .catch((err) => {
    console.error("✗ orphan import check failed:");
    console.error(err?.message ?? err);
    process.exit(1);
  });
