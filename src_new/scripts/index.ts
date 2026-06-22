import { WalletsStorageRepository } from "@domains/WalletsStorageRepository";

export const createStorage = () => {
    return WalletsStorageRepository.getInstance();
};

export const initializeStorage = async (): Promise<void> => {
    await WalletsStorageRepository.getInstance().initialize();
};
