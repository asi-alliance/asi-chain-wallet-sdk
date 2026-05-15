const http = require("http");
const https = require("https");

const { PROTOCOL, TEST_TIMEOUT_MS, NODE_HOST } = require("../../config/env");

const HttpMethods = {
    GET: "GET",
    POST: "POST",
};

const HttpHeaders = {
    CONTENT_TYPE: "Content-Type",
    USER_AGENT: "User-Agent",
};

const HttpHeaderValues = {
    JSON: "application/json",
    USER_AGENT: "F1R3Node-Test-Suite/1.0",
};

async function parseBody(response) {
    const rawBody = await response.text();

    let parsedBody = null;

    try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
        parsedBody = null;
    }

    return { parsedBody, rawBody };
}

async function makeGet(url) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, TEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: HttpMethods.GET,
            headers: {
                [HttpHeaders.USER_AGENT]: HttpHeaderValues.USER_AGENT,
            },
            signal: controller.signal,
        });

        const { rawBody, parsedBody } = await parseBody(response);

        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: parsedBody,
            rawBody,
        };
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(`Request timeout after ${TEST_TIMEOUT_MS}ms`);
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function makePost(url, body = null) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, TEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: HttpMethods.POST,
            headers: {
                [HttpHeaders.CONTENT_TYPE]: HttpHeaderValues.JSON,
                [HttpHeaders.USER_AGENT]: HttpHeaderValues.USER_AGENT,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        const { rawBody, parsedBody } = await parseBody(response);

        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: parsedBody,
            rawBody,
        };
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(`Request timeout after ${TEST_TIMEOUT_MS}ms`);
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    makeGet,
    makePost,
    HttpMethods,
    HttpHeaders,
    HttpHeaderValues,
};
