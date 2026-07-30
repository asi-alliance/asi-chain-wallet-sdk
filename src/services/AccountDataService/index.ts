import ApiClientManager from "@domains/ApiClientManager";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { GraphqlParser } from "@services/GraphqlParser";
import { Transaction } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";

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

    private get api(): NodeApiAdapter {
        return this.nodeApiProvider.getApi();
    }

    public async getTransactionHistory(
        address: string,
        publicKey: string,
        pagination: Pagination = {},
        networkId?: NetworkId,
    ): Promise<Transaction[]> {
        try {
            const currentNetworkId: NetworkId =
                networkId ?? this.apiClientManager.getCurrentNetworkId();

            const response = await this.api.getTransactionHistory(
                address,
                publicKey,
                pagination,
            );

            return GraphqlParser.mapTransactionHistory(
                response,
                address,
                currentNetworkId,
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
