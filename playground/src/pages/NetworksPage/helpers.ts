import type { ApplicationContextValue } from "@components/Application/context";
import type { UseSdkValue } from "../../sdk-react-kit";
import { Modals } from "@components/Application/meta";
import { INetworkModalPayload } from "@components/NetworkModal";
import { INetworkRecord, NetworkId } from "asi-wallet-sdk";

type CreateNetworksPageHandlersParams = {
    sdk: UseSdkValue;
    setModalState: ApplicationContextValue["setModalState"];
    withLoader: ApplicationContextValue["withLoader"];
};

export type NetworksPageHandlers = {
    addNetwork: () => void;
    editNetwork: (network: INetworkRecord) => void;
    removeNetwork: (network: INetworkRecord) => void;
    switchNetwork: (networkId: NetworkId) => void;
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
                                await sdk.addNetwork(
                                    payload.name,
                                    payload.config,
                                );
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

        editNetwork: (network: INetworkRecord) =>
            setModalState({
                type: Modals.NETWORK_MODAL,
                props: {
                    mode: "edit",
                    title: `Edit ${network.name}`,
                    initialName: network.name,
                    initialConfig: network.config,
                    onSubmit: (payload: INetworkModalPayload) =>
                        withLoader(async () => {
                            try {
                                await sdk.updateNetwork(network.id, {
                                    name: payload.name,
                                    config: payload.config,
                                });
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

        removeNetwork: (network: INetworkRecord) =>
            withLoader(async () => {
                if (!window.confirm(`Remove network "${network.name}"?`)) return;

                try {
                    await sdk.removeNetwork(network.id);
                } catch (error) {
                    console.error(error);
                    alert(
                        (error as Error)?.message ?? "Failed to remove network",
                    );
                }
            }),

        switchNetwork: (networkId: NetworkId) => {
            try {
                sdk.setNetwork(networkId);
            } catch (error) {
                console.error(error);
                alert((error as Error)?.message ?? "Failed to switch network");
            }
        },
    };
};