import storage, { LocalStorage } from "node-persist";
import { ITableRecord, ITableService } from "@domains/TableService";
import {
    createMissingTableError,
    EnsureDatabaseInitialized,
    SkipIfDatabaseNotInitialized,
} from "@utils/decorators";
import { DEFAULT_NODE_STORAGE_DIR } from "@config/index";
import KeyedReadWriteLock from "@services/KeyedReadWriteLock";

const TABLES_FOLDER_KEY: string = "__tables__";
const TABLES_KEY_PREFIX: string = "table";

export default class NodeStorage implements ITableService<ITableRecord> {
    private static instance: NodeStorage | null = null;

    private readonly storageDir: string;
    private readonly tablesLock: KeyedReadWriteLock = new KeyedReadWriteLock();
    private storageInterface: LocalStorage | null = null;
    private pendingInit: Promise<void> | null = null;

    public constructor(storageDir: string = DEFAULT_NODE_STORAGE_DIR) {
        this.storageDir = storageDir;
    }

    public static getInstance(storageDir?: string): NodeStorage {
        if (!NodeStorage.instance) {
            NodeStorage.instance = new NodeStorage(storageDir);
        }

        return NodeStorage.instance;
    }

    public async init(): Promise<void> {
        if (this.storageInterface) {
            return;
        }

        this.pendingInit ??= this.initialize().finally(() => {
            this.pendingInit = null;
        });

        await this.pendingInit;
    }

    private async initialize(): Promise<void> {
        const storageInterface: LocalStorage = storage.create({
            dir: this.storageDir,
            writeQueue: false,
        });

        await storageInterface.init();

        this.storageInterface = storageInterface;
    }

    private getTableKey(tableName: string): string {
        return `${TABLES_KEY_PREFIX}:${tableName}`;
    }

    @EnsureDatabaseInitialized
    private async readTable(
        tableName: string,
    ): Promise<Record<string, ITableRecord> | undefined> {
        return this.storageInterface!.getItem(this.getTableKey(tableName));
    }

    private async getTable(
        tableName: string,
    ): Promise<Record<string, ITableRecord>> {
        const table: Record<string, ITableRecord> | undefined =
            await this.readTable(tableName);

        if (!table) {
            throw createMissingTableError(tableName);
        }

        return table;
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
    private async readTableNames(): Promise<string[]> {
        return (await this.storageInterface!.getItem(TABLES_FOLDER_KEY)) ?? [];
    }

    private readFromTable<T>(
        tableName: string,
        read: (table: Record<string, ITableRecord>) => T,
    ): Promise<T> {
        return this.tablesLock.runShared(
            this.getTableKey(tableName),
            async () => read(await this.getTable(tableName)),
        );
    }

    private modifyTable(
        tableName: string,
        modify: (
            table: Record<string, ITableRecord>,
        ) => Record<string, ITableRecord>,
    ): Promise<void> {
        return this.tablesLock.runExclusive(
            this.getTableKey(tableName),
            async () => {
                const table: Record<string, ITableRecord> =
                    await this.getTable(tableName);

                await this.saveTable(tableName, modify(table));
            },
        );
    }

    private modifyTableNames(
        modify: (tableNames: string[]) => string[],
    ): Promise<void> {
        return this.tablesLock.runExclusive(TABLES_FOLDER_KEY, async () => {
            const tableNames: string[] = await this.readTableNames();

            await this.storageInterface!.setItem(
                TABLES_FOLDER_KEY,
                modify(tableNames),
            );
        });
    }

    private async addTable(tableName: string): Promise<void> {
        if (await this.readTable(tableName)) {
            return;
        }

        await this.saveTable(tableName, {});

        await this.modifyTableNames((tableNames: string[]) => [
            ...tableNames,
            tableName,
        ]);
    }

    async createTable(tableName: string, _keyPath: string): Promise<void> {
        await this.tablesLock.runExclusive(this.getTableKey(tableName), () =>
            this.addTable(tableName),
        );
    }

    async insert(tableName: string, record: ITableRecord): Promise<void> {
        await this.modifyTable(tableName, (table) => {
            if (table[String(record.id)]) {
                throw new Error(`Record with id '${record.id}' already exists`);
            }

            table[String(record.id)] = {
                ...record,
                createdAt: record.createdAt || Date.now(),
                updatedAt: Date.now(),
            };

            return table;
        });
    }

    async insertMany(
        tableName: string,
        records: ITableRecord[],
    ): Promise<void> {
        await this.modifyTable(tableName, (table) => {
            for (const record of records) {
                table[String(record.id)] = {
                    ...record,
                    createdAt: record.createdAt || Date.now(),
                    updatedAt: Date.now(),
                };
            }

            return table;
        });
    }

    async getById(
        tableName: string,
        id: string | number,
    ): Promise<ITableRecord | null> {
        return this.readFromTable(
            tableName,
            (table) => table[String(id)] || null,
        );
    }

    async getAll(tableName: string): Promise<ITableRecord[]> {
        return this.readFromTable(tableName, (table) => Object.values(table));
    }

    async update(
        tableName: string,
        id: string | number,
        data: Partial<ITableRecord>,
    ): Promise<void> {
        await this.modifyTable(tableName, (table) => {
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

            return table;
        });
    }

    async delete(tableName: string, id: string | number): Promise<void> {
        await this.modifyTable(tableName, (table) => {
            delete table[String(id)];

            return table;
        });
    }

    async deleteMany(
        tableName: string,
        ids: (string | number)[],
    ): Promise<void> {
        await this.modifyTable(tableName, (table) => {
            for (const id of ids) {
                delete table[String(id)];
            }

            return table;
        });
    }

    async clearTable(tableName: string): Promise<void> {
        await this.modifyTable(tableName, () => ({}));
    }

    private async removeTable(tableName: string): Promise<void> {
        await this.getTable(tableName);

        await this.storageInterface!.removeItem(this.getTableKey(tableName));

        await this.modifyTableNames((tableNames: string[]) =>
            tableNames.filter((name: string) => name !== tableName),
        );
    }

    async dropTable(tableName: string): Promise<void> {
        await this.tablesLock.runExclusive(this.getTableKey(tableName), () =>
            this.removeTable(tableName),
        );
    }

    public isInitialized(): boolean {
        return !!this.storageInterface;
    }

    @EnsureDatabaseInitialized
    public getKeys(): Promise<string[]> {
        return this.storageInterface!.keys();
    }

    public getTableNames(): Promise<string[]> {
        return this.tablesLock.runShared(TABLES_FOLDER_KEY, () =>
            this.readTableNames(),
        );
    }

    async tableExists(tableName: string): Promise<boolean> {
        return this.tablesLock.runShared(
            this.getTableKey(tableName),
            async () => !!(await this.readTable(tableName)),
        );
    }

    @SkipIfDatabaseNotInitialized
    async close(): Promise<void> {
        this.storageInterface = null;
    }
}
