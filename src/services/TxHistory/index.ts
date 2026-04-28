import { Network, Transaction } from '@domains/';
import { BlockchainGateway } from '@domains/';
import { fromAtomicAmount, toAtomicAmount } from '@utils';
import { TransactionFilter, TransactionStats } from './types';
import { applyTransactionFilter } from './helpers';
export * from './types';
export { hasActiveTransactionFilters } from "./helpers";

export class TxHistory {
  static async getTransactions(
    network: Network,
    address: string,
    offset: number = 0, 
    limit: number = Number.POSITIVE_INFINITY
  ): Promise<Transaction[]> {
    try {
      console.log("[sdk] TxHistory: getTransactions:", network, address, offset, limit);
      const transactions: Transaction[] = [];

      const blockchainGateway = BlockchainGateway.getInstance();
      const blockchainTxs = await blockchainGateway.graphqlGateway.fetchTransactionHistory(network, address, offset, limit);
      console.log("getTransactions: blockchainTxs=", blockchainTxs)


      for (const bcTx of blockchainTxs) {
        const normalizedAddress = address?.toLowerCase().trim();
        const normalizedTo = bcTx.to?.toLowerCase().trim();
        const normalizedFrom = bcTx.from?.toLowerCase().trim();
        
        if (bcTx.type === 'deploy') {
          const isDeploy = normalizedFrom;
          if (!isDeploy) {
            continue;
          }
        } else {
          const isReceive = normalizedTo && normalizedTo === normalizedAddress;
          const isSend = normalizedFrom && normalizedFrom === normalizedAddress;
          
          if (!isReceive && !isSend) {
            continue;
          }
        }
        
        const transaction: Transaction = {
          id: bcTx.deployId || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(bcTx.timestamp),
          type: bcTx.type,
          from: bcTx.from,
          to: bcTx.to,
          amount: bcTx.amount,
          deployId: bcTx.deployId,
          blockHash: bcTx.blockHash,
          gasCost: "N/A",
          status: bcTx.status,
          network: "N/A",
          detectedBy: 'auto'
        };
        
        transactions.push(transaction);
      }

      try {
        const knownIds = new Set(blockchainTxs.map((t: any) => t.deployId));
        const pendingOnly = transactions.filter(t => t.status === 'pending' && !knownIds.has(t.deployId));
        const confirmed = transactions.filter(t => t.status !== 'pending');
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = localStorage.getItem('asi_wallet_pending_transactions');
          const pending: any[] = raw ? JSON.parse(raw) : [];
          const filtered = pending.filter(p => !knownIds.has(p.deployId));
          if (filtered.length !== pending.length) {
            localStorage.setItem('asi_wallet_pending_transactions', JSON.stringify(filtered));
          }
        }
        return [...pendingOnly, ...confirmed];
      } catch(error) {
        console.error(error);
      }

      return transactions;
    } catch (error: any) {
      console.error(error);
      return [];
    }
  }

  static async getFilteredTxsWithStats(
    network: Network,
    address: string,
    filter: TransactionFilter,
    offset: number = 0, 
    limit: number = Number.POSITIVE_INFINITY
  ): Promise<{filteredTxs: Transaction[], stats: TransactionStats}> {
    const transactions = await this.getTransactions(network, address, offset, limit);
    console.log("getFilteredTxsWithStats: transactions=", transactions)
    const filteredTxs = applyTransactionFilter(transactions, filter);
    console.log("getFilteredTxsWithStats: filteredTxs=", filteredTxs)
    return {filteredTxs, stats: await this.calcStatistics(transactions)};
  }

  static async calcStatistics(
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
          stats.totalSent = (BigInt(stats.totalSent) + BigInt(tx.amount)).toString();
        } else if (tx.type === 'receive') {


          //TODO:
          // const txAmount = utils.parseEther(tx.amount);
          // const totalAmount = utils.parseEther(stats.totalReceived);
          // stats.totalReceived = (txAmount.add(totalAmount)).toString();
          const txAmount =  toAtomicAmount(tx.amount)
          const totalAmount = toAtomicAmount(stats.totalReceived);
          stats.totalReceived = fromAtomicAmount(txAmount + totalAmount);
        }
      }

      if (tx.gasCost) {
        stats.totalGas = (BigInt(stats.totalGas) + BigInt(tx.gasCost)).toString();
      }
    });

    return stats;
  }

  static async exportTransactions(
    network: Network,
    address: string,
    offset: number = 0, 
    limit: number = Number.POSITIVE_INFINITY,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const transactions = await this.getTransactions(network, address, offset, limit);
    
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

  static async downloadTransactions(
    network: Network,
    address: string,
    offset: number = 0, 
    limit: number = Number.POSITIVE_INFINITY,
    format: 'json' | 'csv' = 'json'
  ) {
    const data = await this.exportTransactions(network, address, offset, limit, format);
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