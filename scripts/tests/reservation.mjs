import { spawn } from "child_process";
import { readdir } from "fs/promises";
import path from "path";

const TEST_DIR = path.resolve("tests");

async function findReservationTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findReservationTestFiles(fullPath)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".test.ts") &&
      (entry.name.includes("reservation") || entry.name.includes("funds-reservation"))
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

async function main() {
  const tests = await findReservationTestFiles(TEST_DIR);

  if (tests.length === 0) {
    console.error(
      `No reservation test files found under ${TEST_DIR}. Expected pattern: **/*reservation*.test.ts`
    );
    process.exit(1);
  }

  console.log(`Found ${tests.length} reservation test file(s):\n`);
  tests.forEach((test) => console.log(`  ${test}`));
  console.log("\n");

  const child = spawn(
    process.execPath,
    [
      path.join("node_modules", "tsx", "dist", "cli.mjs"),
      "--test",
      ...tests,
    ],
    {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    }
  );

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
