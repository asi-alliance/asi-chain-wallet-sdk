import { DEFAULT_ASSET, NATIVE_TOKEN_DECIMALS_AMOUNT } from "@config/index";
import { NetworkName, TNetworksConfig } from "@domains/Network";
import { IStorageFabricOptions } from "@fabrics/Storage";
import StorageManager from "@services/StorageManager";
import ApiClientManager from "@domains/ApiClientManager";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import Wallet, { Address, WalletTypes } from "@domains/Wallet";
import Account from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import ReservationAdapter from "@domains/ReservationAdapter";
import { ITransactionReservation } from "@domains/Transaction";
import MnemonicService, { MnemonicStrength } from "@services/Mnemonic";
import KeysManager from "@services/KeysManager";
import WalletManager from "@services/WalletManager";
import { fromAtomicAmount, toAtomicAmount } from "@utils/index";
import { ICreatedAccountData } from "@services/AccountManager";

export interface IUnlockedWallet {
    id: string;
    signerId: string;
    type: WalletTypes;
    accounts: Account[];
    activeAccountId: string | null;
}

export interface ICreateHDWalletPayload {
    mnemonic: string;
    accountName: string;
    index?: number;
}

export interface ICreatePrivateKeyWalletPayload {
    privateKey: Uint8Array;
    accountName: string;
}

export interface ITransferRequest {
    walletId: string;
    accountId: string;
    to: Address;
    amount: bigint;
}

export interface IClientEventDispatcher {
    onWalletsChanged?(wallets: Wallet[]): void;
    onAccountsChanged?(walletId: string, accounts: Account[]): void;
    onNetworkChanged?(networkName: NetworkName): void;
    onReservationsChanged?(
        walletId: string,
        reservations: ITransactionReservation[],
    ): void;
}

export interface ICreateClientOptions {
    networksConfig: TNetworksConfig;
    defaultNetwork?: NetworkName;
    storageOptions?: IStorageFabricOptions;
    eventDispatcher?: IClientEventDispatcher;
}

interface IClientOptions {
    walletsMap?: Map<string, Wallet>;
    eventDispatcher?: IClientEventDispatcher;
}

export default class Client {
    private readonly eventDispatcher?: IClientEventDispatcher;
    private readonly walletManager: WalletManager;

    private constructor({ walletsMap, eventDispatcher }: IClientOptions) {
        this.walletManager = new WalletManager(walletsMap);
        this.eventDispatcher = eventDispatcher;
    }

    public static async create({
        networksConfig,
        defaultNetwork,
        storageOptions,
        eventDispatcher,
    }: ICreateClientOptions): Promise<Client> {
        await StorageManager.init(storageOptions);

        ApiClientManager.getInstance().initialize(
            networksConfig,
            defaultNetwork,
        );
        ApiServiceRegistry.getInstance();

        return new Client({ eventDispatcher });
    }

    public getWalletManager(): WalletManager {
        return this.walletManager;
    }

    public async clearPersistence(): Promise<void> {
        this.walletManager.clear();

        await StorageManager.clear();

        await this.emitWalletsChanged();
    }

    public close(): void {
        this.walletManager.clear();

        StorageManager.close();
        ApiClientManager.getInstance().close();
    }

    public generateMnemonic(
        strength: MnemonicStrength = MnemonicStrength.TWELVE_WORDS,
    ): string {
        return MnemonicService.generateMnemonic(strength);
    }

    public generatePrivateKey(): Uint8Array {
        return KeysManager.generateKeyPair().privateKey;
    }

    public async createHDWallet(
        { mnemonic, accountName, index }: ICreateHDWalletPayload,
        password: string,
    ): Promise<Wallet> {
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const wallet: Wallet = await this.walletManager.createHD(
            { mnemonic, accountName, index },
            passwordProvider,
        );

        await this.emitWalletsChanged();

        return wallet;
    }

    public async createPrivateKeyWallet(
        { privateKey, accountName }: ICreatePrivateKeyWalletPayload,
        password: string,
    ): Promise<Wallet> {
        const secretProvider: SecretsProvider = new SecretsProvider(() => ({
            password,
            secret: { privateKey },
        }));

        const wallet: Wallet = await this.walletManager.createPrivateKey(
            accountName,
            secretProvider,
        );

        await this.emitWalletsChanged();

        return wallet;
    }

    public async removeWallet(walletId: string): Promise<void> {
        await this.walletManager.delete(walletId);

        await this.emitWalletsChanged();
    }

    public async unlockWallet(
        signerId: string,
        password: string,
    ): Promise<Wallet> {
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const wallet: Wallet = await this.walletManager.unlock(
            signerId,
            passwordProvider,
        );

        return wallet;
    }

    public lockWallet(walletId: string): void {
        this.walletManager.remove(walletId);
    }

