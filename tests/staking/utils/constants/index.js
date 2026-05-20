const HttpStatus = {
    SUCCESS: 200,
    ACCEPTED: 202,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    UNPROCESSABLE_ENTITY: 422,
};

const AcceptedStatusCodes = {
    DEFAULT: [HttpStatus.SUCCESS, HttpStatus.ACCEPTED],
    BOND_VALIDATOR: [
        HttpStatus.SUCCESS,
        HttpStatus.ACCEPTED,
        HttpStatus.BAD_REQUEST,
    ],
    STATUS_CHECK: [HttpStatus.SUCCESS, HttpStatus.NOT_FOUND],
    EXPLORATORY_DEPLOY: [HttpStatus.SUCCESS],
    EXPLORATORY_DEPLOY_ERROR: [HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN],
    EPOCH_REWARDS: [HttpStatus.SUCCESS],
    EPOCH_REWARDS_WITH_HASH: [HttpStatus.SUCCESS, HttpStatus.NOT_FOUND],
    BALANCE_INVALID: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
    VALIDATOR_NOT_FOUND: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
    EXPLORATORY_DEPLOY_INVALID: [
        HttpStatus.BAD_REQUEST,
        HttpStatus.UNPROCESSABLE_ENTITY,
    ],
    ERROR: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.FORBIDDEN],
};

const Endpoints = {
    STATUS: "/api/status",
    VALIDATORS: "/api/validators",
    BOND_STATUS: "/api/bond-status",
    VALIDATOR: "/api/validator",
    EPOCH: "/api/epoch",
    EPOCH_REWARDS: "/api/epoch/rewards",
    BALANCE: "/api/balance",
    EXPLORATORY_DEPLOY: "/api/explore-deploy",
    ADMIN_PROPOSE: "/api/propose",
    WS_EVENTS: "/ws/events",
};

const BLOCK_HASH_KEY = "blockHash";

module.exports = {
    HttpStatus,
    AcceptedStatusCodes,
    Endpoints,
    BLOCK_HASH_KEY,
};
