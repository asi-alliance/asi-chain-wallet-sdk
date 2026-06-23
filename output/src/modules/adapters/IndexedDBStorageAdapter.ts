import { IStorageAdapter, SignerRecord, AccountRecord, SessionRecord } from "../StorageAdapter";

const SIGNERS_TABLE = "signers";
const ACCOUNTS_TABLE = "accounts";
const SESSION_KEY = "session";

export class IndexedDBStorageAdapter implements IStorageAdapter {
    private db: IDBDatabase | null = null;

    public async init(): Promise<void> {
        if (this.db) {
            return;
        }

        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("asi_wallet_sdk", 1);

            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(SIGNERS_TABLE)) {
                    database.createObjectStore(SIGNERS_TABLE, { keyPath: "id" });
                }
                if (!database.objectStoreNames.contains(ACCOUNTS_TABLE)) {
                    database.createObjectStore(ACCOUNTS_TABLE, { keyPath: "id" });
                }
                if (!database.objectStoreNames.contains(SESSION_KEY)) {
                    database.createObjectStore(SESSION_KEY, { keyPath: "id" });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public async close(): Promise<void> {
        this.db?.close();
        this.db = null;
    }

    private async transaction<T>(
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: IDBObjectStore) => IDBRequest,
    ): Promise<T> {
        if (!this.db) {
            throw new Error("IndexedDB is not initialized.");
        }

        return new Promise<T>((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = callback(store);

            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => reject(request.error);
        });
    }

    public async saveSigner(signer: SignerRecord): Promise<void> {
        await this.transaction<void>(SIGNERS_TABLE, "readwrite", (store) =>
            store.put(signer),
        );
    }

    public async getSigner(id: string): Promise<SignerRecord | null> {
        return await this.transaction<SignerRecord | null>(
            SIGNERS_TABLE,
            "readonly",
            (store) => store.get(id),
        );
    }

    public async getAllSigners(): Promise<SignerRecord[]> {
        return await this.transaction<SignerRecord[]>(
            SIGNERS_TABLE,
            "readonly",
            (store) => store.getAll(),
        );
    }

    public async deleteSigner(id: string): Promise<void> {
        await this.transaction<void>(SIGNERS_TABLE, "readwrite", (store) =>
            store.delete(id),
        );
    }

    public async saveAccount(account: AccountRecord): Promise<void> {
        await this.transaction<void>(ACCOUNTS_TABLE, "readwrite", (store) =>
            store.put(account),
        );
    }

    public async getAccount(id: string): Promise<AccountRecord | null> {
        return await this.transaction<AccountRecord | null>(
            ACCOUNTS_TABLE,
            "readonly",
            (store) => store.get(id),
        );
    }

    public async getAccountsBySigner(signerId: string): Promise<AccountRecord[]> {
        const allAccounts = await this.getAllAccounts();
        return allAccounts.filter((account) => account.signerId === signerId);
    }

    public async getAllAccounts(): Promise<AccountRecord[]> {
        return await this.transaction<AccountRecord[]>(
            ACCOUNTS_TABLE,
            "readonly",
            (store) => store.getAll(),
        );
    }

    public async deleteAccount(id: string): Promise<void> {
        await this.transaction<void>(ACCOUNTS_TABLE, "readwrite", (store) =>
            store.delete(id),
        );
    }

    public async saveSession(session: SessionRecord): Promise<void> {
        await this.transaction<void>(SESSION_KEY, "readwrite", (store) =>
            store.put({ id: SESSION_KEY, ...session }),
        );
    }

    public async getSession(): Promise<SessionRecord | null> {
        const record = await this.transaction<any>(
            SESSION_KEY,
            "readonly",
            (store) => store.get(SESSION_KEY),
        );
        return record ? { activeAccountId: record.activeAccountId, updatedAt: record.updatedAt } : null;
    }

    public async clearSession(): Promise<void> {
        await this.transaction<void>(SESSION_KEY, "readwrite", (store) =>
            store.clear(),
        );
    }
}
