# Domains Reference

This file contains extended, per-method documentation and usage for the domain modules in `src/domains`.

---

## Asset (src/domains/Asset/index.ts)

Model: represents a blockchain asset with an identifier, human-readable name and decimals.

```ts
constructor(id: string, name: string, decimals: number = DEFAULT_DECIMALS_AMOUNT)
```
Creates a new `Asset` instance. `id` is the asset identifier, `name` is the display name, `decimals` is the precision.

```ts
getId(): string
```
Returns the asset identifier.

```ts
getName(): string
```
Returns the asset name.

```ts
getDecimals(): number
```
Returns the asset decimals (precision).

Example usage with descriptive variables:

```ts
const assetId = "ASSET-1";
const assetName = "Token";
const tokenAsset = new Asset(assetId, assetName, 6);
console.log(tokenAsset.getDecimals());
```

---

## BinaryWriter (src/domains/BinaryWriter/index.ts)

Utility: encodes fields using varint and length-delimited semantics (protobuf-like).

```ts
writeString(fieldNumber: number, value: string): void
```
Writes a length-delimited string field. If `value` is empty, no bytes are written.

```ts
writeInt64(fieldNumber: number, value: number): void
```
Writes a varint-encoded 64-bit integer field. If `value` is falsy (0), nothing is written.

```ts
getResultBuffer(): Uint8Array
```
Returns the encoded bytes accumulated so far as a `Uint8Array`.

Private helpers (implementation details):

```ts
private writeInteger(value: number): void
```
Writes a JavaScript number as varint (7-bit chunks with continuation flag).

```ts
private writeInteger64(value: number): void
```
Writes a number as 64-bit varint using repeated division by 128 for continuation.

Example usage with descriptive variables:

```ts
const writer = new BinaryWriter();
const fieldIndex = 1;
writer.writeString(fieldIndex, "example");
writer.writeInt64(2, 1234567890);
const encodedBytes = writer.getResultBuffer();
```

---

## SecureWebWalletsStorage (src/domains/SecureStorage/index.ts)

Client-side encrypted storage for wallets and a master key. Uses PBKDF2 for key derivation and AES for encryption.

Types used:

```ts
interface WalletData { 
    id: string;
    address: string;
    privateKey: string;
    derivationIndex: number;
}

interface EncryptedData { 
    salt: Base64;
    iv: Base64;
    data: Ciphertext;
    version: number;
}
```

Private helpers:

```ts
private createWalletStorageKey(walletId: string): string
```
Builds a namespaced `localStorage` key for a given wallet id.

```ts
private generateSalt(): WordArray
```
Generates cryptographically-random salt for key derivation.

```ts
private generateIV(): WordArray
```
Generates a random initialization vector for AES encryption.

```ts
private deriveKey(passphrase: string, salt: WordArray): WordArray
```
Derives an AES key from `passphrase` and `salt` using PBKDF2 and the configured iterations/size.

```ts
private encryptWithPass(plainText: string, passphrase: string): EncryptedData
```
Encrypts `plainText` with a derived key from `passphrase`, returning `EncryptedData` (salt, iv, ciphertext, version).

```ts
private decryptWithPass(payload: EncryptedData, passphrase: string): string
```
Decrypts `payload` using a key derived from `passphrase`. Throws on failure.

Public API:

```ts
saveMasterKey(masterKey: string, passphrase: string): void
```
Encrypts and stores the master key in `localStorage` under an internal prefix.

```ts
loadMasterKey(passphrase: string): string | null
```
Loads and decrypts the stored master key using `passphrase`. Returns the master key string or `null` if not present or decryption fails.

```ts
deleteMasterKey(): void
```
Removes the stored master key from `localStorage`.

```ts
hasMasterKey(): boolean
```
Returns `true` when a master key is present in storage.

```ts
saveWallet(walletId: string, data: WalletData, passphrase: string): void
```
Encrypts and stores a wallet's data under a namespaced key derived from `walletId` using `passphrase`.

```ts
loadWallet(walletId: string, passphrase: string): WalletData | null
```
Loads and decrypts wallet data for `walletId` using `passphrase`. Returns `WalletData` or `null` if missing or decryption fails.

```ts
deleteWallet(walletId: string): void
```
Removes a wallet entry from storage.

```ts
getAllWalletsIds(): string[]
```
Returns all stored wallet ids discovered under the configured storage prefix.

