import { DEFAULT_AUTO_LOCK_MS } from "@config/index";
import AutoTimer from "@domains/AutoTimer";
import { WalletOperationCancelledError } from "@domains/CustomError";
import type { TDecryptedSecret } from "@domains/SecretsProvider";

export interface ISigningSessionOptions {
    autoLockMs?: number;
    onAutoLock?: () => void;
}

export interface ISigningSessionSecrets {
    secret: TDecryptedSecret;
    dataKeySecret: string;
}

interface ISigningSessionState extends ISigningSessionSecrets {
    timer: AutoTimer;
}

export default class SigningSession {
    private readonly signerId: string;
    private state: ISigningSessionState | null = null;
    private generation: number = 0;

    constructor(signerId: string) {
        this.signerId = signerId;
    }

    public isActive(): boolean {
        return this.state !== null;
    }

    public getSecret(): TDecryptedSecret | null {
        return this.state?.secret ?? null;
    }

    public getDataKey(): string | null {
        return this.state?.dataKeySecret ?? null;
    }

    public getSessionGeneration(): number {
        return this.generation;
    }

    private wipeSecret(secret: TDecryptedSecret): void {
        if ("privateKey" in secret) {
            secret.privateKey.fill(0);
        }
    }

    public release(): void {
        this.generation++;

        if (!this.state) {
            return;
        }

        this.state.timer.clear();

        this.wipeSecret(this.state.secret);

        this.state = null;
    }

    public hold(
        currentGeneration: number,
        secrets: ISigningSessionSecrets,
        options?: ISigningSessionOptions,
    ): void {
        if (currentGeneration !== this.generation) {
            this.wipeSecret(secrets.secret);

            throw new WalletOperationCancelledError(this.signerId);
        }

        this.release();

        // TODO(next-major): Validate ISigningSessionOptions and throw on a
        // non-positive autoLockMs instead of silently skipping the session.
        const autoLockMs: number = options?.autoLockMs ?? DEFAULT_AUTO_LOCK_MS;

        if (autoLockMs <= 0) {
            this.wipeSecret(secrets.secret);

            return;
        }

        const onAutoLock: (() => void) | undefined = options?.onAutoLock;

        const timer: AutoTimer = new AutoTimer({
            delayMs: autoLockMs,
            onElapsed: () => {
                this.release();

                onAutoLock?.();
            },
        });

        this.state = { ...secrets, timer };

        timer.start();
    }
}
