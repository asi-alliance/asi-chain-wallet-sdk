import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "playground/src"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const CONSOLE_PATTERN = /console\.(log|info|debug|warn|error|trace)\s*\(/;
const MAX_STATEMENT_LINES = 12;
const SENSITIVE_KEYWORDS = [
    "private",
    "mnemonic",
    "seed",
    "secret",
    "password",
    "passphrase",
    "keyfile",
    "decrypted",
    "signed deploy",
];
const SENSITIVE_SDK_PATH_PREFIXES = [
    "src/domains/Deploy/",
    "src/domains/SecretsProvider/",
    "src/domains/Signer/",
    "src/domains/SigningSession/",
    "src/domains/Wallet/",
    "src/services/AssetsService/",
    "src/services/Crypto/",
    "src/services/ExportKeyfileService/",
    "src/services/ImportKeyfileService/",
    "src/services/KeyDerivation/",
    "src/services/KeyFingerprint/",
    "src/services/KeyfileSerializer/",
    "src/services/KeysManager/",
    "src/services/Mnemonic/",
    "src/services/Signer/",
    "src/services/WalletImport/",
    "src/services/WalletPersistence/",
    "src/services/Wallets/",
];

const findings = [];

const stripStringLiterals = (line) =>
    line
        .replace(/\\./g, "")
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``");

const readConsoleStatement = (lines, startIndex) => {
    const lastIndex = Math.min(
        lines.length - 1,
        startIndex + MAX_STATEMENT_LINES - 1,
    );
    let depth = 0;
    let statement = "";

    for (let index = startIndex; index <= lastIndex; index += 1) {
        const line = lines[index];
        statement += `${line}\n`;

        for (const character of stripStringLiterals(line)) {
            if (character === "(") {
                depth += 1;
            }

            if (character === ")") {
                depth -= 1;
            }
        }

        if (depth <= 0) {
            break;
        }
    }

    return statement.toLowerCase();
};

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
            if (!CONSOLE_PATTERN.test(line)) {
                return;
            }

            const statement = readConsoleStatement(lines, index);
            const hasSensitiveKeyword = SENSITIVE_KEYWORDS.some((keyword) =>
                statement.includes(keyword),
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