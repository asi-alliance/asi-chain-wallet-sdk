import { NetworkName } from "../../domains/Network";
import { Transaction } from "../../domains/Transaction";
import { mapRawTransferToTransaction } from "./mapping";
import { Pagination } from "./queryOptions";

interface GraphqlEnvelope<TData> {
    data?: TData;
    errors?: unknown[];
}

export interface TransactionHistoryQueryData {
    transfers?: RawTransfer[];
}

export interface RawTransfer {
    deploy_id: string;
    block_number?: number | string;
    block_hash?: string;
    from_address?: string;
    to_address?: string;
    amount_asi?: number | string;
    timestamp?: number | string;
    from_public_key?: string;
    network_name?: string;
}

const TRANSACTION_HISTORY_QUERY = `
  query GetTransactionHistory($address: String!, $offset: Int!, $limit: Int) {
    transfers(
      where: {
        _or: [
          {from_address: {_eq: $address}},
          {to_address: {_eq: $address}}
        ]
      },
      order_by: {block_number: desc},
      offset: $offset,
      limit: $limit
    ) {
      deploy_id
      block_number
      from_address
      to_address
      amount_asi
      timestamp
      from_public_key
    }
  }
`;

/**
 * Access to indexer GraphQL API.
 */
export class GraphqlParser {
    public static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
    }

    public static isDefined<T>(value: T | undefined): value is T {
        return value !== undefined;
    }

    public static createTransactionHistoryRequest(
        address: string,
        pagination: Pagination = {},
    ): {
        query: string;
        variables: Record<string, number | string | undefined>;
    } {
        const variables: Record<string, number | string | undefined> = {
            address: address.trim(),
            offset: pagination.offset ?? 0,
        };

        if (pagination.limit !== undefined) {
            variables.limit = pagination.limit;
        }

        return {
            query: TRANSACTION_HISTORY_QUERY,
            variables,
        };
    }

    public static mapTransactionHistory(
        data: TransactionHistoryQueryData | undefined,
        address: string,
        networkName: NetworkName,
    ): Transaction[] {
        if (!data || !data.transfers) {
            return [];
        }

        return data.transfers
            .map((transfer: RawTransfer) =>
                mapRawTransferToTransaction(transfer, {
                    accountAddress: address,
                    networkName: networkName,
                }),
            )
            .filter(this.isDefined);
    }

    public static unwrapGraphqlEnvelope<TData>(
        response: unknown,
    ): GraphqlEnvelope<TData> {
        if (this.isRecord(response)) {
            if ("transfers" in response) {
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
