import assert from "node:assert/strict";
import test from "node:test";

import MnemonicService from "../../src/services/Mnemonic";
import WalletsService from "../../src/services/Wallets";

test("createWalletFromMnemonic returns generated mnemonic when omitted", async () => {
    const wallet = await WalletsService.createWalletFromMnemonic();

    assert.ok(wallet.mnemonic);
    assert.equal(MnemonicService.isMnemonicValid(wallet.mnemonic), true);
});

test("generated mnemonic can deterministically recover wallet keys", async () => {
    const generated = await WalletsService.createWalletFromMnemonic(undefined, 3);
    const recovered = await WalletsService.createWalletFromMnemonic(
        generated.mnemonic,
        3,
    );

    assert.equal(recovered.address, generated.address);
    assert.deepEqual(
        Array.from(recovered.privateKey),
        Array.from(generated.privateKey),
    );
});

test("provided mnemonic is normalized in output", async () => {
    const mnemonic = MnemonicService.generateMnemonic();
    const wallet = await WalletsService.createWalletFromMnemonic(
        ` ${mnemonic} `,
        0,
    );

    assert.equal(wallet.mnemonic, mnemonic);
});

test("createWalletFromMnemonic rejects missing or invalid recovery data", async () => {
    await assert.rejects(
        WalletsService.createWalletFromMnemonic("   ", 0),
        /Recovery mnemonic is missing or invalid/,
    );

    await assert.rejects(
        WalletsService.createWalletFromMnemonic("invalid words", 0),
        /Recovery mnemonic is missing or invalid/,
    );
});
