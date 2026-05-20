const ENABLED_TESTS = [
    "API Health Check - Node Status",

    "Bond Validator - Propose Transaction",

    "Bonds - Retrieve Active Validators",
    "Bonds - Support Block Hash Parameter",

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

    "Error Handling - Invalid Deploy Request",

    "Watch Blocks - WebSocket Connection",
];

const DEFAULT_SEPARATOR = "=";
const DEFAULT_CONSOLE_LOG_LENGTH = 80;
const DEFAULT_INFO_LOG_LENGTH = 60;

const DEFAULT_ENDPOINT_LOG_LENGTH = 80;

const ENABLE_REQUEST_LOGS = true;
const ENABLE_RESPONSE_LOGS = true;

module.exports = {
    ENABLED_TESTS,
    DEFAULT_SEPARATOR,
    DEFAULT_CONSOLE_LOG_LENGTH,
    DEFAULT_ENDPOINT_LOG_LENGTH,
    DEFAULT_INFO_LOG_LENGTH,
    ENABLE_REQUEST_LOGS,
    ENABLE_RESPONSE_LOGS,
};
