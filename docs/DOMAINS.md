# Domains Reference

This file documents the current domain modules under `src/domains`.

The SDK is organized around a high-level `Client` facade. `Client` owns a
`WalletManager` and a `ReservationAdapterManager`, and it wires network access
through the singletons `ApiClientManager` (transport) and `ApiServiceRegistry`
(services). Wallets own accounts through an `AccountManager`, and secret material
is never exposed directly — it flows through `SecretsProvider` closures and the
`Signer` boundary.

Everything is re-exported from the package root (`@config`, `@domains`,
`@services`, `@utils`).

---

## Client (`src/domains/Client/index.ts`)

High-level entry point for the whole SDK. Manages wallet lifecycle, network
selection, balances, transfers with reservations, and optional insensitive
cache storage. Construct it via the async factory.

```ts
Client.create(options: ICreateClientOptions): Promise<Client>
```

```ts
interface ICreateClientOptions {
    networksConfig: TNetworksConfig;
    defaultNetwork?: NetworkName;
    storageOptions?: IStorageFabricOptions;
    eventDispatcher?: IClientEventDispatcher;
    flags?: ICreateClientFlags; // { withInsensitiveCacheStorage?: boolean }
    security?: ISessionPolicy; // signing-session policy (see below)
}
```

`create()` initializes `StorageManager`, `NetworkManager` (which restores any
persisted custom networks into `ApiClientManager`), `ApiServiceRegistry`, and
(when the flag is set) `InsensitiveCacheStorageManager`.

Signing-session policy (optional): the client can hold a wallet unlocked in
memory so repeated signatures don't re-prompt for the password. See the
_Signing sessions_ note below.

```ts
interface ISessionPolicy {
    autoLockMs?: number; // default DEFAULT_AUTO_LOCK_MS (15 min)
    requirePassword?: RequirePassword;
}

// RequirePassword: "once-per-session" (default) | "every-signature"
```

With `requirePassword: "once-per-session"`, unlocking (or the first
password-carrying transfer/deploy) starts a fixed-duration session; subsequent
operations reuse the in-memory secret until it auto-locks. With
`"every-signature"`, no session is held and every signature requires the
password again.

Wallet & account lifecycle:

```ts
generateMnemonic(strength?: MnemonicStrength): string
generatePrivateKey(): Uint8Array

createHDWallet(payload: ICreateHDWalletPayload, password: string): Promise<Wallet>
createPrivateKeyWallet(payload: ICreatePrivateKeyWalletPayload, password: string): Promise<Wallet>
unlockWallet(signerId: string, password: string): Promise<Wallet> // starts a session when policy holds one
removeWallet(walletId: string): Promise<Wallet>

deriveAccount(walletId: string, accountName: string, password: string): Promise<ICreatedAccountData>
removeAccount(walletId: string, accountId: string): Promise<Account>
renameAccount(walletId: string, accountId: string, name: string): Promise<void>
setActiveAccount(walletId: string, accountId: string): void

getWalletManager(): WalletManager
getInsensitiveAccountsData(): Promise<IInsensitiveCacheRecord[]> // requires withInsensitiveCacheStorage flag
```

Signing sessions:

```ts
isWalletUnlocked(walletId: string): boolean // true while an in-memory session is active
lockWallet(walletId: string): void          // clears the session + zeroizes the secret, fires onWalletLocked
```

`unlockWallet` decrypts the signer secret and, when the policy holds a session
(`requirePassword !== "every-signature"`), keeps it in memory until it
auto-locks after `autoLockMs`. The session is **fixed-duration**: activity does
not extend it. When a session expires, signing without a password throws a
`WalletLockedError` (HTTP-style status `403`) so callers can distinguish an
expired session from a server error and re-prompt for the password.

Network (runtime registry — see `NetworkManager` / `ApiClientManager`):

```ts
getNetworks(): INetworkRecord[]
getNetwork(id: NetworkId): INetworkRecord
getCurrentNetwork(): INetworkRecord
getCurrentNetworkId(): NetworkId
setNetwork(networkId: NetworkId): void                     // switch active network by id, fires onNetworkChanged

addNetwork(name: NetworkName, config: INetworkConfig): Promise<INetworkRecord> // custom network
updateNetwork(id: NetworkId, update: INetworkUpdate): Promise<void>            // custom only
removeNetwork(id: NetworkId): Promise<void>                                    // custom only
```

