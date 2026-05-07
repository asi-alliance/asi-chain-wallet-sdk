import { TWalletCreatePayload } from "@components/CreateWalletModal";
import type { ApplicationContextValue } from "@components/Application/context";
import type { SdkContextValue } from "../../sdk-react-kit/SdkContext";
import {
    createInitialMnemonic,
    createInitialPrivateKey,
    createMnemonicWallet,
    deriveNextWallet,
    Modals,
} from "@components/Application/meta";
import {
    Address,
    // EncryptedRecord,
    // MnemonicService,
    IVault,
    Wallet,
    Client,
} from "asi-wallet-sdk";
import { keccak512 } from "js-sha3";

type CreateWalletPageHandlersParams = {
    sdkClient: Client;
    saveVault: (password: string) => Promise<void>;
    currentPassword: string;
    setModalState: ApplicationContextValue["setModalState"];
    withLoader: ApplicationContextValue["withLoader"];
};

type WalletPageHandlers = {
    removeWallet: (id: Address) => void;
    importPk: () => void;
    importDk: (words: 12 | 24) => void;
    createPk: () => void;
    createDk: (words: 12 | 24) => void;
    deriveK: (index: number) => void;
};

const openCreateSeedModal = (
    setModalState: ApplicationContextValue["setModalState"],
    action: (password: string, words: 12 | 24) => void,
    words: 12 | 24,
) => {
    setModalState({
        type: Modals.PASSWORD_MODAL,
        props: {
            title: "Create Password for Seed",
            onSubmit: (password: string) => action(password, words),
        },
    });
};

const addWalletToVault = async (
    vault: IVault,
    wallet: Wallet,
    currentPassword: string,
    saveVault: (password: string) => Promise<void>,
) => {
    
    vault.addWallet(wallet);
console.log("addWalletToVault: vault=", vault, "wallet=", wallet, "currentPassword=", currentPassword);
    await saveVault(currentPassword);
};

const createInitialPrivateKeyInputValue = () => {
    // return Array.from(createInitialPrivateKey()).join(",");
}

const createWalletPageHandlers = ({
    sdkClient,
    saveVault,
    currentPassword,
    setModalState,
    withLoader,
}: CreateWalletPageHandlersParams): WalletPageHandlers => {
    // const { vault, currentPassword, saveVault } = sdk;

    const removeWallet = (id: Address) =>
        withLoader(async () => {
            if (!sdkClient.vault) return;

            sdkClient.vault.removeWallet(id);

            await saveVault(currentPassword);
        });

    const createKeyPairWallet = async (payload: TWalletCreatePayload) => {
        try {
            if (payload.mode !== "privateKey") {
                throw new Error(
                    "Invalid payload mode for key pair wallet creation",
                );
            }

            const newWallet = await Wallet.fromPrivateKey(
                payload.name,
                payload.privateKey,
                payload.password,
            );
            console.log("newWallet=", newWallet);

            await addWalletToVault(
                sdkClient.vault,
                newWallet,
                currentPassword,
                saveVault,
            );

            setModalState({ type: null });
        } catch (error) {
            console.error(error);
        }
    };

    const handleCreateMnemonicWallet = (payload: TWalletCreatePayload) =>
        withLoader(async () => {
            if (!sdkClient.vault) return;

            if (payload.mode !== "mnemonic" || !payload.mnemonicWords) {
                throw new Error(
                    "Mnemonic words are required for mnemonic wallet",
                );
            }

            try {
                // const mnemonic = MnemonicService.wordArrayToMnemonic(
                //     payload.mnemonicWords,
                // );
                // const encryptedSeed = await EncryptedRecord.createAndEncrypt(
                //     mnemonic,
                //     payload.seedPassword,
                // );

                // const { wallet, seedId } = await createMnemonicWallet(
                //     payload.name,
                //     mnemonic,
                //     payload.password,
                // );

                // sdkClient.vault.addWallet(wallet);
                // sdkClient.vault.addSeed(seedId, encryptedSeed);

                await saveVault(currentPassword);

                setModalState({ type: null });
            } catch (error) {
                throw new Error(
                    "Failed to create wallet from recovery phrase",
                );
            }
        });

    const handleDeriveWallet = (
        name: string,
        password: string,
        index: number,
        seed: string,
    ) =>
        withLoader(async () => {
            if (!sdkClient.vault) return;

            try {
                const seedId = keccak512(seed);

                // const { wallet } = await deriveNextWallet(
                //     seedId,
                //     seed,
                //     name,
                //     password,
                //     index,
                // );

                // sdkClient.vault.addWallet(wallet);

                await saveVault(currentPassword);
                setModalState({ type: null });
            } catch (error) {
                console.error("Error deriving wallet:", error);
            }
        });

    const openDeriveWalletModal = (index: number, seed: string) => {
        setModalState({
            type: Modals.DERIVE_WALLET_MODAL,
            props: {
                index,
                onSubmit: (name, password, idx) =>
                    handleDeriveWallet(name, password, idx, seed),
                onClose: () => setModalState({ type: null }),
            },
        });
    };

    const openSeedPasswordForDerive = (index: number) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Enter Seed Password",
                onSubmit: async (password: string) => {
                    try {
                        const seeds = sdkClient.vault!.getSeeds();
                        if (seeds.length === 0) {
                            throw new Error("No seeds available in the vault");
                        }
                        const seedRecord = seeds[0];
                        const decryptedSeed =
                            await seedRecord.decrypt(password);
                        if (!decryptedSeed) {
                            throw new Error("Failed to decrypt seed");
                        }
                        openDeriveWalletModal(index, decryptedSeed);
                    } catch (error) {
                        alert(
                            "Failed to decrypt seed. Please check your password.",
                        );
                    }
                },
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
                // initialPrivateKey: createInitialPrivateKeyInputValue(),
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

    const openCreateMnemonicWalletModal = (
        password: string,
        words: 12 | 24,
    ) => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "mnemonic",
                onSubmit: (payload) =>
                    handleCreateMnemonicWallet({
                        ...payload,
                        seedPassword: password,
                    }),
                onClose: () => setModalState({ type: null }),
                isInputMode: false,
                title: "Create Mnemonic Wallet",
                // initialMnemonic:
                //     words === 12
                //         ? createInitialMnemonic(12)
                //         : createInitialMnemonic(24),
                variant: words,
            },
        });
    };

    const openRestoreMnemonicWalletModal = (
        password: string,
        words: 12 | 24,
    ) => {
        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode: "mnemonic",
                onSubmit: (payload) =>
                    handleCreateMnemonicWallet({
                        ...payload,
                        seedPassword: password,
                    }),
                onClose: () => setModalState({ type: null }),
                variant: words,
                isInputMode: true,
                title: "Restore Mnemonic Wallet",
            },
        });
    };

    return {
        removeWallet,
        createPk: openCreateKeyPairWalletModal,
        importPk: openImportKeyPairWalletModal,
        importDk: (words) =>
            openCreateSeedModal(
                setModalState,
                openRestoreMnemonicWalletModal,
                words,
            ),
        createDk: (words) =>
            openCreateSeedModal(
                setModalState,
                openCreateMnemonicWalletModal,
                words,
            ),
        deriveK: openSeedPasswordForDerive,
    };
};

export { createWalletPageHandlers };
