import { Transaction } from "@domains/aggregates/Transaction";
import { TransactionFilter, TransactionStats } from "./types";
import { Network } from "@domains/aggregates/Network";

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

export const applyTransactionFilter = (
    transactions: Transaction[],
    filter: TransactionFilter | null,
    network: Network,
): Transaction[] => {
    let filteredTransactions = transactions;
    filteredTransactions = filteredTransactions.filter(
        (tx) => tx.networkName === network.name,
    );
    if (!filter) {
        return filteredTransactions;
    }

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