Built-in networks (those provided to `Client.create`) are marked
`isDefault: true` and are immutable: `updateNetwork` / `removeNetwork` reject
them. Custom networks are addressed by a generated `id` (not by `name`, which is
editable data) and are persisted so they survive a reload.

Balances, reservations & transfers:

```ts
getBalance(address: Address): Promise<bigint>
getAvailableBalance(walletId: string, accountId: string): Promise<bigint> // total minus reserved
getReservations(walletId: string): Promise<ITransactionReservation[]>
getTransactionsHistory(walletId: string, accountId: string, pagination?: Pagination): Promise<Transaction[]>
transfer(request: ITransferRequest, password?: string): Promise<string> // returns deployId
```

`password` is optional: when a session is active it is omitted; when it is
supplied and the policy holds sessions, the transfer (re-)establishes the
session before signing.

`getTransactionsHistory` is the only history entry point that knows about
pending transactions: it merges the indexed history of the account with the
pending transactions held by this wallet's reservation adapter for the current
network, dedupes by deploy id (the indexed row wins once confirmed), and sorts
newest first. The lower-level bricks stay unaware of reservations —
`Account.getTransactionsHistory` and `AccountDataService.getTransactionHistory`
return indexed transactions only.

Raw deploys (arbitrary Rholang, no reservation adapter):

```ts
deploy(request: IDeployRequest, password?: string): Promise<string> // returns deployId; same session rules as transfer
exploreDeploy(rholang: string): Promise<unknown>                    // read-only, no unlock/password
watchDeploy(deployId, callbacks?, options?): IDeployWatchHandle     // poll deploy status
```

Data export:

```ts
getExportedAccountData(walletId: string, accountId: string): string // encrypted keyfile JSON (ASI keyfile format)
getExportedTransactionsData(
    walletId: string,
    accountId: string,
    format?: ExportFormat,   // "json" (default) | "csv"
    networkId?: string,
): Promise<string>
```

`getExportedAccountData` returns the account's address plus its **encrypted**
private key wrapped in the versioned ASI keyfile envelope — the plaintext key is
never exposed. `getExportedTransactionsData` serializes the account's history
(transfers + deployments) as JSON or CSV.

Amount helpers (bound to the native token decimals):

```ts
toDisplayAmount(atomicAmount: bigint): string
toAtomicAmount(amount: number | string): bigint
```

Persistence & teardown:

```ts
clearPersistence(): Promise<void> // wipes storage + in-memory state
close(): void                     // releases managers and API clients
```

Event callbacks are delivered through `IClientEventDispatcher`:

```ts
interface IClientEventDispatcher {
    onWalletsChanged?(wallets: Wallet[]): void;
    onAccountsChanged?(walletId: string, accounts: Account[]): void;
    onNetworkChanged?(network: INetworkRecord): void;
    onReservationsChanged?(
        walletId: string,
        reservations: ITransactionReservation[],
    ): void;
    onWalletLocked?(walletId: string): void; // fired on manual lock and on auto-lock expiry
}
```

`onReservationsChanged` is wired by the `createReservationAdapter` fabric
(`src/utils/fabrics/client/reservationAdapter.ts`), which every `Client` path
that builds an adapter (create, import, unlock) goes through: it forwards the
`passwordProvider` needed for the data key and re-emits the wallet's
reservations on confirmation, expiry, and watch failure.

Key payload types: `ICreateHDWalletPayload` (`{ mnemonic, accountName, index? }`),
`ICreatePrivateKeyWalletPayload` (`{ privateKey, accountName }`),
`ITransferRequest` (`{ walletId, accountId, to, amount }`),
`IDeployRequest` (`{ walletId, accountId, term, phloLimit? }`).

---

## Wallet (`src/domains/Wallet/index.ts`)

Owns a `Signer` and a set of `Account`s (through an internal `AccountManager`).
A wallet is either private-key based or HD (mnemonic). The private constructor
is only reachable via the static factories.

Branded address type:

```ts
type Address = `1111${string}`; // brand-typed; produced by validated derivation
```

Wallet type:

```ts
enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
}
```

Factories:

