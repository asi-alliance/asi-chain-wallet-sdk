import assert from "node:assert/strict";
import test from "node:test";

import SecretsProvider from "@domains/SecretsProvider";

const PASSWORD = "secrets-provider-password";

test("a provider exposes no own properties that could leak the secret", () => {
    const provider = new SecretsProvider(() => ({ password: PASSWORD }));

    assert.deepEqual(Object.keys(provider), []);
    assert.deepEqual(Object.getOwnPropertyNames(provider), []);
    assert.deepEqual(Object.getOwnPropertySymbols(provider), []);
    assert.equal(JSON.stringify(provider), "{}");
    assert.equal(JSON.stringify({ provider }).includes(PASSWORD), false);
});

test("a provider reads its source on every access instead of caching", () => {
    let password = "first-password";
    const provider = new SecretsProvider(() => ({ password }));

    assert.equal(provider.getSecret().password, "first-password");

    password = "second-password";

    assert.equal(provider.getSecret().password, "second-password");
});

test("a provider keeps no copy once its source releases the secret", () => {
    let secret: { password: string } | null = { password: PASSWORD };
    const provider = new SecretsProvider(() => secret);

    assert.equal(provider.getSecret().password, PASSWORD);

    secret = null;

    assert.equal(provider.getSecret(), null);
});

test("a provider hands out the live key material rather than a detached copy", () => {
    const privateKey = new Uint8Array(32).fill(4);
    const provider = new SecretsProvider(() => ({ privateKey }));

    provider.getSecret().privateKey.fill(0);

    assert.deepEqual(Array.from(privateKey), new Array(32).fill(0));
});