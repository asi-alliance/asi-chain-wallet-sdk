# Domains Reference

This file documents the current domain modules under `src/domains`.

The SDK is organized around a high-level `Client` facade. `Client` owns a
`WalletManager` and a `ReservationAdapterManager`, and it wires network access
through the singletons `ApiClientManager` (transport) and `ApiServiceRegistry`
(services). Wallets own accounts through an `AccountManager`, and secret material
is never exposed directly — it flows through `SecretsProvider` closures and the
`Signer` boundary.

Two cross-cutting concerns have their own small domains rather than being spread
across the facade: a `SigningSession` per signer holds the decrypted secret under
a fixed auto-lock window, and a `LifecycleGuard` tracks in-flight work so a
logout can invalidate and drain it. `Client` itself is a `ClosableDomain`, and it
publishes state changes through a `ClientEventBus` that callers subscribe to at
any time.

Node access is layered, because two f1r3node implementations (legacy Scala, new
Rust) expose different HTTP contracts:

```
ApiServiceRegistry → services
        ↓
NodeApiProvider → NodeApiAdapter (Scala | Rust)   per-profile request shaping
        ↓
ApiClientManager ── NetworkConfigProvider          client ownership + network registry
        ↓
ValidatorClient · ObserverClient · IndexerClient
        ↓
BaseHttpClient · BaseGraphQLClient
```

The active network's `nodeApiProfile` picks the adapter. Nothing above the adapter
knows which node implementation it is talking to.

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
    onListenerError?: TClientEventListenerErrorHandler; // (name, error) => void
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

openWallet(signerId: string, password: string): Promise<Wallet> // load a stored wallet into memory
closeWallet(walletId: string): void                             // drop it from memory, keep it in storage
closeAllWallets(): void                                         // close every open wallet at once
isWalletOpen(walletId: string): boolean
removeWallet(walletId: string): Promise<Wallet>                 // delete it from storage for good

deriveAccount(walletId: string, accountName: string, password: string): Promise<ICreatedAccountData>
removeAccount(walletId: string, accountId: string): Promise<Account>
renameAccount(walletId: string, accountId: string, name: string): Promise<void>
setActiveAccount(walletId: string, accountId: string): void

getWalletManager(): WalletManager
getInsensitiveAccountsData(): Promise<IInsensitiveCacheRecord[]> // requires withInsensitiveCacheStorage flag
```

### Open vs unlocked

These are two independent states, and the API keeps them apart.

**Open** is about presence: the wallet, its accounts, and its reservation adapter
are materialized in memory and addressable by `walletId`. `openWallet` reads the
stored signer, decrypts it with the password, and publishes the wallet;
`closeWallet` and `closeAllWallets` drop it again without touching storage;
`removeWallet` deletes it permanently. Only `removeWallet` destroys data.

**Unlocked** is about signing: an in-memory signing session holds the decrypted
secret, so transfers and deploys do not re-prompt for the password.

`openWallet` needs the password either way (it has to decrypt the signer) and,
when the policy holds sessions, opens the wallet already unlocked. A wallet can
then be locked and unlocked any number of times while staying open, and closing
a wallet always locks it first.

Opening the same signer twice throws: `openWallet` rejects a signer that is
already open, and `WalletManager` serializes concurrent `open` calls for one
signer through `WalletActionInProgressError` (status `409`).

Signing sessions:

```ts
isWalletUnlocked(walletId: string): boolean // true while an in-memory session is active
unlockWallet(walletId: string, password: string): Promise<void> // (re)start the session of an open wallet
lockWallet(walletId: string): void          // clears the session + zeroizes the secret, fires walletLocked
```

`unlockWallet` addresses an **open wallet by `walletId`**, not a stored signer by
`signerId` — use `openWallet` for the latter. It decrypts the signer secret and
keeps it in memory until it auto-locks after `autoLockMs`. Under
`requirePassword: "every-signature"` no session is ever held, so `unlockWallet`
throws instead of pretending to start one.

The session is **fixed-duration**: activity does not extend it. When a session
expires, signing without a password throws a `WalletLockedError` (HTTP-style
status `403`) so callers can distinguish an expired session from a server error
and re-prompt for the password.

Locking, closing, or clearing persistence while an unlock is still decrypting
cancels that unlock: the resolved secret is zeroized instead of being installed,
and the caller gets a `WalletOperationCancelledError` (status `409`). The same
guard covers wallet publication — a `createHDWallet`, `createPrivateKeyWallet`,
or `openWallet` that finishes after a logout discards the wallet it just built
rather than leaking it into the post-logout state. See
[SigningSession](#signingsession-srcdomainssigningsessionindexts) and
[LifecycleGuard](#lifecycleguard-srcdomainslifecycleguardindexts).

Duplicate protection is enforced at creation time, not at the UI layer:
`createHDWallet` and `createPrivateKeyWallet` reject a secret that is already
stored with `DuplicateWalletError`, and a key that already belongs to a stored
account with `DuplicateAccountError` (both status `409`, both carrying the ids of
the existing owner). Matching is done on a non-reversible key fingerprint, so it
works while every wallet is locked. `createPrivateKeyWallet` additionally
validates the raw key against the secp256k1 range before doing any work.

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

isNetworkBusy(networkId?: NetworkId): boolean              // defaults to the active network
hasNetworkReservations(networkId?: NetworkId): boolean    // any open wallet still holds funds there
```

`isNetworkBusy` and `hasNetworkReservations` answer different questions:
the first is about an operation running right now, the second about funds still
locked by pending reservations on that network. A UI that warns before removing
a network reads the second one.

Built-in networks (those provided to `Client.create`) are marked
`isDefault: true` and are immutable: `updateNetwork` / `removeNetwork` reject
them. Custom networks are addressed by a generated `id` (not by `name`, which is
editable data) and are persisted so they survive a reload.

