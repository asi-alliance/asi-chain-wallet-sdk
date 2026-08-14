import {
    DEFAULT_AUTO_LOCK_MS,
    ExportFormat,
    NATIVE_TOKEN_DECIMALS_AMOUNT,
    RequirePassword,
} from "@config/index";
import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import { IStorageFabricOptions } from "@fabrics/storage";
import StorageManager from "@services/StorageManager";
import NetworkManager from "@services/NetworkManager";
import ApiClientManager from "@domains/ApiClientManager";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import {
    IDeployWatchCallbacks,
    IDeployWatchHandle,
    IDeployWatchOptions,
} from "@services/DeployStatusPoller";
import Wallet, { Address, IImportKeyfileWalletPayload } from "@domains/Wallet";
import Account from "@domains/Account";
import { CustomError, WalletLockedError } from "@domains/CustomError";
import SecretsProvider from "@domains/SecretsProvider";
import ReservationAdapter, {
    IReservedOperationResult,
} from "@domains/ReservationAdapter";
import {
    ITransactionReservation,
    TReservationsByWallet,
    Transaction,
} from "@domains/Transaction";
import MnemonicService, { MnemonicStrength } from "@services/Mnemonic";
import KeysManager from "@services/KeysManager";
import WalletManager, {
    ICreatedWalletAccounts,
} from "@services/WalletManager";
import WalletImportService, {
    IKeyfileImportPlan,
    IKeyfileImportPreview,
    IKeyfileImportResult,
} from "@services/WalletImport";
import ExportKeyfileService from "@services/ExportKeyfileService";
import { IImportWalletKeyfileOptions } from "@services/ImportKeyfileService";
import {
    fromAtomicAmount,
    isNetworkConfigChanged,
    toAtomicAmount,
} from "@utils/index";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { ICreatedAccountData } from "@services/AccountManager";
import ReservationAdapterManager from "@services/ReservationAdapterManager";
import InsensitiveCacheStorageManager from "@services/InsensitiveCacheStorageManager";
import InsensitiveCacheStorageSerializer from "@services/InsensitiveCacheStorageSerializer";
import { IInsensitiveCacheRecord } from "@domains/InsensitiveCacheStorageRepository";
import { EnsureWithInsensitiveCacheStorage } from "@utils/decorators";
import { DEFAULT_ASSET } from "@domains/Asset";
import { WalletTypes } from "@domains/Signer";
import { createReservationAdapter } from "@fabrics/client/reservationAdapter";
import { registerEventDispatcher } from "@fabrics/client/eventDispatcherBridge";
import ClientEventBus, {
    ClientEvent,
    IClientEventSource,
    TClientEventListenerErrorHandler,
} from "@services/ClientEventBus";
import TransactionsHistoryAggregator, {
    ITransactionsHistoryWindow,
} from "@services/TransactionsHistoryAggregator";

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

export interface IDeployRequest {
    walletId: string;
    accountId: string;
    term: string;
    phloLimit?: number;
}

export type THistorySource = "pending" | "executed";

export interface ITransactionsHistoryOptions {
    sources?: THistorySource[];
    pagination?: Pagination;
}

const DEFAULT_HISTORY_SOURCES: THistorySource[] = ["pending", "executed"];

export interface IClientEventDispatcher {
    onWalletsChanged?(wallets: Wallet[]): void | Promise<void>;
    onAccountsChanged?(
        walletId: string,
        accounts: Account[],
    ): void | Promise<void>;
    onNetworkChanged?(network: INetworkRecord): void | Promise<void>;
    onReservationsChanged?(
        reservationsByWallet: TReservationsByWallet,
    ): void | Promise<void>;
    onNetworkBusyChanged?(
        networkId: NetworkId,
        isBusy: boolean,
    ): void | Promise<void>;
    onWalletLocked?(walletId: string): void | Promise<void>;
}

export interface ISessionPolicy {
    autoLockMs?: number;
    requirePassword?: RequirePassword;
}

export interface ICreateClientFlags {
    withInsensitiveCacheStorage?: boolean;
}

export interface ICreateClientOptions {
    networksConfig: TNetworksConfig;
    defaultNetwork?: NetworkName;
    storageOptions?: IStorageFabricOptions;
    eventDispatcher?: IClientEventDispatcher;
    onListenerError?: TClientEventListenerErrorHandler;
    flags?: ICreateClientFlags;
    security?: ISessionPolicy;
}

