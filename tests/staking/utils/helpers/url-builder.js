const {
    NODE_HOST,
    REST_PORT,
    READ_NODE_HOST,
    READ_REST_PORT,
    ADMIN_PORT,
    PROTOCOL,
} = require("../../config/env");

const RequestClientTypes = {
    MAIN_REST: "main-rest",
    READ_REST: "read-rest",
    ADMIN: "admin",
};

function buildHostWithPort(host, port) {
    return `${host}:${port}`;
}

const requestHostWithPortByClientType = {
    [RequestClientTypes.MAIN_REST]: buildHostWithPort(NODE_HOST, REST_PORT),
    [RequestClientTypes.READ_REST]: buildHostWithPort(
        READ_NODE_HOST,
        READ_REST_PORT,
    ),
    [RequestClientTypes.ADMIN]: buildHostWithPort(NODE_HOST, ADMIN_PORT),
};

function buildUrl(endpoint, clientType) {
    return `${PROTOCOL}://${requestHostWithPortByClientType[clientType]}${endpoint}`;
}

module.exports = {
    RequestClientTypes,
    buildUrl,
};
