import { Address, Network, Transaction } from '../../../domain';
import { BlockchainGateway } from '../../../infrastructure/adapters/BlockchainGateway';
import { fromAtomicAmount, toAtomicAmount } from '../../../domain/services/AmountRepresentation';
import { TransactionFilter, TransactionStats } from './types';
import { applyTransactionFilter } from './helpers';
import { IAuxiliaryVault } from '../../ports/outbound/IAuxiliaryVault';
import { IFileSaver, Order, Pagination } from '../..';
export * from './types';
export { hasActiveTransactionFilters } from "./helpers";

export class TxHistory {
    constructor(private blockchainGateway: BlockchainGateway, private _auxiliaryVault?: IAuxiliaryVault, private _fileSaver?: IFileSaver) {

    }
    private get auxiliaryVault() {
        if(!this._auxiliaryVault) {
            throw new Error("TxHistory: To call this method, you need to provide auxiliaryVault when initializing the sdk")
        }
        return this._auxiliaryVault;
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

            id: deployId, //NOTE/TODO: remove this field
            status: "pending",
            type: "send",
            networkName: network.name,
        }
        await this.auxiliaryVault.unlock(auxVaultPassword);
        this.auxiliaryVault.transactions.set(deployId, tx);
        const allLocalTxs = Array.from(this.auxiliaryVault.transactions.values());
        await this.auxiliaryVault.lock(auxVaultPassword);
        this.auxiliaryVault.save();
        return allLocalTxs;
    }

    /**
     * filters and removes transactions from local vault that are no longer needed
     * @returns updated all transactions from auxilliary vault
     */
    private async removeExcessTxsInAuxVault(indexerTxs: Transaction[], auxVaultPassword: string): Promise<Transaction[]> {
        await this.auxiliaryVault.unlock(auxVaultPassword);
        for(const [key, value] of this.auxiliaryVault.transactions.entries()) {
            if(indexerTxs.find(tx => tx.deployId === value.deployId)) {
                this.auxiliaryVault.transactions.delete(key);
            }
        }
        const auxVaultTxs = Array.from(this.auxiliaryVault.transactions.values());
        await this.auxiliaryVault.lock(auxVaultPassword);
        this.auxiliaryVault.save();
        return auxVaultTxs;
    }
    /* /txs in local vault */
    

    /* getIndexerTxs helpers */

    /* /getIndexerTxs helpers */
    private async getIndexerTxs(
        address: string,
        pagination: Pagination,
    ): Promise<Transaction[]> {
        try {
            const txs = await this.blockchainGateway.graphqlGateway.fetchTransactionHistory(
                address,
                pagination,
            );
            return txs;
        } catch (error: any) {
            console.error(error);
            return [];
        }
    }

    /**
     * @param auxVaultTxs all transactions in auxiliary vault
     * @param the address to which the filtered transactions should be related. to or from.
     */
    filterAndMapAuxVaultTxsWithAddress(auxVaultTxs: Transaction[], address: Address) {
        const filtered = auxVaultTxs.filter(tx => tx.from ===address || tx.to===address);
        filtered.forEach(tx => {
            if(tx.to === address) {
                tx.type = "receive"; //Transactions are saved only for the sender's wallet. If they also apply to the recipient's wallet, their type must be changed.
            }
        });
        return filtered;
    }
    private sortTxsByTimestamp(txs: Transaction[], order: Order = "desc"): Transaction[] {
        const sign = order === "asc" ? 1 : -1;
        return txs.sort((a, b) => sign*(a.timestamp.valueOf() - b.timestamp.valueOf()));
    }
    /**
     * sends a query to the indexer, updates local transactions, and returns the updated result
     * @returns both local and indexer transactions
     */
    private async syncTransactions(
        address: Address,
        pagination: Pagination,
        auxVaultPassword: string,
    ) {
        const indexerTxs = await this.getIndexerTxs(address, pagination);
        const auxVaultTxs = await this.removeExcessTxsInAuxVault(indexerTxs, auxVaultPassword);
        
        return {allLocalTxs: auxVaultTxs, indexerTxs: indexerTxs}
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
    private calcStatistics(
        transactions: Transaction[]
    ): TransactionStats {

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
    private getMixedTxsByParts(localTxs: Transaction[], indexerTxs: Transaction[]) {
        const mixexTxs = [...localTxs, ...indexerTxs];
        const txs = this.sortTxsByTimestamp(mixexTxs);
        return txs; 
    }
    /**
     * Allows you to build a transaction history from local and indexer transactions. This method is useful when local and indexer transactions are not updated simultaneously.
     * @param localTxs Transactions associated with a specific request
     * @param indexerTxs Transactions associated with a specific request
     */
    public buildTxHistoryWithStats(localTxs: Transaction[], indexerTxs: Transaction[]) {
        const mixexTxs = this.getMixedTxsByParts(localTxs, indexerTxs);
        return { txs: mixexTxs, stats: this.calcStatistics(mixexTxs) };
    }
    /**
     * @param allLocalTxs all txs in auxiliary vault
     * @returns filtered by address and filter txs from auxiliary vault
     */
    public filterLocalTxs(allLocalTxs: Transaction[], address: Address, filter: TransactionFilter | null, network: Network) {
        console.log(allLocalTxs, network);
        const filteredByAddressLocalTxs = this.filterAndMapAuxVaultTxsWithAddress(allLocalTxs, address);
        const filteredLocalTxs = this.sortTxsByTimestamp(applyTransactionFilter(filteredByAddressLocalTxs, filter, network));
        return filteredLocalTxs;
    }
    public async getFilteredTxs(
        network: Network,
        address: Address,
        filter: TransactionFilter,
        pagination: Pagination,
        auxVaultPassword: string
    ): Promise<{ localTxs: Transaction[], indexerTxs: Transaction[] }> {
        const {allLocalTxs, indexerTxs} = await this.syncTransactions(
            address,
            pagination,
            auxVaultPassword
        );

        const filteredLocalTxs = this.filterLocalTxs(allLocalTxs, address, filter, network);
        const filteredIndexerTxs = this.sortTxsByTimestamp(applyTransactionFilter(indexerTxs, filter, network));

        return { localTxs: filteredLocalTxs, indexerTxs: filteredIndexerTxs };
    }
    /**
     * A function that retrieves transactions as a single array. Useful when there's no need to separate local and indexer transactions.
     */
    public async getMixedTxs(
        network: Network,
        address: Address,
        filter: TransactionFilter,
        pagination: Pagination,
        auxVaultPassword: string
    ) {
        const { localTxs, indexerTxs } = await this.getFilteredTxs(network, address, filter, pagination, auxVaultPassword);
        return this.getMixedTxsByParts(localTxs, indexerTxs);
    }

    public async exportTransactions(
        network: Network,
        address: Address,
        pagination: Pagination,
        filter: TransactionFilter,
        format: 'json' | 'csv' = 'json',
        auxVaultPassword: string
    ): Promise<string> {
        const transactions = await this.getMixedTxs(network, address, filter, pagination, auxVaultPassword);

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
                tx.networkName,
                tx.note || ''
            ].map(val => `"${val}"`).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    public async downloadTransactions(
        network: Network,
        address: Address,
        pagination: Pagination,
        filter: TransactionFilter,
        format: 'json' | 'csv' = 'json',
        auxVaultPassword: string
    ) {
        const data = await this.exportTransactions(network, address, pagination, filter, format, auxVaultPassword);
        this.fileSaver.save({
            name: `transactions_${(new Date()).toISOString()}.${format}`,
            content: data,
            mimeType: format === 'json' ? 'application/json' : 'text/csv',
        })
    }
}
