# Services Reference

This file contains extended, per-method documentation and usage examples for the service modules in `src/services`.

---

## CryptoService (src/services/crypto/index.ts)

Utility for password-based encryption and decryption using PBKDF2 + AES.

```ts
encryptWithPassword(data: string, passphrase: string): EncryptedData
```
Encrypts `data` with a derived key from `passphrase`. Returns `{ salt, iv, data, version }`.

```ts
decryptWithPassword(payload: EncryptedData, passphrase: string): string
```
Decrypts `payload` using `passphrase`. Throws `Error('Decryption failed')` on invalid credentials.

Private helpers:

```ts
private static generateSalt(): WordArray
```
Generates a random salt for PBKDF2.

```ts
private static generateIV(): WordArray
```
Generates a random IV for AES.

```ts
private static deriveKey(passphrase: string, salt: WordArray): WordArray
```
Derives an encryption key using PBKDF2 with configured iterations and key size.

Example usage:

```ts
const secret = "sensitive-data";
const passphrase = "strong-pass";
const encrypted = CryptoService.encryptWithPassword(secret, passphrase);
const decrypted = CryptoService.decryptWithPassword(encrypted, passphrase);
```

---

## WalletsService (src/services/WalletsService/index.ts)

High level wallet creation and address derivation utilities.

```ts
static createWallet(privateKey?: string, options?: CreateWalletOptions): WalletMeta
```
Creates a wallet. If `privateKey` is omitted, a new keypair is generated. Returns `{ address, publicKey, privateKey }`.

```ts
static createWalletFromMnemonic(mnemonic?: string, index?: number): Promise<WalletMeta>
```
Derives a private key from `mnemonic` using BIP-39/BIP-44 and returns wallet metadata. If `mnemonic` is omitted, a new one is generated.

```ts
static deriveAddressFromPrivateKey(privateKey: string): Address
```
Derives the wallet `Address` from a raw `privateKey`.

```ts
static deriveAddressFromPublicKey(publicKey: string): Address
```
Derives the wallet `Address` from an uncompressed `publicKey` hex string. Steps: decode public key, keccak256 hash, take last 40 chars, compute blake2b checksum, encode base58 with chain prefix.

Example usage:

```ts
const newWallet = WalletsService.createWallet();
const derivedFromMnemonic = await WalletsService.createWalletFromMnemonic(myMnemonic, 0);
const address = WalletsService.deriveAddressFromPrivateKey(myPrivateKey);
```

---

## MnemonicService (src/services/mnemonic/index.ts)

Utilities around BIP-39 mnemonic generation and validation.

```ts
static generateMnemonic(strength: MnemonicStrength = MnemonicStrength.TWELVE_WORDS): string
```
Generates a mnemonic phrase. `strength` controls entropy (12 or 24 words).

```ts
static isMnemonicValid(mnemonic: string): boolean
```
Validates BIP-39 mnemonic phrase.

```ts
static mnemonicToWordArray(mnemonic: string): string[]
```
Splits a mnemonic string into an array of words.

```ts
static wordArrayToMnemonic(words: string[]): string
```
Joins an array of words into a mnemonic string.

Example usage:

```ts
const mnemonic = MnemonicService.generateMnemonic();
if (MnemonicService.isMnemonicValid(mnemonic)) {
  const words = MnemonicService.mnemonicToWordArray(mnemonic);
}
```

---

## KeyDerivationService (src/services/keyDerivation/index.ts)

Derivation helpers for BIP-32/BIP-44 key derivation.

```ts
static buildBip44Path(coinType: number, account = 0, change = 0, index = 0): string
```
Returns a BIP-44 derivation path string: `m/44'/coinType'/account'/change/index`.

```ts
static derivePrivateKey(masterNode: bip32.BIP32Interface, path: string): string
```
Derives a private key hex from `masterNode` at `path`. Throws if the derived node lacks a private key.

```ts
static mnemonicToSeed(mnemonic: string, passphrase = ""): Promise<Uint8Array>
```
Converts mnemonic to a seed buffer (async).

```ts
static seedToMasterNode(seed: any): bip32.BIP32Interface
```
Converts a seed to a BIP32 master node using `tiny-secp256k1` (returns a node with `derivePath`).

