import { Network, Transaction } from '@domains/';
import { BlockchainGateway } from '@domains/';
import type { GatewayTransactionHistoryItem } from '@domains/BlockchainGateway/GraphqlGateway';
import { fromAtomicAmount, toAtomicAmount } from '@utils';
import { encodeBase16 } from '@utils/codec';
import { TransactionFilter, TransactionStats } from './types';
import { applyTransactionFilter } from './helpers';
import { IAuxiliaryVault } from '../../application/ports/outbound/IAuxiliaryVault';
export * from './types';
export { hasActiveTransactionFilters } from "./helpers";

export class TxHistory {
    constructor(private _auxilliaryVault?: IAuxiliaryVault) {

    }
    private get auxilliaryVault() {
        if(!this._auxilliaryVault) {
            throw new Error("TxHistory: To call this method, you need to provide auxilliaryVault when initializing the sdk")
        }
        return this._auxilliaryVault;
    }

    /* txs in local vault */
    public storeTxInAuxVault(deployId: string, network: Network, amount: bigint, fromAddress: string, toAddress: string, auxVaultPassword: string) {
        const tx: Transaction = {
            deployId,
            amount: fromAtomicAmount(amount),
            from: fromAddress,
            to: toAddress,
            timestamp: new Date(),

            id: deployId, //TODO: remove this field
            status: "pending",
            type: "send",
            network: network.id,
        }
        this.auxilliaryVault.unlock(auxVaultPassword);
        this.auxilliaryVault.transactions.set(deployId, tx);
        this.auxilliaryVault.lock(auxVaultPassword);
        this.auxilliaryVault.save();
    }

    /**
     * filters and removes transactions from local vault that are no longer needed
     * @returns updated transactions from auxilliary vault
     */
    private removeExcessTxsInAuxVault(indexerTxs: Transaction[], auxVaultPassword: string): Transaction[] {
        this.auxilliaryVault.unlock(auxVaultPassword);
        for(const [key, value] of this.auxilliaryVault.transactions.entries()) {
            if(indexerTxs.find(tx => tx.deployId === value.deployId)) {
                this.auxilliaryVault.transactions.delete(key);
            }
        }
        const auxVaultTxs = Array.from(this.auxilliaryVault.transactions.values());
        this.auxilliaryVault.lock(auxVaultPassword);
        this.auxilliaryVault.save();
        return auxVaultTxs;
    }
    /* /txs in local vault */
    
    private async getIndexerTxs(
        network: Network,
        address: string,
        publicKey: Uint8Array,
        offset: number = 0,
        limit: number = Number.POSITIVE_INFINITY,
    ): Promise<Transaction[]> {
        try {
            const publicKeyHex = encodeBase16(publicKey);
            const blockchainGateway = BlockchainGateway.getInstance();
            const blockchainTxs = await blockchainGateway.graphqlGateway.fetchTransactionHistory(
                network,
                address,
                publicKeyHex,
                offset,
                limit,
            );
            const transactions = blockchainTxs
                .filter((tx) => this.belongsToAccount(tx, address, publicKeyHex))
                .map((tx) => this.toTransaction(tx, network))
                .filter((tx): tx is Transaction => tx !== undefined);

            try {
                this.removeConfirmedPendingTransactions(blockchainTxs);
            } catch (error) {
                console.error(error);
            }

            return transactions;
        } catch (error: any) {
            console.error(error);
            return [];
        }
    }
    
    public async getTransactions(
        network: Network,
        address: string,
        publicKey: Uint8Array,
        offset: number = 0,
        limit: number = Number.POSITIVE_INFINITY,
        auxVaultPassword: string,
    ): Promise<Transaction[]> {
        const indexerTxs = await this.getIndexerTxs(network, address, publicKey, offset, limit);
        const auxVaultTxs = this.removeExcessTxsInAuxVault(indexerTxs, auxVaultPassword);
        return [
            ...auxVaultTxs,
            ...indexerTxs,
        ]
    }

    public async getFilteredTxsWithStats(
        network: Network,
        address: string,
        publicKey: Uint8Array,
        filter: TransactionFilter,
        offset: number = 0,
        limit: number = Number.POSITIVE_INFINITY,
        auxVaultPassword: string
    ): Promise<{ filteredTxs: Transaction[], stats: TransactionStats }> {
        const transactions = await this.getTransactions(
            network,
            address,
            publicKey,
            offset,
            limit,
            auxVaultPassword
        );
        const filteredTxs = applyTransactionFilter(transactions, filter);
        return { filteredTxs, stats: await this.calcStatistics(transactions) };
    }

