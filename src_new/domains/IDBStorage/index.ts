import { ITableRecord, ITableService } from "./meta";

export default class Storage implements ITableService<ITableRecord> {
    private readonly dbName: string;
    private readonly version: number;
    private db: IDBDatabase | null = null;
    private tables: Set<string> = new Set();

    constructor(dbName: string = "AppDatabase", version: number = 1) {
        this.dbName = dbName;
        this.version = version;
    }

    private async init(): Promise<IDBDatabase> {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const database = request.result;
                const oldVersion = event.oldVersion;

                for (let i = 0; i < database.objectStoreNames.length; i++) {
                    this.tables.add(database.objectStoreNames[i]);
                }

                console.log(
                    `Database upgraded from version ${oldVersion} to ${this.version}`,
                );
            };

            request.onsuccess = () => {
                this.db = request.result;

                this.updateTablesList();

                this.db.onclose = () => {
                    this.db = null;
                    this.tables.clear();
                };

                resolve(this.db);
            };

            request.onerror = () => {
                reject(
                    new Error(
                        `Failed to open database: ${request.error?.message}`,
                    ),
                );
            };
        });
    }

    private async updateTablesList(): Promise<void> {
        if (!this.db) return;

        this.tables.clear();
        for (let i = 0; i < this.db.objectStoreNames.length; i++) {
            this.tables.add(this.db.objectStoreNames[i]);
        }
    }

    private async ensureTable(tableName: string): Promise<void> {
        await this.init();

        if (!this.tables.has(tableName)) {
            throw new Error(
                `Table '${tableName}' does not exist. Use createTable() first.`,
            );
        }
    }

    private async executeTransaction<T>(
        tableName: string,
        mode: IDBTransactionMode,
        operation: (store: IDBObjectStore) => IDBRequest<T> | void,
    ): Promise<T> {
        await this.ensureTable(tableName);

        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Database not initialized"));
                return;
            }

            const transaction = this.db.transaction(tableName, mode);
            const store = transaction.objectStore(tableName);

            const request = operation(store);

            transaction.oncomplete = () => {
                if (request && "result" in request) {
                    resolve(request.result as T);
                } else {
                    resolve(undefined as T);
                }
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

    async createTable(
        tableName: string,
        keyPath: string = "id",
    ): Promise<void> {
        await this.init();

        if (!this.db) {
            throw new Error("Database not initialized");
        }

        this.db.close();
        this.db = null;

        const newVersion = this.version + 1;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, newVersion);

            request.onupgradeneeded = (event) => {
                const database = request.result;

                if (!database.objectStoreNames.contains(tableName)) {
                    const objectStore = database.createObjectStore(tableName, {
                        keyPath: keyPath,
                    });

                    objectStore.createIndex("createdAt", "createdAt", {
                        unique: false,
                    });

                    console.log(
                        `Table '${tableName}' created with keyPath '${keyPath}'`,
                    );
                } else {
                    console.log(`Table '${tableName}' already exists`);
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.tables.add(tableName);

                (this as any).version = newVersion;

                resolve();
            };

            request.onerror = () => {
                reject(
                    new Error(
                        `Failed to create table: ${request.error?.message}`,
                    ),
                );
            };
        });
    }

    async insert(tableName: string, record: ITableRecord): Promise<void> {
        const recordWithTimestamp = {
            ...record,
            createdAt: record.createdAt || Date.now(),
            updatedAt: Date.now(),
        };

        await this.executeTransaction(tableName, "readwrite", (store) => {
            return store.add(recordWithTimestamp);
        });
    }

    async insertMany(
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

    async getById(
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

    async getAll(tableName: string): Promise<ITableRecord[]> {
        const result = await this.executeTransaction(
            tableName,
            "readonly",
            (store) => {
                return store.getAll();
            },
        );

        return result || [];
    }

    async update(
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

    async delete(tableName: string, id: string | number): Promise<void> {
        await this.executeTransaction(tableName, "readwrite", (store) => {
            return store.delete(id);
        });
    }

    async deleteMany(
        tableName: string,
        ids: (string | number)[],
    ): Promise<void> {
        await this.executeTransaction(tableName, "readwrite", (store) => {
            for (const id of ids) {
                store.delete(id);
            }
        });
    }

    async clearTable(tableName: string): Promise<void> {
        await this.executeTransaction(tableName, "readwrite", (store) => {
            return store.clear();
        });
    }

    async dropTable(tableName: string): Promise<void> {
        await this.init();

        if (!this.db) {
            throw new Error("Database not initialized");
        }

        if (!this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        this.db.close();
        this.db = null;

        const newVersion = this.version + 1;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, newVersion);

            request.onupgradeneeded = (event) => {
                const database = request.result;

                if (database.objectStoreNames.contains(tableName)) {
                    database.deleteObjectStore(tableName);
                    console.log(`Table '${tableName}' dropped`);
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.tables.delete(tableName);
                (this as any).version = newVersion;
                resolve();
            };

            request.onerror = () => {
                reject(
                    new Error(
                        `Failed to drop table: ${request.error?.message}`,
                    ),
                );
            };
        });
    }

    async tableExists(tableName: string): Promise<boolean> {
        await this.init();
        return this.tables.has(tableName);
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.tables.clear();
        }
    }
}
