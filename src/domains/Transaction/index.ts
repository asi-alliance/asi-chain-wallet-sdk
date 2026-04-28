export interface Transaction {
  id: string;
  timestamp: Date;
  type: 'send' | 'receive' | 'deploy';
  from: string;
  to?: string;
  amount?: string;
  deployId?: string;
  blockHash?: string;
  gasCost?: string;
  status: 'pending' | 'confirmed' | 'failed';
  contractCode?: string;
  note?: string;
  network: string;
  detectedBy?: 'balance_change' | 'manual' | 'auto';
}

export interface TransactionFilter {
  type?: 'send' | 'receive' | 'deploy';
  status?: 'pending' | 'confirmed' | 'failed';
  from?: string;
  to?: string;
  startDate?: Date;
  endDate?: Date;
  network?: string;
}

export interface TransactionStats {
  total: number;
  sent: number;
  received: number;
  deployed: number;
  pending: number;
  confirmed: number;
  failed: number;
}