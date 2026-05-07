import { Network } from "../../../domain/aggregates/Network";

const DEFAULT_NETWORK_NAME = "DevNet"

export const defaults = {
    getCurrentNetwork(networks: Network[]) {
        return (networks.find(network => network.name === DEFAULT_NETWORK_NAME)  ?? (networks.length && networks[0])) || null;
    } 
}