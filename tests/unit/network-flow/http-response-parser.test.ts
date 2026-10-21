import assert from "node:assert/strict";
import test from "node:test";

import HttpResponseParser from "@services/HttpResponseParser";

const UNTERMINATED_QUOTES_COUNT = 100_000;
const ESCAPED_QUOTES_COUNT = 3_500_000;
const LINEAR_PARSE_BUDGET_MS = 1000;

const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const FIRST_UNSAFE_INTEGER = String(MAX_SAFE_INTEGER + 1n);
const UNSAFE_INTEGER = String(MAX_SAFE_INTEGER + 2n);
const NEGATIVE_UNSAFE_INTEGER = `-${UNSAFE_INTEGER}`;
const NODE_BALANCE = "49985999997359719";
const TWENTY_DIGIT_INTEGER = "12345678901234567890";
const MAX_UINT64 = "18446744073709551615";

const parse = (data: unknown): unknown =>
    HttpResponseParser.parseWithBigIntegersAsStrings(data);

test("unsafe integers from a node response are returned as strings", () => {
    const response = parse(
        `{"expr":[{"ExprInt":{"data":${NODE_BALANCE}}}],"debt":${NEGATIVE_UNSAFE_INTEGER},"edge":${FIRST_UNSAFE_INTEGER}}`,
    );

    assert.deepEqual(response, {
        expr: [{ ExprInt: { data: NODE_BALANCE } }],
        debt: NEGATIVE_UNSAFE_INTEGER,
        edge: FIRST_UNSAFE_INTEGER,
    });
});

test("a bare unsafe integer and unsafe integers in nested arrays are returned as strings", () => {
    assert.equal(parse(TWENTY_DIGIT_INTEGER), TWENTY_DIGIT_INTEGER);

    assert.deepEqual(
        parse(
            `[[${UNSAFE_INTEGER},${NEGATIVE_UNSAFE_INTEGER}],[1,[${MAX_UINT64}]]]`,
        ),
        [
            [UNSAFE_INTEGER, NEGATIVE_UNSAFE_INTEGER],
            [1, [MAX_UINT64]],
        ],
    );
});

test("safe integers and non-integer numbers stay numbers", () => {
    const response = parse(
        `{"seqNum":18397,"max":${Number.MAX_SAFE_INTEGER},"faultTolerance":0.9999934,"huge":1.5e300}`,
    );

    assert.deepEqual(response, {
        seqNum: 18397,
        max: Number.MAX_SAFE_INTEGER,
        faultTolerance: 0.9999934,
        huge: 1.5e300,
    });
});

test("digits inside strings are left untouched, including after escaped quotes", () => {
    const response = parse(
        `{"blockSize":"103284","note":"x\\"${UNSAFE_INTEGER}","path":"C:\\\\${TWENTY_DIGIT_INTEGER}"}`,
    );

    assert.deepEqual(response, {
        blockSize: "103284",
        note: `x"${UNSAFE_INTEGER}`,
        path: `C:\\${TWENTY_DIGIT_INTEGER}`,
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

test("a valid response with millions of escaped quotes is parsed into an object", () => {
    const expr = '"'.repeat(ESCAPED_QUOTES_COUNT);

    const response = parse(JSON.stringify({ expr }));

    assert.deepEqual(response, { expr });
});

test("invalid json and non-string data are returned as they are", () => {
    const payload = { already: "parsed" };

    assert.equal(parse("not json {"), "not json {");
    assert.equal(parse(payload), payload);
    assert.equal(parse(undefined), undefined);
});
