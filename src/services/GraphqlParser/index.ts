import { NetworkId } from "@domains/Network";
import {
    DEFAULT_HISTORY_LIMIT,
    DEFAULT_HISTORY_ORDER,
    Order,
} from "./queryOptions";
import {
    ITransactionsHistoryFilters,
    ITransactionsHistoryPage,
    ITransactionsHistoryQuery,
    TransactionType,
    TTransactionStatusFilter,
} from "@domains/Transaction";
import { mapRawTransactionToTransaction } from "./mapper";

interface GraphqlEnvelope<TData> {
    data?: TData;
    errors?: unknown[];
}

export type RawTransactionType = "transfer" | "not_transfer";

export type RawTransactionStatus = "success" | "failed";

export interface RawTransaction {
    deploy_id: string;
    block_hash: string;
    block_number: number | string;
    timestamp: number | string;
    type: RawTransactionType;
    deployer_address: string;
    from_address: string | null;
    to_address: string | null;
    from_public_key: string | null;
    amount_asi: number | string | null;
    status: RawTransactionStatus | null;
}

export interface TransactionHistoryQueryData {
    transaction_history_view: RawTransaction[];
    transaction_history_view_aggregate: {
        aggregate: { count: number } | null;
    };
}

export interface ITransactionHistoryRequest {
    query: string;
    variables: Record<string, number | string>;
}

const TIMESTAMP_SCALAR: string = "bigint";

const RAW_TRANSACTION_TYPES: Record<TransactionType, RawTransactionType> = {
    send: "transfer",
    receive: "transfer",
    deploy: "not_transfer",
};

const RAW_TRANSACTION_STATUSES: Record<
    TTransactionStatusFilter,
    RawTransactionStatus
> = {
    completed: "success",
    failed: "failed",
};

const ACCOUNT_CONDITIONS: Record<TransactionType, string> = {
    send: "{ from_address: { _eq: $address } }",
    receive: "{ to_address: { _eq: $address } }",
    deploy: "{ deployer_address: { _eq: $address } }",
};

const STATUS_CONDITIONS: Record<TTransactionStatusFilter, string> = {
    completed:
        "{ _or: [{ status: { _eq: $status } } { status: { _is_null: true } }] }",
    failed: "{ status: { _eq: $status } }",
};

const ANY_ACCOUNT_ROLE_CONDITION: string = `{
      _or: [
        { deployer_address: { _eq: $address } }
        { from_address: { _eq: $address } }
        { to_address: { _eq: $address } }
      ]
    }`;

const TRANSACTION_HISTORY_FIELDS: string = `
    deploy_id
    block_hash
    block_number
    timestamp
    type
    deployer_address
    from_address
    to_address
    from_public_key
    amount_asi
    status`;

const buildTransactionHistoryQuery = (
    declarations: string[],
    conditions: string[],
    order: Order,
): string => {
    const where: string = `where: { _and: [${conditions.join(" ")}] }`;

    return `
query GetTransactionHistory(${declarations.join(", ")}) {
  transaction_history_view(
    ${where}
    order_by: { timestamp: ${order} }
    limit: $limit
    offset: $offset
  ) {${TRANSACTION_HISTORY_FIELDS}
  }

  transaction_history_view_aggregate(${where}) {
    aggregate {
      count
    }
  }
}
`;
};

/**
 * Access to indexer GraphQL API.
 */
export class GraphqlParser {
    public static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
    }

    public static createTransactionHistoryRequest(
        address: string,
        query: ITransactionsHistoryQuery = {},
    ): ITransactionHistoryRequest {
        const {
            pagination = {},
            order = DEFAULT_HISTORY_ORDER,
            filters = {},
        }: ITransactionsHistoryQuery = query;

        const { type, status, period }: ITransactionsHistoryFilters = filters;

        const variables: Record<string, number | string> = {
            address: address.trim(),
            limit: pagination.limit ?? DEFAULT_HISTORY_LIMIT,
            offset: pagination.offset ?? 0,
        };

        const declarations: string[] = [
            "$address: String!",
            "$limit: Int!",
            "$offset: Int!",
        ];

        const conditions: string[] = [
            type ? ACCOUNT_CONDITIONS[type] : ANY_ACCOUNT_ROLE_CONDITION,
        ];

        if (type) {
            declarations.push("$type: String!");
            conditions.push("{ type: { _eq: $type } }");

            variables.type = RAW_TRANSACTION_TYPES[type];
        }

        if (status) {
            declarations.push("$status: String!");
            conditions.push(STATUS_CONDITIONS[status]);

            variables.status = RAW_TRANSACTION_STATUSES[status];
        }

        if (period?.from) {
            declarations.push(`$fromTimestamp: ${TIMESTAMP_SCALAR}!`);
            conditions.push("{ timestamp: { _gte: $fromTimestamp } }");

            variables.fromTimestamp = period.from.getTime();
        }

        if (period?.to) {
            declarations.push(`$toTimestamp: ${TIMESTAMP_SCALAR}!`);
            conditions.push("{ timestamp: { _lte: $toTimestamp } }");

            variables.toTimestamp = period.to.getTime();
        }

        return {
            query: buildTransactionHistoryQuery(
                declarations,
                conditions,
                order,
            ),
            variables,
        };
    }

    public static mapTransactionHistory(
        data: TransactionHistoryQueryData,
        address: string,
        networkId: NetworkId,
    ): ITransactionsHistoryPage {
        return {
            items: data.transaction_history_view.map(
                (transaction: RawTransaction) =>
                    mapRawTransactionToTransaction(transaction, {
                        accountAddress: address,
                        networkId,
                    }),
            ),
            total:
                data.transaction_history_view_aggregate.aggregate?.count ?? 0,
        };
    }

    public static unwrapGraphqlEnvelope<TData>(
        response: unknown,
    ): GraphqlEnvelope<TData> {
        if (this.isRecord(response)) {
            if ("transaction_history_view" in response) {
                return { data: response as TData };
            }

            const nestedResponse = response.data;

            if (
                this.isRecord(nestedResponse) &&
                ("data" in nestedResponse || "errors" in nestedResponse)
            ) {
                return nestedResponse as GraphqlEnvelope<TData>;
            }
        }

        return response as GraphqlEnvelope<TData>;
    }

    public static isRecoverableNetworkError(error: any): boolean {
        const message = String(error?.message ?? "");

        return (
            error?.code === "ERR_NETWORK" ||
            message.includes("CORS") ||
            message.includes("ERR_FAILED")
        );
    }
}