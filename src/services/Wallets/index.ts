import MnemonicService from "@services/Mnemonic";
import KeyDerivationService from "@services/KeyDerivation";
import KeysManager, { type KeyPair } from "@services/KeysManager";
import { ASI_CHAIN_PREFIX, ASI_COIN_TYPE } from "@utils/constants";
import { decodeBase16, encodeBase58 } from "@utils/codec";
import { Address } from "@domains/Wallet";
import { blake2bHex } from "blakejs";
import { keccak256 } from "js-sha3";

export interface CreateWalletOptions {
    name?: string;
}
export interface WalletMeta {
    address: string;
    privateKey: string;
    publicKey?: string;
    mnemonic?: string;
}

export default class WalletsService {
    public static createWallet(
        privateKey?: string,
        options?: CreateWalletOptions
    ): WalletMeta {
        let keyPair: KeyPair;

        if (!privateKey) {
            keyPair = KeysManager.generateKeyPair();
        } else {
            keyPair = KeysManager.getKeyPairFromPrivateKey(privateKey);
        }

        const address: string = this.deriveAddressFromPublicKey(
            keyPair.publicKey
        );

        return {
            address,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
        };
    }

    public static async createWalletFromMnemonic(
        mnemonic?: string,
        index?: number
    ): Promise<WalletMeta> {
        const seed = await KeyDerivationService.mnemonicToSeed(
            mnemonic ?? MnemonicService.generateMnemonic()
        );

        const masterNode = KeyDerivationService.seedToMasterNode(seed);

        const path = KeyDerivationService.buildBip44Path(
            ASI_COIN_TYPE,
            0,
            0,
            index || 0
        );

        const privateKey = KeyDerivationService.derivePrivateKey(
            masterNode,
            path
        );

        return { ...this.createWallet(privateKey), mnemonic };
    }

    public static deriveAddressFromPrivateKey(privateKey: string): Address {
        const keyPair: KeyPair =
            KeysManager.getKeyPairFromPrivateKey(privateKey);

        return this.deriveAddressFromPublicKey(keyPair.publicKey);
    }

    public static deriveAddressFromPublicKey(publicKey: string): Address {
        const publicKeyBytes: Uint8Array = decodeBase16(publicKey);

        const hash: string = keccak256(publicKeyBytes.slice(1));

        const addressBase: Uint8Array = decodeBase16(hash.slice(-40));

        const addressBaseHash: string = keccak256(addressBase);

        const addressPayload: string = `${ASI_CHAIN_PREFIX.coinId}${ASI_CHAIN_PREFIX.version}${addressBaseHash}`;

        const addressPayloadBytes: Uint8Array = decodeBase16(addressPayload);

        const checksum: string = blake2bHex(
            addressPayloadBytes,
            undefined,
            32
        ).slice(0, 8);

        return encodeBase58(`${addressPayload}${checksum}`) as Address; // payload prefix should always start with `1111`
    }
}
