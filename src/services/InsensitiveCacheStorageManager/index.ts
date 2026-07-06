import { IInsensitiveCacheRecord } from "@domains/InsensitiveCacheStorageRepository";
import { InsensitiveCacheStorageRepository } from "@domains/InsensitiveCacheStorageRepository";

class InsensitiveCacheStorageManager {
    public static init = async (): Promise<void> => {
        await InsensitiveCacheStorageRepository.getInstance().initialize();
    };

    public static save = async (
        record: IInsensitiveCacheRecord,
    ): Promise<void> => {
        await InsensitiveCacheStorageRepository.getInstance().saveRecord(
            record,
        );
    };

    public static get = async (
        id: string,
    ): Promise<IInsensitiveCacheRecord | null> => {
        return InsensitiveCacheStorageRepository.getInstance().getRecord(id);
    };

    public static getAll = async (): Promise<IInsensitiveCacheRecord[]> => {
        return InsensitiveCacheStorageRepository.getInstance().getAllRecords();
    };

    public static update = async (
        id: string,
        updates: Partial<IInsensitiveCacheRecord>,
    ): Promise<void> => {
        await InsensitiveCacheStorageRepository.getInstance().updateRecord(
            id,
            updates,
        );
    };

    public static delete = async (id: string): Promise<void> => {
        await InsensitiveCacheStorageRepository.getInstance().deleteRecord(id);
    };

    public static deleteAll = async (ids: string[]): Promise<void> => {
        for (const id of ids) {
            await InsensitiveCacheStorageManager.delete(id);
        }
    };

    public static clear = async (): Promise<void> => {
        await InsensitiveCacheStorageRepository.getInstance().clear();
    };

    public static close = (): void => {
        InsensitiveCacheStorageRepository.getInstance().close();
    };
}

export default InsensitiveCacheStorageManager;
