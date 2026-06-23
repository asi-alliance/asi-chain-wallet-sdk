import { IStorageAdapter, SignerRecord, AccountRecord, SessionRecord } from "../modules/StorageAdapter";

export class StorageService {
    constructor(private readonly adapter: IStorageAdapter) {}

    public async initialize(): Promise<void> {
        await this.adapter.init();
    }

    public async close(): Promise<void> {
        await this.adapter.close();
    }

    public async saveSigner(signer: SignerRecord): Promise<void> {
        await this.adapter.saveSigner(signer);
    }

    public async getSigner(id: string): Promise<SignerRecord | null> {
        return this.adapter.getSigner(id);
    }

    public async getAllSigners(): Promise<SignerRecord[]> {
        return this.adapter.getAllSigners();
    }

    public async deleteSigner(id: string): Promise<void> {
        await this.adapter.deleteSigner(id);
    }

    public async saveAccount(account: AccountRecord): Promise<void> {
        await this.adapter.saveAccount(account);
    }

    public async getAccount(id: string): Promise<AccountRecord | null> {
        return this.adapter.getAccount(id);
    }

    public async getAccountsBySigner(signerId: string): Promise<AccountRecord[]> {
        return this.adapter.getAccountsBySigner(signerId);
    }

    public async getAllAccounts(): Promise<AccountRecord[]> {
        return this.adapter.getAllAccounts();
    }

    public async deleteAccount(id: string): Promise<void> {
        await this.adapter.deleteAccount(id);
    }

    public async saveSession(session: SessionRecord): Promise<void> {
        await this.adapter.saveSession(session);
    }

    public async getSession(): Promise<SessionRecord | null> {
        return this.adapter.getSession();
    }

    public async clearSession(): Promise<void> {
        await this.adapter.clearSession();
    }
}
