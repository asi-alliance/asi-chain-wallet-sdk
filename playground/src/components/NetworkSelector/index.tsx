import { NetworkName } from "asi-wallet-sdk";
import { ReactElement } from "react";
import "./style.css";
import { useSdkContext } from "../../sdk-react-kit";

const NetworkSelector = (): ReactElement => {
    const { networks, currentNetwork, setNetwork } = useSdkContext();

    const handleNetworkChange = (networkName: NetworkName) => {
        try {
            setNetwork(networkName);
        } catch (error) {
            console.error(error);
            alert((error as Error)?.message ?? "Failed to switch network");
        }
    };

    return (
        <div className="network-selector">
            <label className="network-selector-label">Network:</label>
            <div className="network-selector-buttons">
                {networks.map((networkName) => (
                    <button
                        key={networkName}
                        className={`network-btn ${
                            networkName === currentNetwork ? "active" : ""
                        }`}
                        onClick={() => handleNetworkChange(networkName)}
                        disabled={networkName === currentNetwork}
                        title={`Switch to ${networkName} network`}
                    >
                        {networkName}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default NetworkSelector;
