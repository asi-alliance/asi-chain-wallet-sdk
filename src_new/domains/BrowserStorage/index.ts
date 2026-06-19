import { ITableRecord, ITableService } from "@domains/TableService";

function EnsureDatabaseInitialized<
    This extends BrowserStorage,
    Args extends any[],
    Return,
>(
    target: (...args: Args) => Return,
    context: ClassMethodDecoratorContext,
) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return>> {
        await this.init();

        return await target.apply(this, args);
    };
}

function EnsureTableExists<
    This extends BrowserStorage,
    Args extends any[],
    Return,
>(
    target: (...args: Args) => Return,
    context: ClassMethodDecoratorContext,
) {
    return async function (this: This, ...args: Args): Promise<Awaited<Return>> {
        const tableName = args[0];

        if (typeof tableName !== "string") {
            throw new Error(
                `Table name must be a string and should be the first argument of the method. Received: ${typeof args[0]}`,
            )
        }
        if (!this.tableExists(tableName)) {
            throw new Error(
                `Table '${tableName}' does not exist. Use createTable() first.`,
            );
        }

        return await target.apply(this, args);
    };
}

export default class BrowserStorage implements ITableService<ITableRecord> {
    private readonly name: string;
    private readonly version: number;
    private storage: IDBDatabase | null = null;
    private tableNames: Set<string> = new Set();

    constructor(name: string = "AppDatabase", version: number = 1) {
        this.name = name;
        this.version = version;
    }

    public async init(): Promise<IDBDatabase> {
        if (this.storage) {
            return this.storage;
        }

        return new Promise((resolve, reject) => {
            const openDatabaseRequest: IDBOpenDBRequest = indexedDB.open(
                this.name,
                this.version,
            );

            openDatabaseRequest.onupgradeneeded = (
                event: IDBVersionChangeEvent,
            ) => {
                const storage = openDatabaseRequest.result;
                const oldVersion = event.oldVersion;

                this.updateTablesList(storage);
            };

            openDatabaseRequest.onsuccess = () => {
                this.storage = openDatabaseRequest.result;

                this.updateTablesList();

                this.storage.onclose = () => {
                    this.storage = null;
                    this.tableNames.clear();
                };

                resolve(this.storage);
            };

            openDatabaseRequest.onerror = () => {
                reject(
                    new Error(
                        `Failed to open database: ${openDatabaseRequest.error?.message}`,
                    ),
                );
            };
        });
    }

    private async updateTablesList(
        storage: IDBDatabase | null = this.storage,
    ): Promise<void> {
        if (!storage) {
            return;
        }

        this.tableNames.clear();

        for (let i = 0; i < storage.objectStoreNames.length; i++) {
            this.tableNames.add(storage.objectStoreNames[i]);
        }
    }

    @EnsureDatabaseInitialized
    public async createTable(
        tableName: string,
        keyPath: string = "id",
    ): Promise<void> {
        if (!this.storage) {
            throw new Error("Database not initialized");
        }

        this.storage.close();
        this.storage = null;

        const newVersion = this.version + 1;

        return new Promise((resolve, reject) => {
            const openDatabaseRequest: IDBOpenDBRequest = indexedDB.open(
                this.name,
                newVersion,
            );

            openDatabaseRequest.onupgradeneeded = (
                event: IDBVersionChangeEvent,
            ) => {
                const database = openDatabaseRequest.result;

                if (!database.objectStoreNames.contains(tableName)) {
                    const objectStore = database.createObjectStore(tableName, {
                        keyPath: keyPath,
                    });

                    objectStore.createIndex("createdAt", "createdAt", {
                        unique: false,
                    });
                }
            };

            openDatabaseRequest.onsuccess = () => {
                this.storage = openDatabaseRequest.result;
                this.tableNames.add(tableName);

                (this as any).version = newVersion;

                resolve();
            };

            openDatabaseRequest.onerror = () => {
                reject(
                    new Error(
                        `Failed to create table: ${openDatabaseRequest.error?.message}`,
                    ),
                );
            };
        });
    }

    public async insert(
        tableName: string,
        record: ITableRecord,
    ): Promise<void> {
        const recordWithTimestamp = {
            ...record,
            createdAt: record.createdAt || Date.now(),
            updatedAt: Date.now(),
        };

        await this.executeTransaction(tableName, "readwrite", (store) => {
            return store.add(recordWithTimestamp);
        });
    }

