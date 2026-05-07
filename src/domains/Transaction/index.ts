import { NetworkName } from "@domains/Network";

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
  networkName: NetworkName; //TODO: clarify what network data will be stored
  detectedBy?: 'balance_change' | 'manual' | 'auto';
}


