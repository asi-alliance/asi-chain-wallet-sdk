import {
    ASI_WALLET_KEYFILE,
    ASI_WALLET_KEYFILE_VERSION,
    ExportFormat,
    TRANSACTIONS_CSV_HEADERS,
} from "@config/index";
import Account from "@domains/Account";
import Wallet from "@domains/Wallet";
import { Transaction } from "@domains/Transaction";
import KeyfileSerializer, {
    IKeyfileAccount,
    IKeyfileWallet,
} from "@services/KeyfileSerializer";

export interface IKeyfileEnvelope {
    version: number;
    type: string;
    timestamp: string;
}

export interface IAccountKeyfile extends IKeyfileEnvelope {
    account: IKeyfileAccount;
}

export interface IWalletKeyfile extends IKeyfileEnvelope, IKeyfileWallet {}

const JSON_REPLACER: Parameters<typeof JSON.stringify>[1] = null;
const JSON_INDENT: Parameters<typeof JSON.stringify>[2] = 2;

export default class ExportKeyfileService {
    public static toJSON(data: unknown): string {
        return JSON.stringify(data, JSON_REPLACER, JSON_INDENT);
    }

    private static createKeyfileEnvelope(): IKeyfileEnvelope {
        return {
            version: ASI_WALLET_KEYFILE_VERSION,
            type: ASI_WALLET_KEYFILE,
            timestamp: new Date().toISOString(),
        };
    }

    public static exportAccountKeyfile(account: Account): IAccountKeyfile {
        return {
            ...ExportKeyfileService.createKeyfileEnvelope(),
            account: KeyfileSerializer.serializeAccount(account),
        };
    }

    public static exportWalletKeyfile(wallet: Wallet): IWalletKeyfile {
        return {
            ...ExportKeyfileService.createKeyfileEnvelope(),
            ...KeyfileSerializer.serializeWallet(wallet),
        };
    }

    public static exportTransactions(
        transactions: Transaction[],
        format: ExportFormat = ExportFormat.JSON,
    ): string {
        if (format === ExportFormat.JSON) {
            return ExportKeyfileService.toJSON(transactions);
        }

        const rows: string[] = transactions.map((transaction: Transaction) => {
            const date: Date = new Date(transaction.timestamp);

            return [
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                transaction.type,
                transaction.status,
                transaction.from,
                transaction.to ?? "",
                transaction.amount ?? "",
                transaction.gasCost ?? "",
                transaction.deployId ?? "",
                transaction.blockHash ?? "",
                transaction.networkId,
                transaction.note ?? "",
            ]
                .map(ExportKeyfileService.escapeCsvValue)
                .join(",");
        });

        return [
            TRANSACTIONS_CSV_HEADERS.map(
                ExportKeyfileService.escapeCsvValue,
            ).join(","),
            ...rows,
        ].join("\r\n");
    }

    private static escapeCsvValue(value: string): string {
        return `"${value.replace(/"/g, '""')}"`;
    }
}