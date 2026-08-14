import type { ApplicationContextValue } from "@components/Application/context";
import type { UseSdkValue } from "../../sdk-react-kit";
import { Modals } from "@components/Application/meta";
import { TWalletCreatePayload } from "@components/CreateWalletModal";
import {
    decodeBase16,
    KeysManager,
    MnemonicStrength,
    Wallet,
    WalletTypes,
} from "asi-wallet-sdk";

type CreateWalletPageHandlersParams = {
    sdk: UseSdkValue;
    setModalState: ApplicationContextValue["setModalState"];
    withLoader: ApplicationContextValue["withLoader"];
};

export type WalletPageHandlers = {
    createPk: () => void;
    importPk: () => void;
    createHd: (words: 12 | 24) => void;
    importHd: (words: 12 | 24) => void;
    openWallet: (signerId: string) => void;
    closeWallet: (walletId: string) => void;
    deriveAccount: (walletId: string) => void;
    removeWallet: (walletId: string) => void;
    renameAccount: (walletId: string, accountId: string) => void;
    removeAccount: (walletId: string, accountId: string) => void;
};

const strengthFromWords = (words: 12 | 24): MnemonicStrength =>
    words === 24
        ? MnemonicStrength.TWENTY_FOUR_WORDS
        : MnemonicStrength.TWELVE_WORDS;

export const createWalletPageHandlers = ({
    sdk,
    setModalState,
    withLoader,
}: CreateWalletPageHandlersParams): WalletPageHandlers => {
    const closeModal = () => setModalState({ type: null });

    const submitCreate = (payload: TWalletCreatePayload) =>
        withLoader(async () => {
            try {
                if (payload.mode === "privateKey") {
                    await sdk.createPrivateKeyWallet(
                        {
                            name: payload.name,
                            privateKey: decodeBase16(payload.privateKey),
                        },
                        payload.password,
                    );
                } else {
                    await sdk.createHDWallet(
                        { name: payload.name, mnemonic: payload.mnemonic },
                        payload.password,
                    );
                }

                closeModal();
            } catch (error) {
                console.error(error);
                alert((error as Error)?.message ?? "Failed to create wallet");
            }
        });

    const openCreateWalletModal = (options: {
        mode: "privateKey" | "mnemonic";
        isInputMode: boolean;
        title: string;
        variant?: 12 | 24;
    }) => {
        const { mode, isInputMode, title, variant } = options;

        setModalState({
            type: Modals.CREATE_WALLET_MODAL,
            props: {
                mode,
                isInputMode,
                title,
                variant,
                onSubmit: submitCreate,
                onClose: closeModal,
                initialMnemonic:
                    mode === "mnemonic" && !isInputMode && variant
                        ? sdk.generateMnemonic(strengthFromWords(variant))
                        : undefined,
                initialPrivateKey:
                    mode === "privateKey" && !isInputMode
                        ? KeysManager.convertKeyToHex(sdk.generatePrivateKey())
                        : undefined,
            },
        });
    };

    return {
        createPk: () =>
            openCreateWalletModal({
                mode: "privateKey",
                isInputMode: false,
                title: "Create Private Key wallet",
            }),
        importPk: () =>
            openCreateWalletModal({
                mode: "privateKey",
                isInputMode: true,
                title: "Import Private Key wallet",
            }),
        createHd: (words: 12 | 24) =>
            openCreateWalletModal({
                mode: "mnemonic",
                isInputMode: false,
                title: `Create Mnemonic wallet (${words})`,
                variant: words,
            }),
        importHd: (words: 12 | 24) =>
            openCreateWalletModal({
                mode: "mnemonic",
                isInputMode: true,
                title: `Import Mnemonic wallet (${words})`,
                variant: words,
            }),

        openWallet: (signerId: string) =>
            setModalState({
                type: Modals.PASSWORD_MODAL,
                props: {
                    title: "Enter wallet password to unlock",
                    onSubmit: (password: string) =>
                        withLoader(async () => {
                            try {
                                await sdk.openWallet(signerId, password);
                                closeModal();
                            } catch (error) {
                                console.error(error);
                                alert(
                                    "Failed to unlock wallet. Please check your password.",
                                );
                            }
                        }),
                    onClose: closeModal,
                },
            }),

        closeWallet: (walletId: string) => sdk.closeWallet(walletId),

        deriveAccount: (walletId: string) =>
            setModalState({
                type: Modals.DERIVE_WALLET_MODAL,
                props: {
                    onSubmit: (name: string, password: string) =>
                        withLoader(async () => {
                            try {
                                await sdk.deriveAccount(
                                    walletId,
                                    name,
                                    password,
                                );
                                closeModal();
                            } catch (error) {
                                console.error(error);
                                alert(
                                    (error as Error)?.message ??
                                        "Failed to derive account",
                                );
                            }
                        }),
                    onClose: closeModal,
                },
            }),

        removeWallet: (walletId: string) =>
            withLoader(async () => {
                if (!window.confirm("Remove this wallet?")) return;

                try {
                    await sdk.removeWallet(walletId);
                } catch (error) {
                    console.error(error);
                    alert(
                        (error as Error)?.message ?? "Failed to remove wallet",
                    );
                }
            }),

        renameAccount: (walletId: string, accountId: string) => {
            const name = window.prompt("New account name");

            if (!name) return;

            withLoader(async () => {
                try {
                    await sdk.renameAccount(walletId, accountId, name);
                } catch (error) {
                    console.error(error);
                    alert(
                        (error as Error)?.message ?? "Failed to rename account",
                    );
                }
            });
        },

        removeAccount: (walletId: string, accountId: string) =>
            withLoader(async () => {
                if (!window.confirm("Remove this account?")) return;

                try {
                    const targetWallet: Wallet = sdk.client
                        .getWalletManager()
                        .get(walletId);

                    await sdk.removeAccount(walletId, accountId);

                    if (targetWallet.getType() !== WalletTypes.PRIVATE_KEY) {
                        return;
                    }

                    sdk.removeWallet(walletId);
                } catch (error) {
                    console.error(error);
                    alert(
                        (error as Error)?.message ?? "Failed to remove account",
                    );
                }
            }),
    };
};
