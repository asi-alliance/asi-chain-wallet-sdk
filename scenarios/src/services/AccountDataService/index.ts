import ApiClientManager from "../../domains/ApiClientManager";
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
        networkName: NetworkName,
        pagination: Pagination = {},
    ): Promise<Transaction[]> {
        try {
            const response = await this.apiClientManager
                .getIndexerClient()
                .getTransactionHistory(address, pagination);

            return GraphqlParser.mapTransactionHistory(
                response,
                address,
                networkName,
            );
        } catch (error) {
            console.error("Failed to fetch transaction history", error);

            return [];
        }
    }
}
