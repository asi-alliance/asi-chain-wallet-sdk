const { TEST_TIMEOUT_MS, WEBSOCKET_TIMEOUT_MS } = require("../../config/env");
const { HttpMethods, makeGet, makePost } = require("../helpers/request");
const { write, printSeparator, LogFormats } = require("../helpers/log");
const { formatCompactJSON } = require("../helpers/wrap-text");
const { findValueByKey } = require("../helpers/extractors");
const { BLOCK_HASH_KEY } = require("../constants");
const {
    ENABLED_TESTS,
    DEFAULT_ENDPOINT_LOG_LENGTH,
    ENABLE_REQUEST_LOGS,
    ENABLE_RESPONSE_LOGS,
    DEFAULT_INFO_LOG_LENGTH,
} = require("../../config");

function testSuiteWrapper(suiteName, callback) {
    describe(suiteName, () => {
        callback({
            suiteName,
        });
    });
}

function testWrapper(
    suiteName,
    testName,
    { url, method, request, timeout = TEST_TIMEOUT_MS } = {},
) {
    const fullTestName = `${suiteName} - ${testName}`;

    const testFunction = ENABLED_TESTS.includes(fullTestName)
        ? test
        : test.skip;

    const requestByMethod = {
        [HttpMethods.GET]: makeGet,
        [HttpMethods.POST]: makePost,
    };

    const requestFunction = request || requestByMethod[method];

    return (description, callback) =>
        testFunction(
            description,
            (done) => {
                const flow = createTestFlow(fullTestName);

                callback({
                    done,
                    flow,
                    testName: fullTestName,
                    url,
                    method,
                    request: requestFunction,
                });
            },
            timeout,
        );
}

function printTestHeader() {
    write(LogFormats.title("F1R3NODE STAKING API TEST SUITE"));

    write("");

    write(
        `${LogFormats.info("•")} Timeout: ${TEST_TIMEOUT_MS}ms | WS: ${WEBSOCKET_TIMEOUT_MS}ms`,
    );

    write("");
}

function buildFullUrlLog(url, length = DEFAULT_ENDPOINT_LOG_LENGTH) {
    if (url.length <= length) {
        return url;
    }

    return url.substring(0, length) + "...";
}

function createTestFlow(testName) {
    write(LogFormats.title(testName));

    return {
        step(action, details = {}) {
            const { method, endpoint, host, body, info } = details;

            const methodEndpoint =
                method && endpoint
                    ? `(${method} ${buildFullUrlLog(endpoint)})`
                    : "";

            write(`${LogFormats.info("•")} ${action} ${methodEndpoint}`);

            if (host) {
                write(`HOST: ${host}`);
            }

            if (ENABLE_REQUEST_LOGS && body) {
                write(LogFormats.muted("REQUEST BODY:"));
                write(
                    LogFormats.muted(
                        formatCompactJSON(body, DEFAULT_INFO_LOG_LENGTH),
                    ),
                );
            }

            if (info) {
                write(LogFormats.muted(info));
            }

            write("");
        },
        result(action, success, status, extra = {}) {
            const icon = success
                ? LogFormats.success("✓")
                : LogFormats.error("✗");

            const time = new Date().toLocaleString();

            write(`${icon} - ${action} ${status} (${time})`);

            const withBlockHash = extra.responseLoggerConfig?.withBlockHash;

            if (ENABLE_RESPONSE_LOGS && extra.response) {
                write(LogFormats.muted("RESPONSE:"));
                write(
                    LogFormats.muted(
                        formatCompactJSON(
                            extra.response,
                            DEFAULT_INFO_LOG_LENGTH,
                        ),
                    ),
                );

                if (withBlockHash) {
                    const blockHash = findValueByKey(
                        extra.response,
                        BLOCK_HASH_KEY,
                    );

                    write("");

                    write(
                        LogFormats.muted(
                            `Block Hash: ${blockHash ?? "NOT_FOUND"}`,
                        ),
                    );
                }
            }

            if (extra.error) {
                write(LogFormats.error(`ERROR: ${extra.error}`));
            }

            write("");
        },
    };
}

module.exports = {
    testSuiteWrapper,
    testWrapper,
    printTestHeader,
    createTestFlow,
};
