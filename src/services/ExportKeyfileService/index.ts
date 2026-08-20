import {
    ASI_WALLET_KEYFILE_VERSION,
    ExportFormat,
    KeyfileTypes,
    TRANSACTIONS_CSV_HEADERS,
} from "@config/index";
import Account from "@domains/Account";
import Wallet from "@domains/Wallet";
import { Transaction } from "@domains/Transaction";
import SecretsProvider from "@domains/SecretsProvider";
import {
    InvalidKeyfileError,
    InvalidKeyfilePasswordError,
} from "@domains/CustomError";
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

    private static createKeyfileEnvelope(type: KeyfileTypes): IKeyfileEnvelope {
        return {
            version: ASI_WALLET_KEYFILE_VERSION,
            type,
            timestamp: new Date().toISOString(),
        };
    }

    public static exportAccountKeyfile(account: Account): IAccountKeyfile {
        return {
            ...ExportKeyfileService.createKeyfileEnvelope(KeyfileTypes.ACCOUNT),
            account: KeyfileSerializer.serializeAccount(account),
        };
    }

    public static async exportWalletKeyfile(
        wallet: Wallet,
        passwordProvider: SecretsProvider,
    ): Promise<IWalletKeyfile> {
        if (!(await wallet.isPasswordValid(passwordProvider))) {
            throw new InvalidKeyfilePasswordError(
                "Wallet keyfile cannot be exported with the provided password",
            );
        }

        let serializedWallet: IKeyfileWallet;

        try {
            serializedWallet = await KeyfileSerializer.serializeWallet(
                wallet,
                passwordProvider,
            );
        } catch {
            throw new InvalidKeyfileError("Wallet keyfile cannot be created");
        }

        return {
            ...ExportKeyfileService.createKeyfileEnvelope(KeyfileTypes.WALLET),
            ...serializedWallet,
        };
    }

    private static escapeCsvValue(value: string): string {
        return `"${value.replace(/"/g, '""')}"`;
    }

    public static transactionsToCsv(transactions: Transaction[]): string {
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

    public static exportTransactions(
        transactions: Transaction[],
        format: ExportFormat = ExportFormat.JSON,
    ): string {
        switch (format) {
            case ExportFormat.JSON:
                return ExportKeyfileService.toJSON(transactions);
            case ExportFormat.CSV:
                return ExportKeyfileService.transactionsToCsv(transactions);
        }
    }
}
