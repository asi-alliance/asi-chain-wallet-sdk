import {
    IInsensitiveCacheRecord,
    InsensitiveCacheStorageRepository,
} from "@domains/InsensitiveCacheStorageRepository";

class InsensitiveCacheStorageManager {
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
}

export default InsensitiveCacheStorageManager;
