import { IDBStorageController } from "@domains/WalletsStorageController";

export const createStorage = () => {
    return IDBStorageController.getInstance();
};

export const initializeStorage = async (): Promise<void> => {
    await IDBStorageController.getInstance().initialize();
};
