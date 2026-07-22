import BrowserStorage from "@domains/BrowserStorage";
import NodeStorage from "@domains/NodeStorage";
import { ITableRecord, ITableService } from "@domains/TableService";

export interface IStorageFabricOptions {
    nodeStorageDir?: string;
}

export const storageFabric = (
    options?: IStorageFabricOptions,
): ITableService<ITableRecord> => {
    return typeof window !== "undefined"
        ? BrowserStorage.getInstance()
        : NodeStorage.getInstance(options?.nodeStorageDir);
};
