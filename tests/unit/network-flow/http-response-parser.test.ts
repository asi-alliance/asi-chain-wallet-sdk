import assert from "node:assert/strict";
import test from "node:test";

import { MAX_API_RESPONSE_LENGTH } from "@config/index";
import HttpResponseParser from "@services/HttpResponseParser";

const UNTERMINATED_QUOTES_COUNT = 100_000;
const LINEAR_PARSE_BUDGET_MS = 1000;

const parse = (data: unknown): unknown =>
    HttpResponseParser.parseWithBigIntegersAsStrings(data);

test("unsafe integers from a node response are returned as strings", () => {
    const response = parse(
        '{"expr":[{"ExprInt":{"data":49985999997359719}}],"debt":-9007199254740993,"edge":9007199254740992}',
    );

    assert.deepEqual(response, {
        expr: [{ ExprInt: { data: "49985999997359719" } }],
        debt: "-9007199254740993",
        edge: "9007199254740992",
    });
});

test("safe integers and non-integer numbers stay numbers", () => {
    const response = parse(
        '{"seqNum":18397,"max":9007199254740991,"faultTolerance":0.9999934,"huge":1.5e300}',
    );

    assert.deepEqual(response, {
        seqNum: 18397,
        max: 9007199254740991,
        faultTolerance: 0.9999934,
        huge: 1.5e300,
    });
});

test("digits inside strings are left untouched, including after escaped quotes", () => {
    const response = parse(
        '{"blockSize":"103284","note":"x\\"9007199254740993","path":"C:\\\\12345678901234567890"}',
    );

    assert.deepEqual(response, {
        blockSize: "103284",
        note: 'x"9007199254740993',
        path: "C:\\12345678901234567890",
    });
});

test("parsing a crafted response of unterminated quotes takes linear time", () => {
    const crafted = '"' + '\\"'.repeat(UNTERMINATED_QUOTES_COUNT);

    const startedAt = performance.now();
    const response = parse(crafted);
    const elapsedMs = performance.now() - startedAt;

    assert.equal(response, crafted);
    assert.ok(
        elapsedMs < LINEAR_PARSE_BUDGET_MS,
        `parsing took ${elapsedMs.toFixed(1)}ms`,
    );
});

test("a response over the size limit is rejected before parsing", () => {
    const oversized = `"${"x".repeat(MAX_API_RESPONSE_LENGTH)}"`;

    assert.throws(() => parse(oversized), /exceeds the limit/);
});

test("invalid json and non-string data are returned as they are", () => {
    const payload = { already: "parsed" };

    assert.equal(parse("not json {"), "not json {");
    assert.equal(parse(payload), payload);
    assert.equal(parse(undefined), undefined);
});
