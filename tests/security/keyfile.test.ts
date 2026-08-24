import assert from "node:assert/strict";
import test from "node:test";

import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import { WalletTypes } from "@domains/Signer";
import { InvalidKeyfilePasswordError } from "@domains/CustomError";
import ExportKeyfileService, {
    IWalletKeyfile,
} from "@services/ExportKeyfileService";
import ImportKeyfileService from "@services/ImportKeyfileService";
import KeysManager from "@services/KeysManager";
import MnemonicService from "@services/Mnemonic";

const PASSWORD = "keyfile-export-password";
const WRONG_PASSWORD = "keyfile-export-wrong-password";
const ACCOUNT_NAME = "security-account";

const passwordProvider = new SecretsProvider(() => ({ password: PASSWORD }));

const createHdWallet = (mnemonic: string): Promise<Wallet> =>
    Wallet.createHD(
        {
            mnemonic,
            pathOptions: { index: 0 },
            accountOptions: { name: ACCOUNT_NAME },
        },
        passwordProvider,
    );

const createPkWallet = (privateKey: Uint8Array): Promise<Wallet> =>
    Wallet.createPk(
        { name: ACCOUNT_NAME },
        new SecretsProvider(() => ({
            password: PASSWORD,
            secret: { privateKey },
        })),
    );

const exportKeyfile = (wallet: Wallet): Promise<IWalletKeyfile> =>
    ExportKeyfileService.exportWalletKeyfile(wallet, passwordProvider);

const tamperBase64 = (value: string): string =>
    `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;

test("an exported hd keyfile carries no plaintext mnemonic, password or account name", async () => {
    const mnemonic = MnemonicService.generateMnemonic();
    const wallet = await createHdWallet(mnemonic);

    const serialized = ExportKeyfileService.toJSON(await exportKeyfile(wallet));

    assert.equal(serialized.includes(mnemonic), false);
    assert.equal(serialized.includes(PASSWORD), false);
    assert.equal(serialized.includes(ACCOUNT_NAME), false);
});

test("an exported private key keyfile carries no plaintext key material", async () => {
    const privateKey = KeysManager.generateRandomKey();
    const wallet = await createPkWallet(privateKey);

    const serialized = ExportKeyfileService.toJSON(await exportKeyfile(wallet));
    const keyAsHex = KeysManager.convertKeyToHex(privateKey);

    assert.equal(serialized.toLowerCase().includes(keyAsHex.toLowerCase()), false);
    assert.equal(serialized.includes(Array.from(privateKey).join(",")), false);
    assert.equal(serialized.includes(PASSWORD), false);
    assert.equal(serialized.includes(ACCOUNT_NAME), false);
});

test("exporting a wallet keyfile is refused with a wrong password", async () => {
    const wallet = await createHdWallet(MnemonicService.generateMnemonic());

    await assert.rejects(
        ExportKeyfileService.exportWalletKeyfile(
            wallet,
            new SecretsProvider(() => ({ password: WRONG_PASSWORD })),
        ),
        InvalidKeyfilePasswordError,
    );
});

test("a tampered keyfile secret is rejected instead of being imported", async () => {
    const wallet = await createPkWallet(KeysManager.generateRandomKey());
    const keyfile = await exportKeyfile(wallet);

    await assert.rejects(
        ImportKeyfileService.decryptKeyfileSecret(
            WalletTypes.PRIVATE_KEY,
            {
                ...keyfile.encryptedPrivateData,
                data: tamperBase64(keyfile.encryptedPrivateData.data),
            },
            passwordProvider,
        ),
        InvalidKeyfilePasswordError,
    );
});

test("tampered keyfile accounts are rejected instead of being imported", async () => {
    const wallet = await createPkWallet(KeysManager.generateRandomKey());
    const keyfile = await exportKeyfile(wallet);

    await assert.rejects(
        ImportKeyfileService.decryptKeyfileAccounts(
            {
                ...keyfile,
                encryptedAccounts: {
                    ...keyfile.encryptedAccounts,
                    data: tamperBase64(keyfile.encryptedAccounts.data),
                },
            },
            passwordProvider,
        ),
        InvalidKeyfilePasswordError,
    );
});