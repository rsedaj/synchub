/**
 * Runs every *.test.ts file in tests/server/ as a separate tsx subprocess.
 *
 * Two test styles co-exist in that directory:
 *   - node:test style   (import { test } from "node:test") — deferred-rerun,
 *                        config-backup-roundtrip, import-check-unused-binding
 *   - plain script style (run().catch(err => process.exit(1))) — onix-*,
 *                        hkod-counter-collision
 *
 * Running each file as its own tsx process works for both: the node:test
 * runner surfaces individual test-case results; plain scripts surface
 * pass/fail through their exit code. Both emit diagnostic output to stdout
 * so failures are visible without any extra flags.
 *
 * Usage:
 *   npm run test:server        # via package.json script
 *   npx tsx script/test-server.ts   # direct
 */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "tests/server";

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

if (files.length === 0) {
  console.error(`No *.test.ts files found in ${TEST_DIR}`);
  process.exit(1);
}

console.log(`\nRunning ${files.length} server test file(s):\n`);

let passed = 0;
let failed = 0;
const failedFiles: string[] = [];

for (const file of files) {
  const filePath = join(TEST_DIR, file);
  console.log(`▶  ${filePath}`);
  try {
    execSync(`npx tsx ${filePath}`, { stdio: "inherit" });
    console.log(`✓  ${file}\n`);
    passed++;
  } catch {
    console.error(`✗  ${file} FAILED\n`);
    failed++;
    failedFiles.push(filePath);
  }
}

console.log("─".repeat(60));
if (failed === 0) {
  console.log(`✅ All ${passed} server test file(s) passed`);
} else {
  console.error(
    `❌ ${failed} of ${files.length} server test file(s) FAILED:\n` +
      failedFiles.map((f) => `   • ${f}`).join("\n"),
  );
  process.exit(1);
}
