import { build as esbuild } from "esbuild";
import path from "path";
import { COMMON_IMPORT_CHECK_OPTIONS, ROOT } from "./import-check-config.ts";

// Fast, scoped import-resolution smoke check for the server bundle.
//
// Why this exists:
//   The CI test gate only catches a missing/renamed server module (e.g. a new
//   file imported by server/routes.ts but never committed) at RUNTIME — it shows
//   up as ERR_MODULE_NOT_FOUND after the whole app boots and the health check
//   times out (~120s). This check resolves the entire local server import graph
//   from server/index.ts up front and fails immediately, with a clear "Could not
//   resolve" error naming the missing file.
//
// Why not full `tsc --noEmit`:
//   The project has pre-existing, unrelated type errors and compiles via
//   esbuild/tsx (which does not type-check), so the full type-check is
//   deliberately excluded from the gate (see scripts/run-tests.sh). This check
//   does NOT type-check — esbuild only resolves and parses the import graph, so
//   it stays green unless a referenced local module is actually missing.
//
// How it works:
//   esbuild bundles server/index.ts with the shared import-check options (see
//   ./import-check-config.ts: bundle + packages:"external", so only LOCAL files
//   are followed; the @ / @shared / @assets aliases; resolvable extensions; and
//   the empty asset loaders). Output is discarded — we only care that resolution
//   succeeds. The only server-specific bits are the entry point and platform.

async function checkServerImports() {
  await esbuild({
    ...COMMON_IMPORT_CHECK_OPTIONS,
    entryPoints: [path.join(ROOT, "server/index.ts")],
    platform: "node",
    logLevel: "warning",
  });
}

checkServerImports()
  .then(() => {
    console.log("✓ server import graph resolves — no missing/renamed modules");
  })
  .catch((err) => {
    console.error("✗ server import check failed:");
    console.error(err?.message ?? err);
    process.exit(1);
  });
