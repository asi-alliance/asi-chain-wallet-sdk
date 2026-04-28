import { Transaction, TransactionFilter, TransactionStats } from '@domains/';
import { BlockchainGateway } from '@domains/';
import { fromAtomicAmount, toAtomicAmount } from '@utils';



export class TxHistory {
    static async getTransactions(
    address: string,
    publicKey: string,
    network: string,
    offset: number = 0, 
    limit: number = Number.POSITIVE_INFINITY,
  ): Promise<Transaction[]> {
    try {
      if (!address || !publicKey) {
        return [];
      }

      const transactions: Transaction[] = [];

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = localStorage.getItem('asi_wallet_pending_transactions');
          const pending: any[] = raw ? JSON.parse(raw) : [];
          const normalizedAddress = address?.toLowerCase().trim();
          const normalizedPublicKey = publicKey?.toLowerCase().trim();
          const seen = new Set<string>();
          for (const p of pending) {
            const pFrom = (p.from || '').toLowerCase().trim();
            const pTo = (p.to || '').toLowerCase().trim();
            const matchesAccount = pTo === normalizedAddress || pFrom === normalizedAddress || pFrom === normalizedPublicKey;
            if (!matchesAccount) continue;
            if (seen.has(p.deployId)) continue;
            seen.add(p.deployId);
            
            if (p.type === 'deploy') {
              transactions.push({
                id: p.deployId,
                deployId: p.deployId,
                from: p.from,
                to: undefined,
                amount: undefined,
                timestamp: new Date(p.timestamp),
                status: 'pending',
                gasCost: "N/A",
                type: 'deploy',
                network,
                detectedBy: 'manual'
              } as any);
              continue;
            }
            
            let type: 'send' | 'receive' = 'send';
            if (pTo === normalizedAddress && pFrom !== normalizedPublicKey) type = 'receive';
            transactions.push({
              id: p.deployId,
              deployId: p.deployId,
              from: p.from,
              to: p.to,
              amount: p.amount,
              timestamp: new Date(p.timestamp),
              status: 'pending',
              gasCost: "N/A",
              type,
              network,
              detectedBy: 'manual'
            } as any);
          }
        }
      } catch {}

      const blockchainGateway = BlockchainGateway.getInstance();
      // const rchain = new RChainService('', '', '', 'root', graphqlUrl);
      const blockchainTxs = await blockchainGateway.graphqlGateway.fetchTransactionHistory(address, publicKey, limit);
      
      for (const bcTx of blockchainTxs) {
        const normalizedAddress = address?.toLowerCase().trim();
        const normalizedPublicKey = publicKey?.toLowerCase().trim();
        const normalizedTo = bcTx.to?.toLowerCase().trim();
        const normalizedFrom = bcTx.from?.toLowerCase().trim();
        
        if (bcTx.type === 'deploy') {
          const isDeploy = normalizedFrom && normalizedFrom === normalizedPublicKey;
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
          network: network,
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
      } catch {}

      return transactions;
    } catch (error: any) {
      return [];
    }
  }

  static async getTransactionsWithStats(): Promise<{transactions: Transaction[], stats: }> {
    return;
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
    format: 'json' | 'csv' = 'json',
    address: string,
    publicKey: string,
    network: string,
    graphqlUrl: string
  ): Promise<string> {
    const transactions = await this.getTransactions(address, publicKey, network, graphqlUrl);
    
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
    
    const rows = transactions.map(tx => {
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
    format: 'json' | 'csv' = 'json',
    address: string,
    publicKey: string,
    network: string,
    graphqlUrl: string
  ) {
    const data = await this.exportTransactions(format, address, publicKey, network, graphqlUrl);
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

  static async syncFromBlockchain(
    address: string,
    publicKey: string,
    network: string,
    graphqlUrl: string
  ): Promise<{ added: number; updated: number }> {
    try {
      const transactions = await this.getTransactions(address, publicKey, network, graphqlUrl);
      return { added: transactions.length, updated: 0 };
    } catch (error) {
      return { added: 0, updated: 0 };
    }
  }
}