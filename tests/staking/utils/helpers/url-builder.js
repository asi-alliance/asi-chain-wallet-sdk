const {
    VALIDATOR_URL,
    OBSERVER_URL,
    VALIDATOR_ADMIN_URL,
    WEBSOCKET_VALIDATOR_URL,
} = require("../../config/env");

const RequestTo = {
    VALIDATOR: "validator",
    WEBSOCKET_VALIDATOR: "websocket-validator",
    OBSERVER: "observer",
    ADMIN_VALIDATOR: "admin-validator",
};

const requestUrlByClientType = {
    [RequestTo.VALIDATOR]: VALIDATOR_URL,
    [RequestTo.WEBSOCKET_VALIDATOR]: WEBSOCKET_VALIDATOR_URL,
    [RequestTo.OBSERVER]: OBSERVER_URL,
    [RequestTo.ADMIN_VALIDATOR]: VALIDATOR_ADMIN_URL,
};

function buildUrl(endpoint, clientType) {
    return `${requestUrlByClientType[clientType]}${endpoint}`;
}

module.exports = {
    RequestTo,
    buildUrl,
};
