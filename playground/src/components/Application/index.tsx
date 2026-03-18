import useLoader from "@hooks/useLoader";
import ModalManager from "./ModalManager";
import ApplicationContext from "./context";
import WalletsPage from "@pages/WalletsPage";
import SignerTestPage from "@pages/SignerTestPage";
import FullscreenLoader from "@components/FullScreenLoader";
import { Address, ChainService, EncryptedRecord, MnemonicService, Vault, Wallet } from "asi-wallet-sdk";
import { TWalletCreatePayload } from "@components/CreateWalletModal";
import { ReactElement, useEffect, useState } from "react";
import {
    createInitialPrivateKey,
    createInitialMnemonic,
    createMnemonicWallet,
    deriveNextWallet,
    ModalProps,
    Modals,
    init,
} from "./meta";
import "./style.css";
import { keccak512 } from "js-sha3";

// 37ab5eb1e20b49ed02a33b3b2bf05eac2696140279e12ede4c3623186300a653
// 1111dp3tKaHa1t1ix4HiFYMv5LXydjcufd4XyLLEAM3C8snWasmds

// 67b89a30347d7352a1d2385de7610e9aa1a74ae82f9402dda48f4f70f44b613f
// 1111RpAubAtDCJicMTEXXecYNVNwKtS1saNTmwRzhcg7K6rKx1Zea

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
    const { isLoading, withLoader } = useLoader();
    const [modalState, setModalState] = useState<ModalState>({ type: null });
    const [currentPage, setCurrentPage] = useState<"wallets" | "signer">("wallets");

    const [vault, setVault] = useState<Vault | null>(null);
    const [isVaultConfigured, setIsVaultConfigured] = useState<boolean>(false);
    const [chainService, setChainService] = useState<ChainService | null>(null);

    const [currentPassword, setCurrentPassword] = useState<string>("");

    const updateVault = (vault: Vault) => {
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

    const unlockVault = (password: string) =>
        withLoader(async () => {
            try {
                await vault?.unlock(password);
                setCurrentPassword(password);
                updateVault(vault);

                setModalState({ type: null });
            } catch {
                alert(
                    "Failed to unlock vault. Please check your password and try again."
                );
            }
        });

    const createPassword = (password: string) =>
        withLoader(async () => {
            await saveVault(password);
            setCurrentPassword(password);
            setIsVaultConfigured(true);
            setModalState({ type: null });
        });

    const addWalletToVault = (wallet: Wallet) =>
        withLoader(async () => {
            if (!vault) return;

            vault.addWallet(wallet);

            await saveVault(currentPassword);
        });

    const removeWalletFromVault = (id: string) =>
        withLoader(async () => {
            if (!vault) return;

            vault.removeWallet(id as Address);

            await saveVault(currentPassword);
        });

    const saveVault = async (password: string) => {
        if (!vault) return;

        try {
            console.time("lock");
            await vault.lock(password);
            console.timeEnd("lock");

            console.time("save");
            vault.save(VAULT_STORAGE_KEY);
            console.timeEnd("save");

            console.time("unlock");
            await vault.unlock(password);
            console.time("unlock");

            updateVault(vault);
        } catch (error) {
            console.log(error);
        }
    };

    const createKeyPairWallet = async (payload: TWalletCreatePayload) => {
        if (!vault) return;

        try {
            if (payload.mode !== "privateKey") {
                throw new Error(
                    "Invalid payload mode for key pair wallet creation"
                );
            }

            const newWallet = await Wallet.fromPrivateKey(
                payload.name,
                payload.privateKey,
                payload.password
            );

            addWalletToVault(newWallet);

            setModalState({ type: null });
        } catch (error) {
            console.error(error);
        }
    };

    const handleCreateMnemonicWallet = (payload: TWalletCreatePayload) =>
        withLoader(async () => {
            if (!vault) return;

            if (payload.mode !== "mnemonic" || !payload.mnemonicWords) {
                throw new Error(
                    "Mnemonic words are required for mnemonic wallet"
                );
            }

            try {
                const mnemonic = MnemonicService.wordArrayToMnemonic(payload.mnemonicWords);
                const encryptedSeed = await EncryptedRecord.createAndEncrypt(mnemonic, currentPassword);

                const { wallet, seedId } = await createMnemonicWallet(
                    payload.name,
                    mnemonic,
                    payload.password
                );

                vault.addWallet(wallet);
                vault.addSeed(seedId, encryptedSeed);

                await saveVault(currentPassword);

                setModalState({ type: null });
            } catch (error) {
                console.error("Error creating mnemonic wallet:", error);
            }
        });

    const handleDeriveWallet = (
        name: string,
        password: string,
        index: number
    ) =>
        withLoader(async () => {
            if (!vault) return;

            try {
                const seeds = vault.getSeeds();

                if (seeds.length === 0) {
                    throw new Error("No seeds available in the vault");
                }

                const seedRecord = seeds[0];

                const currentSeed = await seedRecord.decrypt(currentPassword);

                if (!currentSeed) {
                    throw new Error("SeedRecord is empty");
                }

                console.log("Using seed", currentSeed);

                const seedId =  keccak512(currentSeed);

                const { wallet } = await deriveNextWallet(
                    seedId,
                    currentSeed,
                    name,
                    password,
                    index
                );

                vault.addWallet(wallet);
                // vault.addSeed(seedId, seedRecord);

                await saveVault(currentPassword);
                setModalState({ type: null });
            } catch (error) {
                console.error("Error deriving wallet:", error);
            }
        });

    const openDeriveWalletModal = (index: number) => {
        setModalState({
            type: Modals.DERIVE_WALLET_MODAL,
            props: {
                index,
                onSubmit: handleDeriveWallet,
                onClose: () => setModalState({ type: null }),
            },
        });
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
                onClose: () => setModalState({ type: null }),
            },
        });
    };

    const openImportKeyPairWalletModal = () => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "privateKey",
                onSubmit: createKeyPairWallet,
                onClose: () => setModalState({ type: null }),
                isInputMode: true,
                title: "Restore KeyPair Wallet",
            },
        });
    };

    const openCreateMnemonicWalletModal = (words: 12 | 24) => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "mnemonic",
                onSubmit: handleCreateMnemonicWallet,
                onClose: () => setModalState({ type: null }),
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
                onClose: () => setModalState({ type: null }),
                variant: words,
                isInputMode: true,
                title: "Restore Mnemonic Wallet",
            },
        });
    };

    useEffect(() => {
        withLoader(() => init(config, setVault, setChainService));
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
            <ApplicationContext.Provider
                value={{ modalState, setModalState, withLoader }}
            >
                <nav className="app-navigation">
                    <button
                        className={`nav-button ${currentPage === "wallets" ? "active" : ""}`}
                        onClick={() => setCurrentPage("wallets")}
                    >
                        Wallets
                    </button>
                    <button
                        className={`nav-button ${currentPage === "signer" ? "active" : ""}`}
                        onClick={() => setCurrentPage("signer")}
                    >
                        Signer Test
                    </button>
                </nav>

                {currentPage === "wallets" && vault && (
                    <WalletsPage
                        vault={vault}
                        removeWallet={removeWalletFromVault}
                        createPk={openCreateKeyPairWalletModal}
                        importPk={openImportKeyPairWalletModal}
                        importDk={openRestoreMnemonicWalletModal}
                        createDk={openCreateMnemonicWalletModal}
                        deriveK={openDeriveWalletModal}
                        chainService={chainService}
                    />
                )}

                {currentPage === "signer" && vault && (
                    <SignerTestPage vault={vault} />
                )}

                <ModalManager
                    currentModal={modalState.type}
                    modalProps={modalState.props}
                />

                {isLoading && <FullscreenLoader />}
            </ApplicationContext.Provider>
        </main>
    );
};

export default Application;
