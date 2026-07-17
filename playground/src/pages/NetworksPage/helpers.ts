import type { ApplicationContextValue } from "@components/Application/context";
import type { UseSdkValue } from "../../sdk-react-kit";
import { Modals } from "@components/Application/meta";
import { INetworkModalPayload } from "@components/NetworkModal";
import { INetworkConfig, NetworkName } from "asi-wallet-sdk";

type CreateNetworksPageHandlersParams = {
    sdk: UseSdkValue;
    setModalState: ApplicationContextValue["setModalState"];
    withLoader: ApplicationContextValue["withLoader"];
};

export type NetworksPageHandlers = {
    addNetwork: () => void;
    editNetwork: (name: NetworkName, config: INetworkConfig) => void;
    removeNetwork: (name: NetworkName) => void;
    switchNetwork: (name: NetworkName) => void;
};

export const createNetworksPageHandlers = ({
    sdk,
    setModalState,
    withLoader,
}: CreateNetworksPageHandlersParams): NetworksPageHandlers => {
    const closeModal = () => setModalState({ type: null });

    return {
        addNetwork: () =>
            setModalState({
                type: Modals.NETWORK_MODAL,
                props: {
                    mode: "add",
                    title: "Add network",
                    onSubmit: (payload: INetworkModalPayload) =>
                        withLoader(async () => {
                            try {
                                sdk.addNetwork(payload.name, payload.config);
                                closeModal();
                            } catch (error) {
                                console.error(error);
                                alert(
                                    (error as Error)?.message ??
                                        "Failed to add network",
                                );
                            }
                        }),
                    onClose: closeModal,
                },
            }),

        editNetwork: (name: NetworkName, config: INetworkConfig) =>
            setModalState({
                type: Modals.NETWORK_MODAL,
                props: {
                    mode: "edit",
                    title: `Edit ${name}`,
                    initialName: name,
                    initialConfig: config,
                    onSubmit: (payload: INetworkModalPayload) =>
                        withLoader(async () => {
                            try {
                                sdk.updateNetwork(
                                    payload.name,
                                    payload.config,
                                );
                                closeModal();
                            } catch (error) {
                                console.error(error);
                                alert(
                                    (error as Error)?.message ??
                                        "Failed to update network",
                                );
                            }
                        }),
                    onClose: closeModal,
                },
            }),

        removeNetwork: (name: NetworkName) =>
            withLoader(async () => {
                if (!window.confirm(`Remove network "${name}"?`)) return;

                try {
                    sdk.removeNetwork(name);
                } catch (error) {
                    console.error(error);
                    alert(
                        (error as Error)?.message ?? "Failed to remove network",
                    );
                }
            }),

        switchNetwork: (name: NetworkName) => {
            try {
                sdk.setNetwork(name);
            } catch (error) {
                console.error(error);
                alert((error as Error)?.message ?? "Failed to switch network");
            }
        },
    };
};