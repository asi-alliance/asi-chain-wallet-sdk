import ApiClientManager from "@domains/ApiClientManager";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { GraphqlParser } from "@services/GraphqlParser";
import { Transaction } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";

export default class AccountDataService {
    private readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager?: ApiClientManager) {
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
            const currentNetworkId: NetworkId =
                networkId ??
                ApiClientManager.getInstance().getCurrentNetworkId();

            const response = await this.apiClientManager
                .getIndexerClient()
                .getTransactionHistory(address, publicKey, pagination);

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
