import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "playground/src"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const LOG_PATTERN = /console\.(log|info|debug)\s*\(/;
const SENSITIVE_KEYWORDS = [
    "private",
    "mnemonic",
    "seed",
    "decrypted",
    "signed deploy",
    "vault",
];

const findings = [];

const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walk(fullPath);
            continue;
        }

        if (!EXTENSIONS.has(path.extname(entry.name))) {
            continue;
        }

        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
            const normalized = line.toLowerCase();
            if (!LOG_PATTERN.test(line)) {
                return;
            }

            if (
                SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword))
            ) {
                findings.push(`${fullPath}:${index + 1}: ${line.trim()}`);
            }
        });
    }
};

ROOTS.forEach((root) => {
    if (fs.existsSync(root)) {
        walk(root);
    }
});

if (findings.length) {
    console.error("Sensitive log candidates found:");
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exit(1);
}

console.log("No sensitive console log patterns detected.");
