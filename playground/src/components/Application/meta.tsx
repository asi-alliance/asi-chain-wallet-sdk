import { ITransferCompletedModalProps } from "@components/TransferCompletedModal";
import { IDeriveWalletModalProps } from "@components/DeriveWalletModal";
import { IWalletCreateModalProps } from "@components/CreateWalletModal";
import { IPasswordModalProps } from "@components/PasswordModal";
import { ITransferModalProps } from "@components/TransferModal";
import {
    KeyDerivationService,
    MnemonicService,
    MnemonicStrength,
    ChainService,
    KeysManager,
    Wallet,
    Vault,
} from "asi-wallet-sdk";
import { keccak512 } from "js-sha3";

const VAULT_GET_KEY = "ASI_WALLETS_VAULT_test_vault";

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

export const init = (config, setVault, setChainService) => {
    try {
        const chainService = new ChainService({
            validatorURL: config.ValidatorURL,
            readOnlyURL: config.ReadOnlyURL,
        });

        console.log("Initialized Chain service", chainService);

        console.log("Found keys", Vault.getSavedVaultKeys());

        const encryptedVaultData = Vault.getVaultDataFromStorage(VAULT_GET_KEY);

        const vault = new Vault(encryptedVaultData);

        console.log("Vault instance", vault);

        setVault(vault);
        setChainService(chainService);
    } catch (error) {
        alert(error?.message || "Error during initialization");
    }
};

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
    password: string
) => {
    return await deriveNextWallet(keccak512(mnemonic), mnemonic, name, password, 0);
};

export const deriveNextWallet = async (
    seedId,
    mnemonic: string,
    name: string,
    password: string,
    lastIndex: number
) => {
    const nextIndex: number = lastIndex++;

    const path: string = KeyDerivationService.buildBip44Path(
        60,
        0,
        0,
        nextIndex
    );

    const seed = await KeyDerivationService.mnemonicToSeed(mnemonic);
    const masterNode = KeyDerivationService.seedToMasterNode(seed);

    const privateKey = KeyDerivationService.derivePrivateKey(masterNode, path);

    const { publicKey } = KeysManager.getKeyPairFromPrivateKey(privateKey);

    return {
        seedId,
        privateKey,
        publicKey,
        wallet: await Wallet.fromPrivateKey(
            name,
            privateKey,
            password,
            seedId,
            nextIndex
        ),
    };
};

export const createInitialMnemonic = (variant) => {
    return MnemonicService.generateMnemonic(
        wordsCountToMnemonicStrength(variant)
    );
};

export const createInitialPrivateKey = () => {
    return KeysManager.generateKeyPair().privateKey;
};
