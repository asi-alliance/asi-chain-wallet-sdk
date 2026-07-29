import { NetworkId } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";
import { IStorageFabricOptions } from "@utils/fabrics/storage";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";
import { EncryptedData } from "@services/Crypto";

const TRANSACTION_RESERVATIONS_DATA_KEY: string = "TRANSACTION_RESERVATIONS";

export interface ITransactionReservationsStorageRecord extends ITableRecord {
    networkId: NetworkId;
    signerId: string;
    encryptedData: EncryptedData;

    createdAt: number;
    updatedAt?: number;
}

export class TransactionReservationsStorageRepository extends BaseStorageRepository<ITransactionReservationsStorageRecord> {
    private static instance: TransactionReservationsStorageRepository;

    public constructor(options?: IStorageFabricOptions) {
        super(TRANSACTION_RESERVATIONS_DATA_KEY, options);
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

    public async saveTransactionReservation(
        id: string,
        networkId: NetworkId,
        signerId: string,
        encryptedData: EncryptedData,
    ): Promise<void> {
        await this.insertRecord({
            id,
            networkId,
            signerId,
            encryptedData,
            createdAt: Date.now(),
        });
    }

    public async getTransactionReservations(
        id: string,
    ): Promise<ITransactionReservationsStorageRecord | null> {
        return this.getRecordById(id);
    }

    public async getAllTransactionReservations(): Promise<
        ITransactionReservationsStorageRecord[]
    > {
        return this.getAllRecords();
    }

    public async updateTransactionReservation(
        id: string,
        updates: Partial<ITransactionReservationsStorageRecord>,
    ): Promise<void> {
        await this.updateRecord(id, updates);
    }

    public async deleteTransactionReservation(id: string): Promise<void> {
        await this.deleteRecord(id);
    }

    public async deleteMultipleTransactionReservations(
        ids: string[],
    ): Promise<void> {
        await this.deleteManyRecords(ids);
    }

    public async hasTransactionReservations(id: string): Promise<boolean> {
        return this.hasRecord(id);
    }

    public async getTransactionReservationsCount(): Promise<number> {
        return this.getRecordsCount();
    }
}

export { TRANSACTION_RESERVATIONS_DATA_KEY };
