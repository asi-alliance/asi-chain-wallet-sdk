import assert from "node:assert/strict";
import test from "node:test";

import MnemonicService from "@services/Mnemonic";
import WalletsService from "@services/Wallets";

test("createFirstWalletWithMnemonic returns generated mnemonic when omitted", async () => {
    const wallet = await WalletsService.createFirstWalletWithMnemonic();

    assert.ok(wallet.mnemonic);
    assert.equal(MnemonicService.isMnemonicValid(wallet.mnemonic), true);
});

test("generated mnemonic can deterministically recover wallet keys", async () => {
    const generated = await WalletsService.createFirstWalletWithMnemonic(
        undefined,
        3,
    );
    const recovered = await WalletsService.createFirstWalletWithMnemonic(
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
    const wallet = await WalletsService.createFirstWalletWithMnemonic(
        ` ${mnemonic} `,
        0,
    );

    assert.equal(wallet.mnemonic, mnemonic);
});

test("createFirstWalletWithMnemonic rejects missing or invalid recovery data", async () => {
    await assert.rejects(
        WalletsService.createFirstWalletWithMnemonic("   ", 0),
        /Recovery mnemonic is missing or invalid/,
    );

    await assert.rejects(
        WalletsService.createFirstWalletWithMnemonic("invalid words", 0),
        /Recovery mnemonic is missing or invalid/,
    );
});