A network with an operation in flight cannot be switched, updated, or removed:
`setNetwork`, `updateNetwork`, and `removeNetwork` throw `NetworkBusyError`
(status `409`) until it goes idle. `isNetworkBusy` and the `onNetworkBusyChanged`
event let a UI disable those controls instead of catching the error. Removing a
network also drops that network's reservations from memory and storage.

Balances, reservations & transfers:

```ts
getBalance(address: Address): Promise<bigint>
getAvailableBalance(walletId: string, accountId: string): Promise<bigint> // total minus reserved
getReservations(walletId: string): Promise<ITransactionReservation[]>
getTransactionsHistory(walletId: string, accountId: string, options?: ITransactionsHistoryOptions): Promise<Transaction[]>
transfer(request: ITransferRequest, password?: string): Promise<IReservedOperationResult>
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

```ts
type THistorySource = "pending" | "executed";

interface ITransactionsHistoryOptions {
    sources?: THistorySource[]; // defaults to ["pending", "executed"]
    pagination?: Pagination;
}
```

`sources` narrows the merge to one side: `["pending"]` reads the reservation
adapter only and never touches the indexer, `["executed"]` ignores pending rows.

`pagination` covers the merged history, not the indexed part alone. Pending and
executed rows are interleaved by `timestamp`, so the page cannot be split
between the two sources; instead
`TransactionsHistoryAggregator.createHistoryWindow` widens the indexer request
by the number of pending rows, and `mergeHistoryPage` cuts the requested page
out of the merged result. Without a reservation adapter, or with no pending rows
for the current network, the pagination goes to the indexer untouched.

### Pending → executed is eventually consistent

The two sides of the merge come from different backends. A reservation is
released when `DeployStatusPoller` sees the deploy confirmed **on the node**,
while the executed side is served by the **indexer**, which ingests the block
afterwards. There is no shared cursor between node status and indexer ingestion,
so the client cannot detect or close that lag.

For the width of that window the same transaction may therefore be:

- in **neither** list — the reservation is already released, the indexed row has
  not arrived yet;
- in **both** lists — the indexer is ahead of the poller and the reservation is
  still alive.

`mergeHistoryPage` dedupes pending rows against the executed rows **of the same
page** (a pending transaction id equals its deploy id), so a duplicate is
invisible whenever both twins fall into one page. When they land on different
pages the pending twin is not filtered out. Transient cross-page duplicates and
the brief gap are accepted behaviour for now; the next reload after the indexer
catches up settles the list.

Deploys of arbitrary Rholang:

```ts
deploy(request: IDeployRequest, password?: string): Promise<IReservedOperationResult> // same session rules as transfer
exploreDeploy(rholang: string): Promise<unknown>                 // read-only, no unlock/password
watchDeploy(deployId, callbacks?, options?): IDeployWatchHandle  // poll deploy status
```

`transfer` and `deploy` both go through the wallet's reservation adapter, so both
lock funds (`phloLimit * phloPrice` for a deploy) and both return an
`IReservedOperationResult` — the `deployId` plus a `subscribe` that attaches
deploy-watch callbacks to that reservation. Both also run inside
`ApiClientManager.runNetworkOperation`, which marks the network busy for the
duration and reports it through `onNetworkBusyChanged`.

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
isActive(): boolean               // false once close() ran
clearPersistence(): Promise<void> // wipes storage + in-memory state, keeps the client usable
close(): Promise<void>            // releases managers, listeners, and API clients for good
```

