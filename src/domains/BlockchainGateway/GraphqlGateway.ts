import { HttpClient } from "@domains/HttpClient";
import { Network } from "@domains/Network";
import { Pagination } from "../../application";
import { normalizeAddress } from "@domains/Wallet/mapping";

type TransactionType = "send" | "receive" | "deploy";
type TransactionStatus = "pending" | "confirmed" | "failed";

export interface GatewayTransactionHistoryItem {
    deployId: string;
    blockNumber?: number | string;
    from: string;
    to?: string;
    amount?: string;
    status: TransactionStatus;
    timestamp: string;
    blockHash?: string;
    type: TransactionType;
}

interface GraphqlEnvelope<TData> {
    data?: TData;
    errors?: unknown[];
}

interface TransactionHistoryQueryData {
    transfers?: RawTransfer[];
    deployments?: RawDeployment[];
}

interface RawTransfer {
    deploy_id: string;
    block_number?: number | string;
    from_address?: string;
    to_address?: string;
    amount_asi?: number | string;
    timestamp?: number | string;
    from_public_key?: string;
}

interface RawDeployment {
    deploy_id: string;
    block_number?: number | string;
    deployer?: string;
    timestamp?: number | string;
    block?: {
        block_hash?: string;
    };
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

export class GraphqlGateway {
    constructor(private httpClient: HttpClient) {}

    async fetchTransactionHistory(
        network: Network,
        address: string,
        // publicKey: string = "",
        pagination: Pagination,
    ): Promise<GatewayTransactionHistoryItem[]> {
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
            return this.toTransactionHistoryItems(
                envelope.data as TransactionHistoryQueryData, //TODO: More accurate error handling in graphql
                address,
                // publicKey,
            );
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

    private createTransactionHistoryRequest(
        address: string,
        // publicKey: string,
        pagination: Pagination,
    ): { query: string; variables: Record<string, number | string | undefined> } {
        const variables: Record<string, number | string | undefined> = {
            address: address.trim(),
            offset: pagination.offset,
            // publicKey,
        };

        const normalizedLimit = pagination.limit;
        if (normalizedLimit !== undefined) {
            variables.limit = normalizedLimit;
        }

        return {
            query: TRANSACTION_HISTORY_QUERY,
            variables,
        };
    }

    private toTransactionHistoryItems(
        data: TransactionHistoryQueryData,
        address: string,
        // publicKey: string,
    ): GatewayTransactionHistoryItem[] {
        const accountAddress = normalizeAddress(address);
        // const accountPublicKey = normalizeAddress(publicKey);
        const transfers = this.getArray(data.transfers);
        const deployments = this.getArray(data.deployments);
        const deploymentById = this.createDeploymentMap(deployments);
        const transferTxs = transfers
            .map((tx) =>
                this.toTransferHistoryItem(tx, accountAddress, deploymentById),
            )
            .filter(this.isDefined);

        const knownDeployIds = new Set(
            transferTxs
                .map((tx) => tx.deployId)
                .filter((deployId): deployId is string => !!deployId),
        );
        
        // const deployTxs = deployments
        //     .filter((tx) => tx.deploy_id && !knownDeployIds.has(tx.deploy_id))
        //     .map((tx) => this.toDeployHistoryItem(tx, accountPublicKey))
        //     .filter(this.isDefined);
        const deployTxs: GatewayTransactionHistoryItem[] = [];


        return [...transferTxs, ...deployTxs].sort((a, b) => {
            return (
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            );
        });
    }

    private toTransferHistoryItem(
        tx: RawTransfer,
        accountAddress: string,
        deploymentById: Map<string, RawDeployment>,
    ): GatewayTransactionHistoryItem | undefined {
        const from = tx.from_address?.trim();
        const to = tx.to_address?.trim();

        if (!from || !to) {
            return undefined;
        }

        const deployment = tx.deploy_id
            ? deploymentById.get(tx.deploy_id)
            : undefined;

        return {
            deployId: tx.deploy_id,
            blockNumber: tx.block_number,
            from,
            to,
            amount:
                tx.amount_asi === undefined ? undefined : String(tx.amount_asi),
            status: "confirmed",
            timestamp: this.toIsoTimestamp(tx.timestamp ?? deployment?.timestamp),
            blockHash: deployment?.block?.block_hash,
            type: this.getTransferType(from, to, accountAddress),
        };
    }

    private toDeployHistoryItem(
        tx: RawDeployment,
        accountPublicKey: string,
    ): GatewayTransactionHistoryItem | undefined {
        const deployer = tx.deployer?.trim();

        if (!deployer || normalizeAddress(deployer) !== accountPublicKey) {
            return undefined;
        }

        return {
            deployId: tx.deploy_id,
            blockNumber: tx.block_number,
            from: deployer,
            status: "confirmed",
            timestamp: this.toIsoTimestamp(tx.timestamp),
            blockHash: tx.block?.block_hash,
            type: "deploy",
        };
    }

    private createDeploymentMap(
        deployments: RawDeployment[],
    ): Map<string, RawDeployment> {
        return new Map(
            deployments
                .filter((tx) => !!tx.deploy_id)
                .map((tx) => [tx.deploy_id as string, tx]),
        );
    }

    private unwrapGraphqlEnvelope<TData>(
        response: unknown,
    ): GraphqlEnvelope<TData> {
        if (this.isRecord(response)) {
            if ("transfers" in response || "deployments" in response) {
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

    private getTransferType(
        from: string,
        to: string,
        accountAddress: string,
    ): "send" | "receive" {
        const normalizedFrom = normalizeAddress(from);
        const normalizedTo = normalizeAddress(to);

        if (normalizedFrom === accountAddress) {
            return "send";
        }

        if (normalizedTo === accountAddress) {
            return "receive";
        }

        return "receive";
    }

    private toIsoTimestamp(timestamp: number | string | undefined): string {
        if (timestamp === undefined || timestamp === "") {
            return new Date(0).toISOString();
        }

        if (typeof timestamp === "number") {
            return this.toDateFromNumericTimestamp(timestamp).toISOString();
        }

        const trimmedTimestamp = timestamp.trim();
        if (/^\d+$/.test(trimmedTimestamp)) {
            return this.toDateFromNumericTimestamp(
                Number(trimmedTimestamp),
            ).toISOString();
        }

        const parsedTimestamp = Date.parse(trimmedTimestamp);
        if (!Number.isFinite(parsedTimestamp)) {
            return new Date(0).toISOString();
        }

        return new Date(parsedTimestamp).toISOString();
    }

    private toDateFromNumericTimestamp(timestamp: number): Date {
        const milliseconds =
            timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;

        return new Date(milliseconds);
    }

    private getArray<T>(value: T[] | undefined): T[] {
        return Array.isArray(value) ? value : [];
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
}
