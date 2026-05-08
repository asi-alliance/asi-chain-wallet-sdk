import { NetworkName } from "asi-wallet-sdk";
import { ReactElement } from "react";
import "./style.css";

export interface NetworkSelectorProps {
    currentNetwork: NetworkName;
    onNetworkChange: (network: NetworkName) => void;
}

const NetworkSelector = ({
    currentNetwork,
    onNetworkChange,
}: NetworkSelectorProps): ReactElement => {
    const networks: NetworkName[] = ["Dev"]; //INFO/TODO: get actual network array from NetworkProvider via useSdk hook

    const handleNetworkChange = (network: NetworkName) => {
        if (network !== currentNetwork) {
            onNetworkChange(network);
        }
    };

    const buttonClass = (network: NetworkName) =>
        `network-btn ${currentNetwork === network ? "active" : ""}`;

    return (
        <div className="network-selector">
            <label className="network-selector-label">Network:</label>
            <div className="network-selector-buttons">
                {networks.map((network) => (
                    <button
                        key={network}
                        className={buttonClass(network)}
                        onClick={() => handleNetworkChange(network)}
                        disabled={currentNetwork === network}
                        title={`Switch to ${network} network`
                        }
                    >
                        {network}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default NetworkSelector;