```ts
Wallet.createPk(accountOptions: TCreateAccountPayload, secretProvider: SecretsProvider): Promise<Wallet>
Wallet.createHD(options: ICreateHDWalletOptions, passwordProvider: SecretsProvider): Promise<Wallet>
Wallet.restore(payload: IRestoreWalletPayload, passwordProvider: SecretsProvider): Promise<Wallet>
```

Account access:

```ts
getId(): string
getType(): WalletTypes
getSigner(): Signer
getAccounts(): Account[]
getAccountsMap(): Map<string, Account>
getActiveAccount(): Account | null
setActiveAccount(id: string): void
```

Session (delegated to the `Signer`):

```ts
isUnlocked(): boolean
unlock(passwordProvider: SecretsProvider, options?: ISignerUnlockOptions): Promise<void>
lock(): void
```

Mutations:

```ts
deriveAccount(payload: Omit<TCreateAccountPayload, "index">, passwordProvider: SecretsProvider): Promise<ICreatedAccountData> // HD only
removeAccount(id: string): Account
updateAccount(id: string, payload: TEditableAccountOptions): void
```

Signing / transfer:

```ts
transfer(payload: ITransferDetails, passwordProvider?: SecretsProvider): Promise<string>
```

Behavior notes:

- `deriveAccount` is guarded by the `@OnlyHDWallet` decorator; calling it on a
  private-key wallet throws. It auto-computes the next free derivation index.
- `transfer` is guarded by `@EnsureActiveAccountExist` and delegates to
  `ApiServiceRegistry.transactions.transfer(...)`. `passwordProvider` is optional
  — when a session is active the signer uses the in-memory secret; otherwise the
  password is required or a `WalletLockedError` is thrown.

---

## Account (`src/domains/Account/index.ts`)

A single address inside a wallet, plus its asset portfolio. Created through the
static factory, which derives the address from the provided secret.

```ts
Account.create(accountOptions: TCreateAccountPayload, secretProvider: SecretsProvider): Promise<Account>
```

```ts
interface IAccountOptions {
    id?: string;
    name: string;
    index: number | null; // null for private-key accounts
    address: Address;
    publicKey: Uint8Array; // used for deployment-history lookups
    portfolioOptions?: IPortfolioOptions;
}
```

Methods:

```ts
getId(): string
getName(): string
getIndex(): number | null
getAddress(): Address
getPublicKey(): Uint8Array
listAssets(): Asset[]
getAsset(id: string): Asset | null
registerAsset(asset: Asset): void
setPrimaryAsset(id: string): void
update(options: TEditableAccountOptions): void   // { name? }
getBalance(): Promise<IBalanceData>
getTransactionsHistory(networkId?: NetworkId, pagination?: Pagination): Promise<Transaction[]>
```

`getBalance` and `getTransactionsHistory` read through
`ApiServiceRegistry.getInstance()`. `getTransactionsHistory` passes both the
address and the account's public key (`encodeBase16(getPublicKey())`) to
`AccountDataService`, so the result combines the account's **transfers** (matched
by address) and its **deployments** (matched by deployer public key),
de-duplicated by deploy id and sorted newest-first. Associated record shape:
`IAccountRecord = { id, signerId, name, index }`.

---

## Asset (`src/domains/Asset/index.ts`)

Token model. Defaults `decimals` to `NATIVE_TOKEN_DECIMALS_AMOUNT` (8).

```ts
new Asset(options: IAssetOptions) // { id, name, decimals?, contractAddress? }
getId(): string
getName(): string
getDecimals(): number
getContractAddress(): string | null
```

Associated types: `AssetId = string`, `Assets = Map<AssetId, Asset>`.

---

## Signer (`src/domains/Signer/index.ts`, `Signer/HD`, `Signer/PK`)

Abstract signing boundary. Stores the `EncryptedData` secret and produces
signatures without leaking key bytes to callers. Concrete implementations are
`HDSigner` and `PrivateKeySigner`. It also owns the optional in-memory **signing
session**.

```ts
abstract class Signer {
    getId(): string;
    getEncryptedSecret(): EncryptedData;

    // session
    isUnlocked(): boolean;
    unlock(
        passwordProvider: SecretsProvider,
        options?: ISignerUnlockOptions,
    ): Promise<void>;
    lock(): void;

    abstract sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse>;
}
```

