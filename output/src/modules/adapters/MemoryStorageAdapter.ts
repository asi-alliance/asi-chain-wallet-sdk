import { IStorageAdapter, SignerRecord, AccountRecord, SessionRecord } from "../StorageAdapter";

export class MemoryStorageAdapter implements IStorageAdapter {
    private signers = new Map<string, SignerRecord>();
    private accounts = new Map<string, AccountRecord>();
    private session: SessionRecord | null = null;

    public async init(): Promise<void> {
        return;
    }

    public async close(): Promise<void> {
        return;
    }

    public async saveSigner(signer: SignerRecord): Promise<void> {
        this.signers.set(signer.id, signer);
    }

    public async getSigner(id: string): Promise<SignerRecord | null> {
        return this.signers.get(id) ?? null;
    }

    public async getAllSigners(): Promise<SignerRecord[]> {
        return Array.from(this.signers.values());
    }

    public async deleteSigner(id: string): Promise<void> {
        this.signers.delete(id);
    }

    public async saveAccount(account: AccountRecord): Promise<void> {
        this.accounts.set(account.id, account);
    }

    public async getAccount(id: string): Promise<AccountRecord | null> {
        return this.accounts.get(id) ?? null;
    }

    public async getAccountsBySigner(signerId: string): Promise<AccountRecord[]> {
        return Array.from(this.accounts.values()).filter(
            (account) => account.signerId === signerId,
        );
    }

    public async getAllAccounts(): Promise<AccountRecord[]> {
        return Array.from(this.accounts.values());
    }

    public async deleteAccount(id: string): Promise<void> {
        this.accounts.delete(id);
    }

    public async saveSession(session: SessionRecord): Promise<void> {
        this.session = session;
    }

    public async getSession(): Promise<SessionRecord | null> {
        return this.session;
    }

    public async clearSession(): Promise<void> {
        this.session = null;
    }
}
