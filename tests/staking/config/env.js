const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("../utils/helpers/env");

loadEnvFile();

const DefaultEnvValues = {
    VALIDATOR_URL: "http://202.181.159.96:40423",
    OBSERVER_URL: "http://202.181.159.96:40453",
    VALIDATOR_ADMIN_URL: "http://202.181.159.96:40425",
    WEBSOCKET_VALIDATOR_URL: "ws://202.181.159.96:40423",
    TEST_TIMEOUT: "10000",
    WEBSOCKET_TIMEOUT: "10000",
    TEST_VALIDATOR_PUBKEY:
        "04837a4cff833e3157e3135d7b40b8e1f33c6e6b5a4342b9fc784230ca4c4f9d356f258debef56ad4984726d6ab3e7709e1632ef079b4bcd653db00b68b2df065f",
    TEST_WALLET_ADDRESS:
        "111129p33f7vaRrpLqK8Nr35Y2aacAjrR5pd6PCzqcdrMuPHzymczH",
    TEST_BLOCK_HASH:
        "d13ddb09889ef37170a84c085f18c2fe22c0dd86ccb6231a735b5d36faaa3aac",
};

const DEFAULT_ENV_NUMBER_RADIX = 10;

const TEST_TIMEOUT_MS = parseInt(
    process.env.TEST_TIMEOUT || DefaultEnvValues.TEST_TIMEOUT,
    DEFAULT_ENV_NUMBER_RADIX,
);
const WEBSOCKET_TIMEOUT_MS = parseInt(
    process.env.WEBSOCKET_TIMEOUT || DefaultEnvValues.WEBSOCKET_TIMEOUT,
    DEFAULT_ENV_NUMBER_RADIX,
);

const TEST_DATA = {
    validatorPubKey:
        process.env.TEST_VALIDATOR_PUBKEY ||
        DefaultEnvValues.TEST_VALIDATOR_PUBKEY,
    walletAddress:
        process.env.TEST_WALLET_ADDRESS || DefaultEnvValues.TEST_WALLET_ADDRESS,
    blockHash: process.env.TEST_BLOCK_HASH || DefaultEnvValues.TEST_BLOCK_HASH,
};

const VALIDATOR_URL =
    process.env.VALIDATOR_URL || DefaultEnvValues.VALIDATOR_URL;
const OBSERVER_URL = process.env.OBSERVER_URL || DefaultEnvValues.OBSERVER_URL;
const VALIDATOR_ADMIN_URL =
    process.env.VALIDATOR_ADMIN_URL || DefaultEnvValues.VALIDATOR_ADMIN_URL;
const WEBSOCKET_VALIDATOR_URL =
    process.env.WEBSOCKET_VALIDATOR_URL ||
    DefaultEnvValues.WEBSOCKET_VALIDATOR_URL;

module.exports = {
    TEST_TIMEOUT_MS,
    WEBSOCKET_TIMEOUT_MS,

    TEST_DATA,

    VALIDATOR_URL,
    OBSERVER_URL,
    VALIDATOR_ADMIN_URL,
    WEBSOCKET_VALIDATOR_URL,
};
