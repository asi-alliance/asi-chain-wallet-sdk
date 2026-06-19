import { ITableRecord, ITableService } from "@domains/TableService";

function EnsureDatabaseInitialized<
    This extends BrowserStorage,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, context: ClassMethodDecoratorContext) {
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
>(target: (...args: Args) => Return, context: ClassMethodDecoratorContext) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return>> {
        const tableName = args[0];

        if (typeof tableName !== "string") {
            throw new Error(
                `Table name must be a string and should be the first argument of the method. Received: ${typeof args[0]}`,
            );
        }

        if (!(await this.tableExists(tableName))) {
            throw new Error(
                `Table '${tableName}' does not exist. Use createTable() first.`,
            );
        }

        return await target.apply(this, args);
    };
}

export default class BrowserStorage implements ITableService<ITableRecord> {
    private readonly name: string;
    private storageInterface: IDBDatabase | null = null;

    constructor(name: string = "AppDatabase") {
        this.name = name;
    }

    public async init(): Promise<IDBDatabase> {
        if (this.storageInterface) {
            return this.storageInterface;
        }

        return new Promise((resolve, reject) => {
            const openDatabaseRequest: IDBOpenDBRequest = indexedDB.open(
                this.name,
            );

            openDatabaseRequest.onsuccess = () => {
                this.storageInterface = openDatabaseRequest.result;

                this.storageInterface.onclose = () => {
                    this.storageInterface = null;
                };

                this.storageInterface.onversionchange = () => {
                    this.storageInterface?.close();
                    this.storageInterface = null;
                };

                resolve(this.storageInterface);
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

    @EnsureDatabaseInitialized
    public async createTable(
        tableName: string,
        keyPath: string = "id",
    ): Promise<void> {
        const currentVersion: number = this.storageInterface!.version;
        const newVersion: number = currentVersion + 1;

        return new Promise((resolve, reject) => {
            const openDatabaseRequest: IDBOpenDBRequest = indexedDB.open(
                this.name,
                newVersion,
            );

            openDatabaseRequest.onupgradeneeded = (
                event: IDBVersionChangeEvent,
            ) => {
                const storage: IDBDatabase = openDatabaseRequest.result;

                if (!storage.objectStoreNames.contains(tableName)) {
                    const objectStore = storage.createObjectStore(tableName, {
                        keyPath: keyPath,
                    });

                    objectStore.createIndex("createdAt", "createdAt", {
                        unique: false,
                    });
                }
            };

            openDatabaseRequest.onsuccess = () => {
                this.storageInterface = openDatabaseRequest.result;
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
        const currentVersion = this.storageInterface!.version;
        const newVersion: number = currentVersion + 1;

        return new Promise((resolve, reject) => {
            const openDatabaseRequest: IDBOpenDBRequest = indexedDB.open(
                this.name,
                newVersion,
            );

            openDatabaseRequest.onupgradeneeded = (event) => {
                const storageInterface: IDBDatabase =
                    openDatabaseRequest.result;

                if (storageInterface.objectStoreNames.contains(tableName)) {
                    storageInterface.deleteObjectStore(tableName);
                }
            };

            openDatabaseRequest.onsuccess = () => {
                this.storageInterface = openDatabaseRequest.result;
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

    @EnsureDatabaseInitialized
    public async tableExists(tableName: string): Promise<boolean> {
        return (
            this.storageInterface?.objectStoreNames.contains(tableName) ?? false
        );
    }

    public getVersion(): number {
        return this.storageInterface?.version ?? 0;
    }

    public getDatabaseName(): string {
        return this.name;
    }

    public getTableNamesList(): string[] {
        if (!this.storageInterface) {
            return [];
        }

        const names: string[] = [];

        return Array.from(this.storageInterface.objectStoreNames);
    }

    @EnsureDatabaseInitialized
    @EnsureTableExists
    private async executeTransaction<T>(
        tableName: string,
        mode: IDBTransactionMode,
        operation: (store: IDBObjectStore) => IDBRequest<T> | void,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.storageInterface) {
                reject(new Error("Database not initialized"));
                return;
            }

            const transaction: IDBTransaction =
                this.storageInterface.transaction(tableName, mode);
            const table: IDBObjectStore = transaction.objectStore(tableName);

            const request = operation(table);

            transaction.oncomplete = () => {
                resolve(
                    (request && "result" in request
                        ? request.result
                        : undefined) as T,
                );
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

    public async close(): Promise<void> {
        if (!this.storageInterface) {
            return;
        }

        this.storageInterface.close();
        this.storageInterface = null;
    }
}
