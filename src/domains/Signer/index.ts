import type SecretsProvider from "@domains/SecretsProvider";
import CryptoService, { EncryptedData } from "@services/Crypto";
import { WalletLockedError } from "@domains/CustomError";
import SigningSession, {
    ISigningSessionOptions,
    TDecryptedSecret,
} from "@domains/SigningSession";

export const SIGNER_KEY_PREFIX: string = "SIGNER";

export enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
}

export interface ISignerOptions {
    id: string;
    encryptedSecret: EncryptedData;
    encryptedDataKey: EncryptedData;
    fingerprint: string;
}

export type TPKSigningContext = {
    passwordProvider?: SecretsProvider;
};

export type THDSigningContext = {
    passwordProvider?: SecretsProvider;
    index: number;
};

export type ISignedMessageResponse = {
    signature: Uint8Array;
    publicKey: Uint8Array;
};

export type TSigningContext = TPKSigningContext | THDSigningContext;

export interface ISignerRecord {
    id: string;
    type: WalletTypes;
    encryptedData: EncryptedData;
    encryptedDataKey: EncryptedData;
    fingerprint: string;
}

export default abstract class Signer {
    protected readonly id: string;
    protected encryptedSecret: EncryptedData;
    protected encryptedDataKey: EncryptedData;
    private readonly fingerprint: string;
    private readonly session: SigningSession;

    constructor({
        id,
        encryptedSecret,
        encryptedDataKey,
        fingerprint,
    }: ISignerOptions) {
        this.id = id;
        this.encryptedSecret = encryptedSecret;
        this.encryptedDataKey = encryptedDataKey;
        this.fingerprint = fingerprint;
        this.session = new SigningSession(id);
    }

    public getId(): string {
        return this.id;
    }

    public getFingerprint(): string {
        return this.fingerprint;
    }

    public getEncryptedSecret(): EncryptedData {
        return this.encryptedSecret;
    }

    public getEncryptedDataKey(): EncryptedData {
        return this.encryptedDataKey;
    }

    public isUnlocked(): boolean {
        return this.session.isActive();
    }

    public async unlock(
        passwordProvider: SecretsProvider,
        options?: ISigningSessionOptions,
    ): Promise<void> {
        const currentGeneration: number = this.session.getSessionGeneration();

        const secret: TDecryptedSecret = await CryptoService.decryptSignerData(
            this.encryptedSecret,
            passwordProvider,
        );

        const dataKeySecret: string = await CryptoService.decryptWithPassword(
            this.encryptedDataKey,
            passwordProvider.getSecret().password,
        );

        this.session.hold(
            currentGeneration,
            { secret, dataKeySecret },
            options,
        );
    }

    public async resolveDataKey(
        passwordProvider?: SecretsProvider,
    ): Promise<string> {
        const dataKeySecret: string | null = this.session.getDataKey();

        if (dataKeySecret) {
            return dataKeySecret;
        }

        if (!passwordProvider) {
            throw new WalletLockedError();
        }

        return CryptoService.decryptWithPassword(
            this.encryptedDataKey,
            passwordProvider.getSecret().password,
        );
    }

    protected async resolveSecret(
        signingContext: TSigningContext,
    ): Promise<{ secret: TDecryptedSecret; ephemeral: boolean }> {
        const sessionSecret: TDecryptedSecret | null =
            this.session.getSecret();

        if (sessionSecret) {
            return { secret: sessionSecret, ephemeral: false };
        }

        if (!signingContext.passwordProvider) {
            throw new WalletLockedError();
        }

        const secret: TDecryptedSecret = await CryptoService.decryptSignerData(
            this.encryptedSecret,
            signingContext.passwordProvider,
        );

        return { secret, ephemeral: true };
    }

    public lock(): void {
        this.session.release();
    }

    public abstract sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse>;
}
