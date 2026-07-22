import ApiClientManager from "@domains/ApiClientManager";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { GraphqlParser } from "@services/GraphqlParser";
import { Transaction } from "@domains/Transaction";
import { NetworkName } from "@domains/Network";

export default class AccountDataService {
    private readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager?: ApiClientManager) {
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
    }

    public async getTransactionHistory(
        address: string,
        networkName?: NetworkName,
        pagination: Pagination = {},
    ): Promise<Transaction[]> {
        try {
            const currentNetwork: NetworkName =
                networkName ?? ApiClientManager.getInstance().getNetwork();

            const response = await this.apiClientManager
                .getIndexerClient()
                .getTransactionHistory(address, pagination);

            return GraphqlParser.mapTransactionHistory(
                response,
                address,
                currentNetwork,
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
