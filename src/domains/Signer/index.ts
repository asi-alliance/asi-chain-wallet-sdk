import Bip44Path from "@domains/Bip44Path";
import type SecretsProvider from "@domains/SecretsProvider";
import type {
    IHDSecret,
    IPrivateKeyCredentials,
} from "@domains/SecretsProvider";
import CryptoService, { EncryptedData } from "@services/Crypto";
import { WalletLockedError } from "@domains/CustomError";
import AutoTimer from "@domains/AutoTimer";

export enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
}

export interface ISignerOptions {
    id: string;
    encryptedSecret: EncryptedData;
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

export type TDecryptedSecret = IPrivateKeyCredentials | IHDSecret;

export interface ISignerUnlockOptions {
    autoLockMs?: number;
    onAutoLock?: () => void;
}

interface ISignerSession {
    secret: TDecryptedSecret;
    timer: AutoTimer;
}

export interface ISignerRecord {
    id: string;
    type: WalletTypes;
    encryptedData: EncryptedData;
}

export default abstract class Signer {
    protected readonly id: string;
    protected encryptedSecret: EncryptedData;
    private session: ISignerSession | null = null;

    constructor({ id, encryptedSecret }: ISignerOptions) {
        this.id = id;
        this.encryptedSecret = encryptedSecret;
    }

    public getId(): string {
        return this.id;
    }

    public getEncryptedSecret(): EncryptedData {
        return this.encryptedSecret;
    }

    public isUnlocked(): boolean {
        return this.session !== null;
    }

    public async unlock(
        passwordProvider: SecretsProvider,
        options?: ISignerUnlockOptions,
    ): Promise<void> {
        const secret: TDecryptedSecret = await CryptoService.decryptSignerData(
            this.encryptedSecret,
            passwordProvider,
        );

        const onAutoLock: (() => void) | undefined = options?.onAutoLock;

        const timer: AutoTimer = new AutoTimer({
            delayMs: options?.autoLockMs ?? 0,
            onElapsed: () => {
                this.lock();

                onAutoLock?.();
            },
        });

        this.session = { secret, timer };

        timer.start();
    }

    protected async resolveSecret(
        signingContext: TSigningContext,
    ): Promise<{ secret: TDecryptedSecret; ephemeral: boolean }> {
        if (this.session) {
            return { secret: this.session.secret, ephemeral: false };
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
        if (!this.session) {
            return;
        }

        this.session.timer.clear();

        if ("privateKey" in this.session.secret) {
            this.session.secret.privateKey.fill(0);
        }

        this.session = null;
    }

    public abstract sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse>;
}
