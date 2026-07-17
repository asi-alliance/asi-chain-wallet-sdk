import BaseGraphQLClient from "@domains/BaseGraphQLClient";
import { Pagination } from "../../services/GraphqlParser/queryOptions";
import {
    GraphqlParser,
    TransactionHistoryQueryData,
} from "../../services/GraphqlParser";

export default class IndexerClient extends BaseGraphQLClient {
    public async getTransactionHistory(
        address: string,
        publicKey: string,
        pagination: Pagination = {},
    ): Promise<TransactionHistoryQueryData> {
        const { query, variables } =
            GraphqlParser.createTransactionHistoryRequest(address, publicKey, pagination);

        return this.query<TransactionHistoryQueryData>(query, variables);
    }
}
