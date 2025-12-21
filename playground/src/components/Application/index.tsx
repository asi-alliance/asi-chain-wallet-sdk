import {
    Wallet,
    Vault,
    MnemonicService,
    KeyDerivationService,
    KeysService,
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

const VAULT_STORAGE_KEY = "test_vault";

const encryptedVaultData = Vault.getVaultDataFromStorage(VAULT_STORAGE_KEY);

const vault = new Vault(encryptedVaultData);

const Application = (): ReactElement => {
    const [currentModal, setCurrentModal] = useState<Modals>();
    const [currentModalProps, setCurrentModalProps] = useState<ModalProps>();
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    const [masterNode, setMasterNode] = useState<BIP32Interface>();
    const [currentMnemonic, setCurrentMnemonic] = useState<string>();
    const [currentPassword, setCurrentPassword] = useState<string>();

    const unlockVault = (password) => {
        try {
            vault.unlock(password);
            setIsModalOpen(false);
            alert(vault.isVaultLocked());
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

    const createWalletWithPayload = (data: TWalletCreatePayload): void => {
        
    }

    const createCreateWalletProps = (mode: "privateKey" | "mnemonic", variant?): IWalletCreateModalProps => {
        return {
            mode,
            variant,
            title: "Create Wallet",
            isInputMode: false,
            onSubmit: createWalletWithPayload,
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
            onSubmit: createWalletWithPayload,
            onClose: () => {
                setCurrentModalProps(createWalletCreateOptions());
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

    const createKeyPairWallet = (name: string, password: string) => {
        const { privateKey, publicKey } = KeysService.generateKeyPair();

        return {
            privateKey,
            publicKey,
            wallet: Wallet.fromPrivateKey(name, privateKey, password, null),
        };
    };

    const createMnemonic12Wallet = (name: string, password: string) => {
        const mnemonic = MnemonicService.generateMnemonic(
            MnemonicStrength.TWELVE_WORDS
        );
        const masterNode = masterNodeFromMnemonic(mnemonic);

        setCurrentMnemonic(mnemonic);
        setMasterNode(masterNode);

        return deriveNextWallet(masterNode, name, password, 0);
    };

    const createMnemonic24Wallet = (name: string, password: string) => {
        const mnemonic = MnemonicService.generateMnemonic(
            MnemonicStrength.TWENTY_FOUR_WORDS
        );
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
                nextIndex
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
            <h1>Playground</h1>
            <main>
                <WalletsPage />
            </main>
            {isModalOpen && (
                <div className="modal-wrapper">
                    {ModalsMeta[currentModal].modal(currentModalProps)}
                </div>
            )}
        </ApplicationContext.Provider>
    );
};

export default Application;
