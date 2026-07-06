# Domains Reference

This file documents the current domain modules under `src/domains`.

The SDK is organized around a high-level `Client` façade. `Client` owns a
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
}
```

`create()` initializes `StorageManager`, `ApiClientManager`, `ApiServiceRegistry`,
and (when the flag is set) `InsensitiveCacheStorageManager`.

Wallet & account lifecycle:

```ts
generateMnemonic(strength?: MnemonicStrength): string
generatePrivateKey(): Uint8Array

createHDWallet(payload: ICreateHDWalletPayload, password: string): Promise<Wallet>
createPrivateKeyWallet(payload: ICreatePrivateKeyWalletPayload, password: string): Promise<Wallet>
unlockWallet(signerId: string, password: string): Promise<Wallet>
removeWallet(walletId: string): Promise<void>

deriveAccount(walletId: string, accountName: string, password: string): Promise<ICreatedAccountData>
removeAccount(walletId: string, accountId: string): Promise<void>
renameAccount(walletId: string, accountId: string, name: string): Promise<void>
setActiveAccount(walletId: string, accountId: string): void

getWalletManager(): WalletManager
getInsensitiveAccountsData(): Promise<IInsensitiveCacheRecord[]> // requires withInsensitiveCacheStorage flag
```

Network:

```ts
getNetworksNames(): NetworkName[]
getCurrentNetwork(): NetworkName
setNetwork(networkName: NetworkName): void
```

Balances, reservations & transfers:

```ts
getBalance(address: Address): Promise<bigint>
getAvailableBalance(walletId: string, accountId: string): Promise<bigint> // total minus reserved
getReservations(walletId: string): Promise<ITransactionReservation[]>
transfer(request: ITransferRequest, password: string): Promise<string> // returns deployId
```

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
    onNetworkChanged?(networkName: NetworkName): void;
    onReservationsChanged?(walletId: string, reservations: ITransactionReservation[]): void;
}
```

Key payload types: `ICreateHDWalletPayload` (`{ mnemonic, accountName, index? }`),
`ICreatePrivateKeyWalletPayload` (`{ privateKey, accountName }`),
`ITransferRequest` (`{ walletId, accountId, to, amount }`).

---

## Wallet (`src/domains/Wallet/index.ts`)

Owns a `Signer` and a set of `Account`s (through an internal `AccountManager`).
A wallet is either private-key based or HD (mnemonic). The private constructor
is only reachable via the static factories.

Branded address type:

```ts
type Address = `1111${string}` // brand-typed; produced by validated derivation
```

Wallet type:

```ts
enum WalletTypes { PRIVATE_KEY = "private-key", HD = "hd" }
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

Mutations:

```ts
deriveAccount(payload: Omit<TCreateAccountPayload, "index">, passwordProvider: SecretsProvider): Promise<ICreatedAccountData> // HD only
removeAccount(id: string): Account
updateAccount(id: string, payload: TEditableAccountOptions): void
```

Signing / transfer:

```ts
transfer(payload: ITransferDetails, passwordProvider: SecretsProvider): Promise<string>
```

Behavior notes:

- `deriveAccount` is guarded by the `@OnlyHDWallet` decorator; calling it on a
  private-key wallet throws. It auto-computes the next free derivation index.
- `transfer` is guarded by `@EnsureActiveAccountExist` and delegates to
  `ApiServiceRegistry.transactions.transfer(...)`.

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
    index: number | null;   // null for private-key accounts
    address: Address;
    portfolioOptions?: IPortfolioOptions;
}
```

Methods:

```ts
getId(): string
getName(): string
getIndex(): number | null
getAddress(): Address
listAssets(): Asset[]
getAsset(id: string): Asset | null
registerAsset(asset: Asset): void
setPrimaryAsset(id: string): void
update(options: TEditableAccountOptions): void   // { name? }
getBalance(): Promise<IBalanceData>
getTransactionsHistory(networkName?: NetworkName, pagination?: Pagination): Promise<Transaction[]>
```

`getBalance` and `getTransactionsHistory` read through
`ApiServiceRegistry.getInstance()`. Associated record shape:
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

Abstract signing boundary. Stores only the `EncryptedData` secret and produces
signatures without leaking key bytes to callers. Concrete implementations are
`HDSigner` and `PrivateKeySigner`.

```ts
abstract class Signer {
    getId(): string
    getEncryptedSecret(): EncryptedData
    abstract sign(payload: string, signingContext: TSigningContext): Promise<ISignedMessageResponse>
}
```

```ts
type ISignedMessageResponse = { signature: Uint8Array; publicKey: Uint8Array };
type TPKSigningContext = { passwordProvider: SecretsProvider };
type THDSigningContext = { passwordProvider: SecretsProvider; index: number };
type TSigningContext = TPKSigningContext | THDSigningContext;

interface ISignerRecord { id: string; type: WalletTypes; encryptedData: EncryptedData }
```

