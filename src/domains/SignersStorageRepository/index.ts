import { IStorageFabricOptions, storageFabric } from "@fabrics/Storage";
import { EncryptedData } from "@services/Crypto";
import { ITableRecord, ITableService } from "@domains/TableService";
import { WalletTypes } from "@domains/Wallet";

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

export class SignersStorageRepository {
    private static instance: SignersStorageRepository;
    private storageInterface: ITableService<ITableRecord>;
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    public constructor(options?: IStorageFabricOptions) {
        this.storageInterface = storageFabric(options);
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
        try {
            const signersTableExists =
                await this.storageInterface.tableExists(SIGNERS_DATA_KEY);

            if (!signersTableExists) {
                await this.storageInterface.createTable(SIGNERS_DATA_KEY, "id");
            }

            this.isInitialized = true;
        } catch (error) {
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public getRawDB(): ITableService<ITableRecord> {
        return this.storageInterface;
    }

    public async saveSigner(
        signerId: string,
        type: WalletTypes,
        encryptedData: EncryptedData,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.insert(SIGNERS_DATA_KEY, {
            id: signerId,
            type,
            encryptedData,
            createdAt: Date.now(),
        });
    }

    public async getSigner(id: string): Promise<ISignerStorageRecord | null> {
        await this.ensureInitialized();

        return this.storageInterface.getById(
            SIGNERS_DATA_KEY,
            id,
        ) as Promise<ISignerStorageRecord | null>;
    }

    public async getAllSigners(): Promise<ISignerStorageRecord[]> {
        await this.ensureInitialized();

        return this.storageInterface.getAll(SIGNERS_DATA_KEY) as Promise<
            ISignerStorageRecord[]
        >;
    }

    public async updateSigner(
        signerId: string,
        updates: Partial<ISignerStorageRecord>,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.update(SIGNERS_DATA_KEY, signerId, updates);
    }

    public async deleteSigner(signerId: string): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.delete(SIGNERS_DATA_KEY, signerId);
    }

    public async deleteMultipleSigners(signerIds: string[]): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.deleteMany(SIGNERS_DATA_KEY, signerIds);
    }

    public async hasSigner(signerId: string): Promise<boolean> {
        await this.ensureInitialized();

        const signer = await this.getSigner(signerId);

        return signer !== null;
    }

    public async getSignersCount(): Promise<number> {
        await this.ensureInitialized();

        const signers = await this.getAllSigners();

        return signers.length;
    }

    public async clearAllData(): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.clearTable(SIGNERS_DATA_KEY);
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (tableName !== SIGNERS_DATA_KEY) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        await this.storageInterface.clearTable(tableName);
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public async getTablesList(): Promise<string[]> {
        await this.ensureInitialized();

        return [SIGNERS_DATA_KEY];
    }

    public close(): void {
        this.storageInterface.close();
        this.isInitialized = false;
    }
}

export { SIGNERS_DATA_KEY };