Example usage:

```ts
const bip44Path = KeyDerivationService.buildBip44Path(ASI_COIN_TYPE, 0, 0, 0);
const seed = await KeyDerivationService.mnemonicToSeed(mnemonic);
const masterNode = KeyDerivationService.seedToMasterNode(seed);
const derivedPrivateKey = KeyDerivationService.derivePrivateKey(masterNode, bip44Path);
```

---

## KeysService (src/services/keysService/index.ts)

Elliptic curve key utilities (secp256k1).

```ts
static generateKeyPair(): KeyPair
```
Generates a new secp256k1 keypair and returns `{ publicKey, privateKey }` in hex.

```ts
static getKeyPairFromPrivateKey(privateKey: string): KeyPair
```
Reconstructs a keypair from `privateKey` hex and returns `{ publicKey, privateKey }`.

```ts
static generateMpcKeyPair(): any
```
Placeholder: throws `Error('MPC key generation is not implemented yet.')`.

Private helper:

```ts
private static extractKeys(keyPair: EC.KeyPair): KeyPair
```
Converts an `elliptic` `KeyPair` into the `{ publicKey, privateKey }` shape.

Example usage:

```ts
const keyPair = KeysService.generateKeyPair();
const derivedPair = KeysService.getKeyPairFromPrivateKey(keyPair.privateKey);
```

---

## RChainService (src/services/chainService/index.ts)

HTTP client and helpers for interacting with RChain nodes, building and signing deploys.

Top-level helpers:

```ts
export const signDeploy(deployData: any, privateKey: string): any
```
Signs a serialized deploy using secp256k1. Returns the deploy augmented with `deployer`, `sig`, and `sigAlgorithm`.

```ts
const deployDataProtobufSerialize(deployData: any): Uint8Array
```
Serializes deploy fields into protobuf-like bytes using `BinaryWriter` (term, timestamp, phloPrice, phloLimit, validAfterBlockNumber, shardId).

`RChainService` class:

Constructor:

```ts
constructor(config: RChainServiceConfig)
```
Requires `{ validatorURL, readOnlyURL, options? }`. Creates Axios clients for read and validator nodes.

Instance methods:

```ts
async exploreDeployData(rholangCode: string): Promise<any>
```
Sends an `explore-deploy` request to a read-only node and returns `expr` from response. Logs helpful message on network errors.

```ts
async getBalance(address: Address, assetId: AssetId): Promise<BigInt>
```
Not implemented: throws `RChainServiceError` indicating missing feature.

```ts
async getASIBalance(address: Address): Promise<bigint>
```
Runs an `explore-deploy` with Rholang that queries ASI vault balance for `address`. Parses response and returns `BigInt` balance or `0` on errors.

```ts
async transfer(fromAddress: string, toAddress: string, amount: bigint, privateKey: string): Promise<any>
```
Builds a Rholang transfer term for `amount` from `fromAddress` to `toAddress` and calls `sendDeploy` with the `privateKey` to sign and submit.

```ts
async sendDeploy(rholangCode: string, privateKey: string, phloLimit: number = 500000): Promise<string>
```
Builds deploy metadata (block number, timestamp), signs the deploy, sends it via RNode API, and attempts to return a deploy id or signature. Throws on failure.

```ts
private async callRNodeAPI(methodName: string, data?: any): Promise<any>
```
Internal HTTP helper that chooses read-only vs validator client based on `methodName` and `data`. Handles request/response errors and throws descriptive errors.

```ts
private isReadOnlyOperation(apiMethod: string): boolean
```
Determines whether `apiMethod` is a read-only operation (affects client selection).

Errors and types:

```ts
export class RChainServiceError extends Error
```
Small wrapper for chain errors that prefixes messages with `[ChainService]:`.

Example usage:

```ts
const config = { validatorURL: "https://validator.node", readOnlyURL: "https://readonly.node" };
const chain = new RChainService(config);
const balance = await chain.getASIBalance(myAddress);
const deployId = await chain.transfer(senderAddress, recipientAddress, BigInt(100), senderPrivateKey);
```

