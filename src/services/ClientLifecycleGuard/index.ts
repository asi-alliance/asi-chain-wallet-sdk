import Wallet from "@domains/Wallet";
import LifecycleGuard from "@domains/LifecycleGuard";
import { WalletOperationCancelledError } from "@domains/CustomError";

export type TDiscardWallet = (wallet: Wallet) => void;

export default class ClientLifecycleGuard extends LifecycleGuard {
    private readonly discardWallet: TDiscardWallet;

    constructor(discardWallet: TDiscardWallet) {
        super();

        this.discardWallet = discardWallet;
    }

    public runWalletPublication(
        operation: () => Promise<Wallet>,
    ): Promise<Wallet> {
        return this.run(operation, (wallet: Wallet) => {
            this.discardWallet(wallet);

            return new WalletOperationCancelledError(wallet.getSigner().getId());
        });
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