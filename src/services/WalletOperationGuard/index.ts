import Wallet, { ACCOUNT_KEY_PREFIX } from "@domains/Wallet";
import { SIGNER_KEY_PREFIX } from "@domains/Signer";
import {
    DuplicateAccountError,
    DuplicateWalletError,
    WalletAction,
    WalletActionInProgressError,
} from "@domains/CustomError";
import ConcurrentOperationGuardService from "@services/ConcurrentOperationGuard";

export interface ISignerOperationOwner {
    signerId: string;
}

export interface IAccountOperationOwner extends ISignerOperationOwner {
    accountId: string;
}

export type TWalletOperationOwner =
    | ISignerOperationOwner
    | IAccountOperationOwner;

export default class WalletOperationGuardService extends ConcurrentOperationGuardService<TWalletOperationOwner> {
    private static instance: WalletOperationGuardService;

    public static getInstance(): WalletOperationGuardService {
        if (!WalletOperationGuardService.instance) {
            WalletOperationGuardService.instance =
                new WalletOperationGuardService();
        }

        return WalletOperationGuardService.instance;
    }

    private getSignerKey(fingerprint: string): string {
        return `${SIGNER_KEY_PREFIX}:${fingerprint}`;
    }

    private getAccountKey(fingerprint: string): string {
        return `${ACCOUNT_KEY_PREFIX}:${fingerprint}`;
    }

    private getActionKey(action: WalletAction, signerId: string): string {
        return `${action}:${signerId}`;
    }

    private getFingerprintReservations(
        wallet: Wallet,
    ): Map<string, TWalletOperationOwner> {
        const signerId: string = wallet.getSigner().getId();

        const reservations: Map<string, TWalletOperationOwner> = new Map([
            [
                this.getSignerKey(wallet.getSigner().getFingerprint()),
                { signerId },
            ],
        ]);

        for (const account of wallet.getAccounts()) {
            reservations.set(this.getAccountKey(account.getFingerprint()), {
                signerId,
                accountId: account.getId(),
            });
        }

        return reservations;
    }

    private createDuplicateError(conflictOwner: TWalletOperationOwner): Error {
        return "accountId" in conflictOwner
            ? new DuplicateAccountError(
                  conflictOwner.signerId,
                  conflictOwner.accountId,
              )
            : new DuplicateWalletError(conflictOwner.signerId);
    }

    public async runWalletCreation<T>(
        wallet: Wallet,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.run(
            this.getFingerprintReservations(wallet),
            (conflictOwner: TWalletOperationOwner) =>
                this.createDuplicateError(conflictOwner),
            operation,
        );
    }

    public async runWalletAction<T>(
        action: WalletAction,
        signerId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.run(
            new Map([[this.getActionKey(action, signerId), { signerId }]]),
            () => new WalletActionInProgressError(action, signerId),
            operation,
        );
    }
}