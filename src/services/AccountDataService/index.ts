import ApiClientManager from "@domains/ApiClientManager";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { GraphqlParser } from "@services/GraphqlParser";
import {
    ITransactionsHistoryPage,
    ITransactionsHistoryQuery,
} from "@domains/Transaction";
import { NetworkId } from "@domains/Network";

const createEmptyHistoryPage = (): ITransactionsHistoryPage => ({
    items: [],
    total: 0,
});

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
        historyQuery: ITransactionsHistoryQuery = {},
        networkId?: NetworkId,
    ): Promise<ITransactionsHistoryPage> {
        try {
            const currentNetworkId: NetworkId =
                networkId ?? this.apiClientManager.getCurrentNetworkId();

            const response = await this.api.getTransactionHistory(
                address,
                historyQuery,
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

                return createEmptyHistoryPage();
            }

            console.error("AccountDataService.getTransactionHistory:", error);

            return createEmptyHistoryPage();
        }
    }
}