Both implementations decrypt the secret, derive the private key (HD derives at
`signingContext.index` from the stored root path), sign with `@noble/secp256k1`,
and zeroize the private key in a `finally` block.

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
interface IPasswordCredentials { password: string }
interface IPrivateKeyCredentials { privateKey: Uint8Array }
interface ISeedCredentials { seed: string }
interface IHDSecret extends ISeedCredentials { rootHDPath: Bip44Path }
interface IHDSecretRecord extends ISeedCredentials { rootHDPath: string } // serialized form
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

Network naming and per-network endpoint config.

```ts
type NetworkName = "Dev" | "MainNet" | "TestNet" | "DevNet";

interface INetworkConfig {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
}

type TNetworksConfig = Record<NetworkName, INetworkConfig>;
```

---

## NetworkConfigProvider (`src/domains/NetworkConfigProvider/index.ts`)

Holds the `TNetworksConfig` and resolves per-network configs. Used internally by
`ApiClientManager`.

```ts
initialize(config: TNetworksConfig): void
get(network: NetworkName): INetworkConfig
getNetworkNames(): NetworkName[]
isReady(): boolean
```

---

## ApiClientManager (`src/domains/ApiClientManager/index.ts`)

Singleton that owns the transport clients (`ValidatorClient`, `ObserverClient`,
`IndexerClient`) and the currently selected network. Switching a network rebuilds
the three clients from that network's URLs.

```ts
ApiClientManager.getInstance(): ApiClientManager
initialize(networksConfig: TNetworksConfig, network?: NetworkName): void
switchNetwork(network: NetworkName): void
getValidatorClient(): ValidatorClient
getObserverClient(): ObserverClient
getIndexerClient(): IndexerClient
getClients(): IApiClients
getNetwork(): NetworkName
getNetworkNames(): NetworkName[]
isReady(): boolean
close(): void
```

Accessors are guarded by `@EnsureApiClientManagerInitialized` /
`@EnsureApiClientManagerConfigured` decorators and throw when used before
`initialize()`.

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
transfer(payload): Promise<any>             // POST /api/transfer
getStatus(): Promise<any>                   // GET  /status
```

### ObserverClient (`src/domains/ObserverClient/index.ts`)

```ts
getDeploy(deployHash): Promise<any>         // GET /api/deploy/:hash
getBlock(blockHash): Promise<IBlockDto>     // GET /api/block/:hash
getBlocks(params?: IGetBlocksParams): Promise<IBlockDto[]> // GET /api/blocks
getLatestBlock(): Promise<IBlockDto>        // GET /api/block/latest
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
    status: "pending" | "confirmed" | "failed";
    contractCode?: string;
    note?: string;
    networkName: NetworkName;
    detectedBy?: "balance_change" | "manual" | "auto";
}

interface ITransactionReservation extends ITransactionReservationPrivateData, ITableRecord {
    networkName: NetworkName;
}
```

`ITransactionReservationPrivateData` holds `timestamp`, `accountAddress`,
`pendingAmount`, `deployId`, and `expirationTime` — the fields encrypted at rest.

---

## ReservationAdapter (`src/domains/ReservationAdapter/index.ts`)

Bridges a wallet to the persistent, encrypted reservation store and the in-memory
`TransactionReservationsManager`. Reservations represent funds temporarily locked
by a pending transfer, so the *available* balance excludes them plus their gas fee.

```ts
ReservationAdapter.create(wallet, passwordProvider, reservationsManagerOptions?): Promise<ReservationAdapter>

getBalance(account: Account): Promise<IBalanceData> // total minus reserved (amount + GasFee.MAX per reservation)
getReservations(): ITransactionReservation[]
transfer(wallet: Wallet, details: ITransferDetails, passwordProvider: SecretsProvider): Promise<string>
dispose(): void
```

`transfer` performs the on-chain transfer, persists an encrypted reservation
(expiring after `RESERVATION_EXPIRATION_TIME`), and tracks it until confirmation
or expiry. Implements `IDisposable`, so it is owned by `ReservationAdapterManager`
(a `DisposableItemManager`).

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

### storageFabric (`src/fabrics/Storage/index.ts`)

Returns the right backend for the current environment.

```ts
storageFabric(options?: IStorageFabricOptions): ITableService<ITableRecord>
// window present -> BrowserStorage.getInstance(); else NodeStorage.getInstance(options?.nodeStorageDir)
```

### Repositories

Each repository is a singleton over a named table, with `initialize()` /
`ensureInitialized()` and typed CRUD.

- **SignersStorageRepository** (`SIGNERS` table) — persists `ISignerStorageRecord`
  (`{ id, type, encryptedData, createdAt }`).
- **AccountsStorageRepository** (`ACCOUNTS` table) — persists
  `IAccountStorageRecord` (`{ id, signerId, name, index, createdAt }`).
- **TransactionReservationsStorageRepository** (`TRANSACTION_RESERVATIONS` table) —
  persists `ITransactionReservationsStorageRecord`
  (`{ id, networkName, signerId, encryptedData, createdAt }`).
- **InsensitiveCacheStorageRepository** (`INSENSITIVE_CACHE` table) — persists
  `IInsensitiveCacheRecord` (`{ id, address }`) for the optional address cache.

These repositories are orchestrated by `StorageManager` and
`InsensitiveCacheStorageManager` in the service layer — see `SERVICES.md`.