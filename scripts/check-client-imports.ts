import { build as esbuild } from "esbuild";
import path from "path";

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
//   esbuild bundles client/src/main.tsx with `bundle: true` and
//   `packages: "external"`, so every bare npm import (react, wouter, ...) is
//   left alone and only LOCAL files (relative imports + the @ / @shared /
//   @assets aliases) are followed and resolved. Output is discarded
//   (`write: false`) — we only care about whether resolution succeeds.
//
//   Non-JS imports (CSS, images, fonts) are loaded as `empty` so esbuild does
//   not try to parse/process their contents — we only care that the referenced
//   files exist and the JSX/TSX module graph resolves.

const ROOT = path.resolve(import.meta.dirname, "..");

async function checkClientImports() {
  await esbuild({
    entryPoints: [path.join(ROOT, "client/src/main.tsx")],
    platform: "browser",
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "warning",
    // Use the automatic JSX runtime (react/jsx-runtime) to mirror @vitejs/plugin-react.
    jsx: "automatic",
    // Leave all node_modules packages external — we only want to verify that the
    // LOCAL client import graph resolves, not pull in third-party code.
    packages: "external",
    // Mirror the Vite/tsconfig path aliases so @/*, @shared/* and @assets/*
    // resolve the same way they do in the real build.
    alias: {
      "@": path.join(ROOT, "client/src"),
      "@shared": path.join(ROOT, "shared"),
      "@assets": path.join(ROOT, "attached_assets"),
    },
    // The TS/TSX files in this project import each other with explicit
    // extensions in some places (allowImportingTsExtensions), so make sure
    // esbuild resolves the full set.
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json", ".css"],
    // We only verify resolution, not asset processing: treat CSS and binary
    // assets as empty so esbuild doesn't parse Tailwind directives or try to
    // load image/font bytes (which is irrelevant to "does this file exist?").
    loader: {
      ".css": "empty",
      ".png": "empty",
      ".jpg": "empty",
      ".jpeg": "empty",
      ".gif": "empty",
      ".svg": "empty",
      ".webp": "empty",
      ".ico": "empty",
      ".woff": "empty",
      ".woff2": "empty",
      ".ttf": "empty",
      ".eot": "empty",
    },
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
