# Domains Reference

This file documents the current domain modules under `src/domains`.

---

## Asset (`src/domains/Asset/index.ts`)

Simple token model.

```ts
new Asset(id: string, name: string, decimals?: number)
getId(): string
getName(): string
getDecimals(): number
```

Associated types:

- `AssetId = string`
- `Assets = Map<AssetId, Asset>`

---

## Wallet (`src/domains/Wallet/index.ts`)

Encrypted wallet metadata + signing capability boundary.

Factory methods:

```ts
Wallet.fromPrivateKey(
  name: string,
  privateKey: Uint8Array,
  password: string,
  masterNodeId?: string | null,
  index?: number | null
): Promise<Wallet>

Wallet.fromEncryptedData(
  name: string,
  address: Address,
  encryptedPrivateKey: EncryptedData,
  masterNodeId: string | null,
  index: number | null
): Wallet
```

Signing boundary:

```ts
wallet.withSigningCapability<T>(
  password: string,
  callback: (capability: SigningCapability) => Promise<T> | T
): Promise<T>
```

`SigningCapability` methods:

```ts
signDigest(digest: Uint8Array): Promise<Uint8Array>
getPublicKey(): Uint8Array
```

Security behavior:

- Capability expires when callback returns.
- Decrypted key bytes are zeroized after callback scope.

Legacy raw-key export (disabled by default):

```ts
wallet.decrypt(password: string): Promise<Uint8Array> // deprecated
Wallet.enableUnsafeRawKeyExportForLegacyInterop(): void
Wallet.disableUnsafeRawKeyExport(): void
Wallet.isUnsafeRawKeyExportEnabled(): boolean
```

Other methods:

```ts
getEncryptedPrivateKey(): EncryptedData
registerAsset(asset: Asset): void
getAddress(): Address
getName(): string
getIndex(): number | null
getAssets(): Assets
isWalletLocked(): boolean
toString(): string
```

---

## Vault (`src/domains/Vault/index.ts`)

Encrypted browser vault for wallets + encrypted records.

Constructor:

```ts
new Vault(vaultData?: string)
```

Static helpers:

```ts
Vault.getSavedVaultKeys(): string[]
Vault.getVaultDataFromStorage(vaultKey: string): string | null
```

State and persistence:

```ts
isVaultLocked(): boolean
save(vaultKey?: string): void
lock(password: string): Promise<void>
unlock(password: string): Promise<void>
isEmpty(): boolean
toString(): string
```

Wallet operations:

```ts
getWallets(): Wallet[]
getWalletsCount(): number
getWalletAddresses(): Address[]
addWallet(wallet: Wallet): void
removeWallet(address: Address): void
getWallet(address: Address): Wallet | undefined
hasWallet(address: Address): boolean
```

Seed/encrypted-record operations:

```ts
getSeeds(): EncryptedRecord[]
getSeed(id: string): EncryptedRecord | undefined
addSeed(id: string, seed: EncryptedRecord): void
removeSeed(id: string): void
getSeedsIds(): string[]
hasSeed(seedId: string): boolean
```

---

## EncryptedRecord (`src/domains/EncryptedRecord/index.ts`)

Encrypted data wrapper used by vault seed flows.

```ts
EncryptedRecord.createAndEncrypt(data: string, password: string): Promise<EncryptedRecord>
EncryptedRecord.createFromEncryptedData(encryptedData: EncryptedData): EncryptedRecord
EncryptedRecord.createFromStringifiedEncryptedData(data: string): EncryptedRecord
decrypt(password: string): Promise<string>
toString(): string
```

---

## BlockchainGateway (`src/domains/BlockchainGateway/index.ts`)

Singleton gateway for validator/indexer node communication.

Initialization:

```ts
BlockchainGateway.init(config: BlockchainGatewayConfig): BlockchainGateway
BlockchainGateway.isInitialized(): boolean
BlockchainGateway.getInstance(): BlockchainGateway
```

Core methods:

```ts
changeValidator(config: GatewayClientConfig): BlockchainGateway
changeIndexer(config: GatewayClientConfig): BlockchainGateway
submitDeploy(deployData: SignedResult): Promise<string | undefined>
submitExploratoryDeploy(rholangCode: string): Promise<any>
exploreDeployData(rholangCode: string): Promise<any>
getDeploy(deployHash: string): Promise<any>
getDeployStatus(deployHash: string): Promise<DeployStatusResult>
getLatestBlockNumber(): Promise<number>
isValidatorActive(): Promise<boolean>
getValidatorClientUrl(): string
```

Types and enums:

- `BlockchainGatewayConfig`
- `DeployStatus`
- `DeployStatusResult`

---

## BrowserStorage (`src/domains/BrowserStorage/index.ts`)

LocalStorage adapter with prefix-based key isolation.

```ts
new BrowserStorage(prefix?: string)
write(id: string, data: string): void
read(id: string): string | null
delete(id: string): void
has(id: string): boolean
isEmpty(): boolean
clear(): void
```

---

## AxiosHttpClient / HttpClient (`src/domains/HttpClient/index.ts`)

HTTP abstraction used by `BlockchainGateway`.

```ts
interface HttpClient {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
  getBaseUrl(): string | undefined
}
```

Implementation:

```ts
new AxiosHttpClient(client: AxiosInstance)
```

---

## Signing Types (`src/domains/Signer/index.ts`)

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

type PasswordProvider = () => Promise<string>
```

---

## Client (`src/domains/Client/index.ts`)

High-level SDK client for simplified wallet and vault management.

Constructor:

```ts
Client.create(options?: ClientOptions): Promise<Client>
```

Options interface:

```ts
interface ClientOptions {
    vault?: Vault;
    password?: string;
}
```

Methods:

```ts
createWallet(name: string, privateKey: Uint8Array, password: string): Promise<Wallet>
```
Creates and adds a wallet to the vault.

```ts
selectActiveWallet(walletAddress: Address): boolean
```
Selects the currently active wallet. Returns `true` if wallet exists in vault.

```ts
getActiveWallet(): Wallet | undefined
```
Returns the currently active wallet or `undefined`.

```ts
getWallets(): Wallet[]
```
Returns all wallets stored in the vault.

---

## Deploy (`src/domains/Deploy/index.ts`)

Deploy data structure and factory functions for RhoLang contract execution.

Deploy data interface:

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

Factory helpers (`src/domains/Deploy/factory/index.ts`):

```ts
createCheckBalanceDeploy(address: Address): string
```
Generates RhoLang code for balance queries on the specified address.

```ts
createTransferDeploy(
    fromAddress: Address,
    toAddress: Address,
    amount: bigint
): string
```
Generates RhoLang code for ASI token transfers. Throws if amount ≤ 0.

```ts
escapeRholangString(value: string): string
```
Escapes special characters in strings for safe use in RhoLang code.

---

## Deployment Error Types (`src/domains/Error/meta.ts`)

Classification and mapping for deploy-related errors.

Exports:

- `RecoverableDeployErrors`
- `FatalDeployErrors`
- `DeploymentErrorType`
- `deploymentErrorMessages`
- `getDeploymentErrorMessage(errorType)`

`src/domains/Error/index.ts` also exports `DeploymentErrorHandler`.
