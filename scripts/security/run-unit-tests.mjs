import { spawn } from "child_process";
import fs, { readdir } from "fs/promises";
import path from "path";

const TEST_DIR = path.resolve("tests/unit");
const TEST_GLOB = "*.test.ts";

async function findTestFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await findTestFiles(fullPath)));
        } else if (
            entry.isFile() &&
            entry.name.endsWith("wallet-deploy.test.ts")
        ) {
            results.push(fullPath);
        }
    }

    return results;
}

const cleanupTestStorage = async () => {
    await Promise.all([
        fs.rm(".tmp", {
            recursive: true,
            force: true,
        }),
        fs.rm(".persist-test", {
            recursive: true,
            force: true,
        }),
    ]);
};

async function main() {
    const tests = await findTestFiles(TEST_DIR);

    if (tests.length === 0) {
        console.error(
            `No test files found under ${TEST_DIR}. Expected pattern: **/${TEST_GLOB}`,
        );
        process.exit(1);
    }

    await Promise.all([
        fs.rm(".tmp", {
            recursive: true,
            force: true,
        }),
        fs.rm(".persist-test", {
            recursive: true,
            force: true,
        }),
    ]);

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
        },
    );

    child.on("exit", async (code) => {
        await cleanupTestStorage();

        process.exit(code ?? 0);
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
