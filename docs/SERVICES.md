# Services Reference

This file documents the current service modules under `src/services`.

Services split into a few groups:

- **Managers** — in-memory ownership of domain objects (`ItemManager`,
  `WalletManager`, `AccountManager`, `ReservationAdapterManager`,
  `TransactionReservationsManager`, `DisposableItemManager`).
- **Read models** — `TransactionsHistoryAggregator`, `CollectionQueryService`.
- **Persistence orchestration** — `StorageManager`, `NetworkManager`,
  `InsensitiveCacheStorageManager`, `InsensitiveCacheStorageSerializer`.
- **API services** — instantiated by `ApiServiceRegistry`: `DeployService`,
  `BlockService`, `AccountDataService`, `AssetsService`, `TransactionService`,
  `DeployStatusPoller`, plus the `GraphqlParser` helpers.
- **Export** — `ExportService` (account keyfile + transactions JSON/CSV).
- **Crypto / key primitives** — `CryptoService`, `WalletsService`,
  `MnemonicService`, `KeyDerivationService`, `KeysManager`, `SignerService`,
  `BinaryWriter` (documented under domains).

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
getAll(): T[]
getMap(): Map<string, T>
clear(): void
```

### DisposableItemManager (`src/services/DisposableItemManager/index.ts`)

`ItemManager` whose items implement `IDisposable`. Calls `dispose()` on overwrite,
removal, and clear.

```ts
interface IDisposable { dispose(): void }
```

### WalletManager (`src/services/WalletManager/index.ts`)

`ItemManager<Wallet>` that bridges wallets to `StorageManager`. Owned by `Client`.

```ts
createHD(params: ICreateHDWalletParams, passwordProvider): Promise<Wallet>
createPrivateKey(accountName: string, secretProvider): Promise<Wallet>
unlock(signerId: string, passwordProvider): Promise<Wallet>
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
lightweight, non-secret listing used by UIs to render locked wallets.

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
create(wallet, passwordProvider?, reservationsManagerOptions?): Promise<ReservationAdapter>
```

Reservations are encrypted with the signer's data key, so building the adapter
needs an active session or the optional `passwordProvider` — `Client` forwards
the provider it already has when creating, importing, or unlocking a wallet.

### TransactionReservationsManager (`src/services/TransactionReservationsManager/index.ts`)

In-memory tracker for active reservations. Each reservation is watched by the
`DeployStatusPoller` and also gets an expiration timer; confirmation or expiry
removes it and fires the matching callback. A poller failure (error or watch
timeout) only stops the watcher and fires `onFailed` — the reservation and its
expiration timer stay, so the deploy status being unknown keeps the funds locked
until the reservation genuinely expires. Implements `IDisposable`.

```ts
new TransactionReservationsManager(reservations, options?: ITransactionReservationsManagerOptions)
add(reservation): void
remove(id: string): boolean
get(id: string): ITransactionReservation | null
getAll(): ITransactionReservation[]
getByAccountId(accountId: string): ITransactionReservation[]
dispose(): void
```

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

// signers (encrypted secret + encrypted data key)
saveSigner / saveSigners / getSigner / getSigners / updateSigner / deleteSigner / deleteMultipleSigners

// accounts
saveAccount / saveAccounts / getAccount / getAccounts / updateAccount / deleteAccount / deleteMultipleAccounts

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
getCustomNetworks(): Promise<INetworkRecord[]>
saveCustomNetwork(network: INetworkRecord): Promise<void>
updateCustomNetwork(network: INetworkRecord): Promise<void>
deleteCustomNetwork(id: NetworkId): Promise<void>

clear(): Promise<void>
close(): void
```

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

### DeployService (`src/services/DeployService/index.ts`)

Submits deploys and reads deploy status through the validator/observer clients.

```ts
submitSignedDeploy(deploy: SignedResult): Promise<string | undefined> // returns extracted deployId
exploreDeployData(rholangCode: string): Promise<any>                  // returns result.expr
getDeploy(deployHash: string): Promise<any>
isDeployFinalized(deploy: any): Promise<boolean>                      // faultTolerance >= FAULT_TOLERANCE_THRESHOLD
getDeployStatus(deployHash: string): Promise<IDeployStatusResult>
```

```ts
enum DeployStatus { DEPLOYING, INCLUDED_IN_BLOCK, FINALIZED, CHECK_ERROR }
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

Validates the address first (throws on invalid); any exploration/parse failure
resolves to `{ amount: 0n, asset }`.

### TransactionService (`src/services/TransactionService/index.ts`)

Builds, signs and submits deploys end to end.

```ts
transfer(payload: ITransferPayload): Promise<string> // returns submitted deployId
deploy(payload: IDeployPayload): Promise<string>     // arbitrary Rholang term
```

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

Polls a deploy until finalized or timed out.

```ts
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
MnemonicService.mnemonicToWordArray(mnemonic: string): string[]
MnemonicService.wordArrayToMnemonic(words: string[]): string
MnemonicService.mnemonicToSeed(mnemonic: string | string[], passphrase?): Promise<Uint8Array>
```

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
interface SigningRequest { wallet: Wallet; data: any }
interface SignedResult { data: any; deployer: string; signature: string; sigAlgorithm: string }
```