```ts
type ISignedMessageResponse = { signature: Uint8Array; publicKey: Uint8Array };
type TPKSigningContext = { passwordProvider?: SecretsProvider };
type THDSigningContext = { passwordProvider?: SecretsProvider; index: number };
type TSigningContext = TPKSigningContext | THDSigningContext;

interface ISignerUnlockOptions {
    autoLockMs?: number; // 0 / omitted -> no auto-lock timer
    onAutoLock?: () => void;
}

interface ISignerRecord {
    id: string;
    type: WalletTypes;
    encryptedData: EncryptedData;
}
```

Session lifecycle:

- `unlock` decrypts the secret once and stores it together with an `AutoTimer`.
  The timer is started immediately and is **fixed-duration** — it is never
  restarted on activity, so the session ends `autoLockMs` after unlock.
- The protected `resolveSecret(signingContext)` returns the in-memory secret when
  a session is active; otherwise it decrypts using `signingContext.passwordProvider`,
  and throws `WalletLockedError` when no password is available (locked/expired).
- `lock` clears the timer, zeroizes the private-key bytes when present, and drops
  the session. It is idempotent.

Both implementations derive the private key (HD derives at
`signingContext.index` from the stored root path), sign with `@noble/secp256k1`,
and zeroize any ephemeral private key after signing.

---

## AutoTimer (`src/domains/AutoTimer/index.ts`)

One-shot, restartable timer used by the `Signer` to auto-lock a session. A fresh
`start()` cancels any pending timer first; `delayMs <= 0` is a no-op (no
auto-lock).

```ts
interface IAutoTimerOptions { delayMs: number; onElapsed: () => void }

new AutoTimer(options: IAutoTimerOptions)
isActive(): boolean
start(): void   // (re)arm; clears first, then schedules onElapsed after delayMs
clear(): void   // cancel a pending timer
```

The signing session arms the timer once at unlock and never restarts it, giving
a **fixed** (non-sliding) session lifetime.

---

## CustomError (`src/domains/CustomError/index.ts`)

Public error taxonomy so integrators can branch on a machine-readable `code` and
an HTTP-style `status` instead of matching message strings.

```ts
enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
}

class CustomError extends Error {
    readonly code: CustomErrorCode;
    readonly status: number;
}

class WalletLockedError extends CustomError {
    // code WALLET_LOCKED, status 403
}
```

`WalletLockedError` is thrown by the signing path when there is no active session
and no password was supplied — i.e. the session is locked or expired. Its `403`
status lets a frontend treat it like an expired auth token and re-prompt for the
password, distinct from a transport/server error.

---

## SecretsProvider (`src/domains/SecretsProvider/index.ts`)

Thin closure wrapper that hands out secret material on demand. The provider
function is stored in a private field and invoked by `getSecret()`. Callers
supply different shapes depending on the flow (password only, password + secret,
HD secret, private-key credentials).

```ts
new SecretsProvider(providerInterface: () => any)
getSecret(): any
```

Secret shapes (all in this module):

```ts
interface IPasswordCredentials {
    password: string;
}
interface IPrivateKeyCredentials {
    privateKey: Uint8Array;
}
interface ISeedCredentials {
    seed: string;
}
interface IHDSecret extends ISeedCredentials {
    rootHDPath: Bip44Path;
}
interface IHDSecretRecord extends ISeedCredentials {
    rootHDPath: string;
} // serialized form
```

---

## Bip44Path (`src/domains/Bip44Path/index.ts`)

Value object for a `m/44'/coinType'/account'/change/index` path with validation.

```ts
new Bip44Path(options: IBip44PathOptions) // { coinType, account?, change?, index? }
Bip44Path.parse(pathString: string): Bip44Path
Bip44Path.fromOptions(options: IBip44PathOptions): Bip44Path
```

Accessors / mutators (each mutator validates its range):

```ts
getCoinType() / setCoinType(value)
getAccount()  / setAccount(value)
getChange()   / setChange(value)   // 0 or 1
getIndex()    / setIndex(value)
toString(): string
toOptions(): IBip44PathOptions
clone(): Bip44Path
nextIndex(): Bip44Path // clone with index + 1
```

---

## Network (`src/domains/Network/index.ts`)

Network identity, per-network endpoint config, and the runtime-registry record
shape. `NetworkId` and `NetworkName` are both `string`: the `id` is the stable
key, the `name` is editable display data.

