import type { Pagination } from "../../../../application";
import type { IHttpClient } from "../../../../application/ports/outbound/IHttpClient";
import type { Transaction } from "../../../../domain/aggregates/Transaction";
import type { NetworkName } from "../../../../domain/aggregates/Network/Network";
import { mapRawTransferToTransaction } from "./mapping";

interface GraphqlEnvelope<TData> {
    data?: TData;
    errors?: unknown[];
}

interface TransactionHistoryQueryData {
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
export class GraphqlGateway {
    constructor(
        private readonly httpClient: IHttpClient,
        private readonly networkName: NetworkName,
    ) {}

    private createTransactionHistoryRequest(
        address: string,
        pagination: Pagination = {},
    ): { query: string; variables: Record<string, number | string | undefined> } {
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

    private mapTransactionHistory(
        data: TransactionHistoryQueryData | undefined,
        address: string,
    ): Transaction[] {
        return (data?.transfers ?? [])
            .map((transfer) =>
                mapRawTransferToTransaction(transfer, {
                    accountAddress: address,
                    networkName: this.networkName,
                }),
            )
            .filter(this.isDefined);
    }

    private unwrapGraphqlEnvelope<TData>(
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

    private isRecoverableNetworkError(error: any): boolean {
        const message = String(error?.message ?? "");

        return (
            error?.code === "ERR_NETWORK" ||
            message.includes("CORS") ||
            message.includes("ERR_FAILED")
        );
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
    }

    private isDefined<T>(value: T | undefined): value is T {
        return value !== undefined;
    }

    public async fetchTransactionHistory(
        address: string,
        pagination: Pagination = {},
    ): Promise<Transaction[]> {
        try {
            const response = await this.httpClient.post(
                "",
                this.createTransactionHistoryRequest(address, pagination),
            );
            const envelope =
                this.unwrapGraphqlEnvelope<TransactionHistoryQueryData>(
                    response,
                );

            if (envelope.errors?.length) {
                console.error("[GraphQL] GraphQL errors:", envelope.errors);
                throw envelope.errors;
            }

            return this.mapTransactionHistory(envelope.data, address);
        } catch (error: any) {
            if (this.isRecoverableNetworkError(error)) {
                console.warn(
                    "[GraphQL] Network error while loading transaction history. Returning an empty history.",
                );
                return [];
            }

            console.error(
                "Error fetching transaction history from indexer:",
                error,
            );
            return [];
        }
    }
}
