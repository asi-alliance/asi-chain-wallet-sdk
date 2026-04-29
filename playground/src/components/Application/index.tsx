import useLoader from "@hooks/useLoader";
import ModalManager from "./ModalManager";
import ApplicationContext, {
    type ApplicationContextValue,
    type ModalState,
} from "./context";
import {
    useSdk,
    SdkContext,
    type IPasswordSubmitHandler,
    type SdkContextValue,
} from "../../sdk-react-kit";
import FullscreenLoader from "@components/FullScreenLoader";
import { ReactElement, useState } from "react";
import { PersistentPageRoutes } from "@router/index";
import { Networks } from "../../config";
import { Modals } from "./meta";
import Header from "./Header";
import "./style.css";

const VAULT_STORAGE_KEY = "test_vault";

const Application = (): ReactElement => {
    const { isLoading, withLoader } = useLoader();
    const [modalState, setModalState] = useState<ModalState>({ type: null });

    const applicationContextValue = {
        modalState,
        setModalState,
        withLoader,
    } satisfies ApplicationContextValue;

    const openUnlockModal = (unlockVault: IPasswordSubmitHandler) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock Vault",
                onSubmit: (password: string) =>
                    withLoader(async () => {
                        try {
                            await unlockVault(password);
                            setModalState({ type: null });
                        } catch {
                            alert(
                                "Failed to unlock vault. Please check your password and try again.",
                            );
                        }
                    }),
            },
        });
    };

    const openCreatePasswordForVaultModal = (
        createVaultPassword: IPasswordSubmitHandler,
    ) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Create Password for Vault",
                onSubmit: (password: string) =>
                    withLoader(async () => {
                        try {
                            await createVaultPassword(password);
                            setModalState({ type: null });
                        } catch (error) {
                            console.error(error);
                            alert("Failed to create vault password.");
                        }
                    }),
            },
        });
    };

    const sdk = useSdk({
        config: Networks["DevNet"],
        onUnlockRequired: openUnlockModal,
        onVaultPasswordRequired: openCreatePasswordForVaultModal,
        onInitError: (error) => {
            console.error(error);
            alert(
                error instanceof Error
                    ? error.message
                    : "Error during SDK initialization",
            );
        },
    });

    const sdkContextValue = sdk satisfies SdkContextValue;

    return (
        <main>
            <ApplicationContext.Provider value={applicationContextValue}>
                <SdkContext.Provider value={sdkContextValue}>
                    <Header />
                    <PersistentPageRoutes />
                </SdkContext.Provider>

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
