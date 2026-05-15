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
];

const REQUIRED_ENV_VARIABLES = [
    "NODE_HOST",
    "REST_PORT",
    "ADMIN_PORT",
    "PROTOCOL",
];

const DEFAULT_SEPARATOR = "=";
const DEFAULT_CONSOLE_LOG_LENGTH = 80;

module.exports = {
    ENABLED_TESTS,
    REQUIRED_ENV_VARIABLES,
    DEFAULT_SEPARATOR,
    DEFAULT_CONSOLE_LOG_LENGTH,
};
