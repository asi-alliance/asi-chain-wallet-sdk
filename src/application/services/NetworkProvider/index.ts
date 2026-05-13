import { Network, NetworkName } from "../../../domain/aggregates/Network";

export class NetworkProvider {
    private _networks: Network[];
    private _currentNetwork!: Network | null;
    constructor(networks: Network[], currentNetworkName: NetworkName | null) {
        this._networks = networks;
        if(currentNetworkName === null) {
            this._currentNetwork = null;
        } else {
            this.setCurrentNetworkByName(currentNetworkName);
        }
    }
    public get currentNetwork(): Network {
        if(!this._currentNetwork) {
            throw new Error;
        }
        return this._currentNetwork;
    }
    /**
     * variant of the {@link currentNetwork} getter with an acceptable null
     */
    public getCurrentNetwork(): Network | null {
        return this._currentNetwork;
    }  
    /**
     * @returns updated network
     */
    public setCurrentNetworkByName(networkName: NetworkName): Network {
        const network = this._networks.find(network => network.name === networkName);
        if(!network) {
            throw new Error(`NetworkProvider: The network with name ${networkName} is not in the current list of networks`)
        }
        this._currentNetwork = network;
        return network;
    }
    public get networks(): readonly Network[] {
        return this._networks;
    }
    public hasNetwork(networkName: NetworkName) {
        return this._networks.some(network => networkName === network.name);
    }
}