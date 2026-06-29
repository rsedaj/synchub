/**
 * Regression test: the import-resolution smoke checks must flag a missing or
 * renamed LOCAL module even when the imported binding is never used as a value.
 *
 * esbuild's bundler elides an import whose binding is unused (it can't tell a
 * value import from a type-only one without type info), so a broken
 *   import { foo } from "./renamed-module"   // foo never used
 * used to slip through scripts/check-{server,client,orphan}-imports.ts even
 * though the reference is genuinely dead. The shared
 * scripts/import-check-plugin.ts closes that hole by parsing every loaded file
 * with the TypeScript parser and resolving each local specifier directly.
 *
 * This test drives the real check end-to-end via the orphan check (the orphan
 * check treats standalone files as entry points, so a temp probe file is the
 * cleanest way to exercise the behavior without touching real source). It
 * writes a probe with an UNUSED broken import, asserts the check fails, then
 * removes it and asserts the check passes again.
 *
 * Pure offline test (esbuild + tsx only, no live server / DB). Run with:
 *   npx tsx --test tests/server/import-check-unused-binding.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROBE = path.join(ROOT, "scripts", "__unused_import_regression_probe__.ts");
const ORPHAN_CHECK = path.join(ROOT, "scripts", "check-orphan-imports.ts");

function runOrphanCheck(): { code: number; output: string } {
  try {
    const output = execFileSync("npx", ["tsx", ORPHAN_CHECK], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (err: any) {
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    return { code: err.status ?? 1, output };
  }
}

test("orphan import check FAILS on a broken import with an unused binding", () => {
  // `ghost` is never used as a value, so esbuild would elide the import and
  // never resolve "./__definitely_missing_module__" without the plugin.
  fs.writeFileSync(
    PROBE,
    'import { ghost } from "./__definitely_missing_module__";\n' +
      "const value = 1;\n" +
      "export default value;\n",
    "utf8",
  );
  try {
    const { code, output } = runOrphanCheck();
    assert.notEqual(code, 0, "check should exit non-zero on a broken import");
    assert.match(output, /Could not resolve/);
    assert.match(output, /__definitely_missing_module__/);
  } finally {
    fs.rmSync(PROBE, { force: true });
  }
});

test("orphan import check PASSES once the broken import is removed", () => {
  // Sanity guard: ensure the failure above is caused by the probe, not a
  // pre-existing problem in the repo.
  fs.rmSync(PROBE, { force: true });
  const { code } = runOrphanCheck();
  assert.equal(code, 0, "check should pass on a clean tree");
});
