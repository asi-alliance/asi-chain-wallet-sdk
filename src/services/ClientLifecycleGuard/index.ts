import Wallet from "@domains/Wallet";
import LifecycleGuard from "@domains/LifecycleGuard";
import { WalletOperationCancelledError } from "@domains/CustomError";

export type TDiscardWallet = (wallet: Wallet) => void;

export type TSetupWallet = (wallet: Wallet) => Promise<unknown>;

export default class ClientLifecycleGuard extends LifecycleGuard {
    private readonly discardWallet: TDiscardWallet;

    constructor(discardWallet: TDiscardWallet) {
        super();

        this.discardWallet = discardWallet;
    }

    private async setupWalletOrDiscard(
        wallet: Wallet,
        setupWallet: TSetupWallet,
    ): Promise<Wallet> {
        try {
            await setupWallet(wallet);

            return wallet;
        } catch (error: unknown) {
            this.discardWallet(wallet);

            throw error;
        }
    }

    public runWalletPublication(
        operation: () => Promise<Wallet>,
        setupWallet: TSetupWallet = async () => {},
    ): Promise<Wallet> {
        return this.run(
            async () =>
                this.setupWalletOrDiscard(await operation(), setupWallet),
            (wallet: Wallet) => {
                this.discardWallet(wallet);

                return new WalletOperationCancelledError(
                    wallet.getSigner().getId(),
                );
            },
        );
    }

    public runAccountsUpdate<T>(
        signerId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.run(
            operation,
            () => new WalletOperationCancelledError(signerId),
        );
    }
}