```ts
type NetworkId = string;
type NetworkName = string;

interface INetworkConfig {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
}

type TNetworksConfig = Record<NetworkName, INetworkConfig>; // built-in config keyed by name

interface INetworkRecord {
    id: NetworkId;
    name: NetworkName;
    config: INetworkConfig;
    isDefault: boolean; // true = built-in (immutable); false = custom (editable/removable)
}

interface INetworkUpdate {
    name?: NetworkName;
    config?: Partial<INetworkConfig>;
}
```

Built-in networks come from the `TNetworksConfig` passed to `Client.create`
(their `id` equals their `name`). Custom networks get a generated `id` and are
persisted via `CustomNetworksStorageRepository`.

---

## NetworkConfigProvider (`src/domains/NetworkConfigProvider/index.ts`)

The in-memory network registry behind `ApiClientManager`. Holds every network as
an `INetworkRecord` keyed by `id`, distinguishes built-in (`isDefault`) from
custom entries, and validates endpoint URLs on write.

```ts
initialize(config: TNetworksConfig): void          // seed built-ins (isDefault: true)
restoreCustomNetworks(records: INetworkRecord[]): void // re-add persisted custom entries

getAll(): INetworkRecord[]
get(id: NetworkId): INetworkRecord                  // @EnsureNetworkExist
getIds(): NetworkId[]

add(name: NetworkName, config: INetworkConfig): INetworkRecord // generates id, isDefault: false
update(id: NetworkId, update: INetworkUpdate): void            // @EnsureNetworkNotDefault
remove(id: NetworkId): INetworkRecord                          // @EnsureNetworkNotDefault
isReady(): boolean
```

`add`/`update` validate URLs with `validateUrl` (must be non-empty http/https for
custom networks; built-in seed config may contain empty placeholder URLs).
`update`/`remove` are guarded by `@EnsureNetworkNotDefault`, so built-in networks
cannot be modified or deleted.

---

## ApiClientManager (`src/domains/ApiClientManager/index.ts`)

Singleton that owns the transport clients (`ValidatorClient`, `ObserverClient`,
`IndexerClient`), the `NetworkConfigProvider` registry, and the currently
selected network id. Switching a network rebuilds the three clients from that
network's URLs.

```ts
ApiClientManager.getInstance(): ApiClientManager
initialize(networksConfig: TNetworksConfig, customNetworks?: INetworkRecord[], networkName?: NetworkName): void
switchNetwork(networkId: NetworkId): void
getValidatorClient(): ValidatorClient
getObserverClient(): ObserverClient
getIndexerClient(): IndexerClient
getClients(): IApiClients

// network registry
getCurrentNetworkId(): NetworkId
getCurrentNetwork(): INetworkRecord
getNetworkIds(): NetworkId[]
getNetworks(): INetworkRecord[]
getNetwork(id: NetworkId): INetworkRecord
addNetwork(name: NetworkName, config: INetworkConfig): INetworkRecord
updateNetwork(id: NetworkId, update: INetworkUpdate): void  // re-switches clients if it's the active network
removeNetwork(id: NetworkId): void                          // falls back to the first network if the active one is removed

isReady(): boolean
close(): void
```

Accessors are guarded by `@EnsureApiClientManagerInitialized` /
`@EnsureApiClientManagerConfigured` decorators and throw when used before
`initialize()`. `initialize` is idempotent (a second call is a no-op).
Persistence of custom networks is orchestrated by `NetworkManager`, not here —
this manager only holds the live registry.

---

## ApiServiceRegistry (`src/domains/ApiServiceRegistry/index.ts`)

Singleton composition root for the service layer. Instantiates core services
(`deploy`, `blocks`, `accountData`) and composite services (`assets`,
`transactions`, `poller`) over an `ApiClientManager`.

```ts
ApiServiceRegistry.getInstance(apiClientManager?: ApiClientManager): ApiServiceRegistry

// public readonly fields:
deploy: DeployService
blocks: BlockService
accountData: AccountDataService
assets: AssetsService
transactions: TransactionService
poller: DeployStatusPoller
```

---

## ValidatorClient / ObserverClient / IndexerClient

HTTP/GraphQL transport clients selected per network by `ApiClientManager`.

### BaseHttpClient (`src/domains/BaseHttpClient/index.ts`)

Abstract Axios wrapper; exposes protected `get`/`post` returning `response.data`.

