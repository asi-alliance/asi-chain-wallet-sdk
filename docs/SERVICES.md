# Services Reference

This file documents the current service modules under `src/services`.

Services split into a few groups:

- **Managers** — in-memory ownership of domain objects (`ItemManager`,
  `WalletManager`, `AccountManager`, `ReservationAdapterManager`,
  `TransactionReservationsManager`, `DisposableItemManager`).
- **Persistence orchestration** — `StorageManager`,
  `InsensitiveCacheStorageManager`, `InsensitiveCacheStorageSerializer`.
- **API services** — instantiated by `ApiServiceRegistry`: `DeployService`,
  `BlockService`, `AccountDataService`, `AssetsService`, `TransactionService`,
  `DeployStatusPoller`, plus the `GraphqlParser` helpers.
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
create(wallet: Wallet, passwordProvider: SecretsProvider): Promise<ReservationAdapter>
```

### TransactionReservationsManager (`src/services/TransactionReservationsManager/index.ts`)

In-memory tracker for active reservations. Each reservation is watched by the
`DeployStatusPoller` and also gets an expiration timer; confirmation, expiry, or
failure removes it and fires the matching callback. Implements `IDisposable`.

```ts
new TransactionReservationsManager(reservations, options?: ITransactionReservationsManagerOptions)
add(reservation): void
remove(id: string): boolean
get(id: string): ITransactionReservation | null
getAll(): ITransactionReservation[]
getByAccountAddress(accountAddress: string): ITransactionReservation[]
dispose(): void
```

```ts
interface ITransactionReservationsManagerOptions {
    onConfirmed?(reservation): void;
    onExpired?(reservation): void;
    onFailed?(reservation, error: Error): void;
    watchCallbacks?: IDeployWatchCallbacks;
    watchOptions?: IDeployWatchOptions;
}
```

---

## Persistence orchestration

### StorageManager (`src/services/StorageManager/index.ts`)

Static façade over the three primary repositories (signers, accounts,
transaction reservations). Handles encrypt-on-write of signer secrets and
compose/decompose of the `Wallet` aggregate.

```ts
StorageManager.init(options?: IStorageFabricOptions): Promise<void>

// signers
saveSigner / saveSigners / getSigner / getSigners / updateSigner / deleteSigner / deleteMultipleSigners

// accounts
saveAccount / saveAccounts / getAccount / getAccounts / updateAccount / deleteAccount / deleteMultipleAccounts

// wallets (aggregate of signer + accounts)
saveWallet(options): Promise<void>
saveWallets(options[]): Promise<void[]>
getWallet({ signerId, passwordProvider }): Promise<Wallet>   // restores + decrypts
getWallets(): Promise<IWalletStorageData[]>                  // public metadata

// reservations
saveTransactionReservation / getTransactionReservationsBySignerId /
updateTransactionReservation / deleteTransactionReservation / deleteMultipleTransactionReservations

clear(): Promise<void>
close(): void
```

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
    passwordProvider: SecretsProvider;
}
interface IDeployPayload {
    walletType: WalletTypes;
    account: Account;
    signer: Signer;
    term: string;
    phloLimit?: number;
    phloPrice?: number;
    shardId?: string;
    passwordProvider: SecretsProvider;
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
CryptoService.encryptWithPassword(data: string, password: string): Promise<EncryptedData>
CryptoService.decryptWithPassword(payload: EncryptedData, passphrase: string): Promise<string>
CryptoService.deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>
```

`EncryptedData = { data, salt, iv, version }`. Current profile:

- Version `2`
- KDF `PBKDF2`, `100_000` iterations, `SHA-256`
- Cipher `AES-GCM`, 256-bit key
- Salt `16` bytes, IV `12` bytes

Decryption throws on an unsupported version or invalid credentials.

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