    public async calcStatistics(
        transactions: Transaction[]
    ): Promise<TransactionStats> {

        const stats = {
            total: transactions.length,
            sent: 0,
            received: 0,
            deployed: 0,
            pending: 0,
            confirmed: 0,
            failed: 0,
            totalSent: '0',
            totalReceived: '0',
            totalGas: '0'
        };

        transactions.forEach(tx => {
            if (tx.type === 'send') stats.sent++;
            else if (tx.type === 'receive') stats.received++;
            else if (tx.type === 'deploy') stats.deployed++;

            if (tx.status === 'pending') stats.pending++;
            else if (tx.status === 'confirmed') stats.confirmed++;
            else if (tx.status === 'failed') stats.failed++;

            if (tx.status === 'confirmed' && tx.amount) {
                if (tx.type === 'send') {
                    stats.totalSent = this.addAmount(stats.totalSent, tx.amount);
                } else if (tx.type === 'receive') {
                    stats.totalReceived = this.addAmount(stats.totalReceived, tx.amount);
                }
            }

            if (tx.gasCost) {
                stats.totalGas = this.addAmount(stats.totalGas, tx.gasCost);
            }
        });

        return stats;
    }

    private toTransaction(
        tx: GatewayTransactionHistoryItem,
        network: Network,
    ): Transaction | undefined {
        if (!tx.from) {
            return undefined;
        }

        return {
            id: tx.deployId || this.createSyntheticId(tx),
            timestamp: new Date(tx.timestamp),
            type: tx.type,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            deployId: tx.deployId,
            blockHash: tx.blockHash,
            status: tx.status,
            network: network.id,
            detectedBy: 'auto'
        };
    }

    private belongsToAccount(
        tx: GatewayTransactionHistoryItem,
        address: string,
        publicKey: string,
    ): boolean {
        const normalizedAddress = this.normalizeAddress(address);
        const normalizedPublicKey = this.normalizeAddress(publicKey);
        const normalizedFrom = this.normalizeAddress(tx.from);
        const normalizedTo = this.normalizeAddress(tx.to);

        if (tx.type === 'deploy') {
            return normalizedFrom === normalizedPublicKey || normalizedFrom === normalizedAddress;
        }

        return normalizedFrom === normalizedAddress || normalizedTo === normalizedAddress;
    }

    private removeConfirmedPendingTransactions(
        blockchainTxs: GatewayTransactionHistoryItem[],
    ): void {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }

        const knownIds = new Set(
            blockchainTxs
                .map((tx) => tx.deployId)
                .filter((deployId): deployId is string => !!deployId),
        );

        if (!knownIds.size) {
            return;
        }

        const raw = localStorage.getItem('asi_wallet_pending_transactions');
        const pending: any[] = raw ? JSON.parse(raw) : [];
        const filtered = pending.filter((tx) => !knownIds.has(tx.deployId));

        if (filtered.length !== pending.length) {
            localStorage.setItem('asi_wallet_pending_transactions', JSON.stringify(filtered));
        }
    }

    private addAmount(total: string, amount: string): string {
        try {
            return fromAtomicAmount(toAtomicAmount(total) + toAtomicAmount(amount));
        } catch (error) {
            console.error(error);
            return total;
        }
    }

    private createSyntheticId(tx: GatewayTransactionHistoryItem): string {
        return [
            tx.type,
            tx.blockNumber ?? 'no_block',
            tx.timestamp,
            tx.from,
            tx.to ?? 'no_to',
            tx.amount ?? 'no_amount',
        ].join('_');
    }

    private normalizeAddress(address: string | undefined): string {
        return address?.trim().toLowerCase() ?? '';
    }

    public async exportTransactions(
        network: Network,
        address: string,
        publicKey: Uint8Array,
        offset: number = 0,
        limit: number = Number.POSITIVE_INFINITY,
        format: 'json' | 'csv' = 'json',
        auxVaultPassword: string
    ): Promise<string> {
        const transactions = await this.getTransactions(network, address, publicKey, offset, limit, auxVaultPassword);

        if (format === 'json') {
            return JSON.stringify(transactions, null, 2);
        }

        const headers = [
            'Date',
            'Time',
            'Type',
            'Status',
            'From',
            'To',
            'Amount',
            'Gas Cost',
            'Deploy ID',
            'Block Hash',
            'Network',
            'Note'
        ];

        const rows = (transactions).map(tx => {
            const date = new Date(tx.timestamp);
            return [
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                tx.type,
                tx.status,
                tx.from,
                tx.to || '',
                tx.amount || '',
                tx.gasCost || '',
                tx.deployId || '',
                tx.blockHash || '',
                tx.network,
                tx.note || ''
            ].map(val => `"${val}"`).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    public async downloadTransactions(
        network: Network,
        address: string,
        publicKey: Uint8Array,
        offset: number = 0,
        limit: number = Number.POSITIVE_INFINITY,
        format: 'json' | 'csv' = 'json',
        auxVaultPassword: string
    ) {
        const data = await this.exportTransactions(network, address, publicKey, offset, limit, format, auxVaultPassword);
        const blob = new Blob([data], {
            type: format === 'json' ? 'application/json' : 'text/csv'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asi-wallet-transactions-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
