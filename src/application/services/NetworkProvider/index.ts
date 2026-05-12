import { Network, NetworkName } from "../../../domain/aggregates/Network";

export class NetworkProvider {
    private networks: Network[];
    private _currentNetwork!: Network | null;
    constructor(networks: Network[], currentNetworkName: NetworkName) {
        this.networks = networks;
        this.setCurrentNetworkByName(currentNetworkName);
    }
    public get currentNetwork(): Network {
        if(!this._currentNetwork) {
            throw new Error;
        }
        return this._currentNetwork;
    }
    /**
     * @returns updated network
     */
    public setCurrentNetworkByName(networkName: NetworkName): Network {
        const network = this.networks.find(network => network.name === networkName);
        if(!network) {
            throw new Error(`NetworkProvider: The network with name ${networkName} is not in the current list of networks`)
        }
        this._currentNetwork = network;
        return network;
    }
}