```ts
hasWallet(walletId: string): boolean
```
Checks whether a wallet with `walletId` exists in storage.

```ts
hasWallets(): boolean
```
Returns `true` if there is at least one wallet stored under the library prefix.

```ts
clear(): void
```
Removes all keys stored under the library's storage prefix (including master and wallets).

Example usage with descriptive variables:

```ts
const storage = new SecureWebWalletsStorage();
const master = "master-secret-key";
const protectPass = "strong-passphrase";
storage.saveMasterKey(master, protectPass);
const recoveredMaster = storage.loadMasterKey(protectPass);
```

---

## EncryptedSeedRecord (src/domains/SeedRecord/index.ts)

Represents a seed phrase or raw seed that can be stored encrypted. Supports locking/unlocking and deriving an identifier from the raw seed.

```ts
static fromRawSeed(seed: string): EncryptedSeedRecord
```
Creates a `SeedRecord` from a plaintext seed. The record will be unlocked.

```ts
static fromEncryptedData(seedData: EncryptedData): EncryptedSeedRecord
```
Creates a `SeedRecord` from previously encrypted `seedData`. The record will be locked.

```ts
isSeedRecordLocked(): boolean
```
Returns `true` when the seed record is locked (seed not in plaintext memory).

```ts
lock(password: string): void
```
Encrypts the in-memory seed with `password` and clears plaintext seed from memory; marks the record locked.

```ts
unlock(password: string): void
```
Decrypts the stored encrypted seed data with `password` and places plaintext seed into memory; marks the record unlocked.

```ts
getSeed(): string | null
```
Returns the plaintext seed if the record is unlocked; otherwise throws an error.

```ts
isEmpty(): boolean
```
Returns `true` if the record has no seed (empty string or null) while unlocked.

```ts
transformToId(): string
```
Derives a deterministic identifier for the seed using `keccak256` of the plaintext seed. Requires the record to be unlocked.

```ts
toString(): string
```
Serializes the encrypted seed data to a JSON string for storage.

Example usage with descriptive variables:

```ts
const plaintextSeed = "seed-words-or-entropy";
const seedRecord = EncryptedSeedRecord.fromRawSeed(plaintextSeed);
seedRecord.lock("seed-pass");
// later
seedRecord.unlock("seed-pass");
console.log(seedRecord.transformToId());
```

---

## Vault (src/domains/Vault/index.ts)

High-level container for `Wallet` and `EncryptedSeedRecord` instances. Vaults can be locked/unlocked as a whole and saved to `localStorage` under `ASI_WALLETS_VAULT_<key>`.

Constructor:

```ts
constructor(vaultRawData?: string)
```
Creates a new Vault. If `vaultRawData` (a JSON string) is provided, the vault will initialize in a locked state with `encryptedVaultData` set.

Static helpers:

```ts
static getSavedVaultKeys(): string[]
```
Returns an array of `localStorage` keys that start with the internal vault prefix.

```ts
static getVaultDataFromStorage(vaultKey: string): string | null
```
Read the raw vault JSON data stored under the provided `vaultKey`.

Instance methods:

```ts
isVaultLocked(): boolean
```
Returns `true` when the vault is locked.

```ts
save(vaultKey: string = DEFAULT_STORAGE_KEY): void
```
Saves the vault's current encrypted data to `localStorage` under `ASI_WALLETS_VAULT_<vaultKey>`. Vault must be locked to save.

```ts
lock(password: string): void
```
Encrypts the current in-memory representation of wallets and seeds with `password`, clears in-memory wallets, and marks the vault locked.

```ts
unlock(password: string): void
```
Decrypts `encryptedVaultData` with `password`, reconstructs `Wallet` and `EncryptedSeedRecord` instances in memory, and marks the vault unlocked.

```ts
isEmpty(): boolean
```
Returns `true` when there are no wallets in the unlocked vault.

```ts
getWallets(): Wallet[]
```
Returns an array of in-memory `Wallet` instances.

```ts
getWalletsCount(): number
```
Returns the number of wallets in the unlocked vault.

```ts
getWalletAddresses(): Address[]
```
Returns the list of wallet addresses (keys) present in the vault.

```ts
addWallet(wallet: Wallet): void
```
Adds a `Wallet` instance to the vault (in-memory). Vault must be unlocked.

