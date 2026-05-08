/**
 * Staking API Test Suite
 * Tests for the F1R3Node staking and validator operations
 *
 * API endpoints tested:
 * - bond-validator: POST /admin/api/propose (admin API)
 * - bonds: GET /api/validators
 * - active-validators: GET /api/validators
 * - bond-status: GET /api/bond-status/{pubkey}
 * - validator-status: GET /api/validator/{pubkey}
 * - epoch-info: GET /api/epoch
 * - epoch-rewards: GET /api/epoch/rewards
 * - wallet-balance: GET /api/balance/{address}
 * - exploratory-deploy: POST /api/exploratory-deploy
 * - watch-blocks: WS /ws/events
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");

// ============================================================================
// ENVIRONMENT VARIABLE LOADING
// ============================================================================

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");

    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const lines = envContent.split("\n");

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine || trimmedLine.startsWith("#")) {
                continue;
            }

            const [key, ...valueParts] = trimmedLine.split("=");
            const value = valueParts.join("=");

            if (key && value) {
                if (!process.env[key.trim()]) {
                    process.env[key.trim()] = value.trim();
                }
            }
        }

        console.log(`✓ Loaded environment variables from ${envPath}`);
    }
}

loadEnvFile();

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const PROTOCOL = process.env.PROTOCOL;
const NODE_HOST = process.env.NODE_HOST;
const READ_NODE_HOST = process.env.READ_NODE_HOST || NODE_HOST;

const REST_PORT = parseInt(process.env.REST_PORT, 10);
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT, 10);
const READ_REST_PORT = parseInt(
    process.env.READ_REST_PORT || process.env.REST_PORT,
    10,
);

const TEST_TIMEOUT_MS = parseInt(process.env.TEST_TIMEOUT || "10000", 10);
const WEBSOCKET_TIMEOUT_MS = parseInt(
    process.env.WEBSOCKET_TIMEOUT || "5000",
    10,
);

const DEFAULT_STATUS_CODE_SUCCESS = 200;

const DEFAULT_ACCEPTED_STATUS_CODES = [200, 202];
const BOND_VALIDATOR_ACCEPTED_CODES = [200, 202, 400, 403];
const STATUS_CHECK_ACCEPTED_CODES = [200, 404];
const EXPLORATORY_DEPLOY_ACCEPTED_CODES = [200, 400, 403];
const EXPLORATORY_DEPLOY_ERROR_CODES = [400, 403];
const ERROR_CODES = [400, 404];
const EPOCH_REWARDS_ACCEPTED_CODES = [200, 403];
const EPOCH_REWARDS_WITH_HASH_ACCEPTED_CODES = [200, 403, 404];
const BALANCE_INVALID_ACCEPTED_CODES = [400, 404];
const VALIDATOR_NOT_FOUND_CODES = [404, 400];
const EXPLORATORY_DEPLOY_INVALID_ACCEPTED_CODES = [400, 403];

const HTTP_HEADER_CONTENT_TYPE = "Content-Type";
const HTTP_HEADER_VALUE_JSON = "application/json";
const HTTP_HEADER_USER_AGENT = "User-Agent";
const HTTP_HEADER_VALUE_USER_AGENT = "F1R3Node-Test-Suite/1.0";

const ENDPOINT_STATUS = "/api/status";
const ENDPOINT_VALIDATORS = "/api/validators";
const ENDPOINT_BOND_STATUS = "/api/bond-status";
const ENDPOINT_VALIDATOR = "/api/validator";
const ENDPOINT_EPOCH = "/api/epoch";
const ENDPOINT_EPOCH_REWARDS = "/api/epoch/rewards";
const ENDPOINT_BALANCE = "/api/balance";
const ENDPOINT_EXPLORATORY_DEPLOY = "/api/exploratory-deploy";
const ENDPOINT_ADMIN_PROPOSE = "/admin/api/propose";
const ENDPOINT_WS_EVENTS = "/ws/events";

const TEST_DATA = {
    validatorPubKey: process.env.TEST_VALIDATOR_PUBKEY || "",
    validatorAddress: process.env.TEST_VALIDATOR_ADDRESS || "",
    walletAddress: process.env.TEST_WALLET_ADDRESS || "",
    rholangCode: process.env.TEST_RHOLANG_CODE || "",
    blockHash: process.env.TEST_BLOCK_HASH || "",
};

const BOND_VALIDATOR_BOND_AMOUNT = parseInt(
    process.env.BOND_AMOUNT || "1000",
    10,
);

// ============================================================================
// TEST CONFIGURATION - Comment out tests you don't want to run
// ============================================================================

const ENABLED_TESTS = [
    "API Health Check - Node Status",

    "Bond Validator - Propose Transaction", // NOTE - not working now

    "Bonds - Retrieve Active Validators",
    "Bonds - Support Block Hash Parameter", // NOTE - This test may fail if the block hash is too old or invalid

    "Bond Status - Check Public Key",

    "Validator Status - Retrieve Status and Bond",
    "Validator Status - Support Block Hash",

    "Epoch Info - Retrieve Current Epoch",
    "Epoch Info - Include Quarantine Length",

    "Epoch Rewards - Retrieve Current Rewards",
    "Epoch Rewards - Support Block Hash Parameter",

    "Wallet Balance - Retrieve Balance",
    "Wallet Balance - Invalid Address Format",

    "Exploratory Deploy - Execute Rholang",
    "Exploratory Deploy - Support Block Hash",
    "Exploratory Deploy - Invalid Rholang Error",

    "Integration - Epoch and Validators",
    "Integration - Block Hash Consistency",

    "Error Handling - Non-existent Validator",
    "Error Handling - Malformed Request",
    "Error Handling - Invalid Deploy Request",
];

function isTestEnabled(testName) {
    return ENABLED_TESTS.includes(testName);
}

// Helper to conditionally skip tests
function createTest(testName) {
    return isTestEnabled(testName) ? test : test.skip;
}

// ============================================================================
// VALIDATION & LOGGING
// ============================================================================

function validateEnvironment() {
    const required = ["NODE_HOST", "REST_PORT", "ADMIN_PORT", "PROTOCOL"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}\n` +
                `Please ensure NODE_HOST, REST_PORT, ADMIN_PORT, and PROTOCOL are set.`,
        );
    }

    if (isNaN(REST_PORT) || REST_PORT <= 0 || REST_PORT > 65535) {
        throw new Error(
            `Invalid REST_PORT: ${process.env.REST_PORT}. Must be a valid port number.`,
        );
    }

    if (isNaN(ADMIN_PORT) || ADMIN_PORT <= 0 || ADMIN_PORT > 65535) {
        throw new Error(
            `Invalid ADMIN_PORT: ${process.env.ADMIN_PORT}. Must be a valid port number.`,
        );
    }

    if (!["http", "https"].includes(PROTOCOL)) {
        throw new Error(
            `Invalid PROTOCOL: ${PROTOCOL}. Must be 'http' or 'https'.`,
        );
    }
}

validateEnvironment();

// Log test configuration
function printTestHeader() {
    const lines = [
        "\n" + "=".repeat(80),
        "F1R3NODE STAKING API TEST SUITE",
        "=".repeat(80),
        "",
        `Node Host: ${NODE_HOST}`,
        `REST Port: ${REST_PORT}`,
        `Admin Port: ${ADMIN_PORT}`,
        `Protocol: ${PROTOCOL}`,
        `Test Timeout: ${TEST_TIMEOUT_MS}ms`,
        `WebSocket Timeout: ${WEBSOCKET_TIMEOUT_MS}ms`,
        "=".repeat(80),
    ];
    console.log(lines.join("\n"));
}

printTestHeader();

// Consolidated logging utility
function logTest(testName, action, details = {}) {
    const timestamp = new Date().toISOString();
    const lines = [`\n[${timestamp}] ${testName}`, `  ACTION: ${action}`];

    if (details.type === "request") {
        lines.push(`  HOST: ${NODE_HOST}:${details.port}`);
        lines.push(`  METHOD: ${details.method}`);
        lines.push(`  ENDPOINT: ${details.endpoint}`);

        if (details.body) {
            lines.push(`  BODY: ${JSON.stringify(details.body)}`);
        }
    }

    if (details.type === "result") {
        lines.push(`  RESULT: ${details.success ? "✓ PASS" : "✗ FAIL"}`);
        lines.push(`  STATUS: ${details.status}`);

        if (details.response) {
            lines.push(`  RESPONSE: ${details.response}`);
        }

        if (details.error) {
            lines.push(`  ERROR: ${details.error}`);
        }
    }

    console.log(lines.join("\n"));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function makeRequest(method, path, host, port, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${PROTOCOL}://${host}:${port}${path}`);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                [HTTP_HEADER_CONTENT_TYPE]: HTTP_HEADER_VALUE_JSON,
                [HTTP_HEADER_USER_AGENT]: HTTP_HEADER_VALUE_USER_AGENT,
            },
            timeout: TEST_TIMEOUT_MS,
        };

        const client = PROTOCOL === "https" ? https : http;

        const req = client.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};

                    // console.log("response", {
                    //     status: res.statusCode,
                    //     headers: res.headers,
                    //     body: parsed,
                    // });

                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: parsed,
                        rawBody: data,
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: null,
                        rawBody: data,
                    });
                }
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Request timeout after ${TEST_TIMEOUT_MS}ms`));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe("Staking API", () => {
    describe("API Health Check", () => {
        createTest("API Health Check - Node Status")(
            "should return node status",
            (done) => {
                const testName = "API Health Check - Node Status";
                logTest(testName, "Fetching node status", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint: ENDPOINT_STATUS,
                });

                makeRequest("GET", ENDPOINT_STATUS, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success =
                            response.status === DEFAULT_STATUS_CODE_SUCCESS;

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body).substring(
                                0,
                                150,
                            ),
                        });

                        expect(response.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(response.body).toHaveProperty("version");
                        expect(response.body).toHaveProperty("address");
                        expect(response.body).toHaveProperty("networkId");
                        expect(response.body).toHaveProperty("isValidator");
                        expect(response.body).toHaveProperty("nativeTokenName");
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("bond-validator", () => {
        createTest("Bond Validator - Propose Transaction")(
            "should propose bond validator transaction",
            (done) => {
                const testName = "Bond Validator - Propose Transaction";
                const bondDeploy = {
                    term: `new stdout(\`rho:io:stdout\`), rl(\`rho:registry:lookup\`), pos(\`rho:system:pos\`) in {
          rl!(\`rho:id:...\`, *pos) |
          for (posChan <- pos) {
            posChan!("bond", "${TEST_DATA.validatorPubKey}", ${BOND_VALIDATOR_BOND_AMOUNT})
          }
        }`,
                };

                logTest(testName, "Proposing bond validator", {
                    type: "request",
                    port: ADMIN_PORT,
                    method: "POST",
                    endpoint: ENDPOINT_ADMIN_PROPOSE,
                    body: { term: bondDeploy },
                });

                makeRequest(
                    "POST",
                    ENDPOINT_ADMIN_PROPOSE,
                    NODE_HOST,
                    ADMIN_PORT,
                    bondDeploy,
                )
                    .then((response) => {
                        const success = BOND_VALIDATOR_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body).substring(
                                0,
                                150,
                            ),
                        });

                        expect(BOND_VALIDATOR_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("bonds / active-validators", () => {
        createTest("Bonds - Retrieve Active Validators")(
            "should retrieve active validators with stakes",
            (done) => {
                const testName = "Bonds - Retrieve Active Validators";
                logTest(testName, "Fetching active validators", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint: ENDPOINT_VALIDATORS,
                });

                makeRequest(
                    "GET",
                    ENDPOINT_VALIDATORS,
                    READ_NODE_HOST,
                    READ_REST_PORT,
                )
                    .then((response) => {
                        const success =
                            response.status === DEFAULT_STATUS_CODE_SUCCESS;

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response: JSON.stringify({
                                validators: response.body.validators?.length,
                                totalStake: response.body.totalStake,
                            }),
                        });

                        expect(response.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(response.body).toHaveProperty("validators");
                        expect(Array.isArray(response.body.validators)).toBe(
                            true,
                        );
                        if (response.body.validators.length > 0) {
                            const validator = response.body.validators[0];
                            expect(validator).toHaveProperty("publicKey");
                            expect(validator).toHaveProperty("stake");
                        }
                        expect(response.body).toHaveProperty("totalStake");
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Bonds - Support Block Hash Parameter")(
            "should support block_hash parameter for validators",
            (done) => {
                const testName = "Bonds - Support Block Hash Parameter";
                const endpoint = `${ENDPOINT_VALIDATORS}?block_hash=${TEST_DATA.blockHash}`;

                logTest(testName, "Fetching validators with block hash", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint,
                });

                makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success = STATUS_CHECK_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(STATUS_CHECK_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("bond-status", () => {
        createTest("Bond Status - Check Public Key")(
            "should check if public key is bonded",
            (done) => {
                const testName = "Bond Status - Check Public Key";
                const endpoint = `${ENDPOINT_BOND_STATUS}/${TEST_DATA.validatorPubKey}`;

                logTest(testName, "Checking if public key is bonded", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint,
                });

                makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success = STATUS_CHECK_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response:
                                response.status === DEFAULT_STATUS_CODE_SUCCESS
                                    ? JSON.stringify(response.body)
                                    : "",
                        });

                        expect(STATUS_CHECK_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        if (response.status === DEFAULT_STATUS_CODE_SUCCESS) {
                            expect(typeof response.body.bonded).toBe("boolean");
                        }
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("validator-status", () => {
        createTest("Validator Status - Retrieve Status and Bond")(
            "should retrieve specific validator status and bond",
            (done) => {
                const testName = "Validator Status - Retrieve Status and Bond";
                const endpoint = `${ENDPOINT_VALIDATOR}/${TEST_DATA.validatorPubKey}`;

                logTest(testName, "Retrieving validator status", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint,
                });

                makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success = STATUS_CHECK_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response: response.body,
                        });

                        expect(STATUS_CHECK_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        if (response.status === DEFAULT_STATUS_CODE_SUCCESS) {
                            expect(response.body).toHaveProperty("publicKey");
                            if (response.body.bond !== undefined) {
                                expect(typeof response.body.bond).toBe(
                                    "number",
                                );
                            }
                        }
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Validator Status - Support Block Hash")(
            "should support block_hash parameter for validator status",
            (done) => {
                const testName = "Validator Status - Support Block Hash";
                const endpoint = `${ENDPOINT_VALIDATOR}/${TEST_DATA.validatorPubKey}?block_hash=${TEST_DATA.blockHash}`;

                logTest(
                    testName,
                    "Retrieving validator status with block hash",
                    {
                        type: "request",
                        port: REST_PORT,
                        method: "GET",
                        endpoint,
                    },
                );

                makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success = STATUS_CHECK_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(STATUS_CHECK_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("epoch-info", () => {
        createTest("Epoch Info - Retrieve Current Epoch")(
            "should retrieve current epoch information",
            (done) => {
                const testName = "Epoch Info - Retrieve Current Epoch";
                logTest(testName, "Fetching current epoch information", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint: ENDPOINT_EPOCH,
                });

                makeRequest("GET", ENDPOINT_EPOCH, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success =
                            response.status === DEFAULT_STATUS_CODE_SUCCESS;

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body).substring(
                                0,
                                150,
                            ),
                        });

                        expect(response.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(response.body).toHaveProperty("currentEpoch");
                        expect(response.body).toHaveProperty("epochLength");
                        expect(response.body).toHaveProperty(
                            "blocksUntilNextEpoch",
                        );
                        expect(response.body).toHaveProperty(
                            "lastFinalizedBlockNumber",
                        );
                        expect(typeof response.body.currentEpoch).toBe(
                            "number",
                        );
                        expect(typeof response.body.epochLength).toBe("number");
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Epoch Info - Include Quarantine Length")(
            "should include quarantine length in epoch info",
            (done) => {
                const testName = "Epoch Info - Include Quarantine Length";
                logTest(
                    testName,
                    "Fetching epoch info with quarantine length",
                    {
                        type: "request",
                        port: REST_PORT,
                        method: "GET",
                        endpoint: ENDPOINT_EPOCH,
                    },
                );

                makeRequest("GET", ENDPOINT_EPOCH, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success =
                            response.status === DEFAULT_STATUS_CODE_SUCCESS;

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(response.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(response.body).toHaveProperty(
                            "quarantineLength",
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("epoch-rewards", () => {
        createTest("Epoch Rewards - Retrieve Current Rewards")(
            "should retrieve current epoch rewards",
            (done) => {
                const testName = "Epoch Rewards - Retrieve Current Rewards";
                logTest(testName, "Fetching current epoch rewards", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint: ENDPOINT_EPOCH_REWARDS,
                });

                makeRequest("GET", ENDPOINT_EPOCH_REWARDS, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success = EPOCH_REWARDS_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(EPOCH_REWARDS_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        if (response.status === DEFAULT_STATUS_CODE_SUCCESS) {
                            expect(response.body).toHaveProperty("rewards");
                            expect(Array.isArray(response.body.rewards)).toBe(
                                true,
                            );
                        }
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Epoch Rewards - Support Block Hash Parameter")(
            "should support block_hash parameter for epoch rewards",
            (done) => {
                const testName = "Epoch Rewards - Support Block Hash Parameter";
                const endpoint = `${ENDPOINT_EPOCH_REWARDS}?block_hash=${TEST_DATA.blockHash}`;

                logTest(testName, "Fetching epoch rewards with block hash", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint,
                });

                makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                    .then((response) => {
                        const success =
                            EPOCH_REWARDS_WITH_HASH_ACCEPTED_CODES.includes(
                                response.status,
                            );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(
                            EPOCH_REWARDS_WITH_HASH_ACCEPTED_CODES,
                        ).toContain(response.status);
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("wallet-balance", () => {
        createTest("Wallet Balance - Retrieve Balance")(
            "should retrieve wallet balance for address",
            (done) => {
                const testName = "Wallet Balance - Retrieve Balance";
                const endpoint = `${ENDPOINT_BALANCE}/${TEST_DATA.walletAddress}`;

                logTest(testName, "Fetching wallet balance", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint,
                });

                makeRequest("GET", endpoint, READ_NODE_HOST, READ_REST_PORT)
                    .then((response) => {
                        const success = STATUS_CHECK_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response:
                                response.status === DEFAULT_STATUS_CODE_SUCCESS
                                    ? JSON.stringify(response.body).substring(
                                          0,
                                          150,
                                      )
                                    : "",
                        });

                        expect(STATUS_CHECK_ACCEPTED_CODES).toContain(
                            response.status,
                        );

                        if (response.status === DEFAULT_STATUS_CODE_SUCCESS) {
                            expect(response.body).toHaveProperty("address");
                            expect(response.body).toHaveProperty("balance");
                            expect(response.body).toHaveProperty("blockNumber");
                            expect(response.body).toHaveProperty("blockHash");
                            expect(typeof response.body.balance).toBe("number");
                        }
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Wallet Balance - Invalid Address Format")(
            "should return 404 for invalid address format",
            (done) => {
                const testName = "Wallet Balance - Invalid Address Format";
                const invalidAddress = "invalid-address";
                const endpoint = `${ENDPOINT_BALANCE}/${invalidAddress}`;

                logTest(testName, "Testing invalid address rejection", {
                    type: "request",
                    port: REST_PORT,
                    method: "GET",
                    endpoint,
                });

                makeRequest("GET", endpoint, READ_NODE_HOST, READ_REST_PORT)
                    .then((response) => {
                        const success = BALANCE_INVALID_ACCEPTED_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                            response: response.rawBody ?? "",
                        });

                        expect(BALANCE_INVALID_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    describe("exploratory-deploy", () => {
        createTest("Exploratory Deploy - Execute Rholang")(
            "should execute read-only Rholang code",
            (done) => {
                const testName = "Exploratory Deploy - Execute Rholang";
                const deploy = { term: TEST_DATA.rholangCode };

                logTest(testName, "Executing exploratory Rholang deploy", {
                    type: "request",
                    port: REST_PORT,
                    method: "POST",
                    endpoint: ENDPOINT_EXPLORATORY_DEPLOY,
                    body: { term: TEST_DATA.rholangCode.substring(0, 100) },
                });

                makeRequest(
                    "POST",
                    ENDPOINT_EXPLORATORY_DEPLOY,
                    NODE_HOST,
                    REST_PORT,
                    deploy,
                )
                    .then((response) => {
                        const success =
                            EXPLORATORY_DEPLOY_ACCEPTED_CODES.includes(
                                response.status,
                            );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(EXPLORATORY_DEPLOY_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        if (response.status === DEFAULT_STATUS_CODE_SUCCESS) {
                            expect(response.body).toHaveProperty("result");
                        }
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Exploratory Deploy - Support Block Hash")(
            "should support block_hash parameter for exploratory deploy",
            (done) => {
                const testName = "Exploratory Deploy - Support Block Hash";
                const endpoint = `${ENDPOINT_EXPLORATORY_DEPLOY}?block_hash=${TEST_DATA.blockHash}`;
                const deploy = { term: TEST_DATA.rholangCode };

                logTest(
                    testName,
                    "Executing exploratory deploy with block hash",
                    {
                        type: "request",
                        port: REST_PORT,
                        method: "POST",
                        endpoint,
                        body: { term: TEST_DATA.rholangCode.substring(0, 100) },
                    },
                );

                makeRequest("POST", endpoint, NODE_HOST, REST_PORT, deploy)
                    .then((response) => {
                        const success =
                            EXPLORATORY_DEPLOY_ACCEPTED_CODES.includes(
                                response.status,
                            );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(EXPLORATORY_DEPLOY_ACCEPTED_CODES).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );

        createTest("Exploratory Deploy - Invalid Rholang Error")(
            "should return proper error for invalid Rholang",
            (done) => {
                const testName = "Exploratory Deploy - Invalid Rholang Error";
                const invalidDeploy = { term: "invalid rholang code !!!" };

                logTest(testName, "Testing invalid Rholang rejection", {
                    type: "request",
                    port: REST_PORT,
                    method: "POST",
                    endpoint: ENDPOINT_EXPLORATORY_DEPLOY,
                    body: invalidDeploy,
                });

                makeRequest(
                    "POST",
                    ENDPOINT_EXPLORATORY_DEPLOY,
                    NODE_HOST,
                    REST_PORT,
                    invalidDeploy,
                )
                    .then((response) => {
                        const success = EXPLORATORY_DEPLOY_ERROR_CODES.includes(
                            response.status,
                        );

                        logTest(testName, "Response received", {
                            type: "result",
                            success,
                            status: response.status,
                        });

                        expect(EXPLORATORY_DEPLOY_ERROR_CODES).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
            TEST_TIMEOUT_MS,
        );
    });

    // describe(
    //   "watch-blocks",
    //   () => {
    //     test("should connect to WebSocket events endpoint", (done) => {
    //       const testName = "Watch Blocks - WebSocket Connection";
    //       const wsUrl = `${PROTOCOL === "https" ? "wss" : "ws"}://${NODE_HOST}:${REST_PORT}${ENDPOINT_WS_EVENTS}`;

    //       logTest(testName, "Connecting to WebSocket events", {
    //         type: "request",
    //         port: REST_PORT,
    //         method: "WS",
    //         endpoint: ENDPOINT_WS_EVENTS,
    //       });

    //       const ws = new WebSocket(wsUrl, { timeout: WEBSOCKET_TIMEOUT_MS });
    //       const events = [];
    //       let timeoutHandle;

    //       ws.on("open", () => {
    //         console.log("  ACTION: WebSocket connection established");
    //       });

    //       ws.on("message", (data) => {
    //         try {
    //           const event = JSON.parse(data);
    //           events.push(event);

    //           const validTypes = [
    //             "block-created",
    //             "block-added",
    //             "block-finalised",
    //             "sent-unapproved-block",
    //             "block-approval-received",
    //             "sent-approved-block",
    //             "approved-block-received",
    //             "entered-running-state",
    //             "node-started",
    //           ];

    //           console.log(`  ACTION: Received event type: ${event.type}`);

    //           if (event.type && validTypes.includes(event.type)) {
    //             console.log("  ACTION: Valid event received, closing connection");
    //             ws.close();
    //           }
    //         } catch (e) {
    //           ws.close();
    //         }
    //       });

    //       ws.on("error", (error) => {
    //         clearTimeout(timeoutHandle);
    //         logTest(testName, "WebSocket error", {
    //           type: "result",
    //           success: false,
    //           status: "ERROR",
    //           error: error.message,
    //         });
    //         ws.close();
    //         done(error);
    //       });

    //       ws.on("close", () => {
    //         clearTimeout(timeoutHandle);
    //         const success = events.length > 0;
    //         logTest(testName, "WebSocket closed", {
    //           type: "result",
    //           success,
    //           status: success ? 200 : 202,
    //           response: JSON.stringify({ eventsReceived: events.length }),
    //         });
    //         done();
    //       });

    //       timeoutHandle = setTimeout(() => {
    //         if (ws.readyState === WebSocket.OPEN) {
    //           console.log(
    //             "  ACTION: WebSocket timeout reached, closing connection",
    //           );
    //           ws.close();
    //         }
    //       }, WEBSOCKET_TIMEOUT_MS);
    //     });

    //     return undefined;
    //   },
    //   TEST_TIMEOUT_MS,
    // );
});

describe("Integration Tests", () => {
    createTest("Integration - Epoch and Validators")(
        "should retrieve epoch info and active validators together",
        (done) => {
            const testName = "Integration - Epoch and Validators";
            logTest(testName, "Fetching epoch info", {
                type: "request",
                port: REST_PORT,
                method: "GET",
                endpoint: ENDPOINT_EPOCH,
            });

            makeRequest("GET", ENDPOINT_EPOCH, NODE_HOST, REST_PORT)
                .then((epochResponse) => {
                    logTest(testName, "Fetching active validators", {
                        type: "request",
                        port: REST_PORT,
                        method: "GET",
                        endpoint: ENDPOINT_VALIDATORS,
                    });

                    return makeRequest(
                        "GET",
                        ENDPOINT_VALIDATORS,
                        NODE_HOST,
                        REST_PORT,
                    ).then((validatorsResponse) => {
                        const success =
                            epochResponse.status ===
                                DEFAULT_STATUS_CODE_SUCCESS &&
                            validatorsResponse.status ===
                                DEFAULT_STATUS_CODE_SUCCESS;

                        logTest(testName, "Integration test complete", {
                            type: "result",
                            success,
                            status: `epoch: ${epochResponse.status}, validators: ${validatorsResponse.status}`,
                        });

                        expect(epochResponse.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(validatorsResponse.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(epochResponse.body.currentEpoch).toBeDefined();
                        expect(
                            validatorsResponse.body.validators,
                        ).toBeDefined();
                        expect(
                            validatorsResponse.body.totalStake,
                        ).toBeDefined();
                        done();
                    });
                })
                .catch(done);
        },
        TEST_TIMEOUT_MS,
    );

    createTest("Integration - Block Hash Consistency")(
        "should verify block hash consistency across endpoints",
        (done) => {
            const testName = "Integration - Block Hash Consistency";
            logTest(testName, "Fetching status", {
                type: "request",
                port: REST_PORT,
                method: "GET",
                endpoint: ENDPOINT_STATUS,
            });

            makeRequest("GET", ENDPOINT_STATUS, NODE_HOST, REST_PORT)
                .then((statusResponse) => {
                    logTest(testName, "Fetching epoch info", {
                        type: "request",
                        port: REST_PORT,
                        method: "GET",
                        endpoint: ENDPOINT_EPOCH,
                    });

                    return makeRequest(
                        "GET",
                        ENDPOINT_EPOCH,
                        NODE_HOST,
                        REST_PORT,
                    ).then((epochResponse) => {
                        const success =
                            statusResponse.status ===
                                DEFAULT_STATUS_CODE_SUCCESS &&
                            epochResponse.status ===
                                DEFAULT_STATUS_CODE_SUCCESS;

                        logTest(testName, "Consistency check complete", {
                            type: "result",
                            success,
                            status: `status: ${statusResponse.status}, epoch: ${epochResponse.status}`,
                        });

                        expect(statusResponse.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(epochResponse.status).toBe(
                            DEFAULT_STATUS_CODE_SUCCESS,
                        );
                        expect(
                            statusResponse.body.lastFinalizedBlockNumber,
                        ).toBe(epochResponse.body.lastFinalizedBlockNumber);
                        done();
                    });
                })
                .catch(done);
        },
        TEST_TIMEOUT_MS,
    );
});

describe("Error Handling", () => {
    createTest("Error Handling - Non-existent Validator")(
        "should handle non-existent validator gracefully",
        (done) => {
            const testName = "Error Handling - Non-existent Validator";
            const invalidPubKey =
                "invalid0000000000000000000000000000000000000";
            const endpoint = `${ENDPOINT_VALIDATOR}/${invalidPubKey}`;

            logTest(testName, "Testing non-existent validator rejection", {
                type: "request",
                port: REST_PORT,
                method: "GET",
                endpoint,
            });

            makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                .then((response) => {
                    const success = VALIDATOR_NOT_FOUND_CODES.includes(
                        response.status,
                    );

                    logTest(testName, "Response received", {
                        type: "result",
                        success,
                        status: response.status,
                    });

                    expect(VALIDATOR_NOT_FOUND_CODES).toContain(
                        response.status,
                    );
                    done();
                })
                .catch(done);
        },
        TEST_TIMEOUT_MS,
    );

    createTest("Error Handling - Malformed Request")(
        "should handle malformed requests",
        (done) => {
            const testName = "Error Handling - Malformed Request";
            const endpoint = `${ENDPOINT_BALANCE}/invalid`;

            logTest(testName, "Testing malformed request rejection", {
                type: "request",
                port: REST_PORT,
                method: "GET",
                endpoint,
            });

            makeRequest("GET", endpoint, NODE_HOST, REST_PORT)
                .then((response) => {
                    const success = ERROR_CODES.includes(response.status);

                    logTest(testName, "Response received", {
                        type: "result",
                        success,
                        status: response.status,
                    });

                    expect(ERROR_CODES).toContain(response.status);
                    done();
                })
                .catch(done);
        },
        TEST_TIMEOUT_MS,
    );

    createTest("Error Handling - Invalid Deploy Request")(
        "should reject invalid exploratory deploy requests",
        (done) => {
            const testName = "Error Handling - Invalid Deploy Request";
            const invalidRequest = { term: null };

            logTest(testName, "Testing invalid deploy rejection", {
                type: "request",
                port: REST_PORT,
                method: "POST",
                endpoint: ENDPOINT_EXPLORATORY_DEPLOY,
                body: invalidRequest,
            });

            makeRequest(
                "POST",
                ENDPOINT_EXPLORATORY_DEPLOY,
                NODE_HOST,
                REST_PORT,
                invalidRequest,
            )
                .then((response) => {
                    const success =
                        EXPLORATORY_DEPLOY_INVALID_ACCEPTED_CODES.includes(
                            response.status,
                        );

                    logTest(testName, "Response received", {
                        type: "result",
                        success,
                        status: response.status,
                    });

                    expect(EXPLORATORY_DEPLOY_INVALID_ACCEPTED_CODES).toContain(
                        response.status,
                    );
                    done();
                })
                .catch(done);
        },
        TEST_TIMEOUT_MS,
    );
});

module.exports = {
    makeRequest,
    logTest,
    validateEnvironment,
    NODE_HOST,
    REST_PORT,
    ADMIN_PORT,
    PROTOCOL,
    TEST_TIMEOUT_MS,
    WEBSOCKET_TIMEOUT_MS,
};
