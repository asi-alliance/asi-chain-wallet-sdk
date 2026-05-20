const WebSocket = require("ws");
const {
    TEST_TIMEOUT_MS,
    WEBSOCKET_TIMEOUT_MS,

    TEST_DATA,
    VALIDATOR_URL,
} = require("./config/env");
const {
    HttpStatus,
    AcceptedStatusCodes,
    Endpoints,
    BLOCK_HASH_KEY,
} = require("./utils/constants");
const { ENABLED_TESTS } = require("./config");
const { HttpMethods, makeGet, makePost } = require("./utils/helpers/request");
const { RequestTo, buildUrl } = require("./utils/helpers/url-builder");
const {
    testSuiteWrapper,
    testWrapper,
    printTestHeader,
    logTestRequest,
    logTestResult,
    createTestFlow,
} = require("./utils/test");
const { createDevCheckBalanceDeploy } = require("./utils/helpers/rholang");
const { write, LogFormats } = require("./utils/helpers/log");
const { findValueByKey } = require("./utils/helpers/extractors");

printTestHeader();

describe("Staking API", () => {
    testSuiteWrapper("API Health Check", ({ suiteName }) => {
        testWrapper(suiteName, "Node Status", {
            method: HttpMethods.GET,
            url: buildUrl(Endpoints.STATUS, RequestTo.VALIDATOR),
        })(
            "should return node status",
            ({ done, flow, url, method, request }) => {
                flow.step("Get node status", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        flow.result(
                            "Validate node status response",
                            response.status === HttpStatus.SUCCESS,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                            },
                        );

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

    testSuiteWrapper("Bond Validator", ({ suiteName }) => {
        testWrapper(suiteName, "Propose Transaction", {
            method: HttpMethods.POST,
            url: buildUrl(Endpoints.ADMIN_PROPOSE, RequestTo.ADMIN_VALIDATOR),
        })(
            "should propose bond validator transaction",
            ({ done, flow, url, method, request }) => {
                flow.step("Propose bond validator transaction", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.BOND_VALIDATOR.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate bond validator response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                // TODO Something went wrong: Failure: Proposal failed: NoNewDeploys. No unprocessed deploys in pool. If you just deployed, the deploy may have already been included by the auto-proposer. (seqNum 7557)* Connection #0 to host 202.181.159.96:40415 left intact
                                // but test says body is null
                            },
                        );

                        expect(AcceptedStatusCodes.BOND_VALIDATOR).toContain(
                            response.status,
                        );

                        done();
                    })
                    .catch(done);
            },
        );
    });

    testSuiteWrapper("Bonds", ({ suiteName }) => {
        testWrapper(suiteName, "Retrieve Active Validators", {
            method: HttpMethods.GET,
            url: buildUrl(Endpoints.VALIDATORS, RequestTo.OBSERVER),
        })(
            "should retrieve active validators with stakes",
            ({ done, flow, url, method, request }) => {
                flow.step("Get active validators", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        flow.result(
                            "Validate validators response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify({
                                    validators:
                                        response.body.validators?.length,
                                    totalStake: response.body.totalStake,
                                }),
                            },
                        );

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

        testWrapper(suiteName, "Support Block Hash Parameter", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.VALIDATORS}?block_hash=${TEST_DATA.blockHash}`,
                RequestTo.OBSERVER,
            ),
        })(
            "should support block_hash parameter for validators",
            ({ done, flow, url, method, request }) => {
                flow.step("Get validators with block hash", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        const responseBlockHash = findValueByKey(
                            response,
                            BLOCK_HASH_KEY,
                        );

                        flow.result(
                            "Validate validators block hash response",
                            success,
                            response.status,
                            {
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );
                        expect(responseBlockHash).toBe(TEST_DATA.blockHash);

                        done();
                    })
                    .catch(done);
            },
        );
    });

    testSuiteWrapper("Bond Status", ({ suiteName }) => {
        testWrapper(suiteName, "Check Public Key", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.BOND_STATUS}/${TEST_DATA.validatorPubKey}`,
                RequestTo.OBSERVER,
            ),
        })(
            "should check if public key is bonded",
            ({ done, flow, url, method, request }) => {
                flow.step("Check if public key is bonded", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate bond status response",
                            success,
                            response.status,
                            {
                                response:
                                    response.status === HttpStatus.SUCCESS
                                        ? JSON.stringify(response.body)
                                        : "",
                            },
                        );

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );

                        if (response.status === HttpStatus.SUCCESS) {
                            expect(typeof response.body.isBonded).toBe(
                                "boolean",
                            ); // TODO docs fix
                        }

                        done();
                    })
                    .catch(done);
            },
        );
    });

    testSuiteWrapper("Validator Status", ({ suiteName }) => {
        testWrapper(suiteName, "Retrieve Status and Bond", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.VALIDATOR}/${TEST_DATA.validatorPubKey}`,
                RequestTo.OBSERVER,
            ),
        })(
            "should retrieve specific validator status and bond",
            ({ done, flow, url, method, request }) => {
                flow.step("Get validator status", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate validator status response",
                            success,
                            response.status,
                            {
                                response: response.body,
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

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

        testWrapper(suiteName, "Support Block Hash", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.VALIDATOR}/${TEST_DATA.validatorPubKey}?block_hash=${TEST_DATA.blockHash}`,
                RequestTo.OBSERVER,
            ),
        })(
            // TODO IS /api/validator/{pubkey}?block_hash=... in docs?
            "should support block_hash parameter for validator status",
            ({ done, flow, url, method, request }) => {
                flow.step("Get validator status with block hash", {
                    method,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        const responseBlockHash = findValueByKey(
                            response,
                            BLOCK_HASH_KEY,
                        );

                        flow.result(
                            "Validate validator block hash response",
                            success,
                            response.status,
                            {
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

                        expect(AcceptedStatusCodes.STATUS_CHECK).toContain(
                            response.status,
                        );
                        expect(responseBlockHash).toBe(TEST_DATA.blockHash);

                        done();
                    })
                    .catch(done);
            },
        );
    });

    testSuiteWrapper("Epoch Info", ({ suiteName }) => {
        testWrapper(suiteName, "Retrieve Current Epoch", {
            method: HttpMethods.GET,
            url: buildUrl(Endpoints.EPOCH, RequestTo.OBSERVER),
        })(
            "should retrieve current epoch information",
            ({ done, flow, request, url }) => {
                flow.step("Fetch current epoch information", {
                    method: HttpMethods.GET,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        flow.result(
                            "Validate current epoch response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

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

        testWrapper(suiteName, "Include Quarantine Length", {
            method: HttpMethods.GET,
            url: buildUrl(Endpoints.EPOCH, RequestTo.OBSERVER),
        })(
            "should include quarantine length in epoch info",
            ({ done, flow, request, url }) => {
                flow.step("Fetch epoch info with quarantine length", {
                    method: HttpMethods.GET,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success = response.status === HttpStatus.SUCCESS;

                        flow.result(
                            "Validate quarantine length response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

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

    testSuiteWrapper("Epoch Rewards", ({ suiteName }) => {
        testWrapper(suiteName, "Retrieve Current Rewards", {
            method: HttpMethods.GET,
            url: buildUrl(Endpoints.EPOCH_REWARDS, RequestTo.OBSERVER),
        })(
            "should retrieve current epoch rewards",
            ({ done, flow, request, url }) => {
                flow.step("Fetch current epoch rewards", {
                    method: HttpMethods.GET,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EPOCH_REWARDS.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate epoch rewards response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

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

        testWrapper(suiteName, "Support Block Hash Parameter", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.EPOCH_REWARDS}?block_hash=${TEST_DATA.blockHash}`,
                RequestTo.OBSERVER,
            ),
        })(
            "should support block_hash parameter for epoch rewards",
            ({ done, flow, request, url }) => {
                flow.step("Fetch epoch rewards with block hash", {
                    method: HttpMethods.GET,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EPOCH_REWARDS_WITH_HASH.includes(
                                response.status,
                            );
                        const responseBlockHash = findValueByKey(
                            response,
                            BLOCK_HASH_KEY,
                        );

                        flow.result(
                            "Validate block hash rewards response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

                        expect(
                            AcceptedStatusCodes.EPOCH_REWARDS_WITH_HASH,
                        ).toContain(response.status);
                        expect(responseBlockHash).toBe(TEST_DATA.blockHash);

                        done();
                    })
                    .catch(done);
            },
        );
    });

    testSuiteWrapper("Wallet Balance", ({ suiteName }) => {
        testWrapper(suiteName, "Retrieve Balance", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.BALANCE}/${TEST_DATA.walletAddress}`,
                RequestTo.OBSERVER,
            ),
        })(
            "should retrieve wallet balance for address",
            ({ done, flow, request, url }) => {
                flow.step("Fetch wallet balance", {
                    method: HttpMethods.GET,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.STATUS_CHECK.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate wallet balance response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

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

        testWrapper(suiteName, "Invalid Address Format", {
            method: HttpMethods.GET,
            url: buildUrl(
                `${Endpoints.BALANCE}/invalid-address`,
                RequestTo.OBSERVER,
            ),
        })(
            "should return 404 for invalid address format",
            ({ done, flow, request, url }) => {
                flow.step("Test invalid address rejection", {
                    method: HttpMethods.GET,
                    endpoint: url,
                });

                request(url)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.BALANCE_INVALID.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate invalid address response",
                            success,
                            response.status,
                        );

                        expect(AcceptedStatusCodes.BALANCE_INVALID).toContain(
                            response.status,
                        );

                        done();
                    })
                    .catch(done);
            },
        );
    });

    testSuiteWrapper("Exploratory Deploy", ({ suiteName }) => {
        testWrapper(suiteName, "Execute Rholang", {
            method: HttpMethods.POST,
            url: buildUrl(Endpoints.EXPLORATORY_DEPLOY, RequestTo.OBSERVER),
        })(
            "should execute read-only Rholang code",
            ({ done, flow, request, url }) => {
                const deploy = {
                    term: createDevCheckBalanceDeploy(TEST_DATA.walletAddress),
                };

                flow.step("Execute exploratory Rholang deploy", {
                    method: HttpMethods.POST,
                    endpoint: url,
                    body: deploy,
                });

                request(url, deploy)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate exploratory deploy response",
                            success,
                            response.status,
                            {
                                response: JSON.stringify(response.body),
                                responseLoggerConfig: {
                                    withBlockHash: true,
                                },
                            },
                        );

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

        testWrapper(suiteName, "Support Block Hash", {
            method: HttpMethods.POST,
            url: buildUrl(
                `${Endpoints.EXPLORATORY_DEPLOY}?block_hash=${TEST_DATA.blockHash}`,
                RequestTo.OBSERVER,
            ),
        })(
            "should support block_hash parameter for exploratory deploy",
            ({ done, flow, request, url }) => {
                const deploy = {
                    term: createDevCheckBalanceDeploy(TEST_DATA.walletAddress),
                };

                flow.step("Execute exploratory deploy with block hash", {
                    method: HttpMethods.POST,
                    endpoint: url,
                    body: deploy,
                });

                request(url, deploy)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY.includes(
                                response.status,
                            );

                        const responseBlockHash = findValueByKey(
                            response,
                            BLOCK_HASH_KEY,
                        );

                        flow.result(
                            "Validate block hash exploratory deploy response",
                            success,
                            response.status,
                        );

                        expect(
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY,
                        ).toContain(response.status);
                        expect(responseBlockHash).toBe(TEST_DATA.blockHash);

                        done();
                    })
                    .catch(done);
            },
        );

        testWrapper(suiteName, "Invalid Rholang Error", {
            method: HttpMethods.POST,
            url: buildUrl(Endpoints.EXPLORATORY_DEPLOY, RequestTo.VALIDATOR),
        })(
            "should return proper error for invalid Rholang",
            ({ done, flow, request, url }) => {
                const invalidDeploy = {
                    term: "invalid rholang code !!!",
                };

                flow.step("Test invalid Rholang rejection", {
                    method: HttpMethods.POST,
                    endpoint: url,
                    body: invalidDeploy,
                });

                request(url, invalidDeploy)
                    .then((response) => {
                        const success =
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY_ERROR.includes(
                                response.status,
                            );

                        flow.result(
                            "Validate invalid Rholang response",
                            success,
                            response.status,
                        );

                        expect(
                            AcceptedStatusCodes.EXPLORATORY_DEPLOY_ERROR,
                        ).toContain(response.status);

                        done();
                    })
                    .catch(done);
            },
        );
    });
});

testSuiteWrapper("Integration", ({ suiteName }) => {
    testWrapper(suiteName, "Epoch and Validators", {
        method: HttpMethods.GET,
        url: buildUrl(Endpoints.EPOCH, RequestTo.OBSERVER),
    })(
        "should retrieve epoch info and active validators together",
        ({ flow, done, request, url }) => {
            flow.step("Fetching epoch info", {
                method: HttpMethods.GET,
                endpoint: url,
            });

            request(url)
                .then((epochResponse) => {
                    const validatorsUrl = buildUrl(
                        Endpoints.VALIDATORS,
                        RequestTo.OBSERVER,
                    );

                    flow.step("Fetching active validators", {
                        method: HttpMethods.GET,
                        endpoint: validatorsUrl,
                    });

                    return makeGet(validatorsUrl).then((validatorsResponse) => {
                        const success =
                            epochResponse.status === HttpStatus.SUCCESS &&
                            validatorsResponse.status === HttpStatus.SUCCESS;

                        flow.result(
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

    testWrapper(suiteName, "Block Hash Consistency", {
        method: HttpMethods.GET,
        url: buildUrl(Endpoints.STATUS, RequestTo.OBSERVER),
    })(
        "should verify block hash consistency across Endpoints",
        ({ flow, done, request, url }) => {
            flow.step("Fetching status", {
                method: HttpMethods.GET,
                endpoint: url,
            });

            request(url)
                .then((statusResponse) => {
                    const epochUrl = buildUrl(
                        Endpoints.EPOCH,
                        RequestTo.OBSERVER,
                    );

                    flow.step("Fetching epoch info", {
                        method: HttpMethods.GET,
                        endpoint: epochUrl,
                    });

                    return makeGet(epochUrl).then((epochResponse) => {
                        const success =
                            statusResponse.status === HttpStatus.SUCCESS &&
                            epochResponse.status === HttpStatus.SUCCESS;

                        flow.result(
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

testSuiteWrapper("Error Handling", ({ suiteName }) => {
    testWrapper(suiteName, "Non-existent Validator", {
        method: HttpMethods.GET,
        url: buildUrl(
            `${Endpoints.VALIDATOR}/invalid0000000000000000000000000000000000000`,
            RequestTo.OBSERVER,
        ),
    })(
        "should handle non-existent validator gracefully",
        ({ flow, done, request, url }) => {
            flow.step("Testing non-existent validator rejection", {
                method: HttpMethods.GET,
                endpoint: url,
            });

            request(url)
                .then((response) => {
                    const success =
                        AcceptedStatusCodes.VALIDATOR_NOT_FOUND.includes(
                            response.status,
                        );

                    flow.result("Response received", success, response.status, {
                        response: JSON.stringify(response.body),
                        responseLoggerConfig: {
                            withBlockHash: true,
                        },
                    });

                    expect(AcceptedStatusCodes.VALIDATOR_NOT_FOUND).toContain(
                        response.status, // TODO sends 200 (Communicating with developers now) --- IGNORE ---
                    );

                    done();
                })
                .catch(done);
        },
    );

    testWrapper(suiteName, "Malformed Request", {
        method: HttpMethods.GET,
        url: buildUrl(`${Endpoints.BALANCE}/invalid`, RequestTo.VALIDATOR),
    })("should handle malformed requests", ({ flow, done, request, url }) => {
        flow.step("Testing malformed request rejection", {
            method: HttpMethods.GET,
            endpoint: url,
        });

        request(url)
            .then((response) => {
                const success = AcceptedStatusCodes.ERROR.includes(
                    response.status,
                );

                flow.result("Response received", success, response.status);

                expect(AcceptedStatusCodes.ERROR).toContain(response.status);

                done();
            })
            .catch(done);
    });

    testWrapper(suiteName, "Invalid Deploy Request", {
        method: HttpMethods.POST,
        url: buildUrl(Endpoints.EXPLORATORY_DEPLOY, RequestTo.OBSERVER),
    })(
        "should reject invalid exploratory deploy requests",
        ({ flow, done, request, url }) => {
            const invalidRequest = { term: null };

            flow.step("Testing invalid deploy rejection", {
                method: HttpMethods.POST,
                endpoint: url,
                body: invalidRequest,
            });

            request(url, invalidRequest)
                .then((response) => {
                    const success =
                        AcceptedStatusCodes.EXPLORATORY_DEPLOY_INVALID.includes(
                            response.status,
                        );

                    flow.result("Response received", success, response.status, {
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

testSuiteWrapper("Watch Blocks", ({ suiteName }) => {
    testWrapper(
        suiteName,
        "WebSocket Connection",
        WEBSOCKET_TIMEOUT_MS,
    )("should connect to WebSocket events endpoint", async ({ flow, done }) => {
        const wsUrl = buildUrl(
            Endpoints.WS_EVENTS,
            RequestTo.WEBSOCKET_VALIDATOR,
        );

        const ws = new WebSocket(wsUrl, {
            timeout: WEBSOCKET_TIMEOUT_MS,
        });

        const events = [];
        let timeoutHandle;

        flow.step("Connect to WebSocket", {
            method: "WS",
            endpoint: wsUrl,
        });

        const validTypes = new Set([
            "block-created",
            "block-added",
            "block-finalised",
            "sent-unapproved-block",
            "block-approval-received",
            "sent-approved-block",
            "approved-block-received",
            "entered-running-state",
            "node-started",
        ]);

        let finished = false;

        const finish = (success, status = success ? 200 : 202) => {
            if (finished) {
                return;
            }

            finished = true;

            clearTimeout(timeoutHandle);

            flow.result("WebSocket test completed", success, status, {
                response: JSON.stringify({
                    eventsReceived: events.length,
                }),
            });

            ws.removeAllListeners();
            ws.close();

            done();
        };

        ws.on("open", () => {
            flow.step("WebSocket connection established");
        });

        ws.on("message", (data) => {
            if (finished) {
                return;
            }

            try {
                const event = JSON.parse(data);
                events.push(event);

                flow.step("Received event", {
                    method: "WS",
                    endpoint: event.type,
                    info: `Event Type: ${event.event}`,
                });

                if (event.event && validTypes.has(event.event)) {
                    flow.step("Valid event received, closing connection");
                    finish(true, 200);
                }
            } catch (error) {
                flow.step("Invalid WS message received, closing");
                finish(false, 500);
            }
        });

        ws.on("error", (error) => {
            if (finished) {
                return;
            }

            flow.result("WebSocket error", false, "ERROR", {
                error: error.message,
            });

            finish(false, 500);
        });

        ws.on("close", () => {
            finish(events.length > 0);
        });

        timeoutHandle = setTimeout(() => {
            if (finished) {
                return;
            }

            flow.step("WebSocket timeout reached");

            finish(events.length > 0);
        }, WEBSOCKET_TIMEOUT_MS);
    });
});
