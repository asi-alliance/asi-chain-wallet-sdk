export type TransactionType = "send" | "receive" | "deploy";

export type TransactionStatus = "pending" | "confirmed" | "failed";

export interface Transaction {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    from: string;
    to?: string;
    amount?: string;
    timestamp: Date;
    network: string;
    note?: string;
    deployId?: string;
    blockHash?: string;
}

export interface TransactionFilter {
    type?: TransactionType;
    status?: TransactionStatus;
    network?: string;
    startDate?: Date;
    endDate?: Date;
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

export interface TxHistoryAccount {
    id: string;
    name: string;
    revAddress: string;
    publicKey: string;
    balance?: string;
}

export interface TxHistoryNetwork {
    id: string;
    name: string;
    url: string;
    readOnlyUrl?: string;
    adminUrl?: string;
    shardId?: string;
    graphqlUrl?: string;
}

export const emptyTransactionStats: TransactionStats = {
    total: 0,
    sent: 0,
    received: 0,
    deployed: 0,
    pending: 0,
    confirmed: 0,
    failed: 0,
};

export const selectedAccountFixture: TxHistoryAccount = {
    id: "account-1",
    name: "Playground account",
    revAddress: "1111WjP6iqqDa61z7wzVYmk7GdTqV9FSZJMzpYqWMe7r7CjixYz8V",
    publicKey:
        "02a1633caf7bfca8e49af33e3f19b4a52dfcb1f0c4b46ad6f7a60d6d2056359f52",
    balance: "125.00000000",
};

export const selectedNetworkFixture: TxHistoryNetwork = {
    id: "devnet",
    name: "DevNet",
    url: "https://node.devnet.example",
    readOnlyUrl: "https://readonly.devnet.example",
    adminUrl: "https://admin.devnet.example",
    shardId: "root",
    graphqlUrl: "https://graphql.devnet.example",
};

export const networksFixture: TxHistoryNetwork[] = [
    selectedNetworkFixture,
    {
        id: "testnet",
        name: "TestNet",
        url: "https://node.testnet.example",
        graphqlUrl: "https://graphql.testnet.example",
    },
    {
        id: "mainnet",
        name: "MainNet",
        url: "https://node.mainnet.example",
        graphqlUrl: "https://graphql.mainnet.example",
    },
];

export const transactionsFixture: Transaction[] = [
    {
        id: "tx-001",
        type: "send",
        status: "confirmed",
        from: selectedAccountFixture.revAddress,
        to: "1111Gh3yL7v7dFQdWxYyF1gzzc8zU8x4ZQxne4U4kZxVTpeUhhUUt",
        amount: "12.5",
        timestamp: new Date("2026-04-24T13:16:00"),
        network: "DevNet",
        note: "Transfer to validator wallet",
        deployId:
            "b9182d0c15f20e3f5ebacb189f6d91579f9e7b845889e5de61132cf1023f5a3d",
        blockHash:
            "d74f7e5b690d8148c39769af2f3f81de668fbaf96a6efaf2e8ba9f83ab5a0b5e",
    },
    {
        id: "tx-002",
        type: "receive",
        status: "confirmed",
        from: "1111NNo7ssbTRfD6Mu7Nrfd28Wkcq44VD7gYNWcFrKdfrz8zm7z4A",
        to: selectedAccountFixture.revAddress,
        amount: "8",
        timestamp: new Date("2026-04-25T09:32:00"),
        network: "DevNet",
        note: "Incoming transfer",
        blockHash:
            "be2f7396cf5be3ea9b5e4f675f3dbda81d7347cf594ab47cce0b88e8f88dfdd4",
    },
    {
        id: "tx-003",
        type: "deploy",
        status: "pending",
        from: selectedAccountFixture.revAddress,
        amount: "0.125",
        timestamp: new Date("2026-04-26T18:45:00"),
        network: "TestNet",
        note: "Contract deployment",
        deployId:
            "9bd419bfc4c8e3a47db33c93002fc2b1ef958cc12e2db5315f679c9a87ce9876",
    },
    {
        id: "tx-004",
        type: "send",
        status: "failed",
        from: selectedAccountFixture.revAddress,
        to: "1111GxXRhvYuXcoyCKLBq7SVyPWuqqq3BU48ZiqzUanAxAhMxnnff",
        amount: "4.75",
        timestamp: new Date("2026-04-27T10:08:00"),
        network: "DevNet",
        note: "Insufficient phlo limit",
        deployId:
            "2b16fc7879e9b37a5c9d7a8292963543995dfd4323c4b979f996afc74723f5aa",
    },
];

export const getTokenDisplayName = (): string => "REV";

export const formatAddress = (address: string): string => {
    if (!address) return "";

    if (address === "Unknown") return address;

    return `${address.substring(0, 10)}...${address.substring(
        address.length - 8,
    )}`;
};

export const formatAmount = (amount?: string): string => {
    if (!amount) return "-";

    const amountNumber = parseFloat(amount);

    if (Number.isNaN(amountNumber)) {
        return `${amount} ${getTokenDisplayName()}`;
    }

    return `${amountNumber.toFixed(8)} ${getTokenDisplayName()}`;
};

export const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString();
};

