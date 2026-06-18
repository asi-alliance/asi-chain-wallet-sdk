import storage, { LocalStorage } from "node-persist";
import { ITableRecord, ITableService } from "@domains/TableService";

export default class NodeStorage implements ITableService<ITableRecord> {
    private readonly storageDir: string;

    private store: LocalStorage | null = null;

    private tables: Set<string> = new Set();

    constructor(storageDir: string = "./storage") {
        this.storageDir = storageDir;
    }

    private async init(): Promise<void> {
        if (this.store) {
            return;
        }

        this.store = await storage.create({
            dir: this.storageDir,
        });

        await this.store.init();

        const tables = (await this.store.getItem("__tables__")) || [];

        this.tables = new Set<string>(tables);
    }

    private async saveTables(): Promise<void> {
        if (!this.store) {
            throw new Error("Storage not initialized");
        }

        await this.store.setItem("__tables__", Array.from(this.tables));
    }

    private async ensureTable(tableName: string): Promise<void> {
        await this.init();

        if (!this.tables.has(tableName)) {
            throw new Error(
                `Table '${tableName}' does not exist. Use createTable() first.`,
            );
        }
    }

    private getTableKey(tableName: string): string {
        return `table:${tableName}`;
    }

    private async getTable(
        tableName: string,
    ): Promise<Record<string, ITableRecord>> {
        await this.ensureTable(tableName);

        if (!this.store) {
            throw new Error("Storage not initialized");
        }

        return (await this.store.getItem(this.getTableKey(tableName))) || {};
    }

    private async saveTable(
        tableName: string,
        table: Record<string, ITableRecord>,
    ): Promise<void> {
        if (!this.store) {
            throw new Error("Storage not initialized");
        }

        await this.store.setItem(this.getTableKey(tableName), table);
    }

    async createTable(
        tableName: string,
        _keyPath: string = "id",
    ): Promise<void> {
        await this.init();

        if (!this.store) {
            throw new Error("Storage not initialized");
        }

        if (this.tables.has(tableName)) {
            return;
        }

        this.tables.add(tableName);

        await this.store.setItem(this.getTableKey(tableName), {});

        await this.saveTables();
    }

    async insert(tableName: string, record: ITableRecord): Promise<void> {
        const table = await this.getTable(tableName);

        if (table[String(record.id)]) {
            throw new Error(`Record with id '${record.id}' already exists`);
        }

        table[String(record.id)] = {
            ...record,
            createdAt: record.createdAt || Date.now(),
            updatedAt: Date.now(),
        };

        await this.saveTable(tableName, table);
    }

    async insertMany(
        tableName: string,
        records: ITableRecord[],
    ): Promise<void> {
        const table = await this.getTable(tableName);

        for (const record of records) {
            table[String(record.id)] = {
                ...record,
                createdAt: record.createdAt || Date.now(),
                updatedAt: Date.now(),
            };
        }

        await this.saveTable(tableName, table);
    }

    async getById(
        tableName: string,
        id: string | number,
    ): Promise<ITableRecord | null> {
        const table = await this.getTable(tableName);

        return table[String(id)] || null;
    }

    async getAll(tableName: string): Promise<ITableRecord[]> {
        const table = await this.getTable(tableName);

        return Object.values(table);
    }

    async update(
        tableName: string,
        id: string | number,
        data: Partial<ITableRecord>,
    ): Promise<void> {
        const table = await this.getTable(tableName);

        const existing = table[String(id)];

        if (!existing) {
            throw new Error(
                `Record with id '${id}' not found in table '${tableName}'`,
            );
        }

        table[String(id)] = {
            ...existing,
            ...data,
            id: existing.id,
            updatedAt: Date.now(),
        };

        await this.saveTable(tableName, table);
    }

    async delete(tableName: string, id: string | number): Promise<void> {
        const table = await this.getTable(tableName);

        delete table[String(id)];

        await this.saveTable(tableName, table);
    }

    async deleteMany(
        tableName: string,
        ids: (string | number)[],
    ): Promise<void> {
        const table = await this.getTable(tableName);

        for (const id of ids) {
            delete table[String(id)];
        }

        await this.saveTable(tableName, table);
    }

    async clearTable(tableName: string): Promise<void> {
        await this.ensureTable(tableName);

        await this.saveTable(tableName, {});
    }

    async dropTable(tableName: string): Promise<void> {
        await this.ensureTable(tableName);

        if (!this.store) {
            throw new Error("Storage not initialized");
        }

        await this.store.removeItem(this.getTableKey(tableName));

        this.tables.delete(tableName);

        await this.saveTables();
    }

    async tableExists(tableName: string): Promise<boolean> {
        await this.init();

        return this.tables.has(tableName);
    }

    async close(): Promise<void> {
        if (!this.store) {
            return;
        }

        this.store = null;
        this.tables.clear();
    }
}
