import assert from "node:assert/strict";
import test from "node:test";
import type { BIP32Interface } from "bip32";

import Bip44Path from "@domains/Bip44Path";
import KeyDerivationService from "@services/KeyDerivation";
import MnemonicService from "@services/Mnemonic";
import { ASI_COIN_TYPE, PRIVATE_KEY_LENGTH } from "@utils/constants";

const MNEMONIC = MnemonicService.generateMnemonic();
const WORDS = MnemonicService.mnemonicToWordArray(MNEMONIC);
const PASSPHRASE = "derivation-passphrase";

const createPath = (index: number): Bip44Path =>
    new Bip44Path({
        coinType: ASI_COIN_TYPE,
        account: 0,
        change: 0,
        index,
    });

test("mnemonicToSeed treats a mnemonic string and a word array as the same input", async () => {
    const fromString = await KeyDerivationService.mnemonicToSeed(
        MNEMONIC,
        PASSPHRASE,
    );
    const fromArray = await KeyDerivationService.mnemonicToSeed(
        WORDS,
        PASSPHRASE,
    );

    assert.deepEqual(Array.from(fromArray), Array.from(fromString));
});

test("mnemonicToSeed produces a different seed for a different passphrase", async () => {
    const withoutPassphrase =
        await KeyDerivationService.mnemonicToSeed(MNEMONIC);
    const withPassphrase = await KeyDerivationService.mnemonicToSeed(
        MNEMONIC,
        PASSPHRASE,
    );

    assert.notDeepEqual(
        Array.from(withPassphrase),
        Array.from(withoutPassphrase),
    );
});

test("derivePrivateKey returns a full length key from a master node", async () => {
    const seed = await KeyDerivationService.mnemonicToSeed(MNEMONIC);
    const masterNode = KeyDerivationService.seedToMasterNode(seed);

    const privateKey = KeyDerivationService.derivePrivateKey(
        masterNode,
        createPath(0),
    );

    assert.equal(privateKey.length, PRIVATE_KEY_LENGTH);
});

test("derivePrivateKey throws when the derived node carries no private key", () => {
    const nodeWithoutPrivateKey = {
        derivePath: () => ({ privateKey: null }),
    } as unknown as BIP32Interface;

    assert.throws(
        () =>
            KeyDerivationService.derivePrivateKey(
                nodeWithoutPrivateKey,
                createPath(0),
            ),
        /No private key at derived node/,
    );
});

test("deriveKeyFromMnemonic is deterministic for the same mnemonic and path", async () => {
    const first = await KeyDerivationService.deriveKeyFromMnemonic(
        WORDS,
        createPath(0),
    );
    const second = await KeyDerivationService.deriveKeyFromMnemonic(
        MNEMONIC,
        createPath(0),
    );

    assert.equal(first.length, PRIVATE_KEY_LENGTH);
    assert.deepEqual(Array.from(second), Array.from(first));
});

test("deriveKeyFromMnemonic separates accounts by derivation index", async () => {
    const atZero = await KeyDerivationService.deriveKeyFromMnemonic(
        WORDS,
        createPath(0),
    );
    const atOne = await KeyDerivationService.deriveKeyFromMnemonic(
        WORDS,
        createPath(1),
    );

    assert.notDeepEqual(Array.from(atOne), Array.from(atZero));
});

test("deriveNextKeyFromMnemonic advances the index by one", async () => {
    const next = await KeyDerivationService.deriveNextKeyFromMnemonic(
        WORDS,
        0,
        {
            coinType: ASI_COIN_TYPE,
            account: 0,
            change: 0,
        },
    );
    const expected = await KeyDerivationService.deriveKeyFromMnemonic(
        WORDS,
        createPath(1),
    );

    assert.equal(next.length, PRIVATE_KEY_LENGTH);
    assert.deepEqual(Array.from(next), Array.from(expected));
});