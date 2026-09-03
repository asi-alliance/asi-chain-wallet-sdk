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
import StorageBootstrap from "@services/StorageBootstrap";
import NetworkManager from "@services/NetworkManager";
import ApiClientManager from "@domains/ApiClientManager";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import {
    IDeployWatchCallbacks,
    IDeployWatchHandle,
    IDeployWatchOptions,
} from "@services/DeployStatusPoller";
import Wallet, { Address } from "@domains/Wallet";
import Account from "@domains/Account";
import ClientLifecycleGuard from "@services/ClientLifecycleGuard";
import ClosableDomain from "@domains/ClosableDomain";
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
import WalletManager from "@services/WalletManager";
import WalletPersistenceService from "@services/WalletPersistence";
import WalletImportService, {
    IKeyfileAccountsImportPlan,
    IKeyfileAccountsImportResult,
    IKeyfileImportPlan,
    IKeyfileImportPreview,
} from "@services/WalletImport";
import ExportKeyfileService, {
    IAccountKeyfile,
    IWalletKeyfile,
} from "@services/ExportKeyfileService";
import { IImportWalletKeyfileOptions } from "@services/ImportKeyfileService";
import {
    fromAtomicAmount,
    isNetworkConfigChanged,
    isPrivateKeyValid,
    toAtomicAmount,
} from "@utils/index";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { ICreatedAccountData } from "@services/AccountManager";
import ReservationAdapterManager from "@services/ReservationAdapterManager";
import InsensitiveCacheStorageManager from "@services/InsensitiveCacheStorageManager";
import InsensitiveCacheStorageSerializer from "@services/InsensitiveCacheStorageSerializer";
import { IInsensitiveCacheRecord } from "@domains/InsensitiveCacheStorageRepository";
import {
    EnsureActive,
    EnsureWithInsensitiveCacheStorage,
    TrackOperation,
} from "@utils/decorators";
import { DEFAULT_ASSET } from "@domains/Asset";
import { registerEventDispatcher } from "@fabrics/client/eventDispatcherBridge";
import ClientEventBus, {
    ClientEvent,
    IClientEventSource,
    TClientEventListenerErrorHandler,
} from "@services/ClientEventBus";
import TransactionsHistoryAggregator, {
    ITransactionsHistoryWindow,
} from "@services/TransactionsHistoryAggregator";
import TransactionReservationFabric, {
    TCreateTransactionReservationPayload,
    TTransactionReservationMeta,
} from "@fabrics/transactionReservation";

export type {
    IDeployReservationMeta,
    ITransferReservationMeta,
    TTransactionReservationMeta,
} from "@fabrics/transactionReservation";

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

export type TTransactionReservationRequest = {
    walletId: string;
    accountId: string;
} & TTransactionReservationMeta;

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

export default class Client extends ClosableDomain {
    private readonly walletManager: WalletManager;
    private readonly reservationAdapterManager: ReservationAdapterManager;
    private readonly eventBus: ClientEventBus;
    private readonly flags?: ICreateClientFlags;
    private readonly autoLockMs: number;
    private readonly requirePassword: RequirePassword;
    private readonly lifecycleGuard: ClientLifecycleGuard;

