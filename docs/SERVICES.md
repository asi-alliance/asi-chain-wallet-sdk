# Services Reference

This file documents the current service modules under `src/services`.

Services split into a few groups:

- **Managers** — in-memory ownership of domain objects (`ItemManager`,
  `WalletManager`, `AccountManager`, `ReservationAdapterManager`,
  `TransactionReservationsManager`, `DisposableItemManager`).
- **Events & lifecycle** — `ClientEventBus`, `ClientLifecycleGuard`,
  `ConcurrentOperationGuardService`, `WalletOperationGuardService`.
- **Read models** — `TransactionsHistoryAggregator`, `CollectionQueryService`.
- **Persistence orchestration** — `StorageManager`, `NetworkManager`,
  `InsensitiveCacheStorageManager`, `InsensitiveCacheStorageSerializer`.
- **API services** — instantiated by `ApiServiceRegistry`: `DeployService`,
  `BlockService`, `AccountDataService`, `AssetsService`, `TransactionService`,
  `DeployStatusPoller`, plus the `GraphqlParser` helpers.
- **Export** — `ExportService` (account keyfile + transactions JSON/CSV).
- **Crypto / key primitives** — `CryptoService`, `WalletsService`,
  `MnemonicService`, `KeyDerivationService`, `KeysManager`, `SignerService`,
  `KeyFingerprintService`, `BinaryWriter` (documented under domains).

---

## Managers

### ItemManager (`src/services/ItemManager/index.ts`)

Generic in-memory `Map<string, T>` registry used as a base class.

```ts
add(id: string, item: T): void
remove(id: string): T          // throws when missing
get(id: string): T | null
has(id: string): boolean
hasByFilter(filter: (item: T) => boolean): boolean
getByFilter(filter: (item: T) => boolean): T[]
removeByFilter(filter: (item: T) => boolean): T[]
getAll(): T[]
getMap(): Map<string, T>
clear(): void
```

### DisposableItemManager (`src/services/DisposableItemManager/index.ts`)

`ItemManager` whose items implement `IDisposable`. Calls `dispose()` on overwrite,
removal, and clear.

```ts
interface IDisposable {
    dispose(): void;
}
```

### WalletManager (`src/services/WalletManager/index.ts`)

`ItemManager<Wallet>` that bridges wallets to `StorageManager`. Owned by `Client`.

```ts
createHD(params: ICreateHDWalletParams, passwordProvider): Promise<Wallet>
createPrivateKey(accountName: string, secretProvider): Promise<Wallet>
open(signerId: string, passwordProvider): Promise<Wallet>
delete(id: string): Promise<Wallet>              // removes signer + accounts from storage
deriveAccount(walletId, accountName, passwordProvider): Promise<IDerivedAccount>
removeAccount(walletId, accountId): Promise<Account>
renameAccount(walletId, accountId, name): Promise<void>
setActiveAccount(walletId, accountId): void
getPublicWalletsMetadata(): Promise<IWalletMetadata[]>
count(): Promise<number>
countInStorage(): Promise<number>
```

`IWalletMetadata = { signerId, type, accounts: IAccountMetadata[] }` is the
lightweight, non-secret listing used by UIs to render closed wallets.

