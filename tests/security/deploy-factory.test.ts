import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "../../src/domains/Wallet";
import {
    createCheckBalanceDeploy,
    createTransferDeploy,
    escapeRholangString,
} from "../../src/domains/Deploy/factory";

test("escapeRholangString escapes dangerous characters", () => {
    const raw = "a\"b\\c\nd\re\tf";
    const escaped = escapeRholangString(raw);

    assert.equal(escaped, "a\\\"b\\\\c\\nd\\re\\tf");
});

test("createCheckBalanceDeploy uses escaped address content", () => {
    const unsafeAddress = String.raw`1111abc" ) | @hack!("pwn") | ("` as Address;
    const deploy = createCheckBalanceDeploy(unsafeAddress);

    assert.ok(deploy.includes(String.raw`1111abc\" ) | @hack!(\"pwn\") | (\"`));
    assert.ok(!deploy.includes(String.raw`1111abc" ) | @hack!("pwn") | ("`));
});

test("createTransferDeploy escapes both addresses", () => {
    const fromAddress = String.raw`1111from"drop` as Address;
    const toAddress = String.raw`1111to"drop` as Address;
    const deploy = createTransferDeploy(fromAddress, toAddress, 1n);

    assert.ok(deploy.includes(String.raw`1111from\"drop`));
    assert.ok(deploy.includes(String.raw`1111to\"drop`));
    assert.ok(!deploy.includes(String.raw`1111from"drop`));
    assert.ok(!deploy.includes(String.raw`1111to"drop`));
});

test("createTransferDeploy rejects non-positive amounts", () => {
    const fromAddress = "1111from" as Address;
    const toAddress = "1111to" as Address;

    assert.throws(
        () => createTransferDeploy(fromAddress, toAddress, 0n),
        /greater than zero/,
    );
    assert.throws(
        () => createTransferDeploy(fromAddress, toAddress, -1n),
        /greater than zero/,
    );
});
