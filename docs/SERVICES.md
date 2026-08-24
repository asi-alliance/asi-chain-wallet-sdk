# Services Reference

This file documents the current service modules under `src/services`.

Services split into a few groups:

- **Managers** — in-memory ownership of domain objects (`ItemManager`,
  `WalletManager`, `AccountManager`, `AccountsService`,
  `ReservationAdapterManager`, `TransactionReservationsManager`,
  `DisposableItemManager`).
- **Events & lifecycle** — `ClientEventBus`, `ClientLifecycleGuard`,
  `ConcurrentOperationGuardService`, `WalletOperationGuardService`.
- **Read models** — `TransactionsHistoryAggregator`, `CollectionQueryService`.
- **Persistence orchestration** — `StorageBootstrap`, `StorageMigrationRunner`,
  `StorageManager`, `NetworkManager`, `InsensitiveCacheStorageManager`,
  `InsensitiveCacheStorageSerializer`, `WalletPersistenceService`,
  `WalletUniquenessService`.
- **API services** — instantiated by `ApiServiceRegistry`: `DeployService`,
  `BlockService`, `AccountDataService`, `AssetsService`, `TransactionService`,
  `DeployStatusPoller`, plus the `GraphqlParser` and `HttpResponseParser`
  helpers.
- **Keyfiles** — `ExportKeyfileService`, `ImportKeyfileService`,
  `KeyfileSerializer`, `WalletImportService`.
- **Crypto / key primitives** — `CryptoService`, `WalletsService`,
  `MnemonicService`, `KeyDerivationService`, `KeysManager`, `SignerService`,
  `KeyFingerprintService`, `BinaryWriter` (documented under domains).

---

## Managers

### ItemManager (`src/services/ItemManager/index.ts`)

Generic in-memory `Map<string, T>` registry used as a base class.

```ts
add(id: string, item: T): void
addMany(entries: Iterable<[string, T]>): void
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
createHD(params: ICreateHDWalletParams, secretProvider): Promise<Wallet> // { accountName, index? }
createPrivateKey(accountName: string, secretProvider): Promise<Wallet>
importKeyfile(payload: IImportKeyfileWalletPayload, passwordProvider): Promise<Wallet>
open(signerId: string, passwordProvider): Promise<Wallet>
delete(id: string): Promise<Wallet>              // removes signer + accounts from storage
getBySignerId(signerId: string): Wallet | null
deriveAccount(walletId, accountName, passwordProvider): Promise<IDerivedAccount>
removeAccount(walletId, accountId): Promise<Account>
renameAccount(walletId, accountId, name): Promise<void>
setActiveAccount(walletId, accountId): void
getPublicWalletsMetadata(): Promise<IWalletMetadata[]>
count(): Promise<number>
countInStorage(): Promise<number>
```

