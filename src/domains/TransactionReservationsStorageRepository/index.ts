import { NetworkName } from "@domains/Network";
import { ITableRecord, ITableService } from "@domains/TableService";
import { IStorageFabricOptions, storageFabric } from "@fabrics/Storage";
import { EncryptedData } from "@services/Crypto";

const TRANSACTION_RESERVATIONS_DATA_KEY: string = "TRANSACTION_RESERVATIONS";

export interface ITransactionReservationsStorageRecord extends ITableRecord {
    networkName: NetworkName;
    signerId: string;
    encryptedData: EncryptedData;

    createdAt: number;
    updatedAt?: number;
}

export class TransactionReservationsStorageRepository {
    private static instance: TransactionReservationsStorageRepository;
    private storageInterface: ITableService<ITableRecord>;
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    public constructor(options?: IStorageFabricOptions) {
        this.storageInterface = storageFabric(options);
    }

    public static getInstance(
        options?: IStorageFabricOptions,
    ): TransactionReservationsStorageRepository {
        if (!TransactionReservationsStorageRepository.instance) {
            TransactionReservationsStorageRepository.instance =
                new TransactionReservationsStorageRepository(options);
        }
        return TransactionReservationsStorageRepository.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInitialize();

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    private async doInitialize(): Promise<void> {
        const tableExists = await this.storageInterface.tableExists(
            TRANSACTION_RESERVATIONS_DATA_KEY,
        );

        if (!tableExists) {
            await this.storageInterface.createTable(
                TRANSACTION_RESERVATIONS_DATA_KEY,
                "id",
            );
        }

        this.isInitialized = true;
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public getRawDB(): ITableService<ITableRecord> {
        return this.storageInterface;
    }

    public async saveTransactionReservation(
        id: string,
        networkName: NetworkName,
        signerId: string,
        encryptedData: EncryptedData,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.insert(TRANSACTION_RESERVATIONS_DATA_KEY, {
            id,
            networkName,
            signerId,
            encryptedData,
            createdAt: Date.now(),
        });
    }

    public async getTransactionReservations(
        id: string,
    ): Promise<ITransactionReservationsStorageRecord | null> {
        await this.ensureInitialized();

        return this.storageInterface.getById(
            TRANSACTION_RESERVATIONS_DATA_KEY,
            id,
        ) as Promise<ITransactionReservationsStorageRecord | null>;
    }

    public async getAllTransactionReservations(): Promise<
        ITransactionReservationsStorageRecord[]
    > {
        await this.ensureInitialized();

        return this.storageInterface.getAll(
            TRANSACTION_RESERVATIONS_DATA_KEY,
        ) as Promise<ITransactionReservationsStorageRecord[]>;
    }

    public async updateTransactionReservation(
        id: string,
        updates: Partial<ITransactionReservationsStorageRecord>,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.update(
            TRANSACTION_RESERVATIONS_DATA_KEY,
            id,
            updates,
        );
    }

    public async deleteTransactionReservation(id: string): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.delete(
            TRANSACTION_RESERVATIONS_DATA_KEY,
            id,
        );
    }

    public async deleteMultipleTransactionReservations(
        ids: string[],
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.deleteMany(
            TRANSACTION_RESERVATIONS_DATA_KEY,
            ids,
        );
    }

    public async hasTransactionReservations(id: string): Promise<boolean> {
        await this.ensureInitialized();

        const record = await this.getTransactionReservations(id);

        return record !== null;
    }

    public async getTransactionReservationsCount(): Promise<number> {
        await this.ensureInitialized();

        const records = await this.getAllTransactionReservations();

        return records.length;
    }

    public async clearAllData(): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.clearTable(
            TRANSACTION_RESERVATIONS_DATA_KEY,
        );
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (tableName !== TRANSACTION_RESERVATIONS_DATA_KEY) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        await this.storageInterface.clearTable(tableName);
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public async getTablesList(): Promise<string[]> {
        await this.ensureInitialized();

        return [TRANSACTION_RESERVATIONS_DATA_KEY];
    }

    public close(): void {
        this.storageInterface.close();
        this.isInitialized = false;
    }
}

export { TRANSACTION_RESERVATIONS_DATA_KEY };