```ts
new BaseHttpClient(config: TAxiosClientConfig) // { baseUrl, axiosConfig? }
```

### BaseGraphQLClient (`src/domains/BaseGraphQLClient/index.ts`)

Axios-based GraphQL client. `query` POSTs `{ query, variables }` and throws on a
non-empty `errors` array.

```ts
new BaseGraphQLClient(config: TAxiosClientConfig)
query<T>(query: string, variables?: Record<string, unknown>): Promise<T>
```

### ValidatorClient (`src/domains/ValidatorClient/index.ts`)

```ts
submitDeploy(deploy): Promise<any>          // POST /api/deploy
submitExploratoryDeploy(rholangCode): Promise<any> // POST /api/explore-deploy
getStatus(): Promise<any>                   // GET  /status
```

### ObserverClient (`src/domains/ObserverClient/index.ts`)

```ts
getDeploy(deployHash): Promise<any>         // GET /api/deploy/:hash
getBlock(blockHash): Promise<IBlockDto>     // GET /api/block/:hash
getBlocks(params?: IGetBlocksParams): Promise<IBlockDto[]> // GET /api/blocks
```

`IBlockDto = { blockInfo: string; blockNumber: number }`.

### IndexerClient (`src/domains/IndexerClient/index.ts`)

GraphQL client for transaction history.

```ts
getTransactionHistory(address: string, pagination?: Pagination): Promise<TransactionHistoryQueryData>
```

---

## Transaction (`src/domains/Transaction/index.ts`)

Read model for indexed transactions and the reservation record shape.

```ts
interface Transaction {
    id: string;
    timestamp: Date;
    type: "send" | "receive" | "deploy";
    from: string;
    to?: string;
    amount?: string;
    deployId?: string;
    blockHash?: string;
    gasCost?: string;
    status: "pending" | "completed" | "failed";
    contractCode?: string;
    note?: string;
    networkId: NetworkId;
    detectedBy?: "balance_change" | "manual" | "auto";
}

interface ITransactionReservation
    extends ITransactionReservationPrivateData, ITableRecord {
    networkId: NetworkId;
}
```

`ITransactionReservationPrivateData` holds `accountId`, `pendingAmount`
(atomic units — the balance-lock semantics), `expirationTime`, and the full
pending `transaction` (`status: "pending"`, `detectedBy: "manual"`, `amount` and
`gasCost` in display units so they match indexed rows). The whole payload is
stored **encrypted at rest** with the signer's data key, so reading it requires
an active session or an explicit password.

---

## ReservationAdapter (`src/domains/ReservationAdapter/index.ts`)

Bridges a wallet to the encrypted reservation store and the in-memory
`TransactionReservationsManager`. Reservations represent funds temporarily locked
by a pending transfer, so the _available_ balance excludes them plus their gas
fee, and they double as the only local source of pending transactions.

```ts
ReservationAdapter.create(wallet, passwordProvider?, reservationsManagerOptions?): Promise<ReservationAdapter>

getBalance(account: Account): Promise<IBalanceData> // total minus reserved (amount + GasFee.MAX per reservation)
getReservations(): ITransactionReservation[]
getPendingTransactions(accountId?: string): Transaction[]
validateSufficientBalance(account: Account, amount: bigint): Promise<boolean>
transfer(wallet: Wallet, details: ITransferDetails, passwordProvider?: SecretsProvider): Promise<string>
dispose(): void
```

Both reading and writing reservations need the signer's data key, resolved
through `Signer.resolveDataKey(passwordProvider?)`: an active session covers it,
otherwise the optional `passwordProvider` does. `create` loads this wallet's
reservations for the current network id, deleting the expired ones (a record that
fails to decrypt rejects the whole `create` call) and rebuilding the rest
through `TransactionReservationFabric.fromStorage`.
Reserved amounts are keyed by `accountId`. `transfer` validates the balance,
performs the on-chain transfer (forwarding the optional `passwordProvider` to the
signer), builds the reservation through `TransactionReservationFabric.create`,
persists it encrypted (expiring after `RESERVATION_EXPIRATION_TIME`), and tracks
it until confirmation or expiry. Only those two outcomes delete the stored
record — a failed deploy watch leaves the reservation to its expiration timer,
so memory and storage never disagree. Implements `IDisposable`, so it is owned
by `ReservationAdapterManager` (a `DisposableItemManager`).

