import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import Signer, { ISignerRecord, WalletTypes } from "@domains/Signer";
import Account, { IAccountRecord } from "@domains/Account";
import { ISignerStorageRecord } from "@domains/SignersStorageRepository/index";
import { SignersStorageRepository } from "@domains/SignersStorageRepository";
import {
    AccountsStorageRepository,
    IAccountStorageRecord,
} from "@domains/AccountsStorageRepository";
import { EncryptedData } from "@services/Crypto";
import { NetworkName } from "@domains/Network";
import {
    TransactionReservationsStorageRepository,
    ITransactionReservationsStorageRecord,
} from "@domains/TransactionReservationsStorageRepository";
import { IStorageFabricOptions } from "@fabrics/Storage";

export interface ISaveSignerToStorageOptions {
    id: string;
    type: WalletTypes;
    signer: Signer;
}

export interface ISaveAccountToStorageOptions {
    id: string;
    account: Account;
    signerId: string;
}

export interface ISaveWalletToStorageOptions {
    signerId: string;
    wallet: Wallet;
}

export interface IGetWalletFromStorageOptions {
    signerId: string;
    passwordProvider: SecretsProvider;
}

export interface IWalletStorageData {
    signer: ISignerRecord;
    accounts: IAccountRecord[];
}

export interface ISaveTransactionReservationsOptions {
    id: string;
    networkName: NetworkName;
    signerId: string;
    encryptedData: EncryptedData;
}

class StorageManager {
    public static init = async (
        options?: IStorageFabricOptions,
    ): Promise<void> => {
        await SignersStorageRepository.getInstance(options).initialize();
        await AccountsStorageRepository.getInstance(options).initialize();
        await TransactionReservationsStorageRepository.getInstance(
            options,
        ).initialize();
    };

    public static saveSigner = async ({
        id,
        type,
        signer,
    }: ISaveSignerToStorageOptions): Promise<void> => {
        await SignersStorageRepository.getInstance().saveSigner(
            id,
            type,
            signer.getEncryptedSecret(),
        );
    };

    public static saveSigners = async (
        signersOptions: ISaveSignerToStorageOptions[],
    ): Promise<void[]> => {
        return Promise.all(
            signersOptions.map((signerOption: ISaveSignerToStorageOptions) =>
                SignersStorageRepository.getInstance().saveSigner(
                    signerOption.id,
                    signerOption.type,
                    signerOption.signer.getEncryptedSecret(),
                ),
            ),
        );
    };

    public static getSigner = async (id: string): Promise<ISignerRecord> => {
        const signerStorageRecord: ISignerStorageRecord | null =
            await SignersStorageRepository.getInstance().getSigner(id);

        if (!signerStorageRecord) {
            throw new Error("Signer with this id not found");
        }

        return {
            id: signerStorageRecord.id,
            type: signerStorageRecord.type,
            encryptedData: signerStorageRecord.encryptedData,
        };
    };

    public static getSigners = async (): Promise<ISignerRecord[]> => {
        return SignersStorageRepository.getInstance().getAllSigners();
    };

    public static updateSigner = async (
        id: string,
        updates: Partial<ISignerRecord>,
    ): Promise<void> => {
        await SignersStorageRepository.getInstance().updateSigner(id, updates);
    };

    public static deleteSigner = async (id: string): Promise<void> => {
        await SignersStorageRepository.getInstance().deleteSigner(id);
    };

    public static deleteMultipleSigners = async (
        ids: string[],
    ): Promise<void> => {
        await SignersStorageRepository.getInstance().deleteMultipleSigners(ids);
    };

    public static saveAccount = async ({
        id,
        account,
        signerId,
    }: ISaveAccountToStorageOptions): Promise<void> => {
        await AccountsStorageRepository.getInstance().saveAccount(
            id,
            signerId,
            account.getName(),
            account.getIndex(),
        );
    };

    public static saveAccounts = async (
        accountsOptions: ISaveAccountToStorageOptions[],
    ): Promise<void> => {
        const records: IAccountStorageRecord[] = accountsOptions.map(
            ({ id, account, signerId }) => ({
                id,
                signerId,
                name: account.getName(),
                index: account.getIndex(),
                createdAt: Date.now(),
            }),
        );

        await AccountsStorageRepository.getInstance().saveAccounts(records);
    };

    public static getAccount = async (id: string): Promise<IAccountRecord> => {
        const accountStorageRecord: IAccountStorageRecord | null =
            await AccountsStorageRepository.getInstance().getAccount(id);

        if (!accountStorageRecord) {
            throw new Error("Account with this id not found");
        }

        return accountStorageRecord;
    };

    public static getAccounts = async (): Promise<IAccountRecord[]> => {
        return AccountsStorageRepository.getInstance().getAllAccounts();
    };

    public static updateAccount = async (
        id: string,
        updates: Partial<IAccountRecord>,
    ): Promise<void> => {
        await AccountsStorageRepository.getInstance().updateAccount(
            id,
            updates,
        );
    };

    public static deleteAccount = async (id: string): Promise<void> => {
        await AccountsStorageRepository.getInstance().deleteAccount(id);
    };

    public static deleteMultipleAccounts = async (
        ids: string[],
    ): Promise<void> => {
        await AccountsStorageRepository.getInstance().deleteMultipleAccounts(
            ids,
        );
    };

    public static saveWallet = async ({
        signerId,
        wallet,
    }: ISaveWalletToStorageOptions): Promise<void> => {
        const signer: Signer = wallet.getSigner();

        await StorageManager.saveSigner({
            id: signerId,
            type: wallet.getType(),
            signer,
        });

        await StorageManager.saveAccounts(
            Array.from(wallet.getAccountsMap()).map(
                ([accountId, account]: [string, Account]) => ({
                    id: accountId,
                    account,
                    signerId,
                }),
            ),
        );
    };

    public static saveWallets = async (
        walletsOptions: ISaveWalletToStorageOptions[],
    ): Promise<void[]> => {
        return Promise.all(
            walletsOptions.map((walletOption: ISaveWalletToStorageOptions) =>
                StorageManager.saveWallet(walletOption),
            ),
        );
    };

    public static getWallet = async ({
        signerId,
        passwordProvider,
    }: IGetWalletFromStorageOptions): Promise<Wallet> => {
        const signerRecord: ISignerRecord =
            await StorageManager.getSigner(signerId);

        const accountRecords: IAccountRecord[] = (
            await StorageManager.getAccounts()
        ).filter(
            (accountRecord: IAccountRecord) =>
                accountRecord.signerId === signerId,
        );

        return Wallet.restore(
            { signerRecord, accountRecords },
            passwordProvider,
        );
    };

    public static getWallets = async (): Promise<IWalletStorageData[]> => {
        const signerRecords: ISignerRecord[] =
            await StorageManager.getSigners();

        const accountRecords: IAccountRecord[] =
            await StorageManager.getAccounts();

        return signerRecords.map((signerRecord: ISignerRecord) => ({
            signer: signerRecord,
            accounts: accountRecords.filter(
                (accountRecord: IAccountRecord) =>
                    accountRecord.signerId === signerRecord.id,
            ),
        }));
    };

    public static saveTransactionReservation = async ({
        id,
        networkName,
        signerId,
        encryptedData,
    }: ISaveTransactionReservationsOptions): Promise<void> => {
        await TransactionReservationsStorageRepository.getInstance().saveTransactionReservation(
            id,
            networkName,
            signerId,
            encryptedData,
        );
    };

    public static getTransactionReservationsBySignerId = async (
        signerId: string,
        networkName: NetworkName,
    ): Promise<ITransactionReservationsStorageRecord[]> => {
        const records =
            await TransactionReservationsStorageRepository.getInstance().getAllTransactionReservations();

        return records.filter(
            (record: ITransactionReservationsStorageRecord) =>
                record.signerId === signerId &&
                record.networkName === networkName,
        );
    };

    public static updateTransactionReservation = async (
        id: string,
        updates: Partial<ITransactionReservationsStorageRecord>,
    ): Promise<void> => {
        await TransactionReservationsStorageRepository.getInstance().updateTransactionReservation(
            id,
            updates,
        );
    };

    public static deleteTransactionReservation = async (
        id: string,
    ): Promise<void> => {
        await TransactionReservationsStorageRepository.getInstance().deleteTransactionReservation(
            id,
        );
    };

    public static deleteMultipleTransactionReservations = async (
        ids: string[],
    ): Promise<void> => {
        await TransactionReservationsStorageRepository.getInstance().deleteMultipleTransactionReservations(
            ids,
        );
    };

    public static clear = async (): Promise<void> => {
        await SignersStorageRepository.getInstance().clearAllData();
        await AccountsStorageRepository.getInstance().clearAllData();
        await TransactionReservationsStorageRepository.getInstance().clearAllData();
    };

    public static close = (): void => {
        SignersStorageRepository.getInstance().close();
        AccountsStorageRepository.getInstance().close();
        TransactionReservationsStorageRepository.getInstance().close();
    };
}

export default StorageManager;
