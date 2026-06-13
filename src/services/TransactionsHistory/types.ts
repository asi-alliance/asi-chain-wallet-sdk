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