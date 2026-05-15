const fs = require("fs");
const path = require("path");
const { loadEnvFile, validateEnvironment } = require("../utils/helpers/env");

loadEnvFile();

const DefaultEnvValues = {
    PROTOCOL: "http",
    NODE_HOST: "44.198.8.24",
    REST_PORT: "40423",
    ADMIN_PORT: "40425",
    READ_NODE_HOST: "98.86.96.109",
    READ_REST_PORT: "40453",
    TEST_TIMEOUT: "10000",
    WEBSOCKET_TIMEOUT: "",
    TEST_VALIDATOR_PUBKEY:
        "04837a4cff833e3157e3135d7b40b8e1f33c6e6b5a4342b9fc784230ca4c4f9d356f258debef56ad4984726d6ab3e7709e1632ef079b4bcd653db00b68b2df065f",
    TEST_VALIDATOR_ADDRESS: "http://44.198.8.24:40423",
    TEST_WALLET_ADDRESS:
        "111129p33f7vaRrpLqK8Nr35Y2aacAjrR5pd6PCzqcdrMuPHzymczH",
    TEST_BLOCK_HASH:
        "d13ddb09889ef37170a84c085f18c2fe22c0dd86ccb6231a735b5d36faaa3aac",
    BOND_AMOUNT: "",
};

const DEFAULT_ENV_NUMBER_RADIX = 10;

const PROTOCOL = process.env.PROTOCOL || DefaultEnvValues.PROTOCOL;

const NODE_HOST = process.env.NODE_HOST || DefaultEnvValues.NODE_HOST;
const READ_NODE_HOST =
    process.env.READ_NODE_HOST || DefaultEnvValues.READ_NODE_HOST || NODE_HOST;

const REST_PORT = parseInt(
    process.env.REST_PORT || DefaultEnvValues.REST_PORT,
    DEFAULT_ENV_NUMBER_RADIX,
);
const ADMIN_PORT = parseInt(
    process.env.ADMIN_PORT || DefaultEnvValues.ADMIN_PORT,
    DEFAULT_ENV_NUMBER_RADIX,
);
const READ_REST_PORT = parseInt(
    process.env.READ_REST_PORT ||
        DefaultEnvValues.READ_REST_PORT ||
        process.env.REST_PORT ||
        DefaultEnvValues.REST_PORT,
    DEFAULT_ENV_NUMBER_RADIX,
);

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
    validatorAddress:
        process.env.TEST_VALIDATOR_ADDRESS ||
        DefaultEnvValues.TEST_VALIDATOR_ADDRESS,
    walletAddress:
        process.env.TEST_WALLET_ADDRESS || DefaultEnvValues.TEST_WALLET_ADDRESS,
    blockHash: process.env.TEST_BLOCK_HASH || DefaultEnvValues.TEST_BLOCK_HASH,
};

const BOND_VALIDATOR_BOND_AMOUNT = parseInt(
    process.env.BOND_AMOUNT || DefaultEnvValues.BOND_AMOUNT,
    DEFAULT_ENV_NUMBER_RADIX,
);

validateEnvironment({
    REST_PORT,
    ADMIN_PORT,
    PROTOCOL,
});

module.exports = {
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
};