    private constructor({
        walletsMap,
        reservationAdaptersMap,
        eventDispatcher,
        onListenerError,
        flags,
        security,
    }: IClientOptions) {
        super();

        this.walletManager = new WalletManager(walletsMap);
        this.eventBus = new ClientEventBus(onListenerError);
        this.reservationAdapterManager = new ReservationAdapterManager({
            reservationAdapters: reservationAdaptersMap,
            onReservationsChanged: () => this.emitReservationsChanged(),
        });
        this.flags = flags;
        this.autoLockMs = security?.autoLockMs ?? DEFAULT_AUTO_LOCK_MS;
        this.requirePassword =
            security?.requirePassword ?? RequirePassword.ONCE_PER_SESSION;
        this.lifecycleGuard = new ClientLifecycleGuard((wallet: Wallet) =>
            this.discardWallet(wallet),
        );

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
        await StorageBootstrap.init({
            storageOptions,
            withInsensitiveCacheStorage: flags?.withInsensitiveCacheStorage,
        });

        await NetworkManager.initialize(networksConfig, defaultNetwork);
        ApiServiceRegistry.getInstance();

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

    private resetRuntimeState(): void {
        this.lifecycleGuard.invalidate();

        this.lockAllSessions();
        this.walletManager.clear();
        this.reservationAdapterManager.clear();
    }

    public getWalletManager(): WalletManager {
        return this.walletManager;
    }

    public getEventBus(): IClientEventSource {
        return this.eventBus.getSource();
    }

    @EnsureActive
    @EnsureWithInsensitiveCacheStorage
    public getInsensitiveAccountsData(): Promise<IInsensitiveCacheRecord[]> {
        return InsensitiveCacheStorageManager.getAll();
    }

    @EnsureActive
    public closeAllWallets(): void {
        this.resetRuntimeState();

        this.emitWalletsChanged();
    }

    @EnsureActive
    public async clearPersistence(): Promise<void> {
        this.resetRuntimeState();

        await this.lifecycleGuard.drain();

        await StorageManager.clear();
        await InsensitiveCacheStorageManager.clear();

        this.emitWalletsChanged();
    }

    protected async onClose(): Promise<void> {
        this.eventBus.clear();

        this.resetRuntimeState();

        await this.lifecycleGuard.drain();

        StorageManager.close();
        InsensitiveCacheStorageManager.close();
        StorageBootstrap.close();
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

    @EnsureActive
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

        const secretProvider: SecretsProvider = new SecretsProvider(() => ({
            password,
            secret: { seed: normalizedMnemonic },
        }));

        const wallet: Wallet = await this.lifecycleGuard.runWalletPublication(
            async () => {
                const createdWallet: Wallet = await this.walletManager.createHD(
                    { accountName, index },
                    secretProvider,
                );

                await this.reservationAdapterManager.create(
                    createdWallet,
                    secretProvider,
                );

                return createdWallet;
            },
        );

        this.emitWalletsChanged();

        this.cacheInsensitiveAccountsData(wallet.getAccounts());

        return wallet;
    }

    @EnsureActive
    public async createPrivateKeyWallet(
        { privateKey, accountName }: ICreatePrivateKeyWalletPayload,
        password: string,
    ): Promise<Wallet> {
        if (!isPrivateKeyValid(privateKey)) {
            throw new Error(
                "Client.createPrivateKeyWallet: private key is invalid",
            );
        }

        const secretProvider: SecretsProvider = new SecretsProvider(() => ({
            password,
            secret: { privateKey },
        }));

        const wallet: Wallet = await this.lifecycleGuard.runWalletPublication(
            async () => {
                const createdWallet: Wallet =
                    await this.walletManager.createPrivateKey(
                        accountName,
                        secretProvider,
                    );

                await this.reservationAdapterManager.create(
                    createdWallet,
                    secretProvider,
                );

                return createdWallet;
            },
        );

        this.emitWalletsChanged();

        this.cacheInsensitiveAccountsData(wallet.getAccounts());

        return wallet;
    }

    @EnsureActive
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

    private discardWallet(wallet: Wallet): void {
        const walletId: string = wallet.getId();

        wallet.lock();

        if (this.walletManager.has(walletId)) {
            this.walletManager.remove(walletId);
        }

        if (this.reservationAdapterManager.has(walletId)) {
            this.reservationAdapterManager.remove(walletId);
        }
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

    @EnsureActive
    public async openWallet(
        signerId: string,
        password: string,
    ): Promise<Wallet> {
        if (
            this.walletManager.hasByFilter(
                (wallet: Wallet) => wallet.getSigner().getId() === signerId,
            )
        ) {
            throw new Error("Client.openWallet: This wallet already open");
        }

        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const wallet: Wallet = await this.lifecycleGuard.runWalletPublication(
            async () => {
                const openedWallet: Wallet = await this.walletManager.open(
                    signerId,
                    passwordProvider,
                );

                if (this.shouldHoldSession()) {
                    await this.holdSession(openedWallet, passwordProvider);
                }

                await this.reservationAdapterManager.create(
                    openedWallet,
                    passwordProvider,
                );

                return openedWallet;
            },
        );

        this.emitWalletsChanged();

        return wallet;
    }

    @EnsureActive
    public closeWallet(walletId: string): void {
        const wallet: Wallet = this.getOpenWallet(walletId);

        wallet.lock();

        this.walletManager.remove(walletId);
        this.reservationAdapterManager.remove(walletId);

        this.emitWalletsChanged();
    }

    public isWalletOpen(walletId: string): boolean {
        return this.walletManager.has(walletId);
    }

    @EnsureActive
    public async unlockWallet(
        walletId: string,
        password: string,
    ): Promise<void> {
        const wallet: Wallet = this.getOpenWallet(walletId);

        if (!this.shouldHoldSession()) {
            throw new Error(
                "Client.unlockWallet: Session policy requires a password for every signature",
            );
        }

        await this.holdSession(wallet, this.createPasswordProvider(password));
    }

    @EnsureActive
    public lockWallet(walletId: string): void {
        const wallet: Wallet = this.getOpenWallet(walletId);

        wallet.lock();

        this.eventBus.emit(ClientEvent.WALLET_LOCKED, walletId);
    }

    public isWalletUnlocked(walletId: string): boolean {
        return this.walletManager.get(walletId)?.isUnlocked() ?? false;
    }

    @EnsureActive
    public async deriveAccount(
        walletId: string,
        accountName: string,
        password: string,
    ): Promise<ICreatedAccountData> {
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const createdAccountData: ICreatedAccountData =
            await this.lifecycleGuard.track(() =>
                this.walletManager.deriveAccount(
                    walletId,
                    accountName,
                    passwordProvider,
                ),
            );

        this.emitAccountsChanged(walletId);

        this.cacheInsensitiveAccountsData([createdAccountData.account]);

        return createdAccountData;
    }

    @EnsureActive
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

    @EnsureActive
    public async renameAccount(
        walletId: string,
        accountId: string,
        name: string,
    ): Promise<void> {
        await this.walletManager.renameAccount(walletId, accountId, name);

        this.emitAccountsChanged(walletId);
    }

    @EnsureActive
    public getExportedAccountData(
        walletId: string,
        accountId: string,
    ): IAccountKeyfile {
        const exportedAccount: Account = this.walletManager.getAccount(
            walletId,
            accountId,
        );

        return ExportKeyfileService.exportAccountKeyfile(exportedAccount);
    }

    @EnsureActive
    public async exportWalletKeyfile(
        walletId: string,
        password: string,
    ): Promise<IWalletKeyfile> {
        const targetWallet: Wallet | null = this.walletManager.get(walletId);

        if (!targetWallet) {
            throw new Error("Client.exportWalletKeyfile: unknown wallet id");
        }

        return ExportKeyfileService.exportWalletKeyfile(
            targetWallet,
            this.createPasswordProvider(password),
        );
    }

    @EnsureActive
    public async previewWalletKeyfileImport(
        source: unknown,
        password: string,
    ): Promise<IKeyfileImportPreview> {
        const preview: Omit<IKeyfileImportPreview, "isExistingWalletOpen"> =
            await WalletImportService.previewKeyfileImport(
                source,
                this.createPasswordProvider(password),
            );

        return {
            ...preview,
            isExistingWalletOpen: Boolean(
                preview.existingSignerId &&
                this.walletManager.getBySignerId(preview.existingSignerId),
            ),
        };
    }

    @EnsureActive
    public async importWalletKeyfile(
        source: unknown,
        password: string,
        options?: IImportWalletKeyfileOptions,
    ): Promise<Wallet> {
        const passwordProvider: SecretsProvider =
            this.createPasswordProvider(password);

        const { payload }: IKeyfileImportPlan =
            await WalletImportService.prepareKeyfileImport(
                source,
                passwordProvider,
                options,
            );

        const wallet: Wallet = await this.lifecycleGuard.runWalletPublication(
            async () => {
                const importedWallet: Wallet =
                    await this.walletManager.importKeyfile(
                        payload,
                        passwordProvider,
                    );

                await this.reservationAdapterManager.create(
                    importedWallet,
                    passwordProvider,
                );

                return importedWallet;
            },
        );

        this.emitWalletsChanged();
        this.cacheInsensitiveAccountsData(wallet.getAccounts());

        return wallet;
    }

    @EnsureActive
    public async importKeyfileAccounts(
        source: unknown,
        password: string,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IKeyfileAccountsImportResult> {
        const {
            payload,
            secretProvider,
            signerId,
        }: IKeyfileAccountsImportPlan =
            await WalletImportService.prepareKeyfileAccountsImport(
                source,
                this.createPasswordProvider(password),
                options,
            );

        const accounts: Account[] = await this.lifecycleGuard.runAccountsUpdate(
            signerId,
            () =>
                WalletPersistenceService.createAccounts(
                    signerId,
                    payload.accounts,
                    secretProvider,
                ),
        );

        const wallet: Wallet | null =
            this.walletManager.getBySignerId(signerId);

        if (wallet) {
            wallet.addAccounts(accounts);

            this.emitAccountsChanged(wallet.getId());
            this.emitWalletsChanged();
        }

        this.cacheInsensitiveAccountsData(accounts);

        return {
            signerId,
            importedAccountIds: accounts.map((account: Account) =>
                account.getId(),
            ),
        };
    }

    @EnsureActive
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

    @EnsureActive
    public setActiveAccount(walletId: string, accountId: string): void {
        this.walletManager.setActiveAccount(walletId, accountId);
    }

    public getCurrentNetworkId(): NetworkId {
        return ApiClientManager.getInstance().getCurrentNetworkId();
    }

    public getCurrentNetwork(): INetworkRecord {
        return ApiClientManager.getInstance().getCurrentNetwork();
    }

    @EnsureActive
    public setNetwork(networkId: NetworkId): void {
        const apiClientManager = ApiClientManager.getInstance();

        apiClientManager.switchNetwork(networkId);

        this.eventBus.emit(
            ClientEvent.NETWORK_CHANGED,
            apiClientManager.getCurrentNetwork(),
        );

        this.emitReservationsChanged();
    }

    @EnsureActive
    public async getBalance(address: Address): Promise<bigint> {
        const balance =
            await ApiServiceRegistry.getInstance().assets.getBalance(
                address,
                DEFAULT_ASSET,
            );

        return balance.amount;
    }

    @EnsureActive
    public async getAvailableBalance(
        walletId: string,
        accountId: string,
    ): Promise<bigint> {
        const account: Account = this.getAccount(walletId, accountId);

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

    @EnsureActive
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

    @EnsureActive
    @TrackOperation
    public addTransactionReservation(
        request: TTransactionReservationRequest,
        password?: string,
    ): Promise<ITransactionReservation> {
        return ApiClientManager.getInstance().runNetworkOperation(async () => {
            const wallet: Wallet = this.getOpenWallet(request.walletId);
            const account: Account = this.getWalletAccount(
                wallet,
                request.accountId,
            );

            const reservationAdapter: ReservationAdapter | null =
                this.reservationAdapterManager.get(request.walletId);

            if (!reservationAdapter) {
                throw new Error(
                    "Client.addTransactionReservation: Not found reservation adapter",
                );
            }

            const passwordProvider: SecretsProvider | undefined =
                password !== undefined
                    ? this.createPasswordProvider(password)
                    : undefined;

            await this.ensureSession(wallet, passwordProvider);

            const payload: TCreateTransactionReservationPayload =
                TransactionReservationFabric.toCreatePayload(
                    request,
                    account,
                    ApiClientManager.getInstance().getCurrentNetworkId(),
                );

            const reservation: ITransactionReservation =
                await reservationAdapter.add(wallet, payload, passwordProvider);

            return reservation;
        },
            { onBusyChanged: this.emitNetworkBusyChanged.bind(this) },
        );
    }

    @EnsureActive
    @TrackOperation
    public updateTransactionReservation(
        reservationId: ITransactionReservation["id"],
        request: TTransactionReservationRequest,
        password?: string,
    ): Promise<ITransactionReservation> {
        return ApiClientManager.getInstance().runNetworkOperation(async () => {
            const wallet: Wallet = this.getOpenWallet(request.walletId);
            const account: Account = this.getWalletAccount(
                wallet,
                request.accountId,
            );

            const reservationAdapter: ReservationAdapter | null =
                this.reservationAdapterManager.get(request.walletId);

            if (!reservationAdapter) {
                throw new Error(
                    "Client.updateTransactionReservation: Not found reservation adapter",
                );
            }

            const passwordProvider: SecretsProvider | undefined =
                password !== undefined
                    ? this.createPasswordProvider(password)
                    : undefined;

            await this.ensureSession(wallet, passwordProvider);

            const payload: TCreateTransactionReservationPayload =
                TransactionReservationFabric.toCreatePayload(
                    request,
                    account,
                    ApiClientManager.getInstance().getCurrentNetworkId(),
                );

            const reservation: ITransactionReservation =
                await reservationAdapter.update(
                    wallet,
                    reservationId,
                    payload,
                    passwordProvider,
                );

            return reservation;
        },
            { onBusyChanged: this.emitNetworkBusyChanged.bind(this) },
        );
    }

    @EnsureActive
    @TrackOperation
    public removeTransactionReservation(
        walletId: string,
        reservationId: ITransactionReservation["id"],
    ): Promise<ITransactionReservation> {
        const reservationAdapter: ReservationAdapter | null =
            this.reservationAdapterManager.get(walletId);

        if (!reservationAdapter) {
            throw new Error(
                "Client.removeTransactionReservation: Not found reservation adapter",
            );
        }

        const { networkId }: ITransactionReservation =
            reservationAdapter.getReservation(reservationId);

        return ApiClientManager.getInstance().runNetworkOperation(
            () => reservationAdapter.remove(reservationId),
            {
                onBusyChanged: this.emitNetworkBusyChanged.bind(this),
                networkId,
            },
        );
    }

    @EnsureActive
    public async getTransactionsHistory(
        walletId: string,
        accountId: string,
        options?: ITransactionsHistoryOptions,
    ): Promise<Transaction[]> {
        const account: Account = this.getAccount(walletId, accountId);

        const { sources = DEFAULT_HISTORY_SOURCES, pagination } = options ?? {};

        const pendingTransactions: Transaction[] = sources.includes("pending")
            ? this.reservationAdapterManager.getPendingTransactions(
                  walletId,
                  account,
              )
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

    @EnsureActive
    @TrackOperation
    public transfer(
        { walletId, accountId, to, amount }: ITransferRequest,
        password?: string,
    ): Promise<IReservedOperationResult> {
        return ApiClientManager.getInstance().runNetworkOperation(async () => {
            const wallet: Wallet = this.getOpenWallet(walletId);

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
        },
            { onBusyChanged: this.emitNetworkBusyChanged.bind(this) },
        );
    }

    @EnsureActive
    @TrackOperation
    public deploy(
        { walletId, accountId, term, phloLimit }: IDeployRequest,
        password?: string,
    ): Promise<IReservedOperationResult> {
        return ApiClientManager.getInstance().runNetworkOperation(async () => {
            const wallet: Wallet = this.getOpenWallet(walletId);

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
        },
            { onBusyChanged: this.emitNetworkBusyChanged.bind(this) },
        );
    }

    @EnsureActive
    public exploreDeploy(rholang: string): Promise<unknown> {
        return ApiServiceRegistry.getInstance().deploy.exploreDeployData(
            rholang,
        );
    }

    @EnsureActive
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

    private getOpenWallet(walletId: string): Wallet {
        const wallet: Wallet | null = this.walletManager.get(walletId);

        if (!wallet) {
            throw new Error(`Wallet ${walletId} is not open`);
        }

        return wallet;
    }

    public getAccount(
        walletId: Wallet["id"],
        accountId: Account["id"],
    ): Account {
        return this.getWalletAccount(this.getOpenWallet(walletId), accountId);
    }

    private getWalletAccount(
        wallet: Wallet,
        accountId: Account["id"],
    ): Account {
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

    @EnsureActive
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

    @EnsureActive
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
    }

    @EnsureActive
    public async removeNetwork(id: NetworkId): Promise<void> {
        await NetworkManager.removeNetwork(id);

        await this.reservationAdapterManager.removeNetworkReservations(id);
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
