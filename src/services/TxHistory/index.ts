import { Network, Transaction } from '@domains/';
import { BlockchainGateway } from '@domains/';
import type { GatewayTransactionHistoryItem } from '@domains/BlockchainGateway/GraphqlGateway';
import { fromAtomicAmount, toAtomicAmount } from '@utils';
import { encodeBase16 } from '@utils/codec';
import { TransactionFilter, TransactionStats } from './types';
import { applyTransactionFilter } from './helpers';
import { IAuxiliaryVault } from '../../application/ports/outbound/IAuxiliaryVault';
import { normalizeAddress } from '@domains/Wallet/mapping';
import { IFileSaver, Pagination } from '../../application';
export * from './types';
export { hasActiveTransactionFilters } from "./helpers";

export class TxHistory {
    constructor(private _auxilliaryVault?: IAuxiliaryVault, private _fileSaver?: IFileSaver) {

    }
    private get auxilliaryVault() {
        if(!this._auxilliaryVault) {
            throw new Error("TxHistory: To call this method, you need to provide auxilliaryVault when initializing the sdk")
        }
        return this._auxilliaryVault;
    }
    private get fileSaver() {
        if(!this._fileSaver) {
            throw new Error("TxHistory: To call this method, you need to provide fileSaver when initializing the sdk")
        }
        return this._fileSaver;
    }

    /* txs in local vault */
    public async storeTxInAuxVault(deployId: string, network: Network, amount: bigint, fromAddress: string, toAddress: string, auxVaultPassword: string) {
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
        await this.auxilliaryVault.unlock(auxVaultPassword);
        this.auxilliaryVault.transactions.set(deployId, tx);
        console.log("storeTxInAuxVault: auxilliaryVault.transactions=", this.auxilliaryVault.transactions);
        await this.auxilliaryVault.lock(auxVaultPassword);
        this.auxilliaryVault.save();
    }

    /**
     * filters and removes transactions from local vault that are no longer needed
     * @returns updated transactions from auxilliary vault
     */
    private async removeExcessTxsInAuxVault(indexerTxs: Transaction[], auxVaultPassword: string): Promise<Transaction[]> {
        await this.auxilliaryVault.unlock(auxVaultPassword);
        console.log(Array.from(this.auxilliaryVault.transactions.entries()));
        for(const [key, value] of this.auxilliaryVault.transactions.entries()) {
            if(indexerTxs.find(tx => tx.deployId === value.deployId)) {
                this.auxilliaryVault.transactions.delete(key);
            }
        }
        const auxVaultTxs = Array.from(this.auxilliaryVault.transactions.values());
        await this.auxilliaryVault.lock(auxVaultPassword);
        this.auxilliaryVault.save();
        return auxVaultTxs;
    }
    /* /txs in local vault */
    

    /* getIndexerTxs helpers */
    private toTransaction(
        tx: GatewayTransactionHistoryItem,
        network: Network,
    ): Transaction {
        return {
            id: tx.deployId,
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
    ): boolean {
        const normalizedAddress = normalizeAddress(address);
        const normalizedFrom = normalizeAddress(tx.from);
        const normalizedTo = normalizeAddress(tx.to);

        return normalizedAddress === normalizedFrom  || normalizedAddress === normalizedTo ;
    }
    /* /getIndexerTxs helpers */
    private async getIndexerTxs(
        network: Network,
        address: string,
        // publicKey: Uint8Array,
        pagination: Pagination,
    ): Promise<Transaction[]> {
        try {
            // const publicKeyHex = encodeBase16(publicKey);
            const blockchainGateway = BlockchainGateway.getInstance();
            const blockchainTxs = await blockchainGateway.graphqlGateway.fetchTransactionHistory(
                network,
                address,
                // publicKeyHex,
                pagination,
            );
            const transactions = blockchainTxs
                .filter((tx) => this.belongsToAccount(tx, address))
                .map((tx) => this.toTransaction(tx, network))
                .filter((tx): tx is Transaction => tx !== undefined);

            return transactions;
        } catch (error: any) {
            console.error(error);
            return [];
        }
    }
    
    /**
     * sends a query to the indexer, updates local transactions, and returns the updated result
     * @returns both local and indexer transactions
     */
    public async syncTransactions(
        network: Network,
        address: string,
        // publicKey: Uint8Array,
        pagination: Pagination,
        auxVaultPassword: string,
    ): Promise<Transaction[]> {
        const indexerTxs = await this.getIndexerTxs(network, address, pagination);
        const auxVaultTxs = await this.removeExcessTxsInAuxVault(indexerTxs, auxVaultPassword);
        console.log("syncTransactions: auxVaultTxs=", auxVaultTxs);
        return [
            ...auxVaultTxs,
            ...indexerTxs,
        ]
    }

    /* calcStatistics helpers */
    private addAmount(total: string, amount: string): string {
        try {
            return fromAtomicAmount(toAtomicAmount(total) + toAtomicAmount(amount));
        } catch (error) {
            console.error(error);
            return total;
        }
    }
    /* /calcStatistics helpers */
    private async calcStatistics(
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

    public async getFilteredTxsWithStats(
        network: Network,
        address: string,
        // publicKey: Uint8Array,
        filter: TransactionFilter,
        pagination: Pagination,
        auxVaultPassword: string
    ): Promise<{ filteredTxs: Transaction[], stats: TransactionStats }> {
        const transactions = await this.syncTransactions(
            network,
            address,
            // publicKey,
            pagination,
            auxVaultPassword
        );
        const filteredTxs = applyTransactionFilter(transactions, filter);
        return { filteredTxs, stats: await this.calcStatistics(transactions) };
    }

    public async exportTransactions(
        network: Network,
        address: string,
        // publicKey: Uint8Array,
        pagination: Pagination,
        format: 'json' | 'csv' = 'json',
        auxVaultPassword: string
    ): Promise<string> {
        const transactions = await this.syncTransactions(network, address, pagination, auxVaultPassword);

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
        pagination: Pagination,
        format: 'json' | 'csv' = 'json',
        auxVaultPassword: string
    ) {
        const data = await this.exportTransactions(network, address, pagination, format, auxVaultPassword);
        this.fileSaver.save({
            name: `transactions_${(new Date()).toISOString()}.${format}`,
            content: data,
            mimeType: format === 'json' ? 'application/json' : 'text/csv',
        })
    }
}