interface IClientOptions {
    walletsMap?: Map<string, Wallet>;
    reservationAdaptersMap?: Map<string, ReservationAdapter>;
    eventDispatcher?: IClientEventDispatcher;
    onListenerError?: TClientEventListenerErrorHandler;
    flags?: ICreateClientFlags;
    security?: ISessionPolicy;
}

export default class Client {
    private readonly walletManager: WalletManager;
    private readonly reservationAdapterManager: ReservationAdapterManager;
    private readonly eventBus: ClientEventBus;
    private readonly flags?: ICreateClientFlags;
    private readonly autoLockMs: number;
    private readonly requirePassword: RequirePassword;

    private constructor({
        walletsMap,
        reservationAdaptersMap,
        eventDispatcher,
        onListenerError,
        flags,
        security,
    }: IClientOptions) {
        this.walletManager = new WalletManager(walletsMap);
        this.reservationAdapterManager = new ReservationAdapterManager(
            reservationAdaptersMap,
        );
        this.eventBus = new ClientEventBus(onListenerError);
        this.flags = flags;
        this.autoLockMs = security?.autoLockMs ?? DEFAULT_AUTO_LOCK_MS;
        this.requirePassword =
            security?.requirePassword ?? RequirePassword.ONCE_PER_SESSION;

        if (eventDispatcher) {
            registerEventDispatcher(this.eventBus, eventDispatcher);
        }
    }

    public static async create({
        networksConfig,
        defaultNetwork,
        storageOptions,
        eventDispatcher,
        onListenerError,
        flags,
        security,
    }: ICreateClientOptions): Promise<Client> {
        await StorageManager.init(storageOptions);

        await NetworkManager.initialize(networksConfig, defaultNetwork);
        ApiServiceRegistry.getInstance();

        if (flags?.withInsensitiveCacheStorage) {
            await InsensitiveCacheStorageManager.init();
        }

        return new Client({
            eventDispatcher,
            onListenerError,
            flags,
            security,
        });
    }

    private shouldHoldSession(): boolean {
        return this.requirePassword !== RequirePassword.EVERY_SIGNATURE;
    }

    private lockAllSessions(): void {
        for (const wallet of this.walletManager.getAll()) {
            wallet.lock();
        }
    }

    public getWalletManager(): WalletManager {
        return this.walletManager;
    }

    public getEventBus(): IClientEventSource {
        return this.eventBus.getSource();
    }

    @EnsureWithInsensitiveCacheStorage
    public getInsensitiveAccountsData(): Promise<IInsensitiveCacheRecord[]> {
        return InsensitiveCacheStorageManager.getAll();
    }

    public async clearPersistence(): Promise<void> {
        this.lockAllSessions();
        this.walletManager.clear();
        this.reservationAdapterManager.clear();

        await StorageManager.clear();

        this.emitWalletsChanged();
    }

    public close(): void {
        this.lockAllSessions();
        this.walletManager.clear();
        this.reservationAdapterManager.clear();

        StorageManager.close();
        ApiClientManager.getInstance().close();

        this.eventBus.clear();
    }

    public generateMnemonic(
        strength: MnemonicStrength = MnemonicStrength.TWELVE_WORDS,
    ): string {
        return MnemonicService.generateMnemonic(strength);
    }

    public generatePrivateKey(): Uint8Array {
        return KeysManager.generateKeyPair().privateKey;
    }

    private cacheInsensitiveAccountsData(accounts: Account[]): void {
        if (!this.flags?.withInsensitiveCacheStorage) {
            return;
        }

        for (const account of accounts) {
            InsensitiveCacheStorageManager.save(
                InsensitiveCacheStorageSerializer.serialize(account),
            );
        }
    }

