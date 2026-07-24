import {
    ASI_WALLET_KEYFILE,
    ASI_WALLET_KEYFILE_VERSION,
    ExportFormat,
    TRANSACTIONS_CSV_HEADERS,
} from "@config/index";
import { Transaction } from "@domains/Transaction";
import { EncryptedData } from "@services/Crypto";

export interface IAccountKeyfileInput {
    address: string;
    encryptedPrivateKey: EncryptedData;
}

export default class ExportService {
    public static exportAccountKeyfile(input: IAccountKeyfileInput): string {
        return JSON.stringify(
            {
                version: ASI_WALLET_KEYFILE_VERSION,
                type: ASI_WALLET_KEYFILE,
                address: input.address,
                encryptedPrivateKey: input.encryptedPrivateKey,
                timestamp: new Date().toISOString(),
            },
            null,
            2,
        );
    }

    public static exportTransactions(
        transactions: Transaction[],
        format: ExportFormat = ExportFormat.JSON,
    ): string {
        if (format === ExportFormat.JSON) {
            return JSON.stringify(transactions, null, 2);
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
                .map(ExportService.escapeCsvValue)
                .join(",");
        });

        return [
            TRANSACTIONS_CSV_HEADERS.map(ExportService.escapeCsvValue).join(","),
            ...rows,
        ].join("\r\n");
    }

    private static escapeCsvValue(value: string): string {
        return `"${value.replace(/"/g, '""')}"`;
    }
}