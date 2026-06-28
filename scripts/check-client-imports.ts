import { build as esbuild } from "esbuild";
import path from "path";
import { COMMON_IMPORT_CHECK_OPTIONS, ROOT } from "./import-check-config.ts";

// Fast, scoped import-resolution smoke check for the client (frontend) bundle.
//
// Why this exists:
//   A React component imported by the client but never committed (or renamed)
//   currently only surfaces during the SLOW Vite production build in the Docker
//   image stage, late in the pipeline. This is the frontend twin of
//   scripts/check-server-imports.ts: it resolves the entire local client import
//   graph from client/src/main.tsx up front and fails immediately, with a clear
//   "Could not resolve" error naming the missing file — instead of only at the
//   end of a full `vite build`.
//
// Why not the full `vite build` / `tsc --noEmit`:
//   A full Vite production build is slow (Tailwind, minification, asset
//   pipeline), and the project has pre-existing, unrelated type errors and
//   compiles via esbuild (which does not type-check). This check does NOT
//   type-check and does NOT run the full build — esbuild only resolves and
//   parses the import graph, so it stays green unless a referenced local module
//   is actually missing/renamed.
//
// How it works:
//   esbuild bundles client/src/main.tsx with the shared import-check options
//   (see ./import-check-config.ts: bundle + packages:"external", so only LOCAL
//   files are followed; the @ / @shared / @assets aliases; jsx:"automatic" to
//   mirror @vitejs/plugin-react; resolvable extensions; and the empty CSS/asset
//   loaders so Tailwind directives and image/font bytes are not parsed). Output
//   is discarded — we only care that resolution succeeds. The only
//   client-specific bits are the entry point and the browser platform.

async function checkClientImports() {
  await esbuild({
    ...COMMON_IMPORT_CHECK_OPTIONS,
    entryPoints: [path.join(ROOT, "client/src/main.tsx")],
    platform: "browser",
    logLevel: "warning",
  });
}

checkClientImports()
  .then(() => {
    console.log("✓ client import graph resolves — no missing/renamed modules");
  })
  .catch((err) => {
    console.error("✗ client import check failed:");
    console.error(err?.message ?? err);
    process.exit(1);
  });
