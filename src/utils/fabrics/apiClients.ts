import IndexerClient from "@domains/IndexerClient";
import ObserverClient from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";
import type { IApiClients } from "@domains/ApiClientManager";
import { INetworkConfig } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { DEFAULT_REQUEST_TIMEOUT } from "@config/index";
import { AxiosRequestConfig } from "axios";

const JSON_CONTENT_TYPE_HEADERS = {
    "Content-Type": "application/json",
};

const GRAPHQL_AXIOS_CONFIG: AxiosRequestConfig = {
    headers: JSON_CONTENT_TYPE_HEADERS,
    timeout: DEFAULT_REQUEST_TIMEOUT,
};

const createNodeAxiosConfig = (
    nodeApiProfile: NodeApiProfile,
): AxiosRequestConfig =>
    nodeApiProfile === NodeApiProfile.RUST
        ? { headers: JSON_CONTENT_TYPE_HEADERS, timeout: DEFAULT_REQUEST_TIMEOUT }
        : { timeout: DEFAULT_REQUEST_TIMEOUT };

export const createApiClients = (config: INetworkConfig): IApiClients => {
    const nodeAxiosConfig: AxiosRequestConfig = createNodeAxiosConfig(
        config.nodeApiProfile,
    );

    return {
        validator: new ValidatorClient({
            baseUrl: config.ValidatorURL,
            axiosConfig: nodeAxiosConfig,
        }),

        observer: new ObserverClient({
            baseUrl: config.ReadOnlyURL,
            axiosConfig: nodeAxiosConfig,
        }),

        indexer: new IndexerClient({
            baseUrl: config.IndexerURL,
            axiosConfig: GRAPHQL_AXIOS_CONFIG,
        }),
    };
};