    public async insertMany(
        tableName: string,
        records: ITableRecord[],
    ): Promise<void> {
        const recordsWithTimestamps = records.map((record) => ({
            ...record,
            createdAt: record.createdAt || Date.now(),
            updatedAt: Date.now(),
        }));

        await this.executeTransaction(tableName, "readwrite", (store) => {
            for (const record of recordsWithTimestamps) {
                store.add(record);
            }
        });
    }

    public async getById(
        tableName: string,
        id: string | number,
    ): Promise<ITableRecord | null> {
        const result = await this.executeTransaction(
            tableName,
            "readonly",
            (store) => {
                return store.get(id);
            },
        );

        return result || null;
    }

    public async getAll(tableName: string): Promise<ITableRecord[]> {
        const result = await this.executeTransaction(
            tableName,
            "readonly",
            (store) => {
                return store.getAll();
            },
        );

        return result || [];
    }

    public async update(
        tableName: string,
        id: string | number,
        data: Partial<ITableRecord>,
    ): Promise<void> {
        const existing = await this.getById(tableName, id);

        if (!existing) {
            throw new Error(
                `Record with id '${id}' not found in table '${tableName}'`,
            );
        }

        const updated = {
            ...existing,
            ...data,
            id: existing.id,
            updatedAt: Date.now(),
        };

        await this.executeTransaction(tableName, "readwrite", (store) => {
            return store.put(updated);
        });
    }

    public async delete(tableName: string, id: string | number): Promise<void> {
        await this.executeTransaction(tableName, "readwrite", (store) => {
            return store.delete(id);
        });
    }

    public async deleteMany(
        tableName: string,
        ids: (string | number)[],
    ): Promise<void> {
        await this.executeTransaction(tableName, "readwrite", (store) => {
            for (const id of ids) {
                store.delete(id);
            }
        });
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.executeTransaction(tableName, "readwrite", (table) => {
            return table.clear();
        });
    }

    @EnsureDatabaseInitialized
    @EnsureTableExists
    public async dropTable(tableName: string): Promise<void> {
        this.closeConnection();

        const newVersion: number = this.version + 1;

        return new Promise((resolve, reject) => {
            const openDatabaseRequest: IDBOpenDBRequest = indexedDB.open(
                this.name,
                newVersion,
            );

            openDatabaseRequest.onupgradeneeded = (event) => {
                const storage: IDBDatabase = openDatabaseRequest.result;

                if (storage.objectStoreNames.contains(tableName)) {
                    storage.deleteObjectStore(tableName);
                }
            };

            openDatabaseRequest.onsuccess = () => {
                this.storage: IDBDatabase = openDatabaseRequest.result;
                this.tableNames.delete(tableName);
                (this as any).version = newVersion;
                resolve();
            };

            openDatabaseRequest.onerror = () => {
                reject(
                    new Error(
                        `Failed to drop table: ${openDatabaseRequest.error?.message}`,
                    ),
                );
            };
        });
    }

    public async tableExists(tableName: string): Promise<boolean> {
        return this.tableNames.has(tableName);
    }

    public getTableNamesList(): string[] {
        return Array.from(this.tableNames);
    }

    public async close(): Promise<void> {
        this.closeConnection();
        this.tableNames.clear();
    }

    @EnsureDatabaseInitialized
    @EnsureTableExists
    private async executeTransaction<T>(
        tableName: string,
        mode: IDBTransactionMode,
        operation: (store: IDBObjectStore) => IDBRequest<T> | void,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.storage) {
                reject(new Error("Database not initialized"));
                return;
            }

            const transaction: IDBTransaction = this.storage.transaction(tableName, mode);
            const table: IDBObjectStore = transaction.objectStore(tableName);

            const request = operation(table);

            transaction.oncomplete = () => {
                resolve((request && "result" in request ? request.result : undefined) as T);
            };

            transaction.onerror = () => {
                reject(
                    new Error(
                        `Transaction failed: ${transaction.error?.message}`,
                    ),
                );
            };

            transaction.onabort = () => {
                reject(new Error("Transaction aborted"));
            };
        });
    }

    @EnsureDatabaseInitialized
    private closeConnection(): void {
        this.storage!.close();
        this.storage = null;
    }
}
