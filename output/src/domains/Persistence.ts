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
