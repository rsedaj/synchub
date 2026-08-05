/**
 * Runs every *.test.ts file in tests/api/ as a separate tsx subprocess.
 *
 * These are black-box HTTP tests that hit a running dev server.
 * Make sure the server is running before invoking this script:
 *
 *   npm run dev &          # start the server in the background
 *   npm run test:api       # then run the API tests
 *
 * or open two terminals — one with `npm run dev`, one with `npm run test:api`.
 *
 * Usage:
 *   npm run test:api             # via package.json script
 *   npx tsx script/test-api.ts  # direct
 */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "tests/api";

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

if (files.length === 0) {
  console.error(`No *.test.ts files found in ${TEST_DIR}`);
  process.exit(1);
}

console.log(`\nRunning ${files.length} API test file(s):\n`);

let passed = 0;
let failed = 0;
const failedFiles: string[] = [];

for (const file of files) {
  const filePath = join(TEST_DIR, file);
  console.log(`▶  ${filePath}`);
  try {
    execSync(`npx tsx --test ${filePath}`, { stdio: "inherit" });
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
  console.log(`✅ All ${passed} API test file(s) passed`);
} else {
  console.error(
    `❌ ${failed} of ${files.length} API test file(s) FAILED:\n` +
      failedFiles.map((f) => `   • ${f}`).join("\n"),
  );
  process.exit(1);
}
