import { IStorageFabricOptions } from "@fabrics/Storage";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";
import { EncryptedData } from "@services/Crypto";
import { ITableRecord } from "@domains/TableService";
import { WalletTypes } from "@domains/Signer";

const SIGNERS_DATA_KEY: string = "SIGNERS";

export interface IPrivateKeySignerEncryptedFields {
    keyData: Uint8Array;
}

export interface IHDSignerEncryptedFields {
    seed: string;
    rootHDPath: string;
}

export interface ISignerStorageRecord extends ITableRecord {
    type: WalletTypes;
    encryptedData: EncryptedData;

    createdAt: number;
    updatedAt?: number;
}

export class SignersStorageRepository extends BaseStorageRepository<ISignerStorageRecord> {
    private static instance: SignersStorageRepository;

    public constructor(options?: IStorageFabricOptions) {
        super(SIGNERS_DATA_KEY, options);
    }

    public static getInstance(
        options?: IStorageFabricOptions,
    ): SignersStorageRepository {
        if (!SignersStorageRepository.instance) {
            SignersStorageRepository.instance = new SignersStorageRepository(
                options,
            );
        }
        return SignersStorageRepository.instance;
    }

    public async saveSigner(
        signerId: string,
        type: WalletTypes,
        encryptedData: EncryptedData,
    ): Promise<void> {
        await this.insertRecord({
            id: signerId,
            type,
            encryptedData,
            createdAt: Date.now(),
        });
    }

    public async getSigner(id: string): Promise<ISignerStorageRecord | null> {
        return this.getRecordById(id);
    }

    public async getAllSigners(): Promise<ISignerStorageRecord[]> {
        return this.getAllRecords();
    }

    public async updateSigner(
        signerId: string,
        updates: Partial<ISignerStorageRecord>,
    ): Promise<void> {
        await this.updateRecord(signerId, updates);
    }

    public async deleteSigner(signerId: string): Promise<void> {
        await this.deleteRecord(signerId);
    }

    public async deleteMultipleSigners(signerIds: string[]): Promise<void> {
        await this.deleteManyRecords(signerIds);
    }

    public async hasSigner(signerId: string): Promise<boolean> {
        return this.hasRecord(signerId);
    }

    public async getSignersCount(): Promise<number> {
        return this.getRecordsCount();
    }
}

export { SIGNERS_DATA_KEY };