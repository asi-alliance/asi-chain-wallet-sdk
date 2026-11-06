import ApiClientManager from "@domains/ApiClientManager";
import NodeApiProvider from "@domains/NodeApiProvider";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { GraphqlParser } from "@services/GraphqlParser";
import { Transaction } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";

export default class AccountDataService {
    private readonly apiClientManager: ApiClientManager;

    constructor(
        _nodeApiProvider?: NodeApiProvider,
        apiClientManager?: ApiClientManager,
    ) {
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
    }

    public async getTransactionHistory(
        address: string,
        publicKey: string,
        pagination: Pagination = {},
        networkId?: NetworkId,
    ): Promise<Transaction[]> {
        try {
            const context = this.apiClientManager.createNetworkContext(networkId);

            const response = await context.api.getTransactionHistory(
                address,
                publicKey,
                pagination,
            );

            return GraphqlParser.mapTransactionHistory(
                response,
                address,
                context.networkId,
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
