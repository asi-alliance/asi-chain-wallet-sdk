import { Network } from "asi-wallet-sdk";

export function networkCallbacks(networkSetters) {
    return {
        onCurrentNetworkChanged(newNetwork: Network) {
            networkSetters.setCurrentNetwork(newNetwork);
        },
        onNetworksChanged(networks: Network[]) {
            networkSetters.setNetworks(networks);
        },
    }
}