import assert from "node:assert/strict";
import test from "node:test";
import WalletsService from "../../src/services/Wallets";
import KeysManager from "../../src/services/KeysManager";
import { isAddress } from "../../src/utils/validators";

test("isAddress accepts SDK-derived addresses", () => {
    const { privateKey } = KeysManager.generateKeyPair();
    const { address } = WalletsService.createWallet(privateKey);

    assert.equal(isAddress(address), true);
});

test("isAddress rejects checksum-tampered addresses", () => {
    const { privateKey } = KeysManager.generateKeyPair();
    const { address } = WalletsService.createWallet(privateKey);

    const lastChar = address[address.length - 1];
    const replacement = lastChar === "1" ? "2" : "1";
    const tamperedAddress = `${address.slice(0, -1)}${replacement}`;

    assert.equal(isAddress(tamperedAddress), false);
});

test("isAddress rejects malformed strings", () => {
    assert.equal(isAddress("1111invalid!"), false);
    assert.equal(isAddress("1111short"), false);
});
