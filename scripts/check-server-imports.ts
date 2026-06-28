import { build as esbuild } from "esbuild";
import path from "path";

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
//   esbuild bundles server/index.ts with `bundle: true` and `packages: "external"`,
//   so every bare npm import (express, drizzle-orm, ...) is left alone and only
//   LOCAL files (relative imports + the @shared / @ aliases) are followed and
//   resolved. Output is discarded (`write: false`) — we only care about whether
//   resolution succeeds.

const ROOT = path.resolve(import.meta.dirname, "..");

async function checkServerImports() {
  await esbuild({
    entryPoints: [path.join(ROOT, "server/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "warning",
    // Leave all node_modules packages external — we only want to verify that the
    // LOCAL server import graph resolves, not pull in third-party code.
    packages: "external",
    // Mirror the tsconfig path aliases so @shared/* and @/* resolve the same way
    // they do at runtime via tsx.
    alias: {
      "@shared": path.join(ROOT, "shared"),
      "@": path.join(ROOT, "client/src"),
    },
    // The TS files in this project import each other with .ts extensions
    // (allowImportingTsExtensions), so make sure esbuild resolves those.
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
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
