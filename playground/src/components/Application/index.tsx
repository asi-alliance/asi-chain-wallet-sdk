import {
    Wallet,
    Vault,
    MnemonicService,
    KeyDerivationService,
    KeysService,
    ChainService,
} from "asi-wallet-sdk";
import { type ReactElement, useEffect, useState } from "react";
import ModalsMeta, { ApplicationContext, ModalProps, Modals } from "./meta";
import WalletsPage from "@pages/WalletsPage";
import { IPasswordModalProps } from "@components/PasswordModal";
import { ISelectModalProps, TSelectModalOption } from "@components/SelectModal";
import { MnemonicStrength } from "../../../../dist/services/mnemonic";
import { BIP32Interface } from "bip32";
import { IWalletCreateModalProps, TWalletCreatePayload } from "@components/CreateWalletModal";
import "./style.css";

const configs = import.meta.env.VITE_NETWORKS;
const config = JSON.parse(configs)["DevNet"];

const chainService = new ChainService({
    validatorURL: config.ValidatorURL,
    readOnlyURL: config.ReadOnlyURL,
});

console.log("Initialized Chain service", chainService);


console.log("keys", Vault.getSavedVaultKeys());

const VAULT_STORAGE_KEY = "test_vault";
const VAULT_GET_KEY = "ASI_WALLETS_VAULT_test_vault";

const encryptedVaultData = Vault.getVaultDataFromStorage(VAULT_GET_KEY);

console.log("Read LS data", encryptedVaultData);

const vault = new Vault(encryptedVaultData);

console.log("Vault instance", vault);


const wordsCountToMnemonicStrength = (words: 12 | 24) => {
    const valuesRecord: Record<number, MnemonicStrength> = {
        12: MnemonicStrength.TWELVE_WORDS,
        24: MnemonicStrength.TWENTY_FOUR_WORDS,
    }

    return valuesRecord[words];
}

