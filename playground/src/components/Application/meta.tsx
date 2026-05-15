import { ITransferCompletedModalProps } from "@components/TransferCompletedModal";
import { IDeriveWalletModalProps } from "@components/DeriveWalletModal";
import { IWalletCreateModalProps } from "@components/CreateWalletModal";
import { IPasswordModalProps } from "@components/PasswordModal";
import { ITransferModalProps } from "@components/TransferModal";
import {
    // KeyDerivationService,
    // MnemonicService,
    // KeysManager,
    Wallet,
    MnemonicStrength,
    Bip32KeyDerivationAdapter, //INFO/TODO: Avoid using such adapters directly in client code. Instead, use the full SDK layer application API.
    Secp256k1KeysManagerAdapter,
    Bip39MnemonicAdapter, 
} from "asi-wallet-sdk";
import { keccak512 } from "js-sha3";



export enum Modals {
    PASSWORD_MODAL = "unlockVault",
    CREATE_WALLET_MODAL = "createWalletModal",
    TRANSFER_MODAL = "transferModal",
    DERIVE_WALLET_MODAL = "deriveWalletModal",
    TRANSFER_COMPLETED_MODAL = "transferCompletedModal",
}

export type ModalProps =
    | IPasswordModalProps
    | ITransferModalProps
    | IWalletCreateModalProps
    | IDeriveWalletModalProps
    | ITransferCompletedModalProps
    | undefined;

const wordsCountToMnemonicStrength = (words: 12 | 24) => {
    const valuesRecord: Record<number, MnemonicStrength> = {
        12: MnemonicStrength.TWELVE_WORDS,
        24: MnemonicStrength.TWENTY_FOUR_WORDS,
    };

    return valuesRecord[words];
};

export const createMnemonicWallet = async (
    name: string,
    mnemonic: string,
    password: string,
) => {
    return await deriveNextWallet(
        keccak512(mnemonic),
        mnemonic,
        name,
        password,
        0,
    );
};


export const deriveNextWallet = async ( //INFO/TODO: need to be placed in sdk
    seedId,
    mnemonic: string,
    name: string,
    password: string,
    lastIndex: number,
) => {
    const nextIndex: number = lastIndex++;

    const path: string = Bip32KeyDerivationAdapter.buildBip44Path({
        coinType: 60,
        account: 0,
        change: 0,
        index: nextIndex,
    });

    const seed = await Bip32KeyDerivationAdapter.mnemonicToSeed(mnemonic);
    const masterNode = Bip32KeyDerivationAdapter.seedToMasterNode(seed);

    const privateKey = Bip32KeyDerivationAdapter.derivePrivateKey(masterNode, path);

    const { publicKey } = Secp256k1KeysManagerAdapter.getKeyPairFromPrivateKey(privateKey);

    return {
        seedId,
        privateKey,
        publicKey,
        wallet: await Wallet.fromPrivateKey(
            name,
            privateKey,
            password,
            seedId,
            nextIndex,
        ),
    };
};

export const createInitialMnemonic = (variant) => {
    return Bip39MnemonicAdapter.generateMnemonic(
        wordsCountToMnemonicStrength(variant),
    );
};

export const createInitialPrivateKey = () => {
    return Secp256k1KeysManagerAdapter.generateKeyPair().privateKey;
};
