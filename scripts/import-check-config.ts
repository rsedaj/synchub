import path from "path";
import type { BuildOptions, Loader } from "esbuild";

// Shared esbuild configuration for the three import-graph smoke checks
// (check-server-imports.ts, check-client-imports.ts, check-orphan-imports.ts).
//
// Why this module exists:
//   All three checks must resolve LOCAL imports exactly the way the real
//   Vite/tsx build does — same path aliases, same resolvable extensions, same
//   "treat assets as empty" loaders. When that config was copy-pasted into each
//   script, adding a new alias or asset type to the real build but only updating
//   one script silently made the checks diverge (missing or falsely flagging
//   imports). Keeping the shared pieces here, imported by all three, keeps them
//   honest: update once, every check stays in sync.
//
// Each check still owns what is genuinely unique to it (entry points, platform,
// metafile/outdir for the multi-entry orphan check, log level).

// Project root. This file lives in scripts/, so the root is one level up — the
// same value every check computed locally before.
export const ROOT = path.resolve(import.meta.dirname, "..");

// Path aliases mirrored from vite.config.ts / tsconfig.json so @, @shared and
// @assets resolve the same way they do in the real Vite/tsx build.
export const IMPORT_CHECK_ALIAS: Record<string, string> = {
  "@": path.join(ROOT, "client/src"),
  "@shared": path.join(ROOT, "shared"),
  "@assets": path.join(ROOT, "attached_assets"),
};

// Extensions esbuild tries when resolving extensionless local imports. The
// project imports TS/TSX files with and without explicit extensions
// (allowImportingTsExtensions), and some modules import .css, so the full set
// must be resolvable.
export const IMPORT_CHECK_RESOLVE_EXTENSIONS = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".json",
  ".css",
];

// Non-JS imports (CSS, images, fonts) are loaded as `empty` so esbuild does not
// parse/process their contents (Tailwind directives, image/font bytes) — we
// only care that the referenced files exist and the module graph resolves.
export const IMPORT_CHECK_ASSET_LOADERS: Record<string, Loader> = {
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
};

// The esbuild options shared by all three checks. Each script spreads this and
// then adds only its unique fields (entryPoints, platform, and — for the
// multi-entry orphan check — metafile/outdir, log level).
//
//   - bundle + packages:"external": follow only LOCAL files; leave every bare
//     npm import (express, react, ...) alone so we verify resolution, not pull
//     in third-party code.
//   - write:false: output is discarded; we only care whether resolution works.
//   - jsx:"automatic": mirror @vitejs/plugin-react. Harmless for the server
//     graph, which has no JSX.
export const COMMON_IMPORT_CHECK_OPTIONS = {
  bundle: true,
  format: "esm",
  write: false,
  packages: "external",
  jsx: "automatic",
  alias: IMPORT_CHECK_ALIAS,
  resolveExtensions: IMPORT_CHECK_RESOLVE_EXTENSIONS,
  loader: IMPORT_CHECK_ASSET_LOADERS,
} satisfies BuildOptions;
