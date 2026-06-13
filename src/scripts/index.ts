import { IDBStorageController } from "@domains/IDBStorageController";

export function createStorage() {
    return IDBStorageController.getInstance();
}
