import { NATIVE_TOKEN_DECIMALS_AMOUNT } from "@config/index";
import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import { IStorageFabricOptions } from "@fabrics/Storage";
import StorageManager from "@services/StorageManager";
import ApiClientManager from "@domains/ApiClientManager";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import Wallet, { Address } from "@domains/Wallet";
import Account from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import ReservationAdapter from "@domains/ReservationAdapter";
import { ITransactionReservation } from "@domains/Transaction";
import MnemonicService, { MnemonicStrength } from "@services/Mnemonic";
import KeysManager from "@services/KeysManager";
import WalletManager from "@services/WalletManager";
import { fromAtomicAmount, toAtomicAmount } from "@utils/index";
import { ICreatedAccountData } from "@services/AccountManager";
import ReservationAdapterManager from "@services/ReservationAdapterManager";
import InsensitiveCacheStorageManager from "@services/InsensitiveCacheStorageManager";
import InsensitiveCacheStorageSerializer from "@services/InsensitiveCacheStorageSerializer";
import { IInsensitiveCacheRecord } from "@domains/InsensitiveCacheStorageRepository";
import { EnsureWithInsensitiveCacheStorage } from "@utils/decorators";
import { DEFAULT_ASSET } from "@domains/Asset";
import { WalletTypes } from "@domains/Signer";

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
    onNetworkChanged?(network: INetworkRecord): void;
    onReservationsChanged?(
        walletId: string,
        reservations: ITransactionReservation[],
    ): void;
}

export interface ICreateClientFlags {
    withInsensitiveCacheStorage?: boolean;
}

export interface ICreateClientOptions {
    networksConfig: TNetworksConfig;
    defaultNetwork?: NetworkName;
    storageOptions?: IStorageFabricOptions;
    eventDispatcher?: IClientEventDispatcher;
    flags?: ICreateClientFlags;
}

interface IClientOptions {
    walletsMap?: Map<string, Wallet>;
    reservationAdaptersMap?: Map<string, ReservationAdapter>;
    eventDispatcher?: IClientEventDispatcher;
    flags?: ICreateClientFlags;
}

export default class Client {
    private readonly walletManager: WalletManager;
    private readonly reservationAdapterManager: ReservationAdapterManager;
    private readonly eventDispatcher?: IClientEventDispatcher;
    private readonly flags?: ICreateClientFlags;

    private constructor({
        walletsMap,
        reservationAdaptersMap,
        eventDispatcher,
        flags,
    }: IClientOptions) {
        this.walletManager = new WalletManager(walletsMap);
        this.reservationAdapterManager = new ReservationAdapterManager(
            reservationAdaptersMap,
        );
        this.eventDispatcher = eventDispatcher;
        this.flags = flags;
    }

    public static async create({
        networksConfig,
        defaultNetwork,
        storageOptions,
        eventDispatcher,
        flags,
    }: ICreateClientOptions): Promise<Client> {
        await StorageManager.init(storageOptions);

        const customNetworks: INetworkRecord[] =
            await StorageManager.getCustomNetworks();

        ApiClientManager.getInstance().initialize(
            networksConfig,
            customNetworks,
            defaultNetwork,
        );
        ApiServiceRegistry.getInstance();

        if (flags?.withInsensitiveCacheStorage) {
            await InsensitiveCacheStorageManager.init();
        }

        return new Client({ eventDispatcher, flags });
    }

    public getWalletManager(): WalletManager {
        return this.walletManager;
    }

    @EnsureWithInsensitiveCacheStorage
    public getInsensitiveAccountsData(): Promise<IInsensitiveCacheRecord[]> {
        return InsensitiveCacheStorageManager.getAll();
    }

    public async clearPersistence(): Promise<void> {
        this.walletManager.clear();
        this.reservationAdapterManager.clear();

        await StorageManager.clear();

        await this.emitWalletsChanged();
    }

    public close(): void {
        this.walletManager.clear();
        this.reservationAdapterManager.clear();

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

        await this.reservationAdapterManager.create(wallet, passwordProvider);

        await this.emitWalletsChanged();

        if (this.flags?.withInsensitiveCacheStorage) {
            InsensitiveCacheStorageManager.save(
                InsensitiveCacheStorageSerializer.serialize(
                    wallet.getActiveAccount()!,
                ),
            );
        }

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

        await this.reservationAdapterManager.create(wallet, secretProvider);

        await this.emitWalletsChanged();

        if (this.flags?.withInsensitiveCacheStorage) {
            InsensitiveCacheStorageManager.save(
                InsensitiveCacheStorageSerializer.serialize(
                    wallet.getActiveAccount()!,
                ),
            );
        }

        return wallet;
    }

    public async removeWallet(walletId: string): Promise<Wallet> {
        const removedWallet: Wallet = await this.walletManager.delete(walletId);
        this.reservationAdapterManager.remove(walletId);

        if (this.flags?.withInsensitiveCacheStorage) {
            InsensitiveCacheStorageManager.deleteAll(
                Array.from(removedWallet.getAccountsMap().keys()),
            );
        }

        await this.emitWalletsChanged();

        return removedWallet;
    }