    public async deriveAccount(
        walletId: string,
        accountName: string,
        password: string,
    ): Promise<ICreatedAccountData> {
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const createdAccountData: ICreatedAccountData =
            await this.walletManager.deriveAccount(
                walletId,
                accountName,
                passwordProvider,
            );

        this.emitAccountsChanged(walletId);

        return createdAccountData;
    }

    public async removeAccount(
        walletId: string,
        accountId: string,
    ): Promise<void> {
        await this.walletManager.removeAccount(walletId, accountId);

        this.emitAccountsChanged(walletId);
    }

    public async renameAccount(
        walletId: string,
        accountId: string,
        name: string,
    ): Promise<void> {
        await this.walletManager.renameAccount(walletId, accountId, name);

        this.emitAccountsChanged(walletId);
    }

    public setActiveAccount(walletId: string, accountId: string): void {
        this.walletManager.setActiveAccount(walletId, accountId);
    }

    public getNetworksNames(): NetworkName[] {
        return ApiClientManager.getInstance().getNetworkNames();
    }

    public getCurrentNetwork(): NetworkName {
        return ApiClientManager.getInstance().getNetwork();
    }

    public setNetwork(networkName: NetworkName): void {
        ApiClientManager.getInstance().switchNetwork(networkName);

        this.eventDispatcher?.onNetworkChanged?.(networkName);
    }

    public async getBalance(address: Address): Promise<bigint> {
        const balance =
            await ApiServiceRegistry.getInstance().assets.getBalance(
                address,
                DEFAULT_ASSET,
            );

        return balance.amount;
    }

    public async getAvailableBalance(
        walletId: string,
        accountId: string,
        password: string,
    ): Promise<bigint> {
        const wallet: Wallet = this.getUnlockedWallet(walletId);
        const account: Account = this.getAccount(wallet, accountId);
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        return this.withReservationAdapter(
            wallet,
            passwordProvider,
            async (adapter: ReservationAdapter) => {
                const balance = await adapter.getBalance(account);

                return balance.amount;
            },
        );
    }

    public async getReservations(
        walletId: string,
        password: string,
    ): Promise<ITransactionReservation[]> {
        const wallet: Wallet = this.getUnlockedWallet(walletId);
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        return this.withReservationAdapter(
            wallet,
            passwordProvider,
            (adapter: ReservationAdapter) => adapter.getReservations(),
        );
    }

    public async transfer(
        { walletId, accountId, to, amount }: ITransferRequest,
        password: string,
    ): Promise<string> {
        const wallet: Wallet = this.getUnlockedWallet(walletId);

        wallet.setActiveAccount(accountId);

        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        return this.withReservationAdapter(
            wallet,
            passwordProvider,
            async (adapter: ReservationAdapter) => {
                const deployId: string = await adapter.transfer(
                    wallet,
                    { to, amount, asset: DEFAULT_ASSET },
                    passwordProvider,
                );

                this.eventDispatcher?.onReservationsChanged?.(
                    walletId,
                    adapter.getReservations(),
                );

                return deployId;
            },
        );
    }

    public toDisplayAmount(atomicAmount: bigint): string {
        return fromAtomicAmount(atomicAmount, NATIVE_TOKEN_DECIMALS_AMOUNT);
    }

    public toAtomicAmount(amount: number | string): bigint {
        return toAtomicAmount(amount, NATIVE_TOKEN_DECIMALS_AMOUNT);
    }

    private async withReservationAdapter<T>(
        wallet: Wallet,
        passwordProvider: SecretsProvider,
        handler: (adapter: ReservationAdapter) => T | Promise<T>,
    ): Promise<T> {
        const adapter: ReservationAdapter = await ReservationAdapter.create(
            wallet,
            passwordProvider,
        );

        try {
            return await handler(adapter);
        } finally {
            adapter.dispose();
        }
    }

    private getUnlockedWallet(walletId: string): Wallet {
        const wallet: Wallet | null = this.walletManager.get(walletId);

        if (!wallet) {
            throw new Error(`Wallet ${walletId} is not unlocked`);
        }

        return wallet;
    }

    private getAccount(wallet: Wallet, accountId: string): Account {
        const account: Account | undefined = wallet
            .getAccountsMap()
            .get(accountId);

        if (!account) {
            throw new Error(`Account ${accountId} not found`);
        }

        return account;
    }

    private createPasswordProvider(password: string): SecretsProvider {
        return new SecretsProvider(() => ({ password }));
    }

    private emitAccountsChanged(walletId: string): void {
        if (!this.eventDispatcher?.onAccountsChanged) {
            return;
        }

        const wallet: Wallet | null = this.walletManager.get(walletId);

        if (!wallet) {
            return;
        }

        this.eventDispatcher.onAccountsChanged(walletId, wallet.getAccounts());
    }

    private async emitWalletsChanged(): Promise<void> {
        if (!this.eventDispatcher?.onWalletsChanged) {
            return;
        }

        this.eventDispatcher.onWalletsChanged(this.walletManager.getAll());
    }
}
