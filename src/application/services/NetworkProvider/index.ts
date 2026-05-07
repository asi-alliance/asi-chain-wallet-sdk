import { Network } from "../../../domain/aggregates/Network";
import { defaults } from "./defaults";

export class NetworkProvider {
    private networks: Network[];
    private _currentNetwork: Network | null;
    constructor(networks: Network[], currentNetwork?: Network) {
        this.networks = networks;
        this._currentNetwork = currentNetwork ?? defaults.getCurrentNetwork(networks);
    }
    public get currentNetwork(): Network {
        if(!this._currentNetwork) {
            throw new Error;
        }
        return this._currentNetwork;
    }
}