`open` replaces the former `unlock`: loading a stored wallet into memory and
holding a signing session are separate steps now, and only the first belongs
here (see [Open vs unlocked](DOMAINS.md#open-vs-unlocked)).

Concurrency and duplicates are enforced here, not in `Client`, through a
**static** `WalletOperationGuardService` shared by every `WalletManager`
instance. Sharing it is deliberate: two managers over the same storage must not
each think they are the only writer.

- `open` and `deriveAccount` run inside `runWalletAction`, so a second concurrent
  attempt at the same action on the same signer throws
  `WalletActionInProgressError` instead of racing.
- `persist` (the tail of both create paths) runs inside `runWalletCreation`,
  which reserves the wallet's fingerprints for the duration and then calls
  `assertWalletIsNotDuplicate`: the signer fingerprint is looked up through
  `StorageManager.findSignerByFingerprint`, each account fingerprint through
  `findAccountByFingerprint`, and a hit raises `DuplicateWalletError` or
  `DuplicateAccountError`.

The reservation is what closes the window a storage-only check would leave open:
two identical wallets created in the same tick would both read an empty storage,
so the second one is rejected on the in-memory reservation instead.

### AccountManager (`src/services/AccountManager/index.ts`)

`ItemManager<Account>` owned by each `Wallet`; also tracks the active account.

```ts
create(payload: TCreateAccountPayload, secretProvider): Promise<ICreatedAccountData>
remove(id: string): Account
update(id: string, payload: TEditableAccountOptions): void
setActiveAccount(id: string): void
getActiveAccount(): Account | null
getAccounts(): Account[]
getAccountsMap(): Map<string, Account>
getAccount(id: string): Account | null
```

`ICreatedAccountData = { accountId: string; account: Account }`.

### ReservationAdapterManager (`src/services/ReservationAdapterManager/index.ts`)

`DisposableItemManager<ReservationAdapter>` keyed by wallet id. Owned by `Client`.

```ts
new ReservationAdapterManager({ reservationAdapters?, onReservationsChanged? })

create(wallet, passwordProvider?): Promise<ReservationAdapter>
remove(id: string): ReservationAdapter
removeByFilter(filter: (adapter: ReservationAdapter) => boolean): ReservationAdapter[]
clear(): void
getReservationsByWallet(): TReservationsByWallet
hasNetworkReservations(networkId: NetworkId): boolean
removeNetworkReservations(networkId: NetworkId): Promise<void>
```

Reservations are encrypted with the signer's data key, so building the adapter
needs an active session or the optional `passwordProvider` — `Client` forwards
the provider it already has when creating or opening a wallet.

This manager owns the reservation change notification. `Client` passes a single
`onReservationsChanged` callback at construction, and every path that can alter
the picture re-fires it: `create`, `remove`, `removeByFilter`, `clear`,
`removeNetworkReservations` (in a `finally`, so a partial failure still notifies),
plus the `onAdded` / `onConfirmed` / `onExpired` callbacks it subscribes on each
adapter. `Client` turns that one callback into the `reservationsChanged` event
with `getReservationsByWallet()` as the payload, so no caller has to wire adapter
callbacks itself.

`hasNetworkReservations` answers whether any open wallet still holds funds on a
network, which is what `Client.hasNetworkReservations` exposes to UIs before a
network is removed. `removeNetworkReservations` fans a removed or reconfigured
network out to every adapter.

### TransactionReservationsManager (`src/services/TransactionReservationsManager/index.ts`)

In-memory tracker for active reservations. Each reservation is watched by a
`DeployStatusPoller` bound to that reservation's own network (through
`ApiClientManager.createNetworkContext`) and also gets an expiration timer;
confirmation or expiry removes it and fires the matching callback. A poller
failure (error or watch timeout) only stops the watcher and fires `onFailed` —
the reservation and its expiration timer stay, so the deploy status being unknown
keeps the funds locked until the reservation genuinely expires. Implements
`IDisposable`.

```ts
new TransactionReservationsManager(reservations, options?: ITransactionReservationsManagerOptions)
add(reservation): void
subscribe(reservationId: string, callbacks: IDeployWatchCallbacks): () => void
remove(id: string): boolean
get(id: string): ITransactionReservation | null
getAll(): ITransactionReservation[]
getByNetworkId(networkId: NetworkId): ITransactionReservation[]
getByAccountId(accountId: string, networkId: NetworkId): ITransactionReservation[]
dispose(): void
```

One manager holds the reservations of every network, so reads are keyed by
network id. `subscribe` attaches per-reservation deploy-watch callbacks on top of
the shared `watchCallbacks` and returns its own unsubscribe; it is what
`ReservationAdapter` hands back inside `IReservedOperationResult`.

```ts
interface ITransactionReservationsManagerOptions {
    onAdded?(reservation): void;
    onConfirmed?(reservation): void;
    onExpired?(reservation): void;
    onFailed?(reservation, error: Error): void;
    watchCallbacks?: IDeployWatchCallbacks;
    watchOptions?: IDeployWatchOptions;
}
```

`onAdded` fires from `add` only, so reservations restored through the
constructor stay silent — the caller already knows about them.

`onFailed` is a notification, not a release signal: the reservation survives it
and is dropped only by `onConfirmed` or `onExpired`, which are the two callbacks
`ReservationAdapter` uses to delete the stored record.

---

## Events & lifecycle

### ClientEventBus (`src/services/ClientEventBus/index.ts`)

Typed pub/sub behind `Client.getEventBus()`. Owned by `Client`, which is the only
code allowed to `emit`.

```ts
new ClientEventBus(onListenerError?: TClientEventListenerErrorHandler)

getSource(): IClientEventSource // frozen { on, off } handed to integrators
on<TName>(name: TName, listener: TClientEventListener<TName>): TUnsubscribe
off<TName>(name: TName, listener: TClientEventListener<TName>): void
emit<TName>(name: TName, ...payload: IClientEventMap[TName]): void
clear(): void
```

`IClientEventMap` ties each `ClientEvent` member to its payload tuple, so
`on(ClientEvent.ACCOUNTS_CHANGED, listener)` type-checks the listener's
`(walletId, accounts)` signature. The event names and payloads are listed in
[Client events](DOMAINS.md#events).

Two properties matter for integrators:

- **Late subscription.** Listeners can be attached and detached at any point in
  the client's life, unlike the constructor-time `IClientEventDispatcher`. `on`
  returns its own unsubscribe.
- **Listener isolation.** `emit` iterates over a snapshot of the bucket, so a
  listener that unsubscribes during dispatch cannot corrupt the loop, and each
  listener is invoked through `runProtected`. A synchronous throw or a rejected
  promise is routed to `onListenerError(name, error)`; an error handler that
  throws in turn is only logged. A broken listener can therefore never break the
  SDK operation that emitted the event, and the bus does not await async
  listeners.

`getSource` returns a frozen facade so that handing the bus to UI code does not
hand over `emit` and `clear` with it.

### ClientLifecycleGuard (`src/services/ClientLifecycleGuard/index.ts`)

`LifecycleGuard` specialized for publishing a wallet.

```ts
new ClientLifecycleGuard(discardWallet: (wallet: Wallet) => void)

runWalletPublication(operation: () => Promise<Wallet>): Promise<Wallet>
```

`Client` wraps `createHDWallet`, `createPrivateKeyWallet`, and `openWallet` in
`runWalletPublication`. If the guard was invalidated while the wallet was being
built (a logout, a `clearPersistence`, or a `close`), the finished wallet is
handed to `discardWallet` — which locks it and drops it from both the wallet
manager and the reservation adapter manager — and the caller gets a
`WalletOperationCancelledError`. The base `LifecycleGuard` contract is documented
under [domains](DOMAINS.md#lifecycleguard-srcdomainslifecycleguardindexts).

### ConcurrentOperationGuardService (`src/services/ConcurrentOperationGuard/index.ts`)

Generic mutual exclusion over named keys. An `ItemManager<TOwner>` where a present
key means "an operation owns this right now".

```ts
class ConcurrentOperationGuardService<TOwner = string> extends ItemManager<TOwner> {
    run<T>(
        reservations: Map<string, TOwner>,
        createConflictError: (conflictOwner: TOwner) => Error,
        operation: () => Promise<T>,
    ): Promise<T>;
}
```

`run` claims **all** keys atomically or none: it scans for a conflict first,
throws the caller's error when one is found, and otherwise registers every key,
runs the operation, and releases the keys in a `finally`. The owner value stored
under each key is what the error factory receives, so the rejection can name what
already holds the key rather than just reporting a generic clash.

### WalletOperationGuardService (`src/services/WalletOperationGuard/index.ts`)

The wallet-specific guard, built on the generic one. Used as a **static** member
of `WalletManager` so all instances share one lock table.

```ts
runWalletCreation<T>(wallet: Wallet, operation: () => Promise<T>): Promise<T>
runWalletAction<T>(action: WalletAction, signerId: string, operation: () => Promise<T>): Promise<T>
```

Two key namespaces keep the two concerns apart:

- `runWalletCreation` reserves `SIGNER:<signerFingerprint>` plus
  `ACCOUNT:<accountFingerprint>` for every account of the wallet. A conflict means
  the same secret is already being created, and it surfaces as
  `DuplicateWalletError` or `DuplicateAccountError` depending on which key
  matched — the owner record carries `signerId` and, for accounts, `accountId`.
- `runWalletAction` reserves `<action>:<signerId>` and raises
  `WalletActionInProgressError`, which is how `open` and `deriveAccount` refuse
  to run twice at once for one signer.

---

## Read models

### CollectionQueryService (`src/services/CollectionQuery/index.ts`)

Generic in-memory sorting and pagination over any array. Pure and static — no
state, no I/O.

```ts
CollectionQueryService.sortByComparator<TItem>(items, comparator): TItem[]
CollectionQueryService.sortByDate<TItem>(items, getDate: (item) => Date, order?: Order): TItem[]
CollectionQueryService.mergeSorted<TItem>(primary, secondary, comparator): TItem[]
CollectionQueryService.slice<TItem>(items, pagination?: Pagination): TItem[]
```

Both sorts copy the input instead of mutating it; `sortByDate` defaults to
`"desc"`. `mergeSorted` interleaves two lists that are **already sorted by the
same comparator**, keeping `primary` ahead of `secondary` on ties. `slice`
applies `offset` / `limit`, where an absent `limit` means "to the end".

### TransactionsHistoryAggregator (`src/services/TransactionsHistoryAggregator/index.ts`)

Merges indexed history with the reservation adapter's pending transactions for
`Client.getTransactionsHistory`. Pure and static — no state, no I/O.

```ts
TransactionsHistoryAggregator.paginatePendingTransactions(
    pending: Transaction[],
    networkId: NetworkId,
    pagination?: Pagination,
): Transaction[]

TransactionsHistoryAggregator.createHistoryWindow(
    pending: Transaction[],
    networkId: NetworkId,
    pagination?: Pagination,
): ITransactionsHistoryWindow

TransactionsHistoryAggregator.mergeHistoryPage(
    historyWindow: ITransactionsHistoryWindow,
    executed: Transaction[],
): Transaction[]

interface ITransactionsHistoryWindow {
    pendingTransactions: Transaction[];
    executedPagination: Pagination;
    pageOffset: number;
    pageLimit?: number;
}
```

Every entry point first drops pending rows belonging to another network and
sorts the rest newest-first. `paginatePendingTransactions` serves the
pending-only source and is a plain slice of that list.

A pending row is not necessarily newer than every indexed one — a reservation
lives up to `RESERVATION_EXPIRATION_TIME`, and the indexer keeps returning older
history — so the requested page cannot be split between the two sources.
`createHistoryWindow` widens the indexer request instead: the executed offset is
the caller's offset minus the pending count (floored at `0`) and the executed
limit is the caller's limit plus the pending count, which guarantees the merged
window covers the requested page whatever the interleaving turns out to be.

`mergeHistoryPage` drops pending rows whose id already appears in the executed
page (a pending transaction id equals its deploy id, so an indexed row replaces
its pending twin), merges both sorted lists by `timestamp` descending, and
slices the caller's page out. Past the first page the slice offset is corrected
by `aheadCount` — the pending rows that sit newer than the indexer window that
came back, i.e. the ones earlier pages already consumed.

#### Eventual consistency of the pending → executed transition

The two sources are not updated by the same actor: a reservation is released
when `DeployStatusPoller` observes the deploy confirmed on the node, whereas the
executed side only shows the transaction once the indexer has ingested its
block. The client has no way to observe or bridge that lag, so a transaction can
briefly appear in neither source (reservation already released, row not yet
indexed) or in both (indexer ahead of the poller, reservation still alive).

Deduplication is per page, since only the executed rows of the current page are
available to compare against. Two twins that fall on different pages therefore
both survive. Transient cross-page duplicates are accepted for now — the
alternative is fetching the whole history to dedupe globally — and a reload once
the indexer has caught up resolves them.

---

## Persistence orchestration

### StorageManager (`src/services/StorageManager/index.ts`)

Static façade over the four repositories (signers, accounts, transaction
reservations, custom networks). Signer secrets and reservations are encrypted on
write (the former with the wallet password, the latter with the signer's data
key); custom-network records are non-secret and stored as plaintext. Also
composes/decomposes the `Wallet` aggregate.

```ts
StorageManager.init(options?: IStorageFabricOptions): Promise<void>

// signers (encrypted secret + encrypted data key + plaintext fingerprint)
saveSigner / saveSigners / getSigner / getSigners / updateSigner / deleteSigner / deleteMultipleSigners
findSignerByFingerprint(fingerprint: string): Promise<ISignerStorageRecord | null>

// accounts
saveAccount / saveAccounts / getAccount / getAccounts / updateAccount / deleteAccount / deleteMultipleAccounts
getAccountsBySignerId(signerId: string): Promise<IAccountStorageRecord[]>
findAccountByFingerprint(fingerprint: string): Promise<IAccountStorageRecord | null>

// wallets (aggregate of signer + accounts)
saveWallet(options): Promise<void>
saveWallets(options[]): Promise<void[]>
getWallet({ signerId, passwordProvider }): Promise<Wallet>   // restores + decrypts
getWallets(): Promise<IWalletStorageData[]>                  // public metadata

// reservations (encrypted with the signer data key)
saveTransactionReservation({ id, networkId, signerId, encryptedData }) /
getTransactionReservationsBySignerId(signerId, networkId) /
updateTransactionReservation / deleteTransactionReservation / deleteMultipleTransactionReservations

// custom networks
getCustomNetworks(): Promise<IPersistedNetworkRecord[]> // no isDefault: restore assigns it
saveCustomNetwork(network: INetworkRecord): Promise<void>
updateCustomNetwork(network: INetworkRecord): Promise<void>
deleteCustomNetwork(id: NetworkId): Promise<void>

clear(): Promise<void>
close(): void
```

Signer and account records carry a plaintext `fingerprint` next to the encrypted
payload. That is what the two `find*ByFingerprint` lookups match on, and it is
why duplicate detection works while every wallet is closed — nothing has to be
decrypted to answer "is this secret already stored?". The fingerprint is a
one-way hash of public material only; see
[KeyFingerprintService](#keyfingerprintservice-srcserviceskeyfingerprintindexts).

`getAccountsBySignerId` and `getTransactionReservationsBySignerId` now resolve
inside their repositories through `getByFilter` rather than by reading every row
and filtering in the manager.

### NetworkManager (`src/services/NetworkManager/index.ts`)

Static orchestrator for the runtime network registry. Bridges the live
`ApiClientManager` registry to `StorageManager` persistence so custom networks
survive reloads. Delegated to by `Client`'s network methods.

```ts
NetworkManager.initialize(networksConfig: TNetworksConfig, defaultNetwork?: NetworkName): Promise<void>
// loads persisted custom networks, then ApiClientManager.initialize(built-ins, custom, default)

addNetwork(name: NetworkName, config: INetworkConfig): Promise<INetworkRecord> // registers + persists
updateNetwork(id: NetworkId, update: INetworkUpdate): Promise<void>            // updates + re-persists
removeNetwork(id: NetworkId): Promise<void>                                    // removes + deletes from storage
```

Built-in networks are never persisted or mutated here; only custom networks flow
through storage. Validation and the built-in-immutability guard live in
`NetworkConfigProvider` (see `DOMAINS.md`).

Because `addNetwork`/`updateNetwork` persist the record the provider returns, a
stored config always carries a validated `nodeApiProfile`.

### InsensitiveCacheStorageManager (`src/services/InsensitiveCacheStorageManager/index.ts`)

Static façade over `InsensitiveCacheStorageRepository`. Opt-in via the
`withInsensitiveCacheStorage` client flag; caches non-secret account data
(currently `{ id, address }`) so addresses can be listed while wallets are locked.

```ts
init(): Promise<void>
save(record: IInsensitiveCacheRecord): Promise<void>
get(id): Promise<IInsensitiveCacheRecord | null>
getAll(): Promise<IInsensitiveCacheRecord[]>
update(id, updates): Promise<void>
delete(id): Promise<void>
deleteAll(ids: string[]): Promise<void>
clear(): Promise<void>
close(): void
```

### InsensitiveCacheStorageSerializer (`src/services/InsensitiveCacheStorageSerializer/index.ts`)

```ts
InsensitiveCacheStorageSerializer.serialize(account: Account): IInsensitiveCacheRecord
// { id: account.getId(), address: account.getAddress() }
```

---

## Export

### ExportService (`src/services/ExportService/index.ts`)

Serializes account and transaction data for download. Pure formatting — it never
decrypts anything.

```ts
ExportService.exportAccountKeyfile(input: IAccountKeyfileInput): string
ExportService.exportTransactions(transactions: Transaction[], format?: ExportFormat): string

interface IAccountKeyfileInput { address: string; encryptedPrivateKey: EncryptedData }
```

`exportAccountKeyfile` wraps the address and the **encrypted** private key in the
versioned ASI keyfile envelope (`{ version, type: "asi-wallet-keyfile", address,
encryptedPrivateKey, timestamp }`) — the plaintext key never leaves the signer.
`exportTransactions` returns pretty-printed JSON (default) or CSV built from
`TRANSACTIONS_CSV_HEADERS` with RFC-4180 quoting. `Client.getExportedAccountData`
and `Client.getExportedTransactionsData` are the high-level entry points.

---

## API services

Instantiated once by `ApiServiceRegistry` over an `ApiClientManager`.

None of them touch a transport client directly. Every node call goes through
`NodeApiAdapter`, resolved per call from the injected `NodeApiProvider`:

```ts
new DeployService(nodeApiProvider?: NodeApiProvider)
new BlockService(nodeApiProvider?: NodeApiProvider)
new AccountDataService(nodeApiProvider?: NodeApiProvider, apiClientManager?: ApiClientManager)
new AssetsService(deployService: DeployService, nodeApiProvider?: NodeApiProvider)
new TransactionService(deployService: DeployService, blockService: BlockService, nodeApiProvider?: NodeApiProvider)
```

Each declares a private getter so call sites read as ordinary API calls while
resolution stays per call — a stored adapter would freeze the profile of whichever
network was active when the registry was built:

```ts
private get api(): NodeApiAdapter {
    return this.nodeApiProvider.getApi();
}
```

`AccountDataService` also keeps an `ApiClientManager` because it needs
`getCurrentNetworkId()` for history mapping. `AssetsService` and
`TransactionService` use the provider only to pick Rholang terms by profile, via a
`private get terms()`. The division of labour: the adapter shapes and sends the
request, the service owns response interpretation and its own fallbacks.

### DeployService (`src/services/DeployService/index.ts`)

Submits deploys and reads deploy status through the node API adapter.

```ts
submitSignedDeploy(deploy: SignedResult): Promise<string | undefined> // returns extracted deployId
exploreDeployData(rholangCode: string): Promise<any>                  // returns result.expr
getDeploy(deployHash: string): Promise<any>
isDeployFinalized(deploy: any): Promise<boolean>                      // faultTolerance >= SCALA_FAULT_TOLERANCE_THRESHOLD
getDeployStatus(deployHash: string): Promise<IDeployStatusResult>
```

```ts
enum DeployStatus {
    DEPLOYING,
    INCLUDED_IN_BLOCK,
    FINALIZED,
    CHECK_ERROR,
}
type IDeployStatusResult =
    | { status: DEPLOYING | INCLUDED_IN_BLOCK | FINALIZED }
    | { status: CHECK_ERROR; errorMessage: string };
```

### BlockService (`src/services/BlockService/index.ts`)

```ts
getBlock(blockHash: string): Promise<string>          // block info
getLatestBlock(): Promise<IBlockDto>
getLatestBlockNumber(): Promise<number>               // INVALID_BLOCK_NUMBER on failure
isValidatorActive(): Promise<boolean>
```

### AccountDataService (`src/services/AccountDataService/index.ts`)

Reads and maps transaction history (transfers + deployments) from the indexer.
Recoverable network/CORS errors are swallowed and return an empty list.

```ts
getTransactionHistory(address: string, publicKey: string, pagination?: Pagination, networkId?: NetworkId): Promise<Transaction[]>
```

### AssetsService (`src/services/AssetsService/index.ts`)

Balance reads via an exploratory deploy.

```ts
getBalance(address: Address, asset: Asset): Promise<IBalanceData> // { amount: bigint; asset }
```

Validates the address first (throws on invalid). The balance term comes from
`this.terms.createCheckBalanceDeploy(address)`, so the vault contract it addresses
follows the active network's profile.

**The zero-balance fallback is gone.** A read that cannot be trusted now throws
`BalanceUnavailableError` (status `502`) carrying the address and a reason, so
"no funds" and "the node did not answer" are no longer the same value. Four cases
raise it:

- the exploratory deploy itself fails (transport, node error) — the reason is the
  underlying message;
- the node answers with `ExprString`, which is how the vault reports its own
  error;
- `ExprInt` carries something that is not a non-negative integer — validated
  through `parseAtomicAmount`, so an overflowing or fractional value is rejected
  instead of being coerced;
- no expression comes back at all.

Only a genuine `ExprInt` amount resolves. Callers that previously relied on a
falsy balance to mean "empty account" have to handle the error explicitly.

### TransactionService (`src/services/TransactionService/index.ts`)

Builds, signs and submits deploys end to end.

```ts
transfer(payload: ITransferPayload): Promise<string> // returns submitted deployId
deploy(payload: IDeployPayload): Promise<string>     // arbitrary Rholang term
```

`transfer` builds its term with `this.terms.createTransferDeploy(...)`, so the
vault contract follows the active network's profile. `deploy` takes the term from
the caller and does not touch the term factory.

```ts
interface ITransferDetails {
    to: Address;
    amount: bigint;
    asset: Asset;
    phloLimit?: number;
    phloPrice?: number;
    shardId?: string;
}
interface ITransferPayload {
    walletType: WalletTypes;
    account: Account;
    signer: Signer;
    details: ITransferDetails;
    passwordProvider?: SecretsProvider; // optional when a signing session is active
}
interface IDeployPayload {
    walletType: WalletTypes;
    account: Account;
    signer: Signer;
    term: string;
    phloLimit?: number;
    phloPrice?: number;
    shardId?: string;
    passwordProvider?: SecretsProvider; // optional when a signing session is active
}
```

`transfer` validates recipient + amount, then generates the transfer RhoLang;
`deploy` takes an arbitrary `term` (rejects an empty one). Both share a private
`signAndSubmit`: read latest block number → build the appropriate `TSigningContext`
(HD adds `index`) → serialize + `blake2b-256` hash + sign → submit via
`DeployService`. Defaults `phloLimit`/`phloPrice` from config and `shardId` to
`"root"`.

### DeployStatusPoller (`src/services/DeployStatusPoller/index.ts`)

Polls a deploy until finalized or timed out. Extends `ApiWorker`, so it is
constructed with the `INetworkContext` of the network the deploy was submitted
to and keeps polling that network even after the active one changes.

```ts
new DeployStatusPoller(networkContext: INetworkContext)

watch(deployId, callbacks?: IDeployWatchCallbacks, options?: IDeployWatchOptions): IDeployWatchHandle
waitFor(deployId, options?: IDeployWatchOptions): Promise<IDeployConfirmedResult>
```

`IDeployWatchHandle = { cancel(): void; done: Promise<IDeployConfirmedResult> }`.
Defaults: 5s interval, 180s timeout. Re-entrancy is guarded so ticks never overlap.

Deploy status comes from the node, which runs ahead of the indexer that serves
transaction history: a deploy is confirmed here before the transaction shows up
in `Client.getTransactionsHistory`.

### GraphqlParser (`src/services/GraphqlParser/`)

Anti-corruption layer between the indexer's GraphQL shape and the domain
`Transaction`.

```ts
GraphqlParser.createTransactionHistoryRequest(address, publicKey, pagination?): { query, variables }
GraphqlParser.mapTransactionHistory(data, address, networkId): Transaction[]
GraphqlParser.unwrapGraphqlEnvelope<T>(response): GraphqlEnvelope<T>
GraphqlParser.isRecoverableNetworkError(error): boolean
```

`mapTransactionHistory` maps both the `transfers` and the `deployments` returned by
the single history query into `Transaction[]`, de-duplicating by deploy id (a
transfer wins over its matching deployment, but inherits the deployment's block
hash) and sorting by timestamp descending. Deployment-only rows map to
`type: "deploy"`.

`mapper.ts` maps a `RawTransfer` to `Transaction` (`send`/`receive` decided by
comparing normalized addresses; robust timestamp parsing). `queryOptions.ts`
defines `Pagination` (`{ offset?, limit? }`), `Order`, and `QueryOptions`.

---

## Crypto / key primitives

### CryptoService (`src/services/Crypto/index.ts`)

Password-based encryption via WebCrypto.

```ts
CryptoService.generateDataKeySecret(): string
CryptoService.encryptWithPassword(data: string, password: string): Promise<EncryptedData>
CryptoService.decryptWithPassword(payload: EncryptedData, passphrase: string): Promise<string>
CryptoService.decryptSignerData(signerData: EncryptedData, passwordProvider: SecretsProvider): Promise<IHDSecret | IPrivateKeyCredentials>
CryptoService.deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>
```

`EncryptedData = { data, salt, iv, version }`. Current profile:

- Version `2`
- KDF `PBKDF2`, `100_000` iterations, `SHA-256`
- Cipher `AES-GCM`, 256-bit key
- Salt `16` bytes, IV `12` bytes, data key `32` bytes

Decryption throws on an unsupported version or invalid credentials.

`decryptSignerData` decrypts the stored signer secret and returns either
private-key credentials or an HD secret (with the `rootHDPath` re-parsed into a
`Bip44Path`).

`generateDataKeySecret` returns 32 random bytes as base64. It is a
high-entropy secret used in place of a password in the same
`encryptWithPassword` / `decryptWithPassword` pair, so records encrypted with a
data key share the exact same envelope and profile as password-encrypted ones.

### WalletsService (`src/services/Wallets/index.ts`)

Address derivation and wallet metadata generation.

```ts
WalletsService.createWallet(privateKey?: Uint8Array, options?: CreateWalletOptions): WalletMeta
WalletsService.createFirstWalletWithMnemonic(mnemonic?: string, index?: number): Promise<WalletMeta>
WalletsService.deriveAddressFromPrivateKey(privateKey: Uint8Array): Address
WalletsService.deriveAddressFromPublicKey(publicKey: Uint8Array): Address
```

`WalletMeta = { address, privateKey, publicKey?, mnemonic? }`. Address derivation:
`keccak256` of the public key → chain prefix → `blake2b` checksum → base58 (always
prefixed `1111`). `createFirstWalletWithMnemonic` throws
`"...Recovery mnemonic is missing or invalid"` for blank/invalid input.

### MnemonicService (`src/services/Mnemonic/index.ts`)

BIP-39 helpers.

```ts
enum MnemonicStrength { TWELVE_WORDS = 128, TWENTY_FOUR_WORDS = 256 }

MnemonicService.generateMnemonic(strength?): string
MnemonicService.generateMnemonicArray(strength?): string[]
MnemonicService.isMnemonicValid(mnemonic: string): boolean
MnemonicService.normalizeMnemonic(mnemonic: string): string
MnemonicService.mnemonicToWordArray(mnemonic: string): string[]
MnemonicService.wordArrayToMnemonic(words: string[]): string
MnemonicService.mnemonicToSeed(mnemonic: string | string[], passphrase?): Promise<Uint8Array>
```

`normalizeMnemonic` trims, lowercases, and collapses runs of whitespace to single
spaces. `Client.createHDWallet` normalizes before validating and before deriving,
so a phrase pasted with stray casing or double spaces produces the same wallet
(and therefore the same fingerprint) as its canonical form, instead of slipping
past duplicate detection.

### KeyFingerprintService (`src/services/KeyFingerprint/index.ts`)

Derives the stable, non-reversible identity of a key pair. Used to detect
duplicate wallets and accounts without decrypting anything.

```ts
KeyFingerprintService.fromPublicKey(publicKey: Uint8Array): string   // sha256(publicKey), hex
KeyFingerprintService.fromPrivateKey(privateKey: Uint8Array): string // public key first, then as above
KeyFingerprintService.fromMnemonic(mnemonic: string): Promise<string>
```

`fromMnemonic` derives the BIP-32 master node and hashes
`publicKey || chainCode`, then zeroizes the seed in a `finally`. Hashing the
master node rather than the seed means the same mnemonic always yields the same
fingerprint while nothing recoverable is stored.

Where each one is used: `Account` computes `fromPublicKey` in its constructor,
and the signer fabric computes `fromPrivateKey` for a private-key signer and
`fromMnemonic` for an HD signer. Both values are persisted in plaintext next to
the encrypted secret, because a hash of public material discloses nothing that
the chain does not already show.

### KeyDerivationService (`src/services/KeyDerivation/index.ts`)

BIP-32/BIP-44 derivation over a custom `@noble/secp256k1` ECC adapter
(`eccAdapter.ts`).

```ts
KeyDerivationService.deriveKeyFromMnemonic(mnemonic: string | string[], bip44path: string | Bip44Path): Promise<Uint8Array>
KeyDerivationService.derivePrivateKey(masterNode: BIP32Interface, path: Bip44Path): Uint8Array
KeyDerivationService.mnemonicToSeed(mnemonicWords: string[] | string, passphrase?): Promise<Uint8Array>
KeyDerivationService.seedToMasterNode(seed): BIP32Interface
KeyDerivationService.deriveNextKeyFromMnemonic(mnemonicWords, currentIndex, options?): Promise<Uint8Array>
```

Derived seeds are zeroized after use.

### KeysManager (`src/services/KeysManager/index.ts`)

secp256k1 key utilities.

```ts
KeysManager.generateRandomKey(length?: number): Uint8Array
KeysManager.generateKeyPair(keyLength?: number): KeyPair
KeysManager.getKeyPairFromPrivateKey(privateKey: Uint8Array): KeyPair
KeysManager.getPublicKeyFromPrivateKey(privateKey: Uint8Array): Uint8Array
KeysManager.convertKeyToHex(key: Uint8Array): string
KeysManager.getInitialHDPathFromOptions(options: TCreateHDPathWalletOptions): Promise<Bip44Path>
KeysManager.getPrivateDataFromSeed(seed: Uint8Array, path: Bip44Path): Promise<IHDWalletPrivateKeyDataFromSeed>
```

`KeyPair = { privateKey: Uint8Array; publicKey: Uint8Array }`. Default key length
is `PRIVATE_KEY_LENGTH` (32 bytes).

### SignerService (`src/services/Signer/index.ts`)

Serializes `DeployData` into the protobuf byte layout expected on-chain (used by
`TransactionService` before hashing/signing).

```ts
SignerService.deployDataProtobufSerialize(deployData: DeployData): Uint8Array
```

Also exports the signing result contracts:

```ts
interface SigningRequest {
    wallet: Wallet;
    data: any;
}
interface SignedResult {
    data: any;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
}
```
