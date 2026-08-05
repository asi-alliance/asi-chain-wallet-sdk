import { NetworkId } from "asi-wallet-sdk";
import { ReactElement } from "react";
import "./style.css";
import { useSdkContext } from "../../sdk-react-kit";

const NetworkSelector = (): ReactElement => {
    const { networkRecords, currentNetwork, setNetwork, isCurrentNetworkBusy } =
        useSdkContext();

    const handleNetworkChange = (networkId: NetworkId) => {
        try {
            setNetwork(networkId);
        } catch (error) {
            console.error(error);
            alert((error as Error)?.message ?? "Failed to switch network");
        }
    };

    return (
        <div className="network-selector">
            <label className="network-selector-label">Network:</label>
            <div className="network-selector-buttons">
                {networkRecords.map(({ id, name }) => {
                    const isActive = id === currentNetwork?.id;

                    return (
                        <button
                            key={id}
                            className={`network-btn ${isActive ? "active" : ""} ${
                                isCurrentNetworkBusy ? "disabled" : ""
                            }`}
                            onClick={() => handleNetworkChange(id)}
                            disabled={isActive || isCurrentNetworkBusy}
                            title={
                                isCurrentNetworkBusy
                                    ? `${currentNetwork?.name} has an operation in progress`
                                    : `Switch to ${name} network`
                            }
                        >
                            {name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default NetworkSelector;