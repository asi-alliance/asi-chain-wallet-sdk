import MnemonicService from "@services/Mnemonic";
import KeyDerivationService from "@services/KeyDerivation";
import KeysManager, { type KeyPair } from "@services/KeysManager";
import { ASI_CHAIN_PREFIX, ASI_COIN_TYPE } from "@utils/constants";
import { decodeBase16, encodeBase58 } from "@utils/codec";
import { Address } from "@domains/Wallet";
import blakejs from "blakejs";
import sha3 from "js-sha3";

const { blake2bHex } = blakejs;
const { keccak256 } = sha3;

export interface CreateWalletOptions {
    name?: string;
}
export interface WalletMeta {
    address: string;
    privateKey: Uint8Array;
    publicKey?: Uint8Array;
    mnemonic?: string;
}

export default class WalletsService {
    public static createWallet(
        privateKey?: Uint8Array,
        options?: CreateWalletOptions,
    ): WalletMeta {
        let keyPair: KeyPair;

        if (!privateKey) {
            keyPair = KeysManager.generateKeyPair();
        } else {
            keyPair = KeysManager.getKeyPairFromPrivateKey(privateKey);
        }

        const address: string = this.deriveAddressFromPublicKey(
            keyPair.publicKey,
        );

        return {
            address,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
        };
    }

    public static async createWalletFromMnemonic(
        mnemonic?: string,
        index?: number,
    ): Promise<WalletMeta> {
        const mnemonicToUse = mnemonic
            ? MnemonicService.mnemonicToWordArray(mnemonic)
            : MnemonicService.generateMnemonicArray();
        const normalizedMnemonic =
            MnemonicService.wordArrayToMnemonic(mnemonicToUse);
        if (!normalizedMnemonic || !MnemonicService.isMnemonicValid(normalizedMnemonic)) {
            throw new Error(
                "WalletsService.createWalletFromMnemonic: Recovery mnemonic is missing or invalid",
            );
        }

        const seed = await KeyDerivationService.mnemonicToSeed(mnemonicToUse);

        const masterNode = KeyDerivationService.seedToMasterNode(seed);

        const path = KeyDerivationService.buildBip44Path({
            coinType: ASI_COIN_TYPE,
            account: 0,
            change: 0,
            index: index || 0,
        });

        const privateKey = KeyDerivationService.derivePrivateKey(
            masterNode,
            path,
        );

        const walletMeta = this.createWallet(privateKey);
        return { ...walletMeta, mnemonic: normalizedMnemonic };
    }

    public static deriveAddressFromPrivateKey(privateKey: Uint8Array): Address {
        const keyPair: KeyPair =
            KeysManager.getKeyPairFromPrivateKey(privateKey);

        return this.deriveAddressFromPublicKey(keyPair.publicKey);
    }

    public static deriveAddressFromPublicKey(publicKey: Uint8Array): Address {
        const hash: string = keccak256(publicKey.slice(1));

        const addressBase: Uint8Array = decodeBase16(hash.slice(-40));

        const addressBaseHash: string = keccak256(addressBase);

        const addressPayload: string = `${ASI_CHAIN_PREFIX.coinId}${ASI_CHAIN_PREFIX.version}${addressBaseHash}`;

        const addressPayloadBytes: Uint8Array = decodeBase16(addressPayload);

        const checksum: string = blake2bHex(
            addressPayloadBytes,
            undefined,
            32,
        ).slice(0, 8);

        return encodeBase58(`${addressPayload}${checksum}`) as Address; // payload prefix should always start with `1111`
    }
}
