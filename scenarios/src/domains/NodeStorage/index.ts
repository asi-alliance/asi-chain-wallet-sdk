import storage, { LocalStorage } from "node-persist";
import { ITableRecord, ITableService } from "../TableService";
import {
    EnsureDatabaseInitialized,
    EnsureTableExists,
    SkipIfDatabaseNotInitialized,
    SkipIfTableExists,
} from "../../utils/decorators";
import { DEFAULT_NODE_STORAGE_DIR } from "../../config";

const TABLES_FOLDER_KEY: string = "__tables__";
const TABLES_KEY_PREFIX: string = "table";

export default class NodeStorage implements ITableService<ITableRecord> {
    private readonly storageDir: string;

    private storageInterface: LocalStorage | null = null;

    constructor(storageDir: string = DEFAULT_NODE_STORAGE_DIR) {
        this.storageDir = storageDir;
    }

    public async init(): Promise<void> {
        if (this.storageInterface) {
            return;
        }

        this.storageInterface = storage.create({
            dir: this.storageDir,
        });

        await this.storageInterface.init();
    }

    private getTableKey(tableName: string): string {
        return `${TABLES_KEY_PREFIX}:${tableName}`;
    }

    @EnsureDatabaseInitialized
    @EnsureTableExists
    private async getTable(
        tableName: string,
    ): Promise<Record<string, ITableRecord>> {
        return this.storageInterface!.getItem(this.getTableKey(tableName));
    }

    @EnsureDatabaseInitialized
    private async saveTable(
        tableName: string,
        table: Record<string, ITableRecord>,
    ): Promise<void> {
        await this.storageInterface!.setItem(
            this.getTableKey(tableName),
            table,
        );
    }

    @EnsureDatabaseInitialized
    @SkipIfTableExists
    async createTable(tableName: string, _keyPath: string): Promise<void> {
        await this.storageInterface!.setItem(this.getTableKey(tableName), {});

        const tables =
            (await this.storageInterface!.getItem(TABLES_FOLDER_KEY)) ?? [];

        tables.push(tableName);

        await this.storageInterface!.setItem(TABLES_FOLDER_KEY, tables);
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
        const table: Record<string, ITableRecord> =
            await this.getTable(tableName);

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

    @EnsureTableExists
    async clearTable(tableName: string): Promise<void> {
        await this.saveTable(tableName, {});
    }

    @EnsureDatabaseInitialized
    @EnsureTableExists
    async dropTable(tableName: string): Promise<void> {
        await this.storageInterface!.removeItem(this.getTableKey(tableName));

        const tables: any[] =
            await this.storageInterface!.getItem(TABLES_FOLDER_KEY);

        await this.storageInterface!.setItem(
            TABLES_FOLDER_KEY,
            tables.filter((name) => name !== tableName),
        );
    }

    public isInitialized(): boolean {
        return !!this.storageInterface;
    }

    @EnsureDatabaseInitialized
    public getKeys(): Promise<string[]> {
        return this.storageInterface!.keys();
    }

    @EnsureDatabaseInitialized
    async tableExists(tableName: string): Promise<boolean> {
        const tableKeys = await this.storageInterface!.keys(
            (item) => item.key === this.getTableKey(tableName),
        );

        return tableKeys.length > 0;
    }

    @SkipIfDatabaseNotInitialized
    async close(): Promise<void> {
        this.storageInterface = null;
    }
}
