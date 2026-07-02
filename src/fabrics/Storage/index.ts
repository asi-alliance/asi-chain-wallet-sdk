import BrowserStorage from "@domains/BrowserStorage";
import NodeStorage from "@domains/NodeStorage";
import { ITableRecord, ITableService } from "@domains/TableService";

export interface IStorageFabricOptions {
    nodeStorageDir?: string;
}

export const storageFabric = (
    options?: IStorageFabricOptions,
): ITableService<ITableRecord> => {
    const isBrowser = typeof window !== "undefined";

    return isBrowser
        ? new BrowserStorage()
        : new NodeStorage(options?.nodeStorageDir);
};
