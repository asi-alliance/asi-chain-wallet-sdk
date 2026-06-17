import { IDBStorageController } from "@domains/IDBStorageController";

export const createStorage = () => {
    return IDBStorageController.getInstance();
};

export const initializeStorage = async (): Promise<void> => {
    await IDBStorageController.getInstance().initialize();
};
