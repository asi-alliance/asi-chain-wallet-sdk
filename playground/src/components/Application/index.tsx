import useLoader from "@hooks/useLoader";
import ModalManager from "./ModalManager";
import ApplicationContext, {
    type ApplicationContextValue,
    type ModalState,
} from "./context";
import SdkContext, { type SdkContextValue } from "./SdkContext";
import useSdk from "./useSdk";
import FullscreenLoader from "@components/FullScreenLoader";
import { ReactElement, useState } from "react";
import { ApplicationNavigation, PersistentPageRoutes } from "@router/index";
import "./style.css";

const Application = (): ReactElement => {
    const { isLoading, withLoader } = useLoader();
    const [modalState, setModalState] = useState<ModalState>({ type: null });
    const sdk = useSdk({
        setModalState,
        withLoader,
    });

    const applicationContextValue = {
        modalState,
        setModalState,
        withLoader,
    } satisfies ApplicationContextValue;

    const sdkContextValue = sdk satisfies SdkContextValue;

    return (
        <main>
            <ApplicationContext.Provider value={applicationContextValue}>
                <SdkContext.Provider value={sdkContextValue}>
                    <ApplicationNavigation />
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
