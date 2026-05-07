import MnemonicService from "@services/Mnemonic";
import Bip32KeyDerivationAdapter from "../../infrastructure/adapters/KeyDerivation";
import Secp256k1KeysManagerAdapter from "../../infrastructure/adapters/KeysManager";
import type { IKeyDerivation } from "../../application/ports/outbound/IKeyDerivation";
import type { IKeyManager, KeyPair } from "../../domain/services/KeyManagement";
import { ASI_CHAIN_PREFIX, ASI_COIN_TYPE } from "../../domain/constants";
import { decodeBase16, encodeBase58 } from "../../infrastructure/misc/codec";
import type { Address } from "../../domain/aggregates/Wallet";
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
    private static keyManager: IKeyManager =
        new Secp256k1KeysManagerAdapter();
    private static keyDerivation: IKeyDerivation =
        new Bip32KeyDerivationAdapter();

    public static configureKeyManager(keyManager: IKeyManager): void {
        this.keyManager = keyManager;
    }

    public static configureKeyDerivation(keyDerivation: IKeyDerivation): void {
        this.keyDerivation = keyDerivation;
    }

    public static createWallet(
        privateKey?: Uint8Array,
        options?: CreateWalletOptions,
    ): WalletMeta {
        let keyPair: KeyPair;

        if (!privateKey) {
            keyPair = this.keyManager.generateKeyPair();
        } else {
            keyPair = this.keyManager.getKeyPairFromPrivateKey(privateKey);
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
        if (
            !normalizedMnemonic ||
            !MnemonicService.isMnemonicValid(normalizedMnemonic)
        ) {
            throw new Error(
                "WalletsService.createWalletFromMnemonic: Recovery mnemonic is missing or invalid",
            );
        }

        const privateKey =
            await this.keyDerivation.derivePrivateKeyFromMnemonic(
                mnemonicToUse,
                {
                    coinType: ASI_COIN_TYPE,
                    account: 0,
                    change: 0,
                    index: index ?? 0,
                },
            );

        const walletMeta = this.createWallet(privateKey);
        return { ...walletMeta, mnemonic: normalizedMnemonic };
    }

    public static deriveAddressFromPrivateKey(privateKey: Uint8Array): Address {
        const keyPair: KeyPair =
            this.keyManager.getKeyPairFromPrivateKey(privateKey);

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
