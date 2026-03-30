import assert from "node:assert/strict";
import test from "node:test";
import WalletsService from "../../src/services/Wallets";
import KeysManager from "../../src/services/KeysManager";
import {
    isAddress,
    validateAddress,
    validateAccountName,
    AddressValidationErrorCode,
} from "../../src/utils/validators";

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

test("validateAddress returns deterministic error codes", () => {
    const invalidPrefix = validateAddress("2222abc");
    assert.equal(invalidPrefix.isValid, false);
    assert.equal(
        invalidPrefix.errorCode,
        AddressValidationErrorCode.INVALID_PREFIX,
    );

    const invalidLength = validateAddress("1111short");
    assert.equal(invalidLength.isValid, false);
    assert.equal(
        invalidLength.errorCode,
        AddressValidationErrorCode.INVALID_LENGTH,
    );

    const tooLongAddress = validateAddress(`1111${"A".repeat(51)}`);
    assert.equal(tooLongAddress.isValid, false);
    assert.equal(
        tooLongAddress.errorCode,
        AddressValidationErrorCode.INVALID_LENGTH,
    );

    const invalidAlphabet = validateAddress(
        "1111AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!",
    );
    assert.equal(invalidAlphabet.isValid, false);
    assert.equal(
        invalidAlphabet.errorCode,
        AddressValidationErrorCode.INVALID_ALPHABET,
    );

    const invalidBase58 = validateAddress(`1111${"0OIl".repeat(12)}`);
    assert.equal(invalidBase58.isValid, false);
    assert.equal(
        invalidBase58.errorCode,
        AddressValidationErrorCode.INVALID_BASE58,
    );

    const invalidHexLength = validateAddress(`1111${"1".repeat(46)}`);
    assert.equal(invalidHexLength.isValid, false);
    assert.equal(
        invalidHexLength.errorCode,
        AddressValidationErrorCode.INVALID_HEX_LENGTH,
    );
});

test("validateAccountName covers required, length, char and success paths", () => {
    const required = validateAccountName("   ");
    assert.equal(required.isValid, false);
    assert.equal(required.error, "Account name is required");

    const tooLong = validateAccountName("a".repeat(31));
    assert.equal(tooLong.isValid, false);
    assert.equal(
        tooLong.error,
        "Account name must be 30 characters or less",
    );

    const invalidChars = validateAccountName("bad/name");
    assert.equal(invalidChars.isValid, false);
    assert.equal(
        invalidChars.error,
        "Account name contains invalid characters",
    );

    const valid = validateAccountName("primary-account");
    assert.equal(valid.isValid, true);
});