```ts
removeWallet(address: Address): void
```
Removes the wallet identified by `address` from the vault.

```ts
getWallet(address: Address): Wallet | undefined
```
Returns a `Wallet` instance by `address`, or `undefined` if not found.

```ts
hasWallet(address: Address): boolean
```
Checks presence of a wallet in the vault by `address`.

```ts
hasSeed(seedId: string): boolean
```
Checks presence of a seed by derived id.

Private helpers (implementation detail):

```ts
private metaToWallets(storedWalletsMeta: Record<Address, string>): void
```
Rehydrates stored wallet metadata into `Wallet` instances.

```ts
private metaToSeeds(storedSeedsMeta: Record<string, string>): void
```
Rehydrates stored seed metadata into `EncryptedSeedRecord` instances.

More seed helpers and accessors:

```ts
getSeeds(): EncryptedSeedRecord[]
```
Returns an array of seeds in the unlocked vault.

```ts
getSeed(id: string): EncryptedSeedRecord | undefined
```
Returns a seed by id.

```ts
addSeed(seed: EncryptedSeedRecord): void
```
Adds a seed to the vault (stored by its `transformToId()` value).

```ts
removeSeed(id: string): void
```
Removes a seed from the vault by id.

```ts
getSeedsIds(): string[]
```
Returns all seed ids stored in the unlocked vault.

```ts
toString(): string
```
Serializes the unlocked vault's wallets and seeds into a JSON string containing `wallets` and `seeds` meta records.

---

## Wallet (src/domains/Wallet/index.ts)

Model for a single wallet: stores encrypted private key material in memory with metadata and registered `Asset` instances.

Constructors / Factory methods:

```ts
static fromPrivateKey(
  name: string,
  privateKey: Uint8Array,
  password: string,
  masterNodeId?: string | null,
  index?: number | null
): Promise<Wallet>
```
Derives the wallet address from `privateKey`, encrypts the private key with `password` and returns a new `Wallet` instance (locked by default).

```ts
static fromEncryptedData(
  name: string,
  address: Address,
  encryptedPrivateKey: EncryptedData,
  masterNodeId: string | null,
  index: number | null
): Wallet
```
Constructs a `Wallet` from serialized/encrypted metadata. Throws with a validation error code if the address is invalid.

Instance methods:

```ts
decrypt(password: string): Promise<Uint8Array>
```
Deprecated raw-key export API. Disabled by default for security.

```ts
withSigningCapability<T>(password: string, callback: (signingCapability: SigningCapability) => Promise<T> | T): Promise<T>
```
Provides scoped signing methods (`signDigest`, `getPublicKey`) without exposing raw key bytes. The capability expires after callback scope.

```ts
getEncryptedPrivateKey(): EncryptedData
```
Returns encrypted key payload metadata.

```ts
registerAsset(asset: Asset): void
```
Registers an `Asset` instance with the wallet (stored in an internal `Map` by asset id).

```ts
getAddress(): Address
```
Returns the wallet address.

```ts
getName(): string
```
Returns the wallet name.

```ts
getIndex(): number | null
```
Returns the wallet derivation index if present.

```ts
getAssets(): Map<string, Asset>
```
Returns the registered assets map.

```ts
isWalletLocked(): boolean
```
Returns `true` when the wallet is locked.

```ts
toString(): string
```
Serializes wallet metadata (`StoredWalletMeta`) to a JSON string for storage.

Static security switches:

```ts
Wallet.enableUnsafeRawKeyExportForLegacyInterop(): void
```
Explicitly enables deprecated `decrypt()` for legacy migration paths.

```ts
Wallet.disableUnsafeRawKeyExport(): void
```
Disables raw key export.

```ts
Wallet.isUnsafeRawKeyExportEnabled(): boolean
```
Returns current raw-key-export policy flag.

Example creating and signing with scoped key access:

```ts
const walletName = "My Wallet";
const rawPrivateKey = new Uint8Array([/* 32 bytes */]);
const walletPassword = "wallet-pass";
const wallet = await Wallet.fromPrivateKey(walletName, rawPrivateKey, walletPassword);

const signaturePayload = await wallet.withSigningCapability(walletPassword, async (capability) => {
  const digest = new Uint8Array(32).fill(1);
  return await capability.signDigest(digest);
});
console.log(signaturePayload);
```