`ICreateHDWalletParams` no longer carries the mnemonic: the recovery phrase
arrives through the `SecretsProvider` instead (see
[SecretsProvider](DOMAINS.md#secretsprovider-srcdomainssecretsproviderindexts)).

`getBySignerId` exists because wallets are keyed by `walletId` in memory while
keyfiles and stored records identify a wallet by its `signerId`. Keyfile account
import uses it to find the open wallet a set of accounts belongs to.

`IWalletMetadata = { signerId, type, accounts: IAccountMetadata[] }` is the
lightweight, non-secret listing used by UIs to render closed wallets.

`open` replaces the former `unlock`: loading a stored wallet into memory and
holding a signing session are separate steps now, and only the first belongs
here (see [Open vs unlocked](DOMAINS.md#open-vs-unlocked)).

Concurrency and duplicates are enforced here, not in `Client`, through the
`WalletOperationGuardService` **singleton**, shared by every `WalletManager`
instance and by `WalletPersistenceService`. Sharing it is deliberate: two
managers over the same storage must not each think they are the only writer.

- `open` and `deriveAccount` run inside `runWalletAction`, so a second concurrent
  attempt at the same action on the same signer throws
  `WalletActionInProgressError` instead of racing.
- `persist` (the tail of every create and import path) runs inside
  `runWalletCreation`, which reserves the wallet's fingerprints for the duration
  and then delegates the storage check to
  [WalletUniquenessService](#walletuniquenessservice-srcserviceswalletuniquenessindexts).

The reservation is what closes the window a storage-only check would leave open:
two identical wallets created in the same tick would both read an empty storage,
so the second one is rejected on the in-memory reservation instead.

### AccountManager (`src/services/AccountManager/index.ts`)

`ItemManager<Account>` owned by each `Wallet`; also tracks the active account.

```ts
create(payload: TCreateAccountPayload, secretProvider): Promise<ICreatedAccountData>
addAccounts(accounts: Account[]): void
remove(id: string): Account
update(id: string, payload: TEditableAccountOptions): void
setActiveAccount(id: string): void
getActiveAccount(): Account | null
getAccounts(): Account[]
getAccountsMap(): Map<string, Account>
getAccount(id: string): Account | null
```

`ICreatedAccountData = { accountId: string; account: Account }`.

`addAccounts` registers several already-created accounts at once and promotes the
first of them to active **only when there was no active account**, so a bulk
keyfile import never steals the selection the user is currently on.

`remove` reassigns the active account only when the removed one was active.
It previously reset the active account on every removal, which moved the
selection out from under the user when they deleted some other account.

### AccountsService (`src/services/Accounts/index.ts`)

Creates a batch of accounts from one secret provider, sequentially.

```ts
AccountsService.createAccounts(accounts: TCreateAccountPayload[], secretProvider): Promise<Account[]>
```

Deliberately sequential rather than `Promise.all`: each `Account.create` derives
a key from the shared secret, and serializing keeps only one derivation in flight
at a time. It creates accounts in memory only — persistence is
`WalletPersistenceService`'s job, which is what lets the keyfile import preview
derive addresses without writing anything.

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

`LifecycleGuard` specialized for wallet-scoped work.

```ts
new ClientLifecycleGuard(discardWallet: (wallet: Wallet) => void)

runWalletPublication(operation: () => Promise<Wallet>): Promise<Wallet>
runAccountsUpdate<T>(signerId: string, operation: () => Promise<T>): Promise<T>
```

`Client` wraps `createHDWallet`, `createPrivateKeyWallet`, `openWallet`, and
`importWalletKeyfile` in `runWalletPublication`. If the guard was invalidated
while the wallet was being built (a logout, a `clearPersistence`, or a `close`),
the finished wallet is handed to `discardWallet` — which locks it and drops it
from both the wallet manager and the reservation adapter manager — and the caller
gets a `WalletOperationCancelledError`.

`runAccountsUpdate` is the same generation check for work that produces accounts
rather than a wallet, used by `importKeyfileAccounts`. There is nothing to
discard here (the accounts are already persisted against a stored signer), so it
only reports the cancellation, naming the `signerId` the work belonged to.

The base `LifecycleGuard` contract is documented under
[domains](DOMAINS.md#lifecycleguard-srcdomainslifecycleguardindexts).

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

The wallet-specific guard, built on the generic one. A process-wide **singleton**
(`WalletOperationGuardService.getInstance()`) so every `WalletManager` and
`WalletPersistenceService` share one lock table.

```ts
WalletOperationGuardService.getInstance(): WalletOperationGuardService

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
  `WalletActionInProgressError`. `WalletAction` covers `OPEN`, `DERIVE_ACCOUNT`,
  and `SAVE_ACCOUNTS`, so opening a wallet twice, deriving two accounts at once,
  or importing two overlapping keyfile selections into the same signer all
  serialize instead of racing.

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

### StorageBootstrap (`src/services/StorageBootstrap/index.ts`)

The ordered startup of the whole storage layer. `Client.create` calls it instead
of `StorageManager.init` directly.

```ts
StorageBootstrap.init(options?: IStorageBootstrapOptions): Promise<void>
StorageBootstrap.close(): void

interface IStorageBootstrapOptions {
    storageOptions?: IStorageFabricOptions;
    withInsensitiveCacheStorage?: boolean;
}
```

The order is the point:

1. Open the schema metadata table on its own. It has to be readable before
   anything else is touched.
2. `runner.assertCompatible()` — **before** any other table is created. A newer
   schema, a malformed migration chain, or an interrupted previous migration
   aborts here, while storage is still untouched.
3. Initialize `StorageManager` and, when the flag is set,
   `InsensitiveCacheStorageManager`.
4. `runner.run()` — apply pending migrations.

Checking compatibility before step 3 is what keeps a downgrade harmless: opening
a table can create it, so an SDK that cannot read the current schema must not
reach that code at all. `MIGRATABLE_TABLES` lists the tables the runner backs up
and restores; the metadata table is deliberately not among them.

### StorageMigrationRunner (`src/services/StorageMigrationRunner/`)

Applies schema migrations with a per-step backup and rollback. Split across
`runner.ts` (the engine) and `migrations.ts` (the declared list) to keep the
import cycle out.

```ts
new StorageMigrationRunner({ storage, metadataRepository, tables, migrations?, currentVersion? })

assertCompatible(): Promise<void>
run(): Promise<number> // returns the version storage ends on

interface IStorageMigration {
    version: number;
    description: string;
    resumable: boolean;
    run(storage: ITableService<ITableRecord>): Promise<void>;
}
```

`STORAGE_MIGRATIONS` is currently empty: `CURRENT_STORAGE_VERSION` and
`BASELINE_STORAGE_VERSION` are both `1`, so existing installs are already on the
supported version. The machinery is in place so the first real schema change does
not have to invent it under pressure.

**`assertCompatible` runs four checks**, in this order:

1. *Downgrade.* Stored version greater than `currentVersion` raises
   `StorageVersionDowngradeError`. Storage is left alone.
2. *Declared versions are valid.* Duplicate versions, or versions outside
   `BASELINE + 1 .. currentVersion`, raise `StorageMigrationChainError`. This is
   a defect in the SDK's own migration list.
3. *The chain has no gaps.* Every version between the stored one and the current
   one must have a migration, or `StorageMigrationChainError` again. A gap would
   mean silently skipping a schema step.
4. *A previous interruption is resumable.* A non-null `pendingVersion` means the
   last run stopped mid-migration; unless it is safe to retry, it raises
   `StorageMigrationInterruptedError` with the reason (`ROLLBACK_FAILED`,
   `MIGRATION_NOT_RESUMABLE`, `MIGRATION_NOT_FOUND`).

**Each migration step** is wrapped in a backup and rollback:

1. Snapshot every migratable table that currently exists, plus the table-name
   list.
2. Mark `pendingVersion` so a crash mid-step is detectable on the next start.
3. Run the migration, then `saveVersion` (which clears `pendingVersion`).
4. On failure, roll back: drop tables the migration created, restore every
   snapshotted table, then clear `pendingVersion`.

The rollback drops created tables **as well as** restoring rows, because a
migration that added a table and then failed would otherwise leave a table the
previous SDK build does not expect. The metadata table is excluded from that
cleanup for the obvious reason.

If the rollback itself fails, the failures are recorded in `rollbackFailure` and
`StorageMigrationRollbackError` is raised. That flag is sticky: every subsequent
start refuses to migrate, because storage now holds partially migrated data that
cannot be reasoned about. A successful rollback instead produces
`StorageMigrationFailedError` with `isStorageIntact: true`.

`run` writes `currentVersion` at the end even when no migration ran, which is how
fresh storage gets stamped on first use.

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

## Keyfiles

Four services split one flow into layers that can be reasoned about separately:
`KeyfileSerializer` decides the on-disk shape, `ExportKeyfileService` and
`ImportKeyfileService` own the two directions of the boundary, and
`WalletImportService` turns a validated keyfile into a decision about what the
caller should do with it. `Client` only calls the last one.

The two keyfile kinds and the public entry points are described in
[Client keyfile export & import](DOMAINS.md#keyfile-export--import).

### KeyfileSerializer (`src/services/KeyfileSerializer/index.ts`)

The single place that decides what a keyfile contains.

```ts
KeyfileSerializer.serializeAccount(account: Account): IKeyfileAccount            // { name, address, index }
KeyfileSerializer.serializeWalletAccount(account: Account): IKeyfileWalletAccount // { name, index }
KeyfileSerializer.serializeWallet(wallet, passwordProvider): Promise<IKeyfileWallet>
```

```ts
interface IKeyfileWallet {
    walletType: WalletTypes;
    encryptedPrivateData: EncryptedData; // the signer's stored ciphertext, reused as-is
    encryptedAccounts: EncryptedData;    // the account list, encrypted under the password
}
```

Two details carry the security properties of the whole feature:

- `encryptedPrivateData` is the signer's **existing** `encryptedSecret`, copied
  out unchanged. Export never decrypts the secret, so no plaintext key exists at
  any point during it.
- The account list is encrypted rather than stored in the clear. A wallet
  keyfile therefore leaks neither keys nor how many accounts a wallet has or at
  which indexes, which would otherwise be a usable fingerprint of the owner.

Note the asymmetry between the two account shapes: a wallet keyfile stores
`{ name, index }` **without** the address, because the address is re-derived from
the secret on import and storing it would be redundant data to keep consistent.
The standalone account keyfile stores the address precisely because it has no
secret to derive it from.

### ExportKeyfileService (`src/services/ExportKeyfileService/index.ts`)

Builds keyfile envelopes and serializes transaction exports. Replaces the former
`ExportService`.

```ts
ExportKeyfileService.exportAccountKeyfile(account: Account): IAccountKeyfile
ExportKeyfileService.exportWalletKeyfile(wallet, passwordProvider): Promise<IWalletKeyfile>
ExportKeyfileService.exportTransactions(transactions: Transaction[], format?: ExportFormat): string
ExportKeyfileService.transactionsToCsv(transactions: Transaction[]): string
ExportKeyfileService.toJSON(data: unknown): string
```

Every keyfile gets the same envelope: `{ version, type, timestamp }`, where
`type` is a `KeyfileTypes` member. `version` is `ASI_WALLET_KEYFILE_VERSION` and
import refuses anything else.

`exportWalletKeyfile` checks the password through `Wallet.isPasswordValid`
**before** serializing and throws `InvalidKeyfilePasswordError` on a mismatch, so
a wrong password produces a precise error rather than a half-built file. Any
other serialization failure is normalized to `InvalidKeyfileError`, so the export
path never leaks a crypto-layer message.

The keyfile builders return objects; only `exportTransactions` returns a string
(pretty-printed JSON by default, or CSV built from `TRANSACTIONS_CSV_HEADERS`
with RFC-4180 quoting). `toJSON` is exposed so a caller that wants a downloadable
file gets the same 2-space formatting the SDK uses.

### ImportKeyfileService (`src/services/ImportKeyfileService/index.ts`)

The parsing and decryption half of the boundary. Every failure here is a typed
keyfile error.

```ts
ImportKeyfileService.fromJSON(source: string): unknown
ImportKeyfileService.parseWalletKeyfile(source: unknown): IWalletKeyfile
ImportKeyfileService.decryptKeyfileAccounts(keyfile, passwordProvider): Promise<IKeyfileWalletAccount[]>
ImportKeyfileService.toImportPayload(keyfile, passwordProvider, options?): Promise<IImportKeyfileWalletPayload>
ImportKeyfileService.decryptKeyfileSecret(walletType, encryptedSecret, passwordProvider): Promise<TDecryptedSecret>
```

`parseWalletKeyfile` accepts either a parsed object or a raw JSON string and runs
`validateWalletKeyfile`: envelope type, version, wallet type, and both encrypted
sections. `decryptKeyfileAccounts` then validates the decrypted list with
`validateWalletKeyfileAccounts` — non-empty, well-shaped, no duplicate indexes,
and at most one account for a private-key keyfile.

`toImportPayload` narrows the accounts to `options.accountIndexes` when given.
An empty array and an index the keyfile does not declare are both rejected with
`InvalidKeyfileError`, the latter naming the missing indexes, so a selection
built against a stale preview fails loudly instead of importing a subset.

`decryptKeyfileSecret` cross-checks the decrypted secret against the declared
`walletType`: an HD keyfile must decrypt to a seed, a private-key keyfile to a
private key. A mismatch is a tampered or corrupted file, not a usable wallet.

Throughout, a failed decrypt becomes `InvalidKeyfilePasswordError` and a failed
structural check becomes `InvalidKeyfileError` — the split a UI needs to decide
between re-prompting for the password and rejecting the file.

### WalletImportService (`src/services/WalletImport/index.ts`)

Turns a keyfile into a decision. This is the layer `Client` talks to.

```ts
WalletImportService.previewKeyfileImport(source, passwordProvider): Promise<Omit<IKeyfileImportPreview, "isExistingWalletOpen">>
WalletImportService.prepareKeyfileImport(source, passwordProvider, options?): Promise<IKeyfileImportPlan>
WalletImportService.prepareKeyfileAccountsImport(source, passwordProvider, options?): Promise<IKeyfileAccountsImportPlan>
```

All three share one private `resolveKeyfileImport`, which parses, decrypts,
builds a `SecretsProvider` over the decrypted secret, and looks the secret up in
storage by fingerprint. That single lookup is what the three entry points then
interpret differently:

| Entry point | Secret already stored | Secret unknown |
| --- | --- | --- |
| `previewKeyfileImport` | reports `existingSignerId` | reports `null` |
| `prepareKeyfileImport` | throws `DuplicateWalletError` | returns the plan |
| `prepareKeyfileAccountsImport` | returns the plan plus `signerId` | throws `KeyfileWalletNotFoundError` |

A private-key keyfile whose secret is already stored is rejected inside
`resolveKeyfileImport` itself, before the split: a private-key wallet has exactly
one account, so there is no "add accounts to the existing wallet" case for it.

`previewKeyfileImport` derives every declared account through `AccountsService`
and checks each one's fingerprint against storage, marking it `new` or
`already-imported` with the existing account id. Nothing is persisted, so a
preview is safe to run on any file the user drops in.

`Client` adds the one fact this service cannot know — whether the existing wallet
is currently **open** — and returns the completed `IKeyfileImportPreview`.

### WalletUniquenessService (`src/services/WalletUniqueness/index.ts`)

The one place that answers "is this key already stored?".

```ts
WalletUniquenessService.findSignerBySecret(secretProvider): Promise<ISignerStorageRecord | null>
WalletUniquenessService.findExistingAccount(account): Promise<IAccountStorageRecord | null>
WalletUniquenessService.assertAccountIsNotDuplicate(account): Promise<void>
WalletUniquenessService.assertWalletIsNotDuplicate(wallet): Promise<void>
```

The lookups are fingerprint-based, so they work while every wallet is closed and
never decrypt stored data. `findSignerBySecret` fingerprints a decrypted secret
through `KeyFingerprintService.fromSecret`, which is what lets keyfile import ask
"does this secret already exist?" before creating anything.

The `assert*` variants raise `DuplicateWalletError` / `DuplicateAccountError`
naming the existing owner. This logic was previously private to `WalletManager`;
it moved here because keyfile import, account import, and wallet creation all
need it and must agree on the answer.

### WalletPersistenceService (`src/services/WalletPersistence/index.ts`)

Creates and persists accounts against an existing signer, without going through a
`Wallet` aggregate.

```ts
WalletPersistenceService.createAccounts(signerId, accounts: TCreateAccountPayload[], secretProvider): Promise<Account[]>
WalletPersistenceService.saveAccounts(signerId, accounts: Account[]): Promise<void>
```

This is the path `Client.importKeyfileAccounts` uses, and it exists because that
import must work whether or not the target wallet is currently open. Writing
through storage rather than through the in-memory wallet means a closed wallet
receives its new accounts just as well; `Client` separately updates the wallet in
memory when it happens to be open.

`saveAccounts` runs inside `runWalletAction(SAVE_ACCOUNTS, signerId)` and
re-checks every account for duplicates **inside** the guard, so two concurrent
imports of overlapping selections cannot both pass their checks and then both
write.

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

### HttpResponseParser (`src/services/HttpResponseParser/index.ts`)

Keeps large chain integers intact across JSON parsing. Installed as the
`transformResponse` of both `BaseHttpClient` and `BaseGraphQLClient`, so it
applies to every node and indexer response.

```ts
HttpResponseParser.parseWithBigIntegersAsStrings(data: unknown): unknown
```

The problem it solves: balances and phlo amounts routinely exceed
`Number.MAX_SAFE_INTEGER`, and `JSON.parse` silently rounds them to the nearest
representable double. By the time SDK code sees the value, the precision is
already gone — `BigInt` conversion afterwards cannot recover it.

The parser scans the raw response text and re-quotes any **integer literal that
is not a safe integer**, turning it into a string before parsing. The scanning
regex matches string literals as well as numbers so that digits already inside a
quoted string are skipped rather than double-quoted. Non-integers (floats,
exponent notation) are left alone, since they were never exact to begin with.

It is deliberately total: a non-string input is returned unchanged, and a parse
failure falls back to the raw data instead of throwing, so a malformed response
surfaces through the normal error path rather than as a transform crash.

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
KeyFingerprintService.fromSecret(secret: TFingerprintSecret): Promise<string>
```

`fromSecret` is the entry point callers should use: it takes a decrypted secret
of either shape and dispatches to the right variant (`privateKey` present means
private-key, otherwise a seed). It exists so the signer fabric and keyfile import
do not each re-implement the same branch, and so both always produce the same
fingerprint for the same secret.

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
