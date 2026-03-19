import assert from "node:assert/strict";
import test from "node:test";

import Asset from "../../src/domains/Asset";
import CryptoService from "../../src/services/Crypto";

test("Asset uses default decimals and returns values via getters", () => {
    const asset = new Asset("ASI", "ASI");

    assert.equal(asset.getId(), "ASI");
    assert.equal(asset.getName(), "ASI");
    assert.equal(asset.getDecimals(), 8);
});

test("CryptoService decrypt rejects unsupported payload versions", async () => {
    const encrypted = await CryptoService.encryptWithPassword(
        "payload",
        "password",
    );

    await assert.rejects(
        CryptoService.decryptWithPassword(
            { ...encrypted, version: encrypted.version + 1 },
            "password",
        ),
        /Unsupported version/,
    );
});