const Application = (): ReactElement => {
    const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
    const [currentModal, setCurrentModal] = useState<Modals>();
    const [currentModalProps, setCurrentModalProps] = useState<ModalProps>();
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    const [masterNode, setMasterNode] = useState<BIP32Interface>();
    const [currentMnemonic, setCurrentMnemonic] = useState<string>();
    const [currentPassword, setCurrentPassword] = useState<string>();

    const unlockVault = (password) => {
        try {
            vault.unlock(password);

            console.log("Unlocked Vault", vault);

            setIsModalOpen(false);
            setIsUnlocked(true);
        } catch (error) {
            alert("Unlock failed " + error?.message || "");
            setCurrentModal(Modals.UNLOCK_VAULT);
        }
    };

    const createUnlockVaultModalProps = (): IPasswordModalProps => {
        return {
            title: "Unlock wallet",
            onSubmit: unlockVault,
        };
    };

    const createWalletWithPrivateKeyPayload = (data: TWalletCreatePayload): void => {
        if (!("privateKey" in data)) {
            throw new Error("Wrong data object type for privateKey in TWalletCreatePayload");
        };
        
        const walletData = createKeyPairWallet(data.name, data.privateKey, data.password);

        console.log("Wallet data: ", walletData);

        vault.addWallet(walletData.wallet);

        console.log("Vault after the wallet was added", vault);

        vault.lock(data.password);

        console.log("Locked vault", vault);

        vault.save(VAULT_STORAGE_KEY);
        vault.unlock(data.password);
    }

    const createWalletWitMnemonicPayload = (data: TWalletCreatePayload): void => {
        if (!("mnemonicWords" in data)) {
            throw new Error("Wrong data object type for mnemonicWords in TWalletCreatePayload");
        }
                
        let walletData;

        if (data.mnemonicWords.length == 12) {
            walletData = createMnemonic12Wallet(data.name, data.mnemonicWords, data.password);
        } else {
             walletData = createMnemonic24Wallet(data.name, data.mnemonicWords, data.password);
        }

        console.log("Wallet data: ", walletData);

        vault.addWallet(walletData.wallet);
    }

    const createInitialMnemonic = (variant) => {
        return MnemonicService.mnemonicToWordArray(MnemonicService.generateMnemonic( wordsCountToMnemonicStrength(variant)));
    }

    const createInitialPrivateKey = () => {
        return KeysService.generateKeyPair().privateKey;
    }

    const createCreateWalletProps = (mode: "privateKey" | "mnemonic", variant?): IWalletCreateModalProps => {
        return {
            mode,
            variant,
            title: "Create Wallet",
            isInputMode: false,
            onSubmit: mode === "mnemonic" ? createWalletWitMnemonicPayload : createWalletWithPrivateKeyPayload,
            initialMnemonic: mode === "mnemonic" ? createInitialMnemonic(variant) : [],
            initialPrivateKey: mode === "privateKey" ? createInitialPrivateKey() : "",
            onClose: () => {
                setCurrentModalProps(createWalletCreateOptions());
                setCurrentModal(Modals.SELECT_WALLET_CREATE_OPTIONS);
            }
        }
    }

    const createWalletRestoreProps = (mode: "privateKey" | "mnemonic", variant?): IWalletCreateModalProps => {
        return {
            mode,
            variant,
            title: "Create Wallet",
            isInputMode: true,
            onSubmit: mode === "mnemonic" ? createWalletWitMnemonicPayload : createWalletWithPrivateKeyPayload,
            initialMnemonic: [],
            initialPrivateKey: "",
            onClose: () => {
                setCurrentModalProps(createWalletRestoreOptions());
                setCurrentModal(Modals.SELECT_WALLET_CREATE_OPTIONS);
            }
        }
    }

    const createWalletCreateOptions = (): ISelectModalProps => {
        const selectOptions: TSelectModalOption[] = [
            {
                title: "Mnemonic 12",
                onClick: () => {
                    setCurrentModalProps(createCreateWalletProps("mnemonic", 12));
                    setCurrentModal(Modals.CREATE_WALLET_MODAL);
                },
            },
            {
                title: "Mnemonic 24",
                onClick: () => {
                    setCurrentModalProps(createCreateWalletProps("mnemonic", 24));
                    setCurrentModal(Modals.CREATE_WALLET_MODAL);
                },
            },
            {
                title: "Private Key",
                onClick: () => {
                    setCurrentModalProps(createCreateWalletProps("privateKey"));
                    setCurrentModal(Modals.CREATE_WALLET_MODAL);
                },
            },
        ];

        return {
            title: "Select Wallet Source",
            options: selectOptions,
            onClose: () => {
                setCurrentModalProps(createSelectWalletCreateModalProps());
                setCurrentModal(Modals.SELECT_WALLET_SOURCE);
            },
        };
    };

    const createWalletRestoreOptions = (): ISelectModalProps => {
        const selectOptions: TSelectModalOption[] = [
            {
                title: "Mnemonic 12",
                onClick: () => {
                    setCurrentModalProps(createWalletRestoreProps("mnemonic", 12));
                    setCurrentModal(Modals.CREATE_WALLET_MODAL);
                },
            },
            {
                title: "Mnemonic 24",
                onClick: () => {
                    setCurrentModalProps(createWalletRestoreProps("mnemonic", 24));
                    setCurrentModal(Modals.CREATE_WALLET_MODAL);
                },
            },
            {
                title: "Private Key",
                onClick: () => {
                    setCurrentModalProps(createWalletRestoreProps("privateKey"));
                    setCurrentModal(Modals.CREATE_WALLET_MODAL);
                },
            },
        ];

        return {
            title: "Select Wallet Source",
            options: selectOptions,
            onClose: () => {
                setCurrentModalProps(createSelectWalletCreateModalProps());
                setCurrentModal(Modals.SELECT_WALLET_SOURCE);
            },
        };
    };

    const createSelectWalletCreateModalProps = (): ISelectModalProps => {
        const selectOptions: TSelectModalOption[] = [
            {
                title: "Create",
                onClick: () => {
                    setCurrentModal(Modals.SELECT_WALLET_CREATE_OPTIONS);
                    setCurrentModalProps(createWalletCreateOptions());
                },
            },
            {
                title: "Restore",
                onClick: () => {
                    setCurrentModal(Modals.SELECT_WALLET_RESTORE_OPTIONS);
                    setCurrentModalProps(createWalletRestoreOptions());
                },
            },
        ];
        return {
            title: "Select Wallet Source",
            options: selectOptions,
        };
    };

    useEffect(() => {
        
        if (vault.isVaultLocked()) {
            setCurrentModalProps(createUnlockVaultModalProps());
            setCurrentModal(Modals.UNLOCK_VAULT);
            setIsModalOpen(true);

            return;
        }

        if ((vault.isEmpty())) {
            setCurrentModalProps(createSelectWalletCreateModalProps());
            setCurrentModal(Modals.SELECT_WALLET_CREATE_OPTIONS);
            setIsModalOpen(true);

            return;
        }
    }, []);

    const createKeyPairWallet = (name: string, privateKey: string, password: string) => {
        const { publicKey } = KeysService.getKeyPairFromPrivateKey(privateKey);
        
        return {
            privateKey,
            publicKey,
            wallet: Wallet.fromPrivateKey(name, privateKey, password),
        };
    };

    const createMnemonic12Wallet = (name: string, mnemonicArray: string[], password: string) => {
        const mnemonic = MnemonicService.wordArrayToMnemonic(mnemonicArray);
        const masterNode = masterNodeFromMnemonic(mnemonic);

        setCurrentMnemonic(mnemonic);
        setMasterNode(masterNode);

        return deriveNextWallet(masterNode, name, password, 0);
    };

    const createMnemonic24Wallet = (name: string, mnemonicArray: string[], password: string) => {
        const mnemonic = MnemonicService.wordArrayToMnemonic(mnemonicArray);

        const masterNode = masterNodeFromMnemonic(mnemonic);

        setCurrentMnemonic(mnemonic);
        setMasterNode(masterNode);

        return deriveNextWallet(masterNode, name, password, 0);
    };

    const masterNodeFromMnemonic = (mnemonic: string) => {
        const seed = KeyDerivationService.mnemonicToSeed(mnemonic);

        return KeyDerivationService.seedToMasterNode(seed);
    };

    const deriveNextWallet = (masterNode, name, password, lastIndex) => {
        const nextIndex: number = lastIndex++;

        const path: string = KeyDerivationService.buildBip44Path(
            60,
            0,
            0,
            nextIndex
        );

        const privateKey = KeyDerivationService.derivePrivateKey(
            masterNode,
            path
        );

        const { publicKey } = KeysService.getKeyPairFromPrivateKey(privateKey);

        return {
            privateKey,
            publicKey,
            wallet: Wallet.fromPrivateKey(
                name,
                privateKey,
                password,
                masterNodeId,
                nextIndex,
            ),
        };
    };

    return (
        <ApplicationContext.Provider
            value={{
                masterNode,
                setMasterNode,
                currentMnemonic,
                setCurrentMnemonic,
                currentModalProps,
                setCurrentModalProps,
                currentModal,
                setCurrentModal,
                isModalOpen,
                setIsModalOpen,
            }}
        >
            {isUnlocked && <main>
                <WalletsPage vault={vault} chainService={chainService}/>
            </main>}
            {isModalOpen && (
                <div className="modal-wrapper">
                    {ModalsMeta[currentModal].modal(currentModalProps)}
                </div>
            )}
        </ApplicationContext.Provider>
    );
};

export default Application;
