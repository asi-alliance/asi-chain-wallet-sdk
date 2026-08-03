import IndexerClient from "@domains/IndexerClient";
import ObserverClient from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";
import type { IApiClients } from "@domains/ApiClientManager";
import { INetworkConfig } from "@domains/Network";
import { AxiosRequestConfig } from "axios";

const DEFAULT_AXIOS_CONFIG: AxiosRequestConfig = {
    headers: {
        "Content-Type": "application/json",
    },
};

export const createApiClients = (config: INetworkConfig): IApiClients => ({
    validator: new ValidatorClient({
        baseUrl: config.ValidatorURL,
        axiosConfig: DEFAULT_AXIOS_CONFIG,
    }),

    observer: new ObserverClient({
        baseUrl: config.ReadOnlyURL,
        axiosConfig: DEFAULT_AXIOS_CONFIG,
    }),

    indexer: new IndexerClient({
        baseUrl: config.IndexerURL,
        axiosConfig: DEFAULT_AXIOS_CONFIG,
    }),
});