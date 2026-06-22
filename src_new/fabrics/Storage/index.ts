import NodeStorage from "@domains/NodeStorage";
import BrowserStorage from "@domains/BrowserStorage";
import { ITableRecord, ITableService } from "@domains/TableService";

export const storageFabric = (): ITableService<ITableRecord> => {
    const isBrowser = typeof window !== "undefined";

    return isBrowser ? new BrowserStorage() : new NodeStorage();
};
