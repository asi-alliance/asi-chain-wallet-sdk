import ApiClientManager from "@domains/ApiClientManager";
import NodeApiProvider from "@domains/NodeApiProvider";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { GraphqlParser } from "@services/GraphqlParser";
import { Transaction } from "@domains/Transaction";
import { INetworkContext, NetworkId } from "@domains/Network";

export default class AccountDataService {
    private readonly nodeApiProvider: NodeApiProvider;
    private readonly apiClientManager: ApiClientManager;

    constructor(
        nodeApiProvider?: NodeApiProvider,
        apiClientManager?: ApiClientManager,
    ) {
        this.nodeApiProvider =
            nodeApiProvider ?? NodeApiProvider.getInstance();
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
    }

    private getHistorySource(
        networkId?: NetworkId,
    ): Pick<INetworkContext, "api" | "networkId"> {
        if (networkId === undefined) {
            return {
                api: this.nodeApiProvider.getApi(),
                networkId: this.apiClientManager.getCurrentNetworkId(),
            };
        }

        return this.apiClientManager.createNetworkContext(networkId);
    }

    public async getTransactionHistory(
        address: string,
        publicKey: string,
        pagination: Pagination = {},
        networkId?: NetworkId,
    ): Promise<Transaction[]> {
        try {
            const source: Pick<INetworkContext, "api" | "networkId"> =
                this.getHistorySource(networkId);

            const response = await source.api.getTransactionHistory(
                address,
                publicKey,
                pagination,
            );

            return GraphqlParser.mapTransactionHistory(
                response,
                address,
                source.networkId,
            );
        } catch (error) {
            if (GraphqlParser.isRecoverableNetworkError(error)) {
                console.warn(
                    "[GraphQL] Network error while loading transaction history. Returning an empty history.",
                );

                return [];
            }

            console.error("AccountDataService.getTransactionHistory:", error);

            return [];
        }
    }
}
