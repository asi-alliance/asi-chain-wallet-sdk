import { NetworkType } from "asi-wallet-sdk";
import { ReactElement } from "react";
import "./style.css";

export interface NetworkSelectorProps {
    currentNetwork: NetworkType;
    onNetworkChange: (network: NetworkType) => void;
    isLoading?: boolean;
}

const networks: NetworkType[] = Object.values(NetworkType);

const NetworkSelector = ({
    currentNetwork,
    onNetworkChange,
    isLoading,
}: NetworkSelectorProps): ReactElement => {
    const handleNetworkChange = (network: NetworkType) => {
        if (network !== currentNetwork && !isLoading) {
            onNetworkChange(network);
        }
    };

    const buttonClass = (network: NetworkType) =>
        `network-btn ${currentNetwork === network ? "active" : ""} ${isLoading ? "disabled" : ""}`;

    return (
        <div className="network-selector">
            <label className="network-selector-label">Network:</label>
            <div className="network-selector-buttons">
                {networks.map((network) => (
                    <button
                        key={network}
                        className={buttonClass(network)}
                        onClick={() => handleNetworkChange(network)}
                        disabled={isLoading || currentNetwork === network}
                        title={
                            isLoading
                                ? "Loading..."
                                : `Switch to ${network} network`
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