Reservation shaping (`ITransactionReservation` from a fresh transfer or from a
storage record plus its decrypted private data) lives in
`TransactionReservationFabric` (`src/utils/fabrics/transactionReservation.ts`),
so the adapter never assembles the record shape inline.

---

## Deploy (`src/domains/Deploy/index.ts`, `Deploy/factory`)

Deploy data structure and RhoLang code generators.

```ts
interface DeployData {
    term: string;
    phloLimit: number;
    phloPrice: number;
    validAfterBlockNumber: number;
    timestamp: number;
    shardId?: string;
}
```

Factory helpers (`Deploy/factory/index.ts`):

```ts
escapeRholangString(value: string): string
createCheckBalanceDeploy(address: Address): string
createTransferDeploy(fromAddress: Address, toAddress: Address, amount: bigint): string // throws if amount <= 0
```

`Deploy/factory/dev.ts` provides `createDevCheckBalanceDeploy` and
`createDevTransferDeploy`, which target the `rho:vault:system` registry instead
of `rho:rchain:asiVault` for dev networks.

---

## BinaryWriter (`src/domains/BinaryWriter/index.ts`)

Minimal protobuf-style writer used by deploy signing serialization.

```ts
writeString(fieldNumber: number, value: string): void
writeInt64(fieldNumber: number, value: number): void
getResultBuffer(): Uint8Array
```

Empty/zero values are skipped (protobuf default-value semantics).

---

## Storage layer

The SDK persists data through a small table abstraction with two backends chosen
automatically by environment.

### TableService (`src/domains/TableService/index.ts`)

```ts
interface ITableRecord { id: string; [key: string]: any }

interface ITableService<T extends ITableRecord> {
    init(): Promise<any>;
    isInitialized(): boolean;
    createTable(tableName: string, keyPath?: string): Promise<void>;
    tableExists(tableName: string): Promise<boolean>;
    insert / insertMany / getById / getAll / update / delete / deleteMany / clearTable / dropTable;
    close(): Promise<void>;
}
```

### BrowserStorage (`src/domains/BrowserStorage/index.ts`)

`IndexedDB`-backed `ITableService` singleton (`getInstance(name?)`). Records are
stamped with `createdAt` / `updatedAt`. Table create/drop bump the DB version.
Guarded by `@EnsureDatabaseInitialized` / `@EnsureTableExists` decorators.

### NodeStorage (`src/domains/NodeStorage/index.ts`)

`node-persist`-backed `ITableService` singleton (`getInstance(storageDir?)`) for
non-browser environments. Default directory `DEFAULT_NODE_STORAGE_DIR`.

### storageFabric (`src/utils/fabrics/storage.ts`)

Returns the right backend for the current environment.

```ts
storageFabric(options?: IStorageFabricOptions): ITableService<ITableRecord>
// window present -> BrowserStorage.getInstance(); else NodeStorage.getInstance(options?.nodeStorageDir)
```

### Repositories

Each repository is a singleton over a named table, with `initialize()` /
`ensureInitialized()` and typed CRUD.

- **SignersStorageRepository** (`SIGNERS` table) — persists `ISignerStorageRecord`
  (`{ id, type, encryptedData, encryptedDataKey, createdAt }`).
- **AccountsStorageRepository** (`ACCOUNTS` table) — persists
  `IAccountStorageRecord` (`{ id, signerId, name, index, createdAt }`).
- **TransactionReservationsStorageRepository** (`TRANSACTION_RESERVATIONS` table) —
  persists `ITransactionReservationsStorageRecord`
  (`{ id, networkId, signerId, encryptedData, createdAt }`), where `encryptedData`
  is `ITransactionReservationPrivateData` encrypted with the signer's data key.
- **CustomNetworksStorageRepository** (`CUSTOM_NETWORKS` table) — persists
  `ICustomNetworkStorageRecord` (`{ id, name, config, createdAt, updatedAt }`) so
  runtime-registered custom networks survive a reload.
- **InsensitiveCacheStorageRepository** (`INSENSITIVE_CACHE` table) — persists
  `IInsensitiveCacheRecord` (`{ id, address }`) for the optional address cache.

These repositories are orchestrated by `StorageManager` (and
`InsensitiveCacheStorageManager`) in the service layer — see `SERVICES.md`.
