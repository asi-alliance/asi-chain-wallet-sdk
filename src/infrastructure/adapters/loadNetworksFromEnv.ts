import { Network, NetworkName } from "../../domain/aggregates/Network";

type EnvNetworks = {
    [key: string]: {
        ValidatorURL: string;
        ReadOnlyURL: string;
        IndexerURL: string;
    }
}

function mapEnvToNetworks(envNetworks: EnvNetworks): Network[] {
    const networks: Network[] = [];
    for(const key of Object.keys(envNetworks)) {
        networks.push({
            name: key as NetworkName,
            endpoints: {
                validatorUrl: envNetworks[key].ValidatorURL,
                readOnlyUrl: envNetworks[key].ReadOnlyURL,
                indexerUrl: envNetworks[key].IndexerURL
            }
        });
    }
    return networks;
}

export function loadNetworksFromEnv(): Network[] {
    const NetworksString = import.meta.env.VITE_NETWORKS;
    if (!NetworksString) {
    throw new Error(
        "Application could not be initialized: 'Networks' .env value is not provided"
    );
    }
    const EnvNetworks: EnvNetworks = JSON.parse(NetworksString);
    return mapEnvToNetworks(EnvNetworks);
}