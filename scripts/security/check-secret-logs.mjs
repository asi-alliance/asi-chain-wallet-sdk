import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "playground/src"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const CONSOLE_PATTERN = /console\.(log|info|debug|warn|error|trace)\s*\(/;
const SENSITIVE_KEYWORDS = [
    "private",
    "mnemonic",
    "seed",
    "decrypted",
    "signed deploy",
    "vault",
];
const SENSITIVE_SDK_PATH_PREFIXES = [
    "src/domains/Wallet/",
    "src/domains/Vault/",
    "src/domains/Deploy/",
    "src/services/Signer/",
    "src/services/AssetsService/",
    "src/services/Wallets/",
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
        const normalizedPath = fullPath.split(path.sep).join("/");
        const isSensitiveSdkPath = SENSITIVE_SDK_PATH_PREFIXES.some((prefix) =>
            normalizedPath.startsWith(prefix),
        );

        lines.forEach((line, index) => {
            const normalized = line.toLowerCase();
            if (!CONSOLE_PATTERN.test(line)) {
                return;
            }

            const hasSensitiveKeyword = SENSITIVE_KEYWORDS.some((keyword) =>
                normalized.includes(keyword),
            );

            if (isSensitiveSdkPath || hasSensitiveKeyword) {
                const reason = isSensitiveSdkPath
                    ? "console-call-in-sensitive-sdk-path"
                    : "sensitive-keyword-log";
                findings.push(
                    `${fullPath}:${index + 1}: [${reason}] ${line.trim()}`,
                );
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
