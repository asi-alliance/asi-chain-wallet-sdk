import { Network } from "asi-wallet-sdk";

export function networkCallbacks(networkSetters) {
    return {
        onCurrentNetworkChanged(newNetwork: Network) {
            console.log("onCurrentNetworkChanged: newNetwork=", newNetwork);
            networkSetters.setCurrentNetwork(newNetwork);
        },
        onNetworksChanged(networks: Network[]) {
            networkSetters.setNetworks(networks);
        },
    }
}