`Client` extends [ClosableDomain](#closabledomain-srcdomainsclosabledomainindexts):
`close()` is idempotent and terminal. Every state-changing method is guarded by
`@EnsureActive` and throws `DomainClosedError` (status `410`) afterwards, so a
call that survives a teardown fails loudly instead of resurrecting a dead client.
Pure reads that cannot corrupt anything (`isWalletOpen`, `isWalletUnlocked`,
`getNetworks`, `getCurrentNetwork`, `isNetworkBusy`, `hasNetworkReservations`,
`getEventBus`, the amount helpers) stay callable.

Both `close()` and `clearPersistence()` first invalidate the lifecycle guard and
lock every open wallet, then **drain** the operations still in flight (bounded by
`DEFAULT_DRAIN_TIMEOUT_MS`, 10s) before touching storage, so a transfer running
concurrently with a logout cannot write after the wipe.

### Events

Subscribe through the event bus:

```ts
getEventBus(): IClientEventSource

interface IClientEventSource {
    on<TName extends TClientEventName>(name: TName, listener: TClientEventListener<TName>): TUnsubscribe;
    off<TName extends TClientEventName>(name: TName, listener: TClientEventListener<TName>): void;
}
```

```ts
enum ClientEvent {
    WALLETS_CHANGED = "walletsChanged",         // (wallets: Wallet[])
    ACCOUNTS_CHANGED = "accountsChanged",       // (walletId: string, accounts: Account[])
    NETWORK_CHANGED = "networkChanged",         // (network: INetworkRecord)
    RESERVATIONS_CHANGED = "reservationsChanged", // (reservationsByWallet: TReservationsByWallet)
    NETWORK_BUSY_CHANGED = "networkBusyChanged",  // (networkId: NetworkId, isBusy: boolean)
    WALLET_LOCKED = "walletLocked",             // (walletId: string) manual lock and auto-lock expiry
}
```

`on` returns its own unsubscribe, so a caller never has to keep the listener
reference around. Subscriptions can be added and dropped at any point in the
client's life, which is what separates the bus from the constructor-time
dispatcher: a component mounted long after `Client.create` can still listen.
`getEventBus` returns a frozen `on`/`off` view — `emit` and `clear` stay internal
so integrators cannot fire client events themselves. `close()` clears every
listener.

Listeners are isolated: a throwing or rejecting listener never breaks the emit
loop or the SDK operation that triggered it. Failures are routed to the optional
`onListenerError(name, error)` handler passed to `Client.create`, and a handler
that throws in turn is only logged. Listeners may be `async`; the bus does not
await them.

The legacy callback object is still supported and is now a thin bridge over the
bus:

```ts
interface IClientEventDispatcher {
    onWalletsChanged?(wallets: Wallet[]): void | Promise<void>;
    onAccountsChanged?(walletId: string, accounts: Account[]): void | Promise<void>;
    onNetworkChanged?(network: INetworkRecord): void | Promise<void>;
    onReservationsChanged?(reservationsByWallet: TReservationsByWallet): void | Promise<void>;
    onNetworkBusyChanged?(networkId: NetworkId, isBusy: boolean): void | Promise<void>;
    onWalletLocked?(walletId: string): void | Promise<void>;
}
```

Passing `eventDispatcher` to `Client.create` registers each present method as a
bus listener through `registerEventDispatcher`
(`src/fabrics/client/eventDispatcherBridge.ts`). Both styles can be used at once
and receive the same events.

`onReservationsChanged` carries every open wallet's reservations at once
(`TReservationsByWallet` — `Record<walletId, ITransactionReservation[]>`, current
network only). It is emitted by `ReservationAdapterManager`, which owns the
adapter callbacks: creating, removing, or clearing an adapter re-emits, and each
adapter re-emits when a reservation is added, confirmed, or expired. The `added`
edge is what lets a history view reload as soon as a transfer or deploy reserves
its funds, so `Client.transfer` and `Client.deploy` do not emit the event
themselves. `Client` emits it directly only where no reservation changes hands:
after `setNetwork`.

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
unlock(passwordProvider: SecretsProvider, options?: ISigningSessionOptions): Promise<void>
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
deploy(payload: TDeployDetails, passwordProvider?: SecretsProvider): Promise<string>
```

Behavior notes:

- `deriveAccount` is guarded by the `@OnlyHDWallet` decorator; calling it on a
  private-key wallet throws. It auto-computes the next free derivation index.
- `transfer` and `deploy` are guarded by `@EnsureActiveAccountExist` and delegate
  to `ApiServiceRegistry.transactions`. `passwordProvider` is optional
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
getFingerprint(): string
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

`getFingerprint` returns `sha256(publicKey)` in hex, computed once in the
constructor by
[KeyFingerprintService](SERVICES.md#keyfingerprintservice-srcserviceskeyfingerprintindexts).
It is a stable, non-reversible identity for the key pair, used to detect that an
account is already stored without decrypting anything.

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
session** and the **data key** — the second encrypted secret, used for non-secret
user data at rest (currently transaction reservations).

```ts
abstract class Signer {
    getId(): string;
    getFingerprint(): string;
    getEncryptedSecret(): EncryptedData;
    getEncryptedDataKey(): EncryptedData;

    // data key
    resolveDataKey(passwordProvider?: SecretsProvider): Promise<string>;

    // session
    isUnlocked(): boolean;
    unlock(
        passwordProvider: SecretsProvider,
        options?: ISigningSessionOptions,
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

interface ISigningSessionOptions {
    autoLockMs?: number; // 0 / omitted -> no auto-lock timer
    onAutoLock?: () => void;
}

interface ISignerRecord {
    id: string;
    type: WalletTypes;
    encryptedData: EncryptedData;
    encryptedDataKey: EncryptedData;
    fingerprint: string;
}

const SIGNER_KEY_PREFIX = "SIGNER"; // namespaces signer keys in the operation guard
```

Session lifecycle:

- The session itself lives in a dedicated
  [SigningSession](#signingsession-srcdomainssigningsessionindexts) object. The
  signer owns one for its whole life and delegates `isUnlocked` / `unlock` /
  `lock` to it, so the timer, the zeroization, and the cancellation rules sit in
  one place instead of being spread across `Signer`.
- `unlock` decrypts the secret **and** the data key once and hands both to the
  session, which arms an `AutoTimer` immediately. The timer is
  **fixed-duration**: it is never restarted on activity, so the session ends
  `autoLockMs` after unlock.
- `unlock` reads the session generation **before** decrypting and passes it to
  `hold`. If the wallet was locked or closed while the decryption was in flight,
  the generation no longer matches: the freshly decrypted secret is zeroized on
  the spot and `WalletOperationCancelledError` is thrown, instead of a stale
  unlock silently reopening a wallet the user just locked.
- The protected `resolveSecret(signingContext)` returns the in-memory secret when
  a session is active; otherwise it decrypts using `signingContext.passwordProvider`,
  and throws `WalletLockedError` when no password is available (locked/expired).
- `lock` clears the timer, zeroizes the private-key bytes when present, and drops
  the session (including the resolved data key). It is idempotent.

Fingerprint:

- `getFingerprint` returns the non-reversible identity of the stored secret,
  computed by
  [KeyFingerprintService](SERVICES.md#keyfingerprintservice-srcserviceskeyfingerprintindexts)
  when the signer fabric builds it: `sha256(publicKey)` for a private-key signer,
  `sha256(masterPublicKey || chainCode)` for an HD signer.
- It is stored in plaintext next to the encrypted secret, which is what allows
  duplicate detection across locked wallets. It reveals no key material and,
  because the HD variant hashes the master node rather than the seed, two wallets
  restored from the same mnemonic collide as intended.

Data key:

- Generated by the signer fabric (`CryptoService.generateDataKeySecret`) at wallet
  creation and stored as `encryptedDataKey`, encrypted with the wallet password —
  so it is never derivable without the password.
- `resolveDataKey` mirrors `resolveSecret`: an active session returns the key it
  already holds, otherwise the optional `passwordProvider` decrypts it, and a
  missing provider fails closed with `WalletLockedError`.
- It never signs anything, which is the point of the separation: code that
  persists user data (today only `ReservationAdapter`) gets a key it can encrypt
  and decrypt with, while the signing secret stays behind the `Signer` boundary
  and is never handed out.

Both implementations derive the private key (HD derives at
`signingContext.index` from the stored root path), sign with `@noble/secp256k1`,
and zeroize any ephemeral private key after signing.

---

## SigningSession (`src/domains/SigningSession/index.ts`)

The in-memory signing session of one `Signer`, extracted so that holding a
decrypted secret is a single object with a single set of rules. Each `Signer`
constructs one at birth and keeps it for life; `hold` and `release` swap the
state inside it.

```ts
new SigningSession(signerId: string)

isActive(): boolean
getSecret(): TDecryptedSecret | null
getDataKey(): string | null
getSessionGeneration(): number

hold(currentGeneration: number, secrets: ISigningSessionSecrets, options?: ISigningSessionOptions): void
release(): void
```

```ts
type TDecryptedSecret = IPrivateKeyCredentials | IHDSecret;

interface ISigningSessionSecrets {
    secret: TDecryptedSecret;
    dataKeySecret: string;
}

interface ISigningSessionOptions {
    autoLockMs?: number; // 0 / omitted -> no auto-lock timer
    onAutoLock?: () => void;
}
```

The **generation counter** is what makes a lock beat a slow unlock. `release`
increments it unconditionally, even when there is nothing to release, so a caller
that read the generation before an `await` can tell that a lock happened in
between. `hold` compares the generation it was given with the current one and, on
a mismatch, zeroizes the secret it was handed and throws
`WalletOperationCancelledError` instead of installing it. Without that check, an
unlock started before a logout would quietly reopen the wallet after it.

`hold` also releases any previous session first, so re-unlocking never leaks the
old secret or leaves a second timer armed. `release` clears the timer, zeroizes
private-key bytes when the secret carries them, and drops the data key. It is
idempotent.

---

## AutoTimer (`src/domains/AutoTimer/index.ts`)

One-shot, restartable timer. A fresh `start()` cancels any pending timer first;
`delayMs <= 0` is a no-op (no auto-lock).

```ts
interface IAutoTimerOptions { delayMs: number; onElapsed: () => void }

new AutoTimer(options: IAutoTimerOptions)
isActive(): boolean
start(): void   // (re)arm; clears first, then schedules onElapsed after delayMs
clear(): void   // cancel a pending timer
```

`SigningSession` arms the timer once at unlock and never restarts it, giving a
**fixed** (non-sliding) session lifetime. `LifecycleGuard` uses a second instance
as the drain timeout.

---

## ClosableDomain (`src/domains/ClosableDomain/index.ts`)

Base class for domains with a terminal teardown. Implemented by `Client`.

```ts
abstract class ClosableDomain {
    isActive(): boolean;
    close(): Promise<void>;
    protected abstract onClose(): Promise<void>;
}
```

`close()` flips the flag **before** awaiting `onClose()` and returns early on a
second call, so teardown runs exactly once and anything racing it already sees an
inactive domain. Subclasses put the actual release work in `onClose` and guard
their public methods with the `@EnsureActive` decorator, which throws
`DomainClosedError` (status `410`) once the flag is down. Nothing here revives a
closed domain: the contract is to construct a new one.

---

## LifecycleGuard (`src/domains/LifecycleGuard/index.ts`)

Tracks in-flight async work and tells the difference between "this finished" and
"this finished, but the world moved on". `ClientLifecycleGuard` extends it for
wallet publication.

```ts
class LifecycleGuard {
    invalidate(): void;                                     // bump the generation
    drain(timeoutMs?: number): Promise<void>;               // wait out pending work
    track<T>(operation: () => Promise<T>): Promise<T>;
    run<T>(operation: () => Promise<T>, onInvalidated: (result: T) => Error): Promise<T>;
}
```

- `track` registers the promise and always deregisters it, so `drain` knows what
  is still running. `Client.transfer` / `Client.deploy` are tracked through the
  `@TrackOperation` decorator.
- `run` is `track` plus a generation check: the operation runs, and if
  `invalidate()` was called meanwhile, `onInvalidated(result)` turns the finished
  result into the error to throw. The callback receives the result so it can
  dispose of it — this is how a wallet published after a logout gets discarded
  rather than orphaned.
- `drain` races the pending set against a timeout (`DEFAULT_DRAIN_TIMEOUT_MS`,
  10s) and never rejects: it uses `allSettled`, because the point is to wait for
  quiet, not to inspect outcomes. The timeout bounds a hung request so a logout
  cannot block forever.

`Client` calls `invalidate()` first and `drain()` second in both
`clearPersistence` and `close`, so in-flight operations are marked stale before
the wait and cannot commit after it.

---

## CustomError (`src/domains/CustomError/index.ts`)

Public error taxonomy so integrators can branch on a machine-readable `code` and
an HTTP-style `status` instead of matching message strings.

```ts
enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    BALANCE_UNAVAILABLE = "BALANCE_UNAVAILABLE",
    DUPLICATE_WALLET = "DUPLICATE_WALLET",
    DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT",
    WALLET_ACTION_IN_PROGRESS = "WALLET_ACTION_IN_PROGRESS",
    WALLET_OPERATION_CANCELLED = "WALLET_OPERATION_CANCELLED",
    DOMAIN_CLOSED = "DOMAIN_CLOSED",
}

class CustomError extends Error {
    readonly code: CustomErrorCode;
    readonly status: number;
}
```

| Class | Code | Status | Extra fields |
| --- | --- | --- | --- |
| `WalletLockedError` | `WALLET_LOCKED` | `403` | — |
| `NetworkBusyError` | `NETWORK_BUSY` | `409` | `networkId` |
| `DuplicateWalletError` | `DUPLICATE_WALLET` | `409` | `existingSignerId` |
| `DuplicateAccountError` | `DUPLICATE_ACCOUNT` | `409` | `existingSignerId`, `existingAccountId` |
| `WalletActionInProgressError` | `WALLET_ACTION_IN_PROGRESS` | `409` | `action`, `signerId` |
| `WalletOperationCancelledError` | `WALLET_OPERATION_CANCELLED` | `409` | `signerId` |
| `DomainClosedError` | `DOMAIN_CLOSED` | `410` | `domainName` |
| `BalanceUnavailableError` | `BALANCE_UNAVAILABLE` | `502` | `address`, `reason` |

```ts
enum WalletAction {
    OPEN = "OPEN",
    DERIVE_ACCOUNT = "DERIVE_ACCOUNT",
}
```

`WalletLockedError` is thrown by the signing path when there is no active session
and no password was supplied — i.e. the session is locked or expired. Its `403`
status lets a frontend treat it like an expired auth token and re-prompt for the
password, distinct from a transport/server error.

`NetworkBusyError` is thrown when a network is switched, updated, or removed
while it still has an operation in flight; it carries the offending `networkId`,
and its `409` status marks it as a conflict the caller can retry once the network
goes idle. See
[NetworkBusyRegistry](#networkbusyregistry-srcdomainsnetworkbusyregistryindexts).

`DuplicateWalletError` and `DuplicateAccountError` are thrown while creating a
wallet whose key fingerprint is already stored. They name the existing owner
(`existingSignerId`, and for accounts `existingAccountId`) so a UI can point at
it instead of just refusing. Because matching runs on fingerprints, the check
works without opening or decrypting anything.

`WalletActionInProgressError` marks a second concurrent attempt at the same
guarded action on the same signer — opening the same wallet twice, or deriving
two accounts at once. `action` says which one. See
[WalletOperationGuardService](SERVICES.md#walletoperationguardservice-srcserviceswalletoperationguardindexts).

`WalletOperationCancelledError` means the operation completed but its result was
thrown away because the wallet was locked, closed, or logged out while it was
running: a cancelled unlock (see
[SigningSession](#signingsession-srcdomainssigningsessionindexts)) or a wallet
published after teardown (see
[LifecycleGuard](#lifecycleguard-srcdomainslifecycleguardindexts)). It is not a
failure to retry blindly; the user's intent changed.

`DomainClosedError` is thrown by `@EnsureActive` on a domain that has already
been closed. Its `410` status says the resource is permanently gone: build a new
`Client` rather than retry.

`BalanceUnavailableError` replaces the old "unreadable balance reads as zero"
behaviour. It carries the `address` and a human-readable `reason` (transport
failure, a vault error string, an unparsable amount, or a missing expression),
and its `502` status marks it as an upstream problem rather than an empty
account. Callers must now handle it explicitly: a caught error is no longer the
same thing as `0`.

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

interface INetworkEndpoints {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
}

interface INetworkConfig extends INetworkEndpoints {
    nodeApiProfile: NodeApiProfile; // required: which node implementation this network runs
}

type TNetworksConfig = Record<NetworkName, INetworkConfig>; // built-in config keyed by name

interface INetworkRecord {
    id: NetworkId;
    name: NetworkName;
    config: INetworkConfig;
    isDefault: boolean; // true = built-in (immutable); false = custom (editable/removable)
}

interface IPersistedNetworkRecord {
    id: NetworkId;
    name: NetworkName;
    config: INetworkConfig; // storage rows carry no isDefault flag
}

interface INetworkUpdate {
    name?: NetworkName;
    config?: Partial<INetworkConfig>;
}

interface INetworkContext {
    networkId: NetworkId;
    name: NetworkName;
    config: INetworkConfig;
    clients: IApiClients;
    api: NodeApiAdapter;
}

type TNetworkBusyListener = (networkId: NetworkId, isBusy: boolean) => void;

const NETWORK_URL_FIELDS: (keyof INetworkEndpoints)[]; // allowlist used by URL validation
```

Built-in networks come from the `TNetworksConfig` passed to `Client.create`
(their `id` equals their `name`). Custom networks get a generated `id` and are
persisted via `CustomNetworksStorageRepository`.

`INetworkEndpoints` exists so URL validation iterates a type-derived allowlist
(`NETWORK_URL_FIELDS`) instead of every config key — without it, adding the
non-URL `nodeApiProfile` field would make validation reject it as an invalid URL.
`NETWORK_URL_FIELDS` is derived from a `Record<keyof INetworkEndpoints, true>`
map, so adding a fourth endpoint without updating the allowlist fails to compile.

`nodeApiProfile` is required on every network, built-in and custom alike: it
decides which HTTP contract and which Rholang terms are used, and a silent
default would send legacy-shaped requests to a new node. See
[NodeApiProfile](#nodeapiprofile-srcdomainsnodeapiprofileindexts).

`INetworkContext` is a self-contained bundle of one network's identity, config,
transport clients, and node API adapter, built by
`ApiClientManager.createNetworkContext(networkId?)`. It exists so long-lived
consumers — most notably the `DeployStatusPoller` behind a reservation — keep
polling the network the operation started on even after the user switches the
active network. `TNetworkBusyListener` is the callback shape reported through
`Client.onNetworkBusyChanged`.

---

## NetworkConfigProvider (`src/domains/NetworkConfigProvider/index.ts`)

The in-memory network registry behind `ApiClientManager`. Holds every network as
an `INetworkRecord` keyed by `id`, distinguishes built-in (`isDefault`) from
custom entries, and validates endpoint URLs and the node API profile on write.

```ts
initialize(config: TNetworksConfig): void          // seed built-ins (isDefault: true)
restoreCustomNetworks(records: IPersistedNetworkRecord[]): void // re-add persisted custom entries

getAll(): INetworkRecord[]
get(id: NetworkId): INetworkRecord                  // @EnsureNetworkExist
getIds(): NetworkId[]

add(name: NetworkName, config: INetworkConfig): INetworkRecord // generates id, isDefault: false
update(id: NetworkId, update: INetworkUpdate): void            // @EnsureNetworkNotDefault
remove(id: NetworkId): INetworkRecord                          // @EnsureNetworkNotDefault
isReady(): boolean
```

`initialize`/`add` validate URLs with `validateUrl` over `NETWORK_URL_FIELDS`
(must be non-empty http/https for custom networks; built-in seed config may
contain empty placeholder URLs) and the profile with `validateNodeApiProfile`,
throwing `Invalid nodeApiProfile: …` on an unknown value. `update` validates
whatever fields it receives; an absent `nodeApiProfile` keeps the stored one, so
a partial update never resets the profile.

`restoreCustomNetworks` is the only lenient path, because storage rows are not
typed by us: a record whose `nodeApiProfile` is unknown or missing is skipped
with a `console.warn` rather than dropped into a default. Falling back to a
default here would reintroduce the silent wrong-contract guess; throwing would
brick `Client.create` over one stale row. URLs on this path are still trusted
verbatim, exactly as before this profile work.

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
initialize(networksConfig: TNetworksConfig, customNetworks?: IPersistedNetworkRecord[], networkName?: NetworkName): void
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

// busy state & per-network context
isNetworkBusy(networkId: NetworkId): boolean
runNetworkOperation<TResult>(operation: () => Promise<TResult>, onBusyChanged?: TNetworkBusyListener): Promise<TResult>
createNetworkContext(networkId?: NetworkId): INetworkContext // defaults to the active network

isReady(): boolean
close(): void
```

Accessors are guarded by `@EnsureApiClientManagerInitialized` /
`@EnsureApiClientManagerConfigured` decorators and throw when used before
`initialize()`. `initialize` is idempotent (a second call is a no-op).
Persistence of custom networks is orchestrated by `NetworkManager`, not here —
this manager only holds the live registry.

`runNetworkOperation` wraps one network-bound operation: it marks the current
network busy in the `NetworkBusyRegistry`, reports the change through the
optional listener, runs the operation, and releases the mark in a `finally` — so
a rejected operation never leaves the network stuck. `Client.transfer` and
`Client.deploy` are the two callers, which is why both report busy transitions
through `onNetworkBusyChanged`. While a network is busy, `switchNetwork`
(`@EnsureCurrentNetworkNotBusy`), `updateNetwork` and `removeNetwork`
(`@EnsureTargetNetworkNotBusy`) throw `NetworkBusyError` instead of rebuilding
clients under an in-flight deploy.

`createNetworkContext` returns an `INetworkContext` pinned to one network id, so
a consumer holding it is unaffected by later network switches. Reservations use
it to watch each deploy on the network it was submitted to.

Services no longer reach for the per-client getters; they go through
`NodeApiAdapter`, which reads `getClients()` on every access. The three single
client getters remain part of the public surface but have no callers inside the
SDK or the playground.

---

## NetworkBusyRegistry (`src/domains/NetworkBusyRegistry/index.ts`)

Counts the operations in flight per network id. Owned by `ApiClientManager`.

```ts
acquire(networkId: NetworkId): void
release(networkId: NetworkId): void
isBusy(networkId: NetworkId): boolean
clear(): void
```

A counter rather than a boolean, so parallel transfers on the same network do not
release each other's mark; the entry is dropped once it reaches zero. Nothing
outside `ApiClientManager` mutates it — callers reach the state through
`Client.isNetworkBusy(networkId?)`, the `onNetworkBusyChanged` event, or the
`NetworkBusyError` raised by the busy guards.

---

## NodeApiProfile (`src/domains/NodeApiProfile/index.ts`)

The discriminator that says which node implementation a network runs. Data only,
no runtime dependencies, so `@domains/Network` can reference it without pulling
in the adapter graph.

```ts
enum NodeApiProfile {
    SCALA = "scala", // legacy f1r3node
    RUST = "rust",   // new f1r3node
}

enum NodeApiProfileStability {
    STABLE = "stable",
    EXPERIMENTAL = "experimental",
}

const DEFAULT_NODE_API_PROFILE: NodeApiProfile;      // SCALA
const NODE_API_PROFILES: NodeApiProfile[];

interface INodeApiProfileDescriptor {
    profile: NodeApiProfile;
    label: string;
    description: string;
    stability: NodeApiProfileStability;
}

const NODE_API_PROFILE_DESCRIPTORS: Record<NodeApiProfile, INodeApiProfileDescriptor>;
```

The profile identifies the *implementation*, not its maturity: `STABLE` /
`EXPERIMENTAL` in the profile name would go stale the day Rust ships and would
leave no name for a third profile. Maturity is a descriptor attribute instead, and
the playground reads its select label and badge from there.

`DEFAULT_NODE_API_PROFILE` is a UI default only — nothing in the domain
substitutes it. The playground uses it to preselect the profile in the add-network
form. Validation lives in `validateNodeApiProfile` (`src/utils/validators`) with
the narrowing guard `isNodeApiProfile` (`src/utils/guards`) on top of it.

---

## NodeApiAdapter (`src/domains/NodeApiAdapter/index.ts`, `NodeApiAdapter/Scala`, `NodeApiAdapter/Rust`)

Per-profile request router. It sits **above** `ApiClientManager` and **below**
`ApiServiceRegistry`: services call the adapter, the adapter picks the client, the
endpoint, and the request body. The abstract base holds the Scala behavior as its
default; a subclass overrides only what its node does differently.

```ts
abstract class NodeApiAdapter {
    constructor(apiClientManager: ApiClientManager)

    protected get clients(): IApiClients          // resolved on every access
    abstract getProfile(): NodeApiProfile

    submitDeploy(deploy: SignedResult): Promise<unknown>
    exploreDeploy(term: string): Promise<unknown>
    getDeploy(deployHash: string): Promise<unknown>
    getBlock(blockHash: string): Promise<IBlockDto>
    getBlocks(params?: IGetBlocksParams): Promise<IBlockDto[]>
    getValidatorStatus(): Promise<unknown>
    getTransactionHistory(address, publicKey, pagination?): Promise<TransactionHistoryQueryData>

    // override points
    protected getExploreDeployClient(): IExploratoryDeployClient // base: clients.validator
    protected buildExploreDeployBody(term: string): unknown      // base: the raw term
}
```

Every public member performs one request and returns the node's response
untouched. Response interpretation stays in the services — `DeployService` reads
`expr` and extracts the deploy id, `BlockService` reads `blockInfo` and picks the
latest block, `AssetsService` parses `ExprInt` / `ExprString`.

`protected get clients()` is the load-bearing detail: the adapter holds no client,
no URL, and no network id, so `switchNetwork` cannot make it stale and it never
needs invalidating.

`ScalaNodeApiAdapter` is `getProfile()` and nothing else — the base *is* the Scala
behavior. `RustNodeApiAdapter` overrides three members: the profile, the
exploratory-deploy target (read-only observer instead of validator), and the body
shape (`{ term }`, the node's `SimpleExploreDeployRequest`). `Content-Type:
application/json` needs no override; `DEFAULT_AXIOS_CONFIG` applies it to every
client.

Subclasses are not re-exported from the barrel, following `Signer/HD` and
`Signer/PK`; instances come from `createNodeApiAdapter`
(`src/fabrics/nodeApiAdapter.ts`), whose `switch` has no `default` clause so
a new profile fails to compile until it is handled.

Adding a profile costs one entry in the enum, one descriptor, one `case`, and one
subclass. Nothing in the service layer changes.

---

## NodeApiProvider (`src/domains/NodeApiProvider/index.ts`)

Singleton that resolves the adapter for the active network and caches adapters by
profile.

```ts
NodeApiProvider.getInstance(apiClientManager?: ApiClientManager): NodeApiProvider
getApi(): NodeApiAdapter
```

`getApi()` reads `apiClientManager.getCurrentNetwork().config.nodeApiProfile` on
every call, so services see the right adapter immediately after `switchNetwork`
without anything being rebuilt. Services hold the provider and resolve per call
through a private getter:

```ts
private get api(): NodeApiAdapter {
    return this.nodeApiProvider.getApi();
}
```

The cache is keyed by profile, not by network, because adapters carry no
per-network state: two networks on the same profile share one instance, at most
one instance exists per profile, and the cache survives an
`ApiClientManager.close()` / re-`initialize()` cycle without going stale.

---

## ApiWorker (`src/domains/ApiWorker/index.ts`)

Abstract base for anything that must stay bound to one network for its whole
lifetime instead of following the active one.

```ts
constructor(networkContext: INetworkContext)

getApi(): NodeApiAdapter
getNetworkId(): NetworkId
getNodeApiProfile(): NodeApiProfile
```

`DeployStatusPoller` is the current implementation: a reservation created on one
network keeps polling that network's node after the user switches away, because
its poller holds the `INetworkContext` it was built with.

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

It resolves `NodeApiProvider.getInstance(apiClientManager)` once and hands that
provider to every service that talks to a node. The registry is built one time
per session, so it deliberately passes the *provider* rather than a resolved
adapter — a resolved adapter would freeze the profile of whichever network was
active at construction time and survive `switchNetwork` unchanged.

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
submitDeploy(deploy): Promise<any>              // POST /api/deploy
submitExploratoryDeploy(body: unknown): Promise<any> // POST /api/explore-deploy
getStatus(): Promise<any>                       // GET  /status
```

### ObserverClient (`src/domains/ObserverClient/index.ts`)

```ts
getDeploy(deployHash): Promise<any>         // GET /api/deploy/:hash
getBlock(blockHash): Promise<IBlockDto>     // GET /api/block/:hash
getBlocks(params?: IGetBlocksParams): Promise<IBlockDto[]> // GET /api/blocks
submitExploratoryDeploy(body: unknown): Promise<any> // POST /api/explore-deploy
```

`IBlockDto = { blockInfo: string; blockNumber: number }`.

Both `submitExploratoryDeploy` methods take an already-built request body. The
clients do not know that one profile sends a raw term string and another sends
`{ term }` — that decision belongs to `NodeApiAdapter`.

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

Storage needs a serializable payload, so what is actually written is
`ISerializedTransactionReservationPrivateData`, whose `transaction` is a
`TSerializedTransaction` — `Transaction` with `timestamp` as an ISO string
instead of a `Date`. `TransactionReservationFabric.toPrivateData` produces it and
`fromStorage` parses the timestamp back into a `Date`, so the in-memory
`Transaction` contract stays unchanged and no consumer ever meets a string
`timestamp`.

---

## ReservationAdapter (`src/domains/ReservationAdapter/index.ts`)

Bridges a wallet to the encrypted reservation store and the in-memory
`TransactionReservationsManager`. Reservations represent funds temporarily locked
by a pending transfer or deploy, so the _available_ balance excludes them, and
they double as the only local source of pending transactions.

```ts
ReservationAdapter.create(wallet, passwordProvider?, reservationsManagerOptions?): Promise<ReservationAdapter>

getBalance(account: Account): Promise<IBalanceData> // total minus the current network's reservations
getReservations(): ITransactionReservation[]
getPendingTransactions(accountId?: string): Transaction[]
removeNetworkReservations(networkId: NetworkId): Promise<void>
validateSufficientBalance(account: Account, amount: bigint): Promise<boolean>
transfer(wallet: Wallet, details: ITransferDetails, passwordProvider?: SecretsProvider): Promise<IReservedOperationResult>
deploy(wallet: Wallet, details: TDeployDetails, passwordProvider?: SecretsProvider): Promise<IReservedOperationResult>
dispose(): void
```

`pendingAmount` already carries the whole locked cost — `amount + GasFee.MAX` for
a transfer, `phloLimit * phloPrice` for a deploy — so the reserved balance is a
plain sum with nothing added on top of it.

Both reading and writing reservations need the signer's data key, resolved
through `Signer.resolveDataKey(passwordProvider?)`: an active session covers it,
otherwise the optional `passwordProvider` does. `create` loads every stored
reservation of this wallet regardless of network, deleting the expired ones and
the ones pointing at a network the client no longer knows (a record that fails to
decrypt rejects the whole `create` call) and rebuilding the rest through
`TransactionReservationFabric.fromStorage`.
Reserved amounts are keyed by `accountId` and network id. `transfer` and `deploy`
validate the balance, perform the on-chain operation (forwarding the optional
`passwordProvider` to the signer), build the reservation through
`TransactionReservationFabric.createTransfer` or `createDeploy`, persist it
encrypted (expiring after `RESERVATION_EXPIRATION_TIME`), and track it until
confirmation or expiry. Both return an `IReservedOperationResult`: the `deployId`
plus a `subscribe` that attaches deploy-watch callbacks to that reservation's
poller. Only confirmation and expiry delete the stored record — a failed deploy
watch leaves the reservation to its expiration timer, so memory and storage never
disagree. Implements `IDisposable`, so it is owned by `ReservationAdapterManager`
(a `DisposableItemManager`).

One adapter holds the reservations of every network at once, so the reads narrow
to the current network id: `getReservations`, `getPendingTransactions`, and the
reserved amount behind `getBalance`. `removeNetworkReservations` drops the
reservations of a removed network from memory and storage in one pass.
`Client.getTransactionsHistory` narrows once more through
`TransactionsHistoryAggregator`, which drops pending rows belonging to another
network before merging or paginating them.

Reservation shaping (`ITransactionReservation` from a fresh transfer or from a
storage record plus its decrypted private data, and back into the serialized
private data written to storage) lives in `TransactionReservationFabric`
(`src/fabrics/transactionReservation.ts`), so the adapter never assembles the
record shape inline.

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

Factory helpers (`Deploy/factory/index.ts`) — the Scala-profile terms, plus the
shared escaper and the contract both profiles implement:

```ts
interface IDeployTermFactory {
    createCheckBalanceDeploy(address: Address): string;
    createTransferDeploy(fromAddress: Address, toAddress: Address, amount: bigint): string;
}

escapeRholangString(value: string): string
createCheckBalanceDeploy(address: Address): string
createTransferDeploy(fromAddress: Address, toAddress: Address, amount: bigint): string // throws if amount <= 0
```

`Deploy/factory/rust.ts` provides `createRustCheckBalanceDeploy` and
`createRustTransferDeploy`, which address the `rho:vault:system` registry and
`rho:system:deployerId` instead of `rho:rchain:asiVault` and
`rho:rchain:deployerId`.

`createDeployTermFactory(profile)`
(`src/fabrics/deployTermFactory.ts`) selects between the two sets. It
returns module-level constant tables of function references, so there is nothing
to allocate or cache, and its `switch` has no `default` clause for the same
exhaustiveness reason as the adapter fabric. `AssetsService` and
`TransactionService` resolve it per call through `getApi().getProfile()`:

```ts
private get terms(): IDeployTermFactory {
    return createDeployTermFactory(this.nodeApiProvider.getApi().getProfile());
}
```

Note that the terms are keyed off `nodeApiProfile` today, but they are really a
property of the chain, not of the node binary: they encode which vault contract is
deployed in the registry. The two axes happen to coincide right now. If an
ASI-vault chain ever runs on a Rust node, change what feeds
`createDeployTermFactory` (a dedicated config field, say) — the transport adapters
stay untouched. That separation is why term selection lives here and not on
`NodeApiAdapter`.

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

### storageFabric (`src/fabrics/storage.ts`)

Returns the right backend for the current environment.

```ts
storageFabric(options?: IStorageFabricOptions): ITableService<ITableRecord>
// window present -> BrowserStorage.getInstance(); else NodeStorage.getInstance(options?.nodeStorageDir)
```

### Repositories

Each repository is a singleton over a named table, with `initialize()` /
`ensureInitialized()` and typed CRUD. `BaseStorageRepository` also exposes a
protected `getByFilter(predicate)` (initialize, read all, filter), so lookups by
a non-key field live in the repository instead of being re-implemented by every
caller.

- **SignersStorageRepository** (`SIGNERS` table) — persists `ISignerStorageRecord`
  (`{ id, type, encryptedData, encryptedDataKey, fingerprint, createdAt }`) and
  offers `findSignerByFingerprint(fingerprint)`.
- **AccountsStorageRepository** (`ACCOUNTS` table) — persists
  `IAccountStorageRecord` (`{ id, signerId, name, index, fingerprint, createdAt }`)
  and offers `getAccountsBySignerId(signerId)` and
  `findAccountByFingerprint(fingerprint)`.
- **TransactionReservationsStorageRepository** (`TRANSACTION_RESERVATIONS` table) —
  persists `ITransactionReservationsStorageRecord`
  (`{ id, networkId, signerId, encryptedData, createdAt }`), where `encryptedData`
  is the JSON of `ISerializedTransactionReservationPrivateData` encrypted with the
  signer's data key. Reads are scoped through
  `getTransactionReservationsBySignerId(signerId)`.
- **CustomNetworksStorageRepository** (`CUSTOM_NETWORKS` table) — persists
  `ICustomNetworkStorageRecord` (`{ id, name, config, createdAt, updatedAt }`) so
  runtime-registered custom networks survive a reload. `config` is a full
  `INetworkConfig`, `nodeApiProfile` included; rows written before that field
  existed are skipped with a warning on restore (no schema migration).
- **InsensitiveCacheStorageRepository** (`INSENSITIVE_CACHE` table) — persists
  `IInsensitiveCacheRecord` (`{ id, address }`) for the optional address cache.

These repositories are orchestrated by `StorageManager` (and
`InsensitiveCacheStorageManager`) in the service layer — see `SERVICES.md`.
