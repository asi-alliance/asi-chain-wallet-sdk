import { NetworkId } from "@domains/Network";
import { Pagination } from "./queryOptions";
import { Transaction } from "@domains/Transaction";
import {
    mapRawDeploymentToTransaction,
    mapRawTransferToTransaction,
} from "./mapper";

interface GraphqlEnvelope<TData> {
    data?: TData;
    errors?: unknown[];
}

export interface TransactionHistoryQueryData {
    transfers?: RawTransfer[];
    deployments?: RawDeployment[];
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

export interface RawDeployment {
    deploy_id: string;
    block_number?: number | string;
    deployer?: string;
    timestamp?: number | string;
    block?: {
        block_hash?: string;
    };
}

const TRANSACTION_HISTORY_QUERY = `
query GetTransactionHistory(
  $address: String!
  $publicKey: String!
  $offset: Int!
  $limit: Int
) {
  transfers(
    where: {
      _or: [
        { from_address: { _eq: $address } }
        { to_address: { _eq: $address } }
      ]
    }
    order_by: { block_number: desc }
    offset: $offset
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

  deployments(
    where: { deployer: { _eq: $publicKey } }
    order_by: { block_number: desc }
    offset: $offset
    limit: $limit
  ) {
    deploy_id
    block_number
    deployer
    timestamp

    block {
      block_hash
    }
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
        publicKey: string,
        pagination: Pagination = {},
    ): {
        query: string;
        variables: Record<string, number | string | undefined>;
    } {
        const variables: Record<string, number | string | undefined> = {
            address: address.trim(),
            publicKey,
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
        networkId: NetworkId,
    ): Transaction[] {
        if (!data) {
            return [];
        }

        const transactionsById: Map<string, Transaction> = new Map();

        (data.transfers ?? [])
            .map((transfer: RawTransfer) =>
                mapRawTransferToTransaction(transfer, {
                    accountAddress: address,
                    networkId,
                }),
            )
            .filter(this.isDefined)
            .forEach((transaction: Transaction) => {
                transactionsById.set(transaction.id, transaction);
            });

        (data.deployments ?? [])
            .map((deployment: RawDeployment) =>
                mapRawDeploymentToTransaction(deployment, { networkId }),
            )
            .filter(this.isDefined)
            .forEach((deployment: Transaction) => {
                const existing: Transaction | undefined = transactionsById.get(
                    deployment.id,
                );

                if (!existing) {
                    transactionsById.set(deployment.id, deployment);

                    return;
                }

                if (!existing.blockHash && deployment.blockHash) {
                    transactionsById.set(deployment.id, {
                        ...existing,
                        blockHash: deployment.blockHash,
                    });
                }
            });

        return Array.from(transactionsById.values()).sort(
            (first: Transaction, second: Transaction) =>
                second.timestamp.getTime() - first.timestamp.getTime(),
        );
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
