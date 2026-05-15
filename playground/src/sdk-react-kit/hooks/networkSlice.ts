import { useCallback, useMemo, useState } from "react";
import { Client, Network, NetworkName } from "asi-wallet-sdk";


export type NetworkSlice = {
    networkSetters: {
        setCurrentNetwork: React.Dispatch<any>;
        setNetworks: React.Dispatch<any>;
    }
    currentNetwork: Network;
    setNetwork(networkName: NetworkName): Promise<Network>;
    networks: Network[];
}

export const networkSlice = (sdkClient: Client): NetworkSlice => {
    const [currentNetwork, setCurrentNetwork] = useState<Network>(null);
    const [networks, setNetworks] = useState<Network[]>(null);

    const setNetwork = useCallback(async (networkName: NetworkName) => {
        const newNetwork = await sdkClient?.setNetworkByName(networkName);
        return newNetwork;
    }, [sdkClient]);

    const networkSliceValue: NetworkSlice = useMemo(() => ({
        networkSetters: {
            setCurrentNetwork,
            setNetworks,
        },
        currentNetwork,
        setNetwork,
        networks,
    }), [currentNetwork, setNetwork, networks]); 

    return networkSliceValue;
}