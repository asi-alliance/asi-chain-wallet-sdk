import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import Signer, { ISignerRecord, WalletTypes } from "@domains/Signer";
import Account, { IAccountRecord } from "@domains/Account";
import { ISignerStorageRecord } from "@domains/SignersStorageRepository/index";
import {
    SIGNERS_DATA_KEY,
    SignersStorageRepository,
} from "@domains/SignersStorageRepository";
import {
    ACCOUNTS_DATA_KEY,
    AccountsStorageRepository,
    IAccountStorageRecord,
} from "@domains/AccountsStorageRepository";
import { StorageMetadataStorageRepository } from "@domains/StorageMetadataStorageRepository";
import { INSENSITIVE_CACHE_TABLE_KEY } from "@domains/InsensitiveCacheStorageRepository";
import StorageMigrationRunner from "@services/StorageMigrationRunner";
import {
    INetworkRecord,
    IPersistedNetworkRecord,
    NetworkId,
} from "@domains/Network";
import { EncryptedData } from "@services/Crypto";
import {
    TRANSACTION_RESERVATIONS_DATA_KEY,
    TransactionReservationsStorageRepository,
    ITransactionReservationsStorageRecord,
} from "@domains/TransactionReservationsStorageRepository";
import {
    CUSTOM_NETWORKS_DATA_KEY,
    CustomNetworksStorageRepository,
    ICustomNetworkStorageRecord,
} from "@domains/CustomNetworksStorageRepository";
import { IStorageFabricOptions } from "@fabrics/storage";

const MIGRATABLE_TABLES: string[] = [
    SIGNERS_DATA_KEY,
    ACCOUNTS_DATA_KEY,
    TRANSACTION_RESERVATIONS_DATA_KEY,
    CUSTOM_NETWORKS_DATA_KEY,
    INSENSITIVE_CACHE_TABLE_KEY,
];

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
    signer: ISignerStorageRecord;
    accounts: IAccountRecord[];
}

export interface ISaveTransactionReservationsOptions {
    id: string;
    networkId: NetworkId;
    signerId: string;
    encryptedData: EncryptedData;
}

class StorageManager {
    private static runMigrations = async (): Promise<void> => {
        const runner: StorageMigrationRunner = new StorageMigrationRunner({
            storage: SignersStorageRepository.getInstance().getRawDB(),
            metadataRepository: StorageMetadataStorageRepository.getInstance(),
            tables: MIGRATABLE_TABLES,
        });

        await runner.run();
    };

    public static init = async (
        options?: IStorageFabricOptions,
    ): Promise<void> => {
        await SignersStorageRepository.getInstance(options).initialize();
        await AccountsStorageRepository.getInstance(options).initialize();
        await TransactionReservationsStorageRepository.getInstance(
            options,
        ).initialize();
        await CustomNetworksStorageRepository.getInstance(options).initialize();
        await StorageMetadataStorageRepository.getInstance(
            options,
        ).initialize();

        await StorageManager.runMigrations();
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
            signer.getEncryptedDataKey(),
            signer.getFingerprint(),
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
                    signerOption.signer.getEncryptedDataKey(),
                    signerOption.signer.getFingerprint(),
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
            encryptedDataKey: signerStorageRecord.encryptedDataKey,
            fingerprint: signerStorageRecord.fingerprint,
        };
    };

    public static getSigners = async (): Promise<ISignerStorageRecord[]> => {
        return SignersStorageRepository.getInstance().getAllSigners();
    };

    public static findSignerByFingerprint = async (
        fingerprint: string,
    ): Promise<ISignerStorageRecord | null> => {
        return SignersStorageRepository.getInstance().findSignerByFingerprint(
            fingerprint,
        );
    };

    public static updateSigner = async (
        id: string,
        updates: Partial<ISignerStorageRecord>,
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
            account.getFingerprint(),
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
                fingerprint: account.getFingerprint(),
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

    public static getAccounts = async (): Promise<IAccountStorageRecord[]> => {
        return AccountsStorageRepository.getInstance().getAllAccounts();
    };

    public static getAccountsBySignerId = async (
        signerId: string,
    ): Promise<IAccountStorageRecord[]> => {
        return AccountsStorageRepository.getInstance().getAccountsBySignerId(
            signerId,
        );
    };

    public static findAccountByFingerprint = async (
        fingerprint: string,
    ): Promise<IAccountStorageRecord | null> => {
        return AccountsStorageRepository.getInstance().findAccountByFingerprint(
            fingerprint,
        );
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

        const accountRecords: IAccountRecord[] =
            await StorageManager.getAccountsBySignerId(signerId);

        return Wallet.restore(
            { signerRecord, accountRecords },
            passwordProvider,
        );
    };

    public static getWallets = async (): Promise<IWalletStorageData[]> => {
        const signerRecords: ISignerStorageRecord[] =
            await StorageManager.getSigners();

        const accountRecords: IAccountRecord[] =
            await StorageManager.getAccounts();

        return signerRecords.map((signerRecord: ISignerStorageRecord) => ({
            signer: signerRecord,
            accounts: accountRecords.filter(
                (accountRecord: IAccountRecord) =>
                    accountRecord.signerId === signerRecord.id,
            ),
        }));
    };

    public static saveTransactionReservation = async ({
        id,
        networkId,
        signerId,
        encryptedData,
    }: ISaveTransactionReservationsOptions): Promise<void> => {
        await TransactionReservationsStorageRepository.getInstance().saveTransactionReservation(
            id,
            networkId,
            signerId,
            encryptedData,
        );
    };

    public static getTransactionReservationsBySignerId = async (
        signerId: string,
    ): Promise<ITransactionReservationsStorageRecord[]> => {
        return TransactionReservationsStorageRepository.getInstance().getTransactionReservationsBySignerId(
            signerId,
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

    public static getCustomNetworks = async (): Promise<
        IPersistedNetworkRecord[]
    > => {
        const records: ICustomNetworkStorageRecord[] =
            await CustomNetworksStorageRepository.getInstance().getAllCustomNetworks();

        return records.map((record: ICustomNetworkStorageRecord) => ({
            id: record.id,
            name: record.name,
            config: record.config,
        }));
    };

    public static saveCustomNetwork = async (
        network: INetworkRecord,
    ): Promise<void> => {
        await CustomNetworksStorageRepository.getInstance().saveCustomNetwork(
            network.id,
            network.name,
            network.config,
        );
    };

    public static updateCustomNetwork = async (
        network: INetworkRecord,
    ): Promise<void> => {
        await CustomNetworksStorageRepository.getInstance().updateCustomNetwork(
            network.id,
            {
                name: network.name,
                config: network.config,
                updatedAt: Date.now(),
            },
        );
    };

    public static deleteCustomNetwork = async (
        id: NetworkId,
    ): Promise<void> => {
        await CustomNetworksStorageRepository.getInstance().deleteCustomNetwork(
            id,
        );
    };

    public static clear = async (): Promise<void> => {
        await SignersStorageRepository.getInstance().clearAllData();
        await AccountsStorageRepository.getInstance().clearAllData();
        await TransactionReservationsStorageRepository.getInstance().clearAllData();
        await CustomNetworksStorageRepository.getInstance().clearAllData();
    };

    public static close = (): void => {
        SignersStorageRepository.getInstance().close();
        AccountsStorageRepository.getInstance().close();
        TransactionReservationsStorageRepository.getInstance().close();
        CustomNetworksStorageRepository.getInstance().close();
        StorageMetadataStorageRepository.getInstance().close();
    };
}

export default StorageManager;
