import useLoader from "@hooks/useLoader";
import ModalManager from "./ModalManager";
import ApplicationContext, {
    type ApplicationContextValue,
    type ModalState,
} from "./context";
import { useSdk, SdkContext, type SdkContextValue } from "../../sdk-react-kit";
import FullscreenLoader from "@components/FullScreenLoader";
import { ReactElement, useState } from "react";
import { PersistentPageRoutes } from "@router/index";
import Header from "./Header";
import "./style.css";

const Application = (): ReactElement => {
    const { isLoading, withLoader } = useLoader();
    const [modalState, setModalState] = useState<ModalState>({ type: null });

    const applicationContextValue = {
        modalState,
        setModalState,
        withLoader,
    } satisfies ApplicationContextValue;

    const sdk = useSdk();

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