    public async createHDWallet(
        { mnemonic, accountName, index }: ICreateHDWalletPayload,
        password: string,
    ): Promise<Wallet> {
        const normalizedMnemonic: string =
            MnemonicService.normalizeMnemonic(mnemonic);

        if (!MnemonicService.isMnemonicValid(normalizedMnemonic)) {
            throw new Error(
                "Client.createHDWallet: recovery mnemonic is invalid",
            );
        }

        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const wallet: Wallet = await this.walletManager.createHD(
            { mnemonic: normalizedMnemonic, accountName, index },
            passwordProvider,
        );

        await createReservationAdapter({
            reservationAdapterManager: this.reservationAdapterManager,
            wallet,
            passwordProvider,
            eventBus: this.eventBus,
        });

        this.emitWalletsChanged();

        this.cacheInsensitiveAccountsData(wallet.getAccounts());

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

        await createReservationAdapter({
            reservationAdapterManager: this.reservationAdapterManager,
            wallet,
            passwordProvider: secretProvider,
            eventBus: this.eventBus,
        });

        this.emitWalletsChanged();

        this.cacheInsensitiveAccountsData(wallet.getAccounts());

        return wallet;
    }

    public async removeWallet(walletId: string): Promise<Wallet> {
        const removedWallet: Wallet = await this.walletManager.delete(walletId);
        removedWallet.lock();
        this.reservationAdapterManager.remove(walletId);

        if (this.flags?.withInsensitiveCacheStorage) {
            InsensitiveCacheStorageManager.deleteAll(
                Array.from(removedWallet.getAccountsMap().keys()),
            );
        }

        this.emitWalletsChanged();

        return removedWallet;
    }

    private async holdSession(
        wallet: Wallet,
        passwordProvider: SecretsProvider,
    ): Promise<void> {
        await wallet.unlock(passwordProvider, {
            autoLockMs: this.autoLockMs,
            onAutoLock: () =>
                this.eventBus.emit(ClientEvent.WALLET_LOCKED, wallet.getId()),
        });
    }

    private async ensureSession(
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
    ): Promise<void> {
        if (
            !passwordProvider ||
            !this.shouldHoldSession() ||
            wallet.isUnlocked()
        ) {
            return;
        }

        await this.holdSession(wallet, passwordProvider);
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

        if (this.shouldHoldSession()) {
            await this.holdSession(wallet, passwordProvider);
        }

        await createReservationAdapter({
            reservationAdapterManager: this.reservationAdapterManager,
            wallet,
            passwordProvider,
            eventBus: this.eventBus,
        });

        return wallet;
    }

    private async ensureWalletIsUnlocked(
        signerId: string,
        password: string,
    ): Promise<void> {
        if (this.walletManager.getBySignerId(signerId)) {
            return;
        }

        try {
            await this.unlockWallet(signerId, password);
        } catch (error) {
            if (error instanceof CustomError) {
                throw error;
            }

            throw new WalletLockedError(
                `Wallet ${signerId} cannot be unlocked with the provided password, unlock it manually before importing accounts`,
            );
        }
    }

    public lockWallet(walletId: string): void {
        const wallet: Wallet = this.getUnlockedWallet(walletId);

        wallet.lock();

        this.eventBus.emit(ClientEvent.WALLET_LOCKED, walletId);
    }