export const calculateTransactionStats = (
    transactions: Transaction[],
): TransactionStats => ({
    total: transactions.length,
    sent: transactions.filter((tx) => tx.type === "send").length,
    received: transactions.filter((tx) => tx.type === "receive").length,
    deployed: transactions.filter((tx) => tx.type === "deploy").length,
    pending: transactions.filter((tx) => tx.status === "pending").length,
    confirmed: transactions.filter((tx) => tx.status === "confirmed").length,
    failed: transactions.filter((tx) => tx.status === "failed").length,
});

export const applyTransactionFilter = (
    transactions: Transaction[],
    filter: TransactionFilter,
): Transaction[] => {
    let filteredTransactions = transactions;

    if (filter.type) {
        filteredTransactions = filteredTransactions.filter(
            (tx) => tx.type === filter.type,
        );
    }

    if (filter.status) {
        filteredTransactions = filteredTransactions.filter(
            (tx) => tx.status === filter.status,
        );
    }

    if (filter.network) {
        filteredTransactions = filteredTransactions.filter(
            (tx) => tx.network === filter.network,
        );
    }

    if (filter.startDate) {
        const startDate = new Date(filter.startDate);
        startDate.setHours(0, 0, 0, 0);
        filteredTransactions = filteredTransactions.filter(
            (tx) => new Date(tx.timestamp) >= startDate,
        );
    }

    if (filter.endDate) {
        const endDate = new Date(filter.endDate);
        endDate.setHours(23, 59, 59, 999);
        filteredTransactions = filteredTransactions.filter(
            (tx) => new Date(tx.timestamp) <= endDate,
        );
    }

    return filteredTransactions;
};

export const hasActiveTransactionFilters = (
    filter: TransactionFilter,
): boolean => {
    return !!(
        filter.type ||
        filter.status ||
        filter.network ||
        filter.startDate ||
        filter.endDate
    );
};

export const TransactionHistoryService = {
    async getTransactions(
        revAddress: string,
        publicKey: string,
        networkName: string,
        graphqlUrl: string,
        limit: number,
    ): Promise<Transaction[]> {
        void revAddress;
        void publicKey;
        void networkName;
        void graphqlUrl;

        return transactionsFixture.slice(0, limit);
    },

    async downloadTransactions(
        format: "json" | "csv",
        revAddress: string,
        publicKey: string,
        networkName: string,
        graphqlUrl: string,
    ): Promise<void> {
        void format;
        void revAddress;
        void publicKey;
        void networkName;
        void graphqlUrl;
    },

    async syncFromBlockchain(
        revAddress: string,
        publicKey: string,
        networkName: string,
        graphqlUrl: string,
    ): Promise<void> {
        void revAddress;
        void publicKey;
        void networkName;
        void graphqlUrl;
    },

    detectReceivedTransaction(
        revAddress: string,
        oldBalance: string,
        newBalance: string,
        networkName: string,
    ): void {
        void revAddress;
        void oldBalance;
        void newBalance;
        void networkName;
    },
};

export const TransactionPollingService = {
    forceCheck(): void {},
};

export const fetchBalance = async ({
    account,
    network,
    forceRefresh,
}: {
    account: TxHistoryAccount;
    network: TxHistoryNetwork;
    forceRefresh?: boolean;
}): Promise<{ balance: string }> => {
    void account;
    void network;
    void forceRefresh;

    return { balance: selectedAccountFixture.balance || "0" };
};
