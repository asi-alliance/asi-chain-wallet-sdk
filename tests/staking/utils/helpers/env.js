const fs = require("fs");
const path = require("path");
const { write, printSeparator, LogFormats } = require("./log");
const { REQUIRED_ENV_VARIABLES } = require("../../config");

function loadEnvFile() {
    const envPath = path.join(__dirname, "../../.env");

    write(`${LogFormats.title("[PREPARE]")} Loading environment`);

    write(`PATH: ${envPath}`);

    if (!fs.existsSync(envPath)) {
        write(`${LogFormats.warn("[SKIP]")} .env file not found`);

        return;
    }

    const envContent = fs.readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");

    let loadedCount = 0;

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (!trimmedLine || trimmedLine.startsWith("#")) {
            continue;
        }

        const [key, ...valueParts] = trimmedLine.split("=");
        const value = valueParts.join("=");

        if (!key || !value || process.env[key.trim()]) {
            continue;
        }

        process.env[key.trim()] = value.trim();
        loadedCount++;
    }

    write(`${LogFormats.success("✓ ENV LOADED")} variables=${loadedCount}`);
    write("");
}

function validateEnvironment(specialCheckingEnv) {
    const missing = REQUIRED_ENV_VARIABLES.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}\n` +
                `Please ensure NODE_HOST, REST_PORT, ADMIN_PORT, and PROTOCOL are set.`,
        );
    }

    if (
        isNaN(specialCheckingEnv.REST_PORT) ||
        specialCheckingEnv.REST_PORT <= 0 ||
        specialCheckingEnv.REST_PORT > 65535
    ) {
        throw new Error(
            `Invalid REST_PORT: ${process.env.REST_PORT}. Must be a valid port number.`,
        );
    }

    if (
        isNaN(specialCheckingEnv.ADMIN_PORT) ||
        specialCheckingEnv.ADMIN_PORT <= 0 ||
        specialCheckingEnv.ADMIN_PORT > 65535
    ) {
        throw new Error(
            `Invalid ADMIN_PORT: ${process.env.ADMIN_PORT}. Must be a valid port number.`,
        );
    }

    if (!["http", "https"].includes(specialCheckingEnv.PROTOCOL)) {
        throw new Error(
            `Invalid PROTOCOL: ${specialCheckingEnv.PROTOCOL}. Must be 'http' or 'https'.`,
        );
    }
}

module.exports = {
    loadEnvFile,
    validateEnvironment,
};
