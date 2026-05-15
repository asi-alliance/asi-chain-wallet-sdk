/**
 * Staking API Test Suite
 * Tests for the F1R3Node staking and validator operations
 *
 * API Endpoints tested:
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

const WebSocket = require("ws");
const {
    PROTOCOL,
    NODE_HOST,
    READ_NODE_HOST,

    REST_PORT,
    ADMIN_PORT,
    READ_REST_PORT,

    TEST_TIMEOUT_MS,
    WEBSOCKET_TIMEOUT_MS,

    TEST_DATA,
    BOND_VALIDATOR_BOND_AMOUNT,
} = require("./config/env");
const {
    HttpStatus,
    AcceptedStatusCodes,
    Endpoints,
} = require("./utils/constants");
const { ENABLED_TESTS } = require("./config");
const { HttpMethods, makeGet, makePost } = require("./utils/helpers/request");
const { RequestClientTypes, buildUrl } = require("./utils/helpers/url-builder");
const {
    testWrapper,
    printTestHeader,
    logTestRequest,
    logTestResult,
    createTestFlow,
} = require("./utils/test");
const { createDevCheckBalanceDeploy } = require("./utils/helpers/rholang");

printTestHeader();

describe("Staking API", () => {
    describe("API Health Check", () => {
        testWrapper("API Health Check - Node Status")(
            "should return node status",
            (done) => {
                const testName = "API Health Check - Node Status";
                logTestRequest(testName, "Fetching node status", {
                    port: REST_PORT,
                    method: HttpMethods.GET,
                    endpoint: Endpoints.STATUS,
                });

                const url = buildUrl(
                    Endpoints.STATUS,
                    RequestClientTypes.MAIN_REST,
                );

                makeGet(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                        });

                        expect(response.status).toBe(HttpStatus.SUCCESS);
                        expect(response.body).toHaveProperty("version");
                        expect(response.body).toHaveProperty("address");
                        expect(response.body).toHaveProperty("networkId");
                        expect(response.body).toHaveProperty("isValidator");
                        expect(response.body).toHaveProperty("nativeTokenName");
                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("bond-validator", () => {
        testWrapper("Bond Validator - Propose Transaction")(
            "should propose bond validator transaction",
            (done) => {
                const testName = "Bond Validator - Propose Transaction";

                logTestRequest(testName, "Proposing bond validator", {
                    port: ADMIN_PORT,
                    method: HttpMethods.POST,
                    endpoint: Endpoints.ADMIN_PROPOSE,
                });

                const url = buildUrl(
                    Endpoints.ADMIN_PROPOSE,
                    RequestClientTypes.ADMIN,
                );

                makePost(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.BOND_VALIDATOR.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                            // TODO Something went wrong: Failure: Proposal failed: NoNewDeploys. No unprocessed deploys in pool.
                        });

                        expect(AcceptedStatusCodes.BOND_VALIDATOR).toContain(
                            response.status,
                        );

                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("bonds / active-validators", () => {
        testWrapper("Bonds - Retrieve Active Validators")(
            "should retrieve active validators with stakes",
            (done) => {
                const testName = "Bonds - Retrieve Active Validators";
                logTestRequest(testName, "Fetching active validators", {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint: Endpoints.VALIDATORS,
                });

                const url = buildUrl(
                    Endpoints.VALIDATORS,
                    RequestClientTypes.READ_REST,
                );

                makeGet(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify({
                                validators: response.body.validators?.length,
                                totalStake: response.body.totalStake,
                            }),
                        });

                        expect(response.status).toBe(HttpStatus.SUCCESS);
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
        );

        testWrapper("Bonds - Support Block Hash Parameter")(
            "should support block_hash parameter for validators",
            (done) => {
                const testName = "Bonds - Support Block Hash Parameter";
                const endpoint = `${Endpoints.VALIDATORS}?block_hash=${TEST_DATA.blockHash}`;

                logTestRequest(
                    testName,
                    "Fetching validators with block hash",
                    {
                        port: READ_REST_PORT,
                        method: HttpMethods.GET,
                        endpoint,
                    },
                );

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                        });

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("bond-status", () => {
        testWrapper("Bond Status - Check Public Key")(
            "should check if public key is bonded",
            (done) => {
                const testName = "Bond Status - Check Public Key";
                const endpoint = `${Endpoints.BOND_STATUS}/${TEST_DATA.validatorPubKey}`;

                logTestRequest(testName, "Checking if public key is bonded", {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint,
                });

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response:
                                response.status === HttpStatus.SUCCESS
                                    ? JSON.stringify(response.body)
                                    : "",
                        });

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );

                        if (response.status === HttpStatus.SUCCESS) {
                            expect(typeof response.body.isBonded).toBe(
                                "boolean",
                            );
                        }

                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("validator-status", () => {
        testWrapper("Validator Status - Retrieve Status and Bond")(
            "should retrieve specific validator status and bond",
            (done) => {
                const testName = "Validator Status - Retrieve Status and Bond";
                const endpoint = `${Endpoints.VALIDATOR}/${TEST_DATA.validatorPubKey}`;

                logTestRequest(testName, "Retrieving validator status", {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint,
                });

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: response.body,
                        });

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );
                        if (response.status === HttpStatus.SUCCESS) {
                            expect(response.body).toHaveProperty("publicKey");
                            expect(response.body).toHaveProperty("isBonded");
                            expect(typeof response.body.isBonded).toBe(
                                "boolean",
                            );

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
        );

        testWrapper("Validator Status - Support Block Hash")(
            "should support block_hash parameter for validator status",
            (done) => {
                const testName = "Validator Status - Support Block Hash";
                const endpoint = `${Endpoints.VALIDATOR}/${TEST_DATA.validatorPubKey}?block_hash=${TEST_DATA.blockHash}`;

                logTestRequest(
                    testName,
                    "Retrieving validator status with block hash",
                    {
                        port: READ_REST_PORT,
                        method: HttpMethods.GET,
                        endpoint,
                    },
                );

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                        });

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("epoch-info", () => {
        testWrapper("Epoch Info - Retrieve Current Epoch")(
            "should retrieve current epoch information",
            (done) => {
                const testName = "Epoch Info - Retrieve Current Epoch";
                logTestRequest(testName, "Fetching current epoch information", {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint: Endpoints.EPOCH,
                });

                const url = buildUrl(
                    Endpoints.EPOCH,
                    RequestClientTypes.READ_REST,
                );

                makeGet(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body).substring(
                                0,
                                150,
                            ),
                        });

                        expect(response.status).toBe(HttpStatus.SUCCESS);
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
        );

        testWrapper("Epoch Info - Include Quarantine Length")(
            "should include quarantine length in epoch info",
            (done) => {
                const testName = "Epoch Info - Include Quarantine Length";
                logTestRequest(
                    testName,
                    "Fetching epoch info with quarantine length",
                    {
                        port: READ_REST_PORT,
                        method: HttpMethods.GET,
                        endpoint: Endpoints.EPOCH,
                    },
                );

                const url = buildUrl(
                    Endpoints.EPOCH,
                    RequestClientTypes.READ_REST,
                );

                makeGet(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                        });

                        expect(response.status).toBe(HttpStatus.SUCCESS);
                        expect(response.body).toHaveProperty(
                            "quarantineLength",
                        );
                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("epoch-rewards", () => {
        testWrapper("Epoch Rewards - Retrieve Current Rewards")(
            "should retrieve current epoch rewards",
            (done) => {
                const testName = "Epoch Rewards - Retrieve Current Rewards";

                logTestRequest(testName, "Fetching current epoch rewards", {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint: Endpoints.EPOCH_REWARDS,
                });

                const url = buildUrl(
                    Endpoints.EPOCH_REWARDS,
                    RequestClientTypes.READ_REST,
                );

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EPOCH_REWARDS.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                        });

                        expect(AcceptedStatusCodes.EPOCH_REWARDS).toContain(
                            response.status,
                        );

                        if (response.status === HttpStatus.SUCCESS) {
                            // TODO might not have property in this case (Communicating with developers now) --- IGNORE ---
                            expect(response.body).toHaveProperty("rewards");
                        }
                        done();
                    })
                    .catch(done);
            },
        );

        testWrapper("Epoch Rewards - Support Block Hash Parameter")(
            "should support block_hash parameter for epoch rewards",
            (done) => {
                const testName = "Epoch Rewards - Support Block Hash Parameter";
                const endpoint = `${Endpoints.EPOCH_REWARDS}?block_hash=${TEST_DATA.blockHash}`;

                logTestRequest(
                    testName,
                    "Fetching epoch rewards with block hash",
                    {
                        port: READ_REST_PORT,
                        method: HttpMethods.GET,
                        endpoint,
                    },
                );

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EPOCH_REWARDS_WITH_HASH.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                        });

                        expect(
                            AcceptedStatusCodes.EPOCH_REWARDS_WITH_HASH,
                        ).toContain(response.status);
                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("wallet-balance", () => {
        testWrapper("Wallet Balance - Retrieve Balance")(
            "should retrieve wallet balance for address",
            (done) => {
                const testName = "Wallet Balance - Retrieve Balance";
                const endpoint = `${Endpoints.BALANCE}/${TEST_DATA.walletAddress}`;

                logTestRequest(testName, "Fetching wallet balance", {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint,
                });

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                        });

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );

                        if (response.status === HttpStatus.SUCCESS) {
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
        );

        testWrapper("Wallet Balance - Invalid Address Format")(
            "should return 404 for invalid address format",
            (done) => {
                const testName = "Wallet Balance - Invalid Address Format";
                const invalidAddress = "invalid-address";
                const endpoint = `${Endpoints.BALANCE}/${invalidAddress}`;

                logTestRequest(testName, "Testing invalid address rejection", {
                    port: REST_PORT,
                    method: HttpMethods.GET,
                    endpoint,
                });

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makeGet(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.BALANCE_INVALID.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                        });

                        expect(AcceptedStatusCodes.BALANCE_INVALID).toContain(
                            response.status,
                        );
                        done();
                    })
                    .catch(done);
            },
        );
    });

    describe("exploratory-deploy", () => {
        testWrapper("Exploratory Deploy - Execute Rholang")(
            "should execute read-only Rholang code",
            (done) => {
                const testName = "Exploratory Deploy - Execute Rholang";
                const deploy = {
                    term: createDevCheckBalanceDeploy(TEST_DATA.walletAddress),
                };

                logTestRequest(
                    testName,
                    "Executing exploratory Rholang deploy",
                    {
                        port: READ_REST_PORT,
                        method: HttpMethods.POST,
                        endpoint: Endpoints.EXPLORATORY_DEPLOY,
                        body: deploy,
                    },
                );

                const url = buildUrl(
                    Endpoints.EXPLORATORY_DEPLOY,
                    RequestClientTypes.READ_REST,
                );

                makePost(url, deploy)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                            response: JSON.stringify(response.body),
                        });

                        expect(
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY,
                        ).toContain(response.status);

                        if (response.status === HttpStatus.SUCCESS) {
                            expect(response.body).toHaveProperty("expr");
                            expect(response.body.expr[0]).toHaveProperty(
                                "ExprInt",
                            );
                            expect(
                                response.body.expr[0].ExprInt,
                            ).toHaveProperty("data");
                            expect(
                                typeof response.body.expr[0].ExprInt.data,
                            ).toBe("number");
                        }
                        done();
                    })
                    .catch(done);
            },
        );

        testWrapper("Exploratory Deploy - Support Block Hash")(
            "should support block_hash parameter for exploratory deploy",
            (done) => {
                const testName = "Exploratory Deploy - Support Block Hash";
                const endpoint = `${Endpoints.EXPLORATORY_DEPLOY}?block_hash=${TEST_DATA.blockHash}`;
                const deploy = {
                    term: createDevCheckBalanceDeploy(TEST_DATA.walletAddress),
                };

                logTestRequest(
                    testName,
                    "Executing exploratory deploy with block hash",
                    {
                        port: READ_REST_PORT,
                        method: HttpMethods.POST,
                        endpoint,
                        body: deploy,
                    },
                );

                const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

                makePost(url, deploy)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                        });

                        expect(
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY,
                        ).toContain(response.status);
                        done();
                    })
                    .catch(done);
            },
        );

        testWrapper("Exploratory Deploy - Invalid Rholang Error")(
            "should return proper error for invalid Rholang",
            (done) => {
                const testName = "Exploratory Deploy - Invalid Rholang Error";
                const invalidDeploy = { term: "invalid rholang code !!!" };

                logTestRequest(testName, "Testing invalid Rholang rejection", {
                    port: REST_PORT,
                    method: HttpMethods.POST,
                    endpoint: Endpoints.EXPLORATORY_DEPLOY,
                    body: invalidDeploy,
                });

                const url = buildUrl(
                    Endpoints.EXPLORATORY_DEPLOY,
                    RequestClientTypes.MAIN_REST,
                );

                makePost(url, invalidDeploy)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY_ERROR.includes(
                                response.status,
                            );

                        logTestResult(testName, "Response received", {
                            success,
                            status: response.status,
                        });

                        expect(
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY_ERROR,
                        ).toContain(response.status);
                        done();
                    })
                    .catch(done);
            },
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
    testWrapper("Integration - Epoch and Validators")(
        "should retrieve epoch info and active validators together",
        (done) => {
            const testName = "Integration - Epoch and Validators";
            const logFlow = createTestFlow(testName);

            logFlow.step("Fetching epoch info", {
                port: READ_REST_PORT,
                method: HttpMethods.GET,
                endpoint: Endpoints.EPOCH,
            });

            const url = buildUrl(Endpoints.EPOCH, RequestClientTypes.READ_REST);

            makeGet(url)
                .then((epochResponse) => {
                    logFlow.step("Fetching active validators", {
                        port: READ_REST_PORT,
                        method: HttpMethods.GET,
                        endpoint: Endpoints.VALIDATORS,
                    });

                    const url = buildUrl(
                        Endpoints.VALIDATORS,
                        RequestClientTypes.READ_REST,
                    );

                    return makeGet(url).then((validatorsResponse) => {
                        const success =
                            epochResponse.status === HttpStatus.SUCCESS &&
                            validatorsResponse.status === HttpStatus.SUCCESS;

                        logFlow.result(
                            "Integration test complete",
                            success,
                            `epoch: ${epochResponse.status}, validators: ${validatorsResponse.status}`,
                        );

                        expect(epochResponse.status).toBe(HttpStatus.SUCCESS);
                        expect(validatorsResponse.status).toBe(
                            HttpStatus.SUCCESS,
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
    );

    testWrapper("Integration - Block Hash Consistency")(
        "should verify block hash consistency across Endpoints",
        (done) => {
            const testName = "Integration - Block Hash Consistency";
            const logFlow = createTestFlow(testName);

            logFlow.step("Fetching status", {
                port: READ_REST_PORT,
                method: HttpMethods.GET,
                endpoint: Endpoints.STATUS,
            });

            const url = buildUrl(
                Endpoints.STATUS,
                RequestClientTypes.READ_REST,
            );

            makeGet(url)
                .then((statusResponse) => {
                    logFlow.step("Fetching epoch info", {
                        port: READ_REST_PORT,
                        method: HttpMethods.GET,
                        endpoint: Endpoints.EPOCH,
                    });

                    const url = buildUrl(
                        Endpoints.EPOCH,
                        RequestClientTypes.READ_REST,
                    );

                    return makeGet(url).then((epochResponse) => {
                        const success =
                            statusResponse.status === HttpStatus.SUCCESS &&
                            epochResponse.status === HttpStatus.SUCCESS;

                        logFlow.result(
                            "Consistency check complete",
                            success,
                            `status: ${statusResponse.status}, epoch: ${epochResponse.status}`,
                        );

                        expect(statusResponse.status).toBe(HttpStatus.SUCCESS);
                        expect(epochResponse.status).toBe(HttpStatus.SUCCESS);
                        expect(
                            statusResponse.body.lastFinalizedBlockNumber,
                        ).toBe(epochResponse.body.lastFinalizedBlockNumber);
                        done();
                    });
                })
                .catch(done);
        },
    );
});

describe("Error Handling", () => {
    testWrapper("Error Handling - Non-existent Validator")(
        "should handle non-existent validator gracefully",
        (done) => {
            const testName = "Error Handling - Non-existent Validator";
            const invalidPubKey =
                "invalid0000000000000000000000000000000000000";
            const endpoint = `${Endpoints.VALIDATOR}/${invalidPubKey}`;

            logTestRequest(
                testName,
                "Testing non-existent validator rejection",
                {
                    port: READ_REST_PORT,
                    method: HttpMethods.GET,
                    endpoint,
                },
            );

            const url = buildUrl(endpoint, RequestClientTypes.READ_REST);

            makeGet(url)
                .then((response) => {
                    const success =
                        AcceptedStatusCodes.VALIDATOR_NOT_FOUND.includes(
                            response.status,
                        );

                    logTestResult(testName, "Response received", {
                        success,
                        status: response.status,
                        response: JSON.stringify(response.body),
                    });

                    expect(AcceptedStatusCodes.VALIDATOR_NOT_FOUND).toContain(
                        response.status, // TODO sends 200 (Communicating with developers now) --- IGNORE ---
                    );
                    done();
                })
                .catch(done);
        },
    );

    testWrapper("Error Handling - Malformed Request")(
        "should handle malformed requests",
        (done) => {
            const testName = "Error Handling - Malformed Request";
            const endpoint = `${Endpoints.BALANCE}/invalid`;

            logTestRequest(testName, "Testing malformed request rejection", {
                port: REST_PORT,
                method: HttpMethods.GET,
                endpoint,
            });

            const url = buildUrl(endpoint, RequestClientTypes.MAIN_REST);

            makeGet(url)
                .then((response) => {
                    const success = AcceptedStatusCodes.ERROR.includes(
                        response.status,
                    );

                    logTestResult(testName, "Response received", {
                        success,
                        status: response.status,
                    });

                    expect(AcceptedStatusCodes.ERROR).toContain(
                        response.status,
                    );
                    done();
                })
                .catch(done);
        },
    );

    testWrapper("Error Handling - Invalid Deploy Request")(
        "should reject invalid exploratory deploy requests",
        (done) => {
            const testName = "Error Handling - Invalid Deploy Request";
            const invalidRequest = { term: null };

            logTestRequest(testName, "Testing invalid deploy rejection", {
                port: READ_REST_PORT,
                method: HttpMethods.POST,
                endpoint: Endpoints.EXPLORATORY_DEPLOY,
                body: invalidRequest,
            });

            const url = buildUrl(
                Endpoints.EXPLORATORY_DEPLOY,
                RequestClientTypes.READ_REST,
            );

            makePost(url, invalidRequest)
                .then((response) => {
                    const success =
                        AcceptedStatusCodes.EXPLORATORY_DEPLOY_INVALID.includes(
                            response.status,
                        );

                    logTestResult(testName, "Response received", {
                        success,
                        status: response.status,
                        response: JSON.stringify(response.body),
                    });

                    expect(
                        AcceptedStatusCodes.EXPLORATORY_DEPLOY_INVALID,
                    ).toContain(response.status);
                    done();
                })
                .catch(done);
        },
    );
});
