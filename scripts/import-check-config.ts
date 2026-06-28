import path from "path";
import ts from "typescript";
import type { BuildOptions, Loader } from "esbuild";

// Shared esbuild configuration for the three import-graph smoke checks
// (check-server-imports.ts, check-client-imports.ts, check-orphan-imports.ts).
//
// Why this module exists:
//   All three checks must resolve LOCAL imports exactly the way the real
//   Vite/tsx build does — same path aliases, same resolvable extensions, same
//   "treat assets as empty" loaders. When that config was copy-pasted into each
//   script, adding a new alias or asset type to the real build but only updating
//   one script silently made the checks diverge. Keeping the shared pieces here,
//   imported by all three, keeps them honest.
//
//   The path aliases go one step further: rather than being hand-copied here,
//   they are DERIVED from tsconfig.json `compilerOptions.paths` (the single
//   source of truth, kept in sync with vite.config.ts `resolve.alias`). Adding a
//   new alias to tsconfig now propagates to all three checks automatically — no
//   manual edit to this file or the check scripts is needed.
//
// Each check still owns what is genuinely unique to it (entry points, platform,
// metafile/outdir for the multi-entry orphan check, log level).

// Project root. This file lives in scripts/, so the root is one level up.
export const ROOT = path.resolve(import.meta.dirname, "..");

// Derive esbuild path aliases from tsconfig.json `compilerOptions.paths`.
//
// We use the TypeScript compiler API rather than JSON.parse so the read is
// tolerant of JSONC (comments, trailing commas) and honours baseUrl / extends
// exactly the way tsc and tsx do. A tsconfig mapping like
//   "@/*": ["./client/src/*"]
// becomes an esbuild alias
//   "@" -> "<root>/client/src"
// (the trailing "/*" wildcard is stripped from both sides).
function loadAliasesFromTsconfig(): Record<string, string> {
  const configPath = path.join(ROOT, "tsconfig.json");
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    throw new Error(
      `import-check-config: could not read tsconfig.json: ${ts.flattenDiagnosticMessageText(
        readResult.error.messageText,
        "\n",
      )}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, ROOT);
  const paths = parsed.options.paths ?? {};
  const baseUrl = parsed.options.baseUrl ?? ROOT;

  const alias: Record<string, string> = {};
  for (const [key, targets] of Object.entries(paths)) {
    if (!targets || targets.length === 0) continue;
    const aliasKey = key.replace(/\/\*$/, "");
    const target = targets[0].replace(/\/\*$/, "");
    alias[aliasKey] = path.resolve(baseUrl, target);
  }

  // Fail loudly if the derivation produced nothing sensible, so a broken/renamed
  // tsconfig surfaces here instead of silently dropping aliases and making the
  // import checks falsely pass (or fail) later.
  if (!alias["@"] || !alias["@shared"]) {
    throw new Error(
      `import-check-config: tsconfig.json compilerOptions.paths is missing the ` +
        `expected @ / @shared aliases (derived: ${Object.keys(alias).join(", ") || "none"}). ` +
        `Has tsconfig.json been moved or restructured?`,
    );
  }

  return alias;
}

// Path aliases, derived from tsconfig.json (kept in sync with vite.config.ts).
export const IMPORT_CHECK_ALIAS: Record<string, string> = loadAliasesFromTsconfig();

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
