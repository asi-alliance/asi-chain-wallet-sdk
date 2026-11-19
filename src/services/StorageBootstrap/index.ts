import { SIGNERS_DATA_KEY } from "@domains/SignersStorageRepository";
import { ACCOUNTS_DATA_KEY } from "@domains/AccountsStorageRepository";
import { TRANSACTION_RESERVATIONS_DATA_KEY } from "@domains/TransactionReservationsStorageRepository";
import { CUSTOM_NETWORKS_DATA_KEY } from "@domains/CustomNetworksStorageRepository";
import { INSENSITIVE_CACHE_TABLE_KEY } from "@domains/InsensitiveCacheStorageRepository";
import { StorageMetadataStorageRepository } from "@domains/StorageMetadataStorageRepository";
import { IStorageFabricOptions } from "@fabrics/storage";
import StorageManager from "@services/StorageManager";
import InsensitiveCacheStorageManager from "@services/InsensitiveCacheStorageManager";
import StorageMigrationRunner from "@services/StorageMigrationRunner";
import type { IPersistedStorageTableNames } from "@utils/validators";

export const PERSISTED_STORAGE_TABLES: IPersistedStorageTableNames = {
    signers: SIGNERS_DATA_KEY,
    accounts: ACCOUNTS_DATA_KEY,
    transactionReservations: TRANSACTION_RESERVATIONS_DATA_KEY,
    customNetworks: CUSTOM_NETWORKS_DATA_KEY,
    insensitiveCache: INSENSITIVE_CACHE_TABLE_KEY,
};

const MIGRATABLE_TABLES: string[] = Object.values(PERSISTED_STORAGE_TABLES);

export interface IStorageBootstrapOptions {
    storageOptions?: IStorageFabricOptions;
    withInsensitiveCacheStorage?: boolean;
}

class StorageBootstrap {
    private static createMigrationRunner = (): StorageMigrationRunner => {
        const metadataRepository: StorageMetadataStorageRepository =
            StorageMetadataStorageRepository.getInstance();

        return new StorageMigrationRunner({
            storage: metadataRepository.getRawDB(),
            metadataRepository,
            tables: MIGRATABLE_TABLES,
        });
    };

    public static init = async ({
        storageOptions,
        withInsensitiveCacheStorage,
    }: IStorageBootstrapOptions = {}): Promise<void> => {
        await StorageMetadataStorageRepository.getInstance(
            storageOptions,
        ).initialize();

        const runner: StorageMigrationRunner =
            StorageBootstrap.createMigrationRunner();

        await runner.assertCompatible();

        await StorageManager.init(storageOptions);

        if (withInsensitiveCacheStorage) {
            await InsensitiveCacheStorageManager.init();
        }

        await runner.run();
    };

    public static close = (): void => {
        StorageMetadataStorageRepository.getInstance().close();
    };
}

export default StorageBootstrap;
