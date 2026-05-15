const { write, printSeparator, LogFormats } = require("../helpers/log");
const { formatCompactJSON } = require("../helpers/wrap-text");
const { ENABLED_TESTS } = require("../../config");
const {
    PROTOCOL,
    NODE_HOST,
    REST_PORT,
    ADMIN_PORT,
    TEST_TIMEOUT_MS,
    WEBSOCKET_TIMEOUT_MS,
} = require("../../config/env");

function testWrapper(testName, timeout = TEST_TIMEOUT_MS) {
    const testWrapperFunction = ENABLED_TESTS.includes(testName)
        ? test
        : test.skip;

    return (description, testFunction) =>
        testWrapperFunction(description, testFunction, timeout);
}

function printTestHeader() {
    write(LogFormats.title("F1R3NODE STAKING API TEST SUITE"));

    write("");

    write(
        `${LogFormats.info("•")} Node: ${NODE_HOST} | ${PROTOCOL.toUpperCase()}`,
    );
    write(`${LogFormats.info("•")} REST: ${REST_PORT} | ADMIN: ${ADMIN_PORT}`);
    write(
        `${LogFormats.info("•")} Timeout: ${TEST_TIMEOUT_MS}ms | WS: ${WEBSOCKET_TIMEOUT_MS}ms`,
    );

    write("");
}

function logTestRequest(testName, action, details = {}) {
    const { method, endpoint, body } = details;

    write(
        LogFormats.title(
            `${testName} (${method} ${endpoint.substring(0, 40)})`,
        ),
    );

    // if (body) {
    //     write(LogFormats.muted("BODY:"));
    //     write(LogFormats.muted(formatCompactJSON(body, 60)));
    // }
}

function logTestResult(testName, action, details = {}) {
    const timestamp = new Date().toLocaleString();

    const icon = details.success
        ? LogFormats.success("✓")
        : LogFormats.error("✗");

    const status = details.status ?? "UNKNOWN";

    write(`${icon} - ${action} ${status} (${timestamp})`);

    if (details.response) {
        write(LogFormats.muted("RESPONSE:"));
        write(LogFormats.muted(formatCompactJSON(details.response, 60)));
    }

    write("");
}

function createTestFlow(testName) {
    write(LogFormats.title(testName));

    return {
        step(action, details = {}) {
            const { method, endpoint, port, host, body } = details;

            const methodEndpoint =
                method && endpoint
                    ? `(${method} ${endpoint.substring(0, 60)})`
                    : "";

            write(`${LogFormats.info("•")} ${action} ${methodEndpoint}`);

            if (host || port) {
                write(`HOST: ${host ?? NODE_HOST}:${port ?? ""}`);
            }

            if (body) {
                write(LogFormats.muted("BODY:"));
                write(LogFormats.muted(formatCompactJSON(body, 70)));
            }

            write("");
        },

        result(action, success, status, extra = {}) {
            const icon = success
                ? LogFormats.success("✓")
                : LogFormats.error("✗");

            const time = new Date().toLocaleString();

            write(`${icon} - ${action} ${status} (${time})`);

            if (extra.response) {
                write(LogFormats.muted("RESPONSE:"));
                write(LogFormats.muted(formatCompactJSON(extra.response, 70)));
            }

            if (extra.error) {
                write(LogFormats.error(`ERROR: ${extra.error}`));
            }

            write("");
        },
    };
}

module.exports = {
    testWrapper,
    printTestHeader,
    logTestRequest,
    logTestResult,
    createTestFlow,
};
