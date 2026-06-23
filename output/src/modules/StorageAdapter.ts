export type EncryptedSecretMaterial = {
    readonly data: string;
    readonly salt: string;
    readonly iv: string;
    readonly version: number;
};

export type SignerType = "hd" | "private-key" | "mpc";

export interface SignerRecord {
    readonly id: string;
    readonly type: SignerType;
    readonly name: string;
    readonly encryptedSecret: EncryptedSecretMaterial;
    readonly createdAt: number;
    readonly updatedAt?: number;
}

export interface AccountRecord {
    readonly id: string;
    readonly address: string;
    readonly signerId: string;
    readonly networkId: string;
    readonly metadata?: Record<string, unknown>;
    readonly createdAt: number;
    readonly updatedAt?: number;
}

export interface SessionRecord {
    readonly activeAccountId: string | null;
    readonly updatedAt: number;
}

export interface IStorageAdapter {
    init(): Promise<void>;
    close(): Promise<void>;

    saveSigner(signer: SignerRecord): Promise<void>;
    getSigner(id: string): Promise<SignerRecord | null>;
    getAllSigners(): Promise<SignerRecord[]>;
    deleteSigner(id: string): Promise<void>;

    saveAccount(account: AccountRecord): Promise<void>;
    getAccount(id: string): Promise<AccountRecord | null>;
    getAccountsBySigner(signerId: string): Promise<AccountRecord[]>;
    getAllAccounts(): Promise<AccountRecord[]>;
    deleteAccount(id: string): Promise<void>;

    saveSession(session: SessionRecord): Promise<void>;
    getSession(): Promise<SessionRecord | null>;
    clearSession(): Promise<void>;
}