    public async unlockWallet(
        signerId: string,
        password: string,
    ): Promise<Wallet> {
        if (
            this.walletManager.hasByFilter(
                (wallet: Wallet) => wallet.getSigner().getId() === signerId,
            )
        ) {
            throw new Error(
                "Client.unlockWallet: This wallet already unlocked",
            );
        }

        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const wallet: Wallet = await this.walletManager.unlock(
            signerId,
            passwordProvider,
        );

        await this.reservationAdapterManager.create(wallet, passwordProvider);

        return wallet;
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

        if (this.flags?.withInsensitiveCacheStorage) {
            InsensitiveCacheStorageManager.save(
                InsensitiveCacheStorageSerializer.serialize(
                    createdAccountData.account,
                ),
            );
        }

        return createdAccountData;
    }

    public async removeAccount(
        walletId: string,
        accountId: string,
    ): Promise<Account> {
        const removedAccount: Account = await this.walletManager.removeAccount(
            walletId,
            accountId,
        );

        if (this.flags?.withInsensitiveCacheStorage) {
            InsensitiveCacheStorageManager.delete(removedAccount.getId());
        }

        this.emitAccountsChanged(walletId);

        return removedAccount;
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

    public getCurrentNetworkId(): NetworkId {
        return ApiClientManager.getInstance().getCurrentNetworkId();
    }

    public getCurrentNetwork(): INetworkRecord {
        return ApiClientManager.getInstance().getCurrentNetwork();
    }

    public setNetwork(networkId: NetworkId): void {
        const apiClientManager = ApiClientManager.getInstance();

        apiClientManager.switchNetwork(networkId);

        this.eventDispatcher?.onNetworkChanged?.(
            apiClientManager.getCurrentNetwork(),
        );
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
    ): Promise<bigint> {
        const wallet: Wallet = this.getUnlockedWallet(walletId);
        const account: Account = this.getAccount(wallet, accountId);

        const reservationAdapter: ReservationAdapter | null =
            this.reservationAdapterManager.get(walletId);

        if (!reservationAdapter) {
            throw new Error(
                "Client.getAvailableBalance: Not found reservation adapter",
            );
        }

        const balance = await reservationAdapter.getBalance(account);

        return balance.amount;
    }

    public async getReservations(
        walletId: string,
    ): Promise<ITransactionReservation[]> {
        const reservationAdapter: ReservationAdapter | null =
            this.reservationAdapterManager.get(walletId);

        if (!reservationAdapter) {
            throw new Error(
                "Client.getReservations: Not found reservation adapter",
            );
        }

        return reservationAdapter.getReservations();
    }

    public async transfer(
        { walletId, accountId, to, amount }: ITransferRequest,
        password: string,
    ): Promise<string> {
        const wallet: Wallet = this.getUnlockedWallet(walletId);

        wallet.setActiveAccount(accountId);

        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const reservationAdapter: ReservationAdapter | null =
            this.reservationAdapterManager.get(walletId);

        if (!reservationAdapter) {
            throw new Error("Client.transfer: Not found reservation adapter");
        }

        const deployId: string = await reservationAdapter.transfer(
            wallet,
            { to, amount, asset: DEFAULT_ASSET },
            passwordProvider,
        );

        this.eventDispatcher?.onReservationsChanged?.(
            walletId,
            reservationAdapter.getReservations(),
        );

        return deployId;
    }

    public toDisplayAmount(atomicAmount: bigint): string {
        return fromAtomicAmount(atomicAmount, NATIVE_TOKEN_DECIMALS_AMOUNT);
    }

    public toAtomicAmount(amount: number | string): bigint {
        return toAtomicAmount(amount, NATIVE_TOKEN_DECIMALS_AMOUNT);
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

    public getNetworks(): INetworkRecord[] {
        return ApiClientManager.getInstance().getNetworks();
    }

    public getNetwork(id: NetworkId): INetworkRecord {
        return ApiClientManager.getInstance().getNetwork(id);
    }

    public async addNetwork(
        name: NetworkName,
        config: INetworkConfig,
    ): Promise<INetworkRecord> {
        const record: INetworkRecord =
            ApiClientManager.getInstance().addNetwork(name, config);

        await StorageManager.saveCustomNetwork(record);

        return record;
    }

    public async updateNetwork(
        id: NetworkId,
        update: INetworkUpdate,
    ): Promise<void> {
        const apiClientManager = ApiClientManager.getInstance();

        apiClientManager.updateNetwork(id, update);

        await StorageManager.updateCustomNetwork(apiClientManager.getNetwork(id));
    }

    public async removeNetwork(id: NetworkId): Promise<void> {
        ApiClientManager.getInstance().removeNetwork(id);

        await StorageManager.deleteCustomNetwork(id);
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
