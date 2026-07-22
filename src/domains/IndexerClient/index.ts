import BaseGraphQLClient from "@domains/BaseGraphQLClient";
import { Pagination } from "../../services/GraphqlParser/queryOptions";
import {
    GraphqlParser,
    TransactionHistoryQueryData,
} from "../../services/GraphqlParser";

export default class IndexerClient extends BaseGraphQLClient {
    public async getTransactionHistory(
        address: string,
        pagination: Pagination = {},
    ): Promise<TransactionHistoryQueryData> {
        const { query, variables } =
            GraphqlParser.createTransactionHistoryRequest(address, pagination);

        return this.query<TransactionHistoryQueryData>(query, variables);
    }
}
