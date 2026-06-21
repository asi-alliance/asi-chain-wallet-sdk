import IndexerClient from "@domains/IndexerClient";
import { NetworkName } from "@domains/Network";
import { Transaction } from "@domains/Transaction";

import { GraphqlParser } from "@services/GraphqlParser";

import { Pagination } from "@services/GraphqlParser/queryOptions";

export default class AccountService {
    private readonly indexerClient: IndexerClient;

    constructor(indexerClient: IndexerClient) {
        this.indexerClient = indexerClient;
    }

    public async getTransactionHistory(
        address: string,
        networkName: NetworkName,
        pagination: Pagination = {},
    ): Promise<Transaction[]> {
        try {
            const response = await this.indexerClient.getTransactionHistory(
                address,
                pagination,
            );

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
