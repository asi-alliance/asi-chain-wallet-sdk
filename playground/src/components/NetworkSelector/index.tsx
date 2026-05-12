import { NetworkName } from "asi-wallet-sdk";
import { ReactElement, useCallback } from "react";
import "./style.css";
import { useSdkContext } from "../../sdk-react-kit";

const NetworkSelector = (): ReactElement => {
    const {network} = useSdkContext();
    console.log("NetworkSelector: network=", network);
    
    const handleNetworkChange = (networkName: NetworkName) => {
        network.setNetwork(networkName);
    };

    const buttonClass = (networkName: NetworkName) =>
        `network-btn ${networkName === network.currentNetwork.name ? "active" : ""}`;

    const networkList = useCallback(() => {
        if(!network.networks) {
            return `network.networks=${String(network.networks)}`
        }
        return (
            <>
                {network.networks.map((networkItem) => (
                    <button
                        key={networkItem.name}
                        className={buttonClass(networkItem.name)}
                        onClick={() => handleNetworkChange(networkItem.name)}
                        disabled={networkItem.name === network.currentNetwork.name}
                        title={`Switch to ${network} network`
                        }
                    >
                        {networkItem.name}
                    </button>
                ))}
            </>
        )
    }, [network, handleNetworkChange]);

    return (
        <div className="network-selector">
            <label className="network-selector-label">Network:</label>
            <div className="network-selector-buttons">
                {networkList()}
            </div>
        </div>
    );
};

export default NetworkSelector;