    public isWalletUnlocked(walletId: string): boolean {
        return this.walletManager.get(walletId)?.isUnlocked() ?? false;
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

        this.cacheInsensitiveAccountsData([createdAccountData.account]);

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

    public getExportedAccountData(walletId: string, accountId: string): string {
        const exportedAccount: Account = this.walletManager.getAccount(
            walletId,
            accountId,
        );

        return ExportKeyfileService.toJSON(
            ExportKeyfileService.exportAccountKeyfile(exportedAccount),
        );
    }

    public async exportWalletKeyfile(
        walletId: string,
        password: string,
    ): Promise<string> {
        const targetWallet: Wallet | null = this.walletManager.get(walletId);

        if (!targetWallet) {
            throw new Error("Client.exportWalletKeyfile: unknown wallet id");
        }

        return ExportKeyfileService.toJSON(
            await ExportKeyfileService.exportWalletKeyfile(
                targetWallet,
                this.createPasswordProvider(password),
            ),
        );
    }

    public async previewWalletKeyfileImport(
        source: unknown,
        password: string,
    ): Promise<IKeyfileImportPreview> {
        return WalletImportService.previewKeyfileImport(
            source,
            this.createPasswordProvider(password),
        );
    }

    private async createWalletFromKeyfile(
        payload: IImportKeyfileWalletPayload,
        passwordProvider: SecretsProvider,
    ): Promise<IKeyfileImportResult> {
        const wallet: Wallet = await this.walletManager.importKeyfile(
            payload,
            passwordProvider,
        );

        await createReservationAdapter({
            reservationAdapterManager: this.reservationAdapterManager,
            wallet,
            passwordProvider,
            eventBus: this.eventBus,
        });

        this.emitWalletsChanged();
        this.cacheInsensitiveAccountsData(wallet.getAccounts());

        return {
            signerId: wallet.getSigner().getId(),
            walletId: wallet.getId(),
            isMergedIntoExistingWallet: false,
            importedAccountIds: wallet
                .getAccounts()
                .map((account: Account) => account.getId()),
            wallet,
        };
    }

    public async importWalletKeyfile(
        source: unknown,
        password: string,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IKeyfileImportResult> {
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const {
            payload,
            secretProvider,
            existingSignerId,
        }: IKeyfileImportPlan = await WalletImportService.prepareKeyfileImport(
            source,
            passwordProvider,
            options,
        );

        if (!existingSignerId) {
            return this.createWalletFromKeyfile(payload, passwordProvider);
        }

        await this.ensureWalletIsUnlocked(existingSignerId, password);

        const { wallet, accounts }: ICreatedWalletAccounts =
            await this.walletManager.createAccounts(
                existingSignerId,
                payload.accounts,
                secretProvider,
            );

        this.emitAccountsChanged(wallet.getId());
        this.emitWalletsChanged();
        this.cacheInsensitiveAccountsData(accounts);

        return {
            signerId: existingSignerId,
            walletId: wallet.getId(),
            isMergedIntoExistingWallet: true,
            importedAccountIds: accounts.map((account: Account) =>
                account.getId(),
            ),
            wallet,
        };
    }

    public async getExportedTransactionsData(
        walletId: string,
        accountId: string,
        format: ExportFormat = ExportFormat.JSON,
        networkId?: string,
    ): Promise<string> {
        const currentAccount: Account = this.walletManager.getAccount(
            walletId,
            accountId,
        );

        const transactions: Transaction[] =
            await currentAccount.getTransactionsHistory(networkId);

        return ExportKeyfileService.exportTransactions(transactions, format);
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

        this.eventBus.emit(
            ClientEvent.NETWORK_CHANGED,
            apiClientManager.getCurrentNetwork(),
        );

        this.emitReservationsChanged();
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

    public async getTransactionsHistory(
        walletId: string,
        accountId: string,
        options?: ITransactionsHistoryOptions,
    ): Promise<Transaction[]> {
        const wallet: Wallet = this.getUnlockedWallet(walletId);
        const account: Account = this.getAccount(wallet, accountId);

        const { sources = DEFAULT_HISTORY_SOURCES, pagination } = options ?? {};

        const reservationAdapter: ReservationAdapter | null =
            this.reservationAdapterManager.get(walletId);

        const pendingTransactions: Transaction[] =
            sources.includes("pending") && reservationAdapter
                ? reservationAdapter.getPendingTransactions(accountId)
                : [];

        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        if (!sources.includes("executed")) {
            return TransactionsHistoryAggregator.paginatePendingTransactions(
                pendingTransactions,
                networkId,
                pagination,
            );
        }

        if (!pendingTransactions.length) {
            return account.getTransactionsHistory(undefined, pagination);
        }

        const historyWindow: ITransactionsHistoryWindow =
            TransactionsHistoryAggregator.createHistoryWindow(
                pendingTransactions,
                networkId,
                pagination,
            );

        const executedTransactions: Transaction[] =
            await account.getTransactionsHistory(
                undefined,
                historyWindow.executedPagination,
            );

        return TransactionsHistoryAggregator.mergeHistoryPage(
            historyWindow,
            executedTransactions,
        );
    }

    public transfer(
        { walletId, accountId, to, amount }: ITransferRequest,
        password?: string,
    ): Promise<IReservedOperationResult> {
        return ApiClientManager.getInstance().runNetworkOperation(async () => {
            const wallet: Wallet = this.getUnlockedWallet(walletId);

            wallet.setActiveAccount(accountId);

            const passwordProvider: SecretsProvider | undefined =
                password !== undefined
                    ? this.createPasswordProvider(password)
                    : undefined;

            await this.ensureSession(wallet, passwordProvider);

            const reservationAdapter: ReservationAdapter | null =
                this.reservationAdapterManager.get(walletId);

            if (!reservationAdapter) {
                throw new Error(
                    "Client.transfer: Not found reservation adapter",
                );
            }

            return reservationAdapter.transfer(
                wallet,
                { to, amount, asset: DEFAULT_ASSET },
                passwordProvider,
            );
        }, this.emitNetworkBusyChanged.bind(this));
    }

    public deploy(
        { walletId, accountId, term, phloLimit }: IDeployRequest,
        password?: string,
    ): Promise<IReservedOperationResult> {
        return ApiClientManager.getInstance().runNetworkOperation(async () => {
            const wallet: Wallet = this.getUnlockedWallet(walletId);

            wallet.setActiveAccount(accountId);

            const passwordProvider: SecretsProvider | undefined =
                password !== undefined
                    ? this.createPasswordProvider(password)
                    : undefined;

            await this.ensureSession(wallet, passwordProvider);

            const reservationAdapter: ReservationAdapter | null =
                this.reservationAdapterManager.get(walletId);

            if (!reservationAdapter) {
                throw new Error("Client.deploy: Not found reservation adapter");
            }

            return reservationAdapter.deploy(
                wallet,
                { term, phloLimit },
                passwordProvider,
            );
        }, this.emitNetworkBusyChanged.bind(this));
    }

    public exploreDeploy(rholang: string): Promise<unknown> {
        return ApiServiceRegistry.getInstance().deploy.exploreDeployData(
            rholang,
        );
    }

    public watchDeploy(
        deployId: string,
        callbacks?: IDeployWatchCallbacks,
        options?: IDeployWatchOptions,
    ): IDeployWatchHandle {
        return ApiServiceRegistry.getInstance().poller.watch(
            deployId,
            callbacks,
            options,
        );
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

    public isNetworkBusy(networkId?: NetworkId): boolean {
        const apiClientManager: ApiClientManager =
            ApiClientManager.getInstance();

        return apiClientManager.isNetworkBusy(
            networkId ?? apiClientManager.getCurrentNetworkId(),
        );
    }

    public addNetwork(
        name: NetworkName,
        config: INetworkConfig,
    ): Promise<INetworkRecord> {
        return NetworkManager.addNetwork(name, config);
    }

    public hasNetworkReservations(networkId?: NetworkId): boolean {
        return this.reservationAdapterManager.hasNetworkReservations(
            networkId ?? ApiClientManager.getInstance().getCurrentNetworkId(),
        );
    }

    public async updateNetwork(
        id: NetworkId,
        update: INetworkUpdate,
    ): Promise<void> {
        const isConfigChanged: boolean = isNetworkConfigChanged(
            ApiClientManager.getInstance().getNetwork(id).config,
            update.config,
        );

        await NetworkManager.updateNetwork(id, update);

        if (!isConfigChanged) {
            return;
        }

        await this.reservationAdapterManager.removeNetworkReservations(id);

        this.emitReservationsChanged();
    }

    public async removeNetwork(id: NetworkId): Promise<void> {
        await NetworkManager.removeNetwork(id);

        await this.reservationAdapterManager.removeNetworkReservations(id);

        this.emitReservationsChanged();
    }

    private createPasswordProvider(password: string): SecretsProvider {
        return new SecretsProvider(() => ({ password }));
    }

    private emitReservationsChanged(): void {
        this.eventBus.emit(
            ClientEvent.RESERVATIONS_CHANGED,
            this.reservationAdapterManager.getReservationsByWallet(),
        );
    }

    private emitNetworkBusyChanged(
        networkId: NetworkId,
        isBusy: boolean,
    ): void {
        this.eventBus.emit(ClientEvent.NETWORK_BUSY_CHANGED, networkId, isBusy);
    }

    private emitAccountsChanged(walletId: string): void {
        const wallet: Wallet | null = this.walletManager.get(walletId);

        if (!wallet) {
            return;
        }

        this.eventBus.emit(
            ClientEvent.ACCOUNTS_CHANGED,
            walletId,
            wallet.getAccounts(),
        );
    }

    private emitWalletsChanged(): void {
        this.eventBus.emit(
            ClientEvent.WALLETS_CHANGED,
            this.walletManager.getAll(),
        );
    }
}
