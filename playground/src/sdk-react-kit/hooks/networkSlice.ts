import { useCallback, useEffect, useMemo, useState } from "react";
import { Client, Network, NetworkName } from "asi-wallet-sdk";


export type UseNetworkValue = {
    currentNetwork: Network;
    setNetwork(networkName: NetworkName): Network;
    networks: Network[];
}

export const networkSlice = (sdkClient: Client): UseNetworkValue => {
    const [currentNetwork, setCurrentNetwork] = useState<Network>(null);
    const [networks, setNetworks] = useState<Network[]>(null);

    const setNetwork = useCallback((networkName: NetworkName) => {
        const newNetwork = sdkClient?.setNetworkByName(networkName);
        return newNetwork;
    }, [sdkClient]);

    const useNetworkValue: UseNetworkValue = useMemo(() => ({
        currentNetwork,
        setNetwork,
        networks,
    }), [currentNetwork, setNetwork, networks]); 

    useEffect(() => {
        if (sdkClient) {
            sdkClient.uiEventDispatcher.onCurrentNetworkChanged = (newNetwork: Network) => {
                console.log("onCurrentNetworkChanged: newNetwork=", newNetwork);
                setCurrentNetwork(newNetwork);
            }
            sdkClient.uiEventDispatcher.onNetworksChanged = (networks: Network[]) => {
                setNetworks(networks);
            }
            return () => {
                sdkClient.uiEventDispatcher.onCurrentNetworkChanged = null;
                sdkClient.uiEventDispatcher.onNetworksChanged = null;
            }
        }
    }, [sdkClient]);

    return useNetworkValue;
}