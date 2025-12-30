import ModalManager from "./ModalManager";
import ApplicationContext from "./context";
import WalletsPage from "@pages/WalletsPage";
import FullscreenLoader from "@components/FullScreenLoader";
import {
    createInitialMnemonic,
    createInitialPrivateKey,
    createMnemonicWallet,
    deriveNextWallet,
    init,
    ModalProps,
    Modals,
} from "./meta";
import { TWalletCreatePayload } from "@components/CreateWalletModal";
import { ReactElement, useEffect, useState } from "react";
import { ChainService, Wallet, Vault } from "asi-wallet-sdk";
import "./style.css";

// 37ab5eb1e20b49ed02a33b3b2bf05eac2696140279e12ede4c3623186300a653
// 1111dp3tKaHa1t1ix4HiFYMv5LXydjcufd4XyLLEAM3C8snWasmds

type ModalState = {
    type: Modals | null;
    props?: ModalProps;
};

const VAULT_STORAGE_KEY = "test_vault";

const configs = import.meta.env.VITE_NETWORKS;
const config = JSON.parse(configs)["DevNet"];

if (!config) {
    throw new Error("Network configuration (env) not found");
}

const Application = (): ReactElement => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [modalState, setModalState] = useState<ModalState>({ type: null });

    const [vault, setVault] = useState<Vault | null>(null);
    const [isVaultConfigured, setIsVaultConfigured] = useState<boolean>(false);
    const [chainService, setChainService] = useState<ChainService | null>(null);

    const [currentPassword, setCurrentPassword] = useState<string>("");

    const updateVault = (vault) => {
        setVault(
            Object.assign(Object.create(Object.getPrototypeOf(vault)), vault)
        );
    };

    const openUnlockModal = () => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock Vault",
                onSubmit: unlockVault,
            },
        });
    };

    const openCreatePasswordForVaultModal = () => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Create Password for Vault",
                onSubmit: createPassword,
            },
        });
    };

    const unlockVault = (password: string) => {
        try {
            setIsLoading(true);

            vault?.unlock(password);
            setCurrentPassword(password);
            updateVault(vault);

            setModalState({ type: null });
        } catch {
            alert(
                "Failed to unlock vault. Please check your password and try again."
            );
        } finally {
            setIsLoading(false);
        }
    };

    const createPassword = (password) => {
        saveVault(password);
        setCurrentPassword(password);
        setIsVaultConfigured(true);
        setModalState({ type: null });
    };

    const addWalletToVault = (wallet: Wallet) => {
        if (!vault) return;

        vault.addWallet(wallet);

        saveVault(currentPassword);
    };

    const saveVault = (password: string) => {
        if (!vault) return;

        console.log("Saving vault with password", password);

        try {
            setIsLoading(true);

            vault.lock(password);
            vault.save(VAULT_STORAGE_KEY);
            vault.unlock(password);

            updateVault(vault);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        console.log(currentPassword)
    }, [currentPassword]);

    const createKeyPairWallet = (payload: TWalletCreatePayload) => {
        if (!vault) return;

        try {
            setIsLoading(true);

            if (payload.mode !== "privateKey") {
                throw new Error(
                    "Invalid payload mode for key pair wallet creation"
                );
            }

            const newWallet = Wallet.fromPrivateKey(
                payload.name,
                payload.privateKey,
                payload.password
            );

            addWalletToVault(newWallet);

            setModalState({ type: null });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateMnemonicWallet = async (
        payload: TWalletCreatePayload
    ) => {
        if (!vault) return;
        setIsLoading(true);

        if (payload.mode !== "mnemonic" || !payload.mnemonicWords) {
            throw new Error("Mnemonic words are required for mnemonic wallet");
        }

        try {
            const { wallet, seedRecord } = await createMnemonicWallet(
                payload.name,
                payload.mnemonicWords,
                payload.password
            );

            seedRecord.lock(currentPassword);
            seedRecord.unlock(currentPassword);

            vault.addWallet(wallet);
            vault.addSeed(seedRecord);

            saveVault(currentPassword);

            setModalState({ type: null });
        } catch (error) {
            console.error("Error creating mnemonic wallet:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeriveWallet = async (index: number) => {
        if (!vault) return;
        setIsLoading(true);

        try {
            const seeds = vault.getSeeds();
            if (seeds.length === 0) {
                throw new Error("No seeds available in the vault");
            }
            const seedRecord = seeds[0];
            seedRecord.unlock(currentPassword);

            const currentSeed = seedRecord.getSeed();

            if (!currentSeed) {
                throw new Error("SeedRecord is empty");
            }

            console.log("Using seed", currentSeed);

            const { wallet } = await deriveNextWallet(
                currentSeed,
                `Derived Wallet ${index}`,
                currentPassword,
                index
            );

            vault.addWallet(wallet);
            vault.addSeed(seedRecord);

            saveVault(currentPassword);
        } catch (error) {
            console.error("Error deriving wallet:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const openCreateKeyPairWalletModal = () => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "privateKey",
                onSubmit: createKeyPairWallet,
                isInputMode: false,
                title: "Create KeyPair Wallet",
                initialPrivateKey: createInitialPrivateKey(),
            },
        });
    };

    const openImportKeyPairWalletModal = () => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "privateKey",
                onSubmit: createKeyPairWallet,
                isInputMode: true,
                title: "Create KeyPair Wallet",
            },
        });
    };

    const openCreateMnemonicWalletModal = (words: 12 | 24) => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "mnemonic",
                onSubmit: handleCreateMnemonicWallet,
                isInputMode: false,
                title: "Create Mnemonic Wallet",
                initialMnemonic:
                    words === 12
                        ? createInitialMnemonic(12)
                        : createInitialMnemonic(24),
                variant: words,
            },
        });
    };

    const openRestoreMnemonicWalletModal = (words: 12 | 24) => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "mnemonic",
                onSubmit: handleCreateMnemonicWallet,
                variant: words,
                isInputMode: true,
                title: "Create Mnemonic Wallet",
            },
        });
    };

    useEffect(() => {
        init(config, setIsLoading, setVault, setChainService);
    }, []);

    useEffect(() => {
        if (vault && vault.isVaultLocked()) {
            setIsVaultConfigured(true);
            openUnlockModal();
            return;
        }

        if (vault && vault.isEmpty() && !isVaultConfigured) {
            openCreatePasswordForVaultModal();
            return;
        }
    }, [vault, isVaultConfigured]);

    return (
        <main>
            <ApplicationContext.Provider value={{ modalState, setModalState }}>
                <WalletsPage
                    vault={vault}
                    createPk={openCreateKeyPairWalletModal}
                    importPk={openImportKeyPairWalletModal}
                    importDk={openRestoreMnemonicWalletModal}
                    createDk={openCreateMnemonicWalletModal}
                    deriveK={handleDeriveWallet}
                    chainService={chainService}
                />

                <ModalManager
                    currentModal={modalState.type}
                    modalProps={modalState.props}
                    onClose={() => setModalState({ type: null })}
                />

                {isLoading && <FullscreenLoader />}
            </ApplicationContext.Provider>
        </main>
    );
};

export default Application;
