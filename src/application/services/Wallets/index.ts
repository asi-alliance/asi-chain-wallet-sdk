import Bip32KeyDerivationAdapter from "@/infrastructure/adapters/KeyDerivation";
import Bip39MnemonicAdapter from "@/infrastructure/adapters/Mnemonic";
import Secp256k1KeysManagerAdapter from "@/infrastructure/adapters/KeysManager";
import type { IKeyDerivation } from "../../ports/outbound/IKeyDerivation";
import type { IMnemonicService } from "../../ports/outbound/IMnemonic";
import type { IKeyManager, KeyPair } from "@/domain/services/KeyManagement";
import { deriveAddressFromPublicKey } from "@/domain/services/AddressDerivation";
import { ASI_COIN_TYPE } from "@/domain/constants";
import type { Address } from "@/domain/aggregates/Wallet";
import { MnemonicPhrase } from "@/domain/valueObjects/MnemonicPhrase";

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
    private static mnemonicService: IMnemonicService =
        new Bip39MnemonicAdapter();

    public static configureKeyManager(keyManager: IKeyManager): void {
        this.keyManager = keyManager;
    }

    public static configureKeyDerivation(keyDerivation: IKeyDerivation): void {
        this.keyDerivation = keyDerivation;
    }

    public static configureMnemonicService(
        mnemonicService: IMnemonicService,
    ): void {
        this.mnemonicService = mnemonicService;
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
        const phrase = mnemonic
            ? MnemonicPhrase.fromString(mnemonic)
            : MnemonicPhrase.fromString(
                  this.mnemonicService.generateMnemonic(),
              );
        const normalizedMnemonic = phrase.toString();

        if (
            !normalizedMnemonic ||
            !this.mnemonicService.isMnemonicValid(normalizedMnemonic)
        ) {
            throw new Error(
                "WalletsService.createWalletFromMnemonic: Recovery mnemonic is missing or invalid",
            );
        }

        const privateKey =
            await this.keyDerivation.derivePrivateKeyFromMnemonic(
                phrase.words,
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

        return deriveAddressFromPublicKey(keyPair.publicKey);
    }

    public static deriveAddressFromPublicKey(publicKey: Uint8Array): Address {
        return deriveAddressFromPublicKey(publicKey);
    }
}
