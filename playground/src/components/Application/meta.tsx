import {
    Vault,
    MnemonicService,
    KeysService,
    ChainService,
    KeyDerivationService,
    EncryptedSeedRecord,
    Wallet,
} from "asi-wallet-sdk";
import PasswordModal, {
    type IPasswordModalProps,
} from "@components/PasswordModal";
import { type ReactElement } from "react";
import TransferModal, { ITransferModalProps } from "@components/TransferModal";
import CreateWalletModal, {
    IWalletCreateModalProps,
} from "@components/CreateWalletModal";
import { MnemonicStrength } from "../../../../dist/services/mnemonic";

const VAULT_GET_KEY = "ASI_WALLETS_VAULT_test_vault";

export enum Modals {
    PASSWORD_MODAL = "unlockVault",
    CREATE_WALLET_MODAL = "createWalletModal",
    TRANSFER_MODAL = "transferModal",
}

export type ModalProps =
    | IPasswordModalProps
    | ITransferModalProps
    | IWalletCreateModalProps
    | undefined;

interface IModalsMetaProps {
    modal: (props: ModalProps) => ReactElement;
}

const ModalsMeta: Record<string, IModalsMetaProps> = {
    [Modals.PASSWORD_MODAL]: {
        modal: (props: IPasswordModalProps) => <PasswordModal {...props} />,
    },
    [Modals.CREATE_WALLET_MODAL]: {
        modal: (props: IWalletCreateModalProps) => (
            <CreateWalletModal {...props} />
        ),
    },
    [Modals.TRANSFER_MODAL]: {
        modal: (props: ITransferModalProps) => <TransferModal {...props} />,
    },
};

export const init = (config, setVault, setChainService) => {
    try {

        const chainService = new ChainService({
            validatorURL: config.ValidatorURL,
            readOnlyURL: config.ReadOnlyURL,
        });

        console.log("Initialized Chain service", chainService);

        console.log("Found keys", Vault.getSavedVaultKeys());

        const encryptedVaultData = Vault.getVaultDataFromStorage(VAULT_GET_KEY);

        console.log("Read LS data", encryptedVaultData);

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
    mnemonicArray: string[],
    password: string
) => {
    const mnemonic = MnemonicService.wordArrayToMnemonic(mnemonicArray);

    return await deriveNextWallet(mnemonic, name, password, 0);
};

export const deriveNextWallet = async (
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

    const { publicKey } = KeysService.getKeyPairFromPrivateKey(privateKey);
    const seedRecord = EncryptedSeedRecord.fromRawSeed(mnemonic);

    return {
        privateKey,
        publicKey,
        seedRecord,
        wallet: Wallet.fromPrivateKey(
            name,
            privateKey,
            password,
            seedRecord.transformToId(),
            nextIndex
        ),
    };
};

export const createInitialMnemonic = (variant) => {
    return MnemonicService.generateMnemonic(wordsCountToMnemonicStrength(variant));
};

export const createInitialPrivateKey = () => {
    return KeysService.generateKeyPair().privateKey;
};

export default ModalsMeta;
