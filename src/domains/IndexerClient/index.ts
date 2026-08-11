import BaseGraphQLClient from "@domains/BaseGraphQLClient";
import { ITransactionsHistoryQuery } from "@domains/Transaction";
import {
    GraphqlParser,
    ITransactionHistoryRequest,
    TransactionHistoryQueryData,
} from "../../services/GraphqlParser";

export default class IndexerClient extends BaseGraphQLClient {
    public async getTransactionHistory(
        address: string,
        historyQuery: ITransactionsHistoryQuery = {},
    ): Promise<TransactionHistoryQueryData> {
        const { query, variables }: ITransactionHistoryRequest =
            GraphqlParser.createTransactionHistoryRequest(address, historyQuery);

        return this.query<TransactionHistoryQueryData>(query, variables);
    }
}