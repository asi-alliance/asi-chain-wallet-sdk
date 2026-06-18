import { WalletsStorageController } from "@domains/WalletsStorageController";

export const createStorage = () => {
    return WalletsStorageController.getInstance();
};

export const initializeStorage = async (): Promise<void> => {
    await WalletsStorageController.getInstance().initialize();
};
