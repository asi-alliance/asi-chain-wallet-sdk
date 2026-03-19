# Services Reference

This file documents the current service modules under `src/services`.

---

## CryptoService (`src/services/Crypto/index.ts`)

Password-based encryption/decryption using WebCrypto.

```ts
encryptWithPassword(data: string, password: string): Promise<EncryptedData>
```
Encrypts plaintext with `PBKDF2(SHA-256)` derived key + `AES-GCM`.

```ts
decryptWithPassword(payload: EncryptedData, passphrase: string): Promise<string>
```
Decrypts ciphertext payload. Throws on unsupported version or invalid credentials.

```ts
deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>
```
Derives the `AES-GCM` key from password + salt.

Current profile highlights:

- Version: `2`
- KDF: `PBKDF2`, `100_000` iterations, `SHA-256`
- Cipher: `AES-GCM`
- Salt: `16` bytes
- IV: `12` bytes

---

## WalletsService (`src/services/Wallets/index.ts`)

Wallet creation and address derivation.

```ts
createWallet(privateKey?: Uint8Array, options?: CreateWalletOptions): WalletMeta
```
Creates wallet metadata from an existing or generated secp256k1 private key.

```ts
createWalletFromMnemonic(mnemonic?: string, index?: number): Promise<WalletMeta>
```
Builds wallet from BIP-39 mnemonic + BIP-44 path. Always returns normalized mnemonic in output.

Validation behavior:

- Throws `WalletsService.createWalletFromMnemonic: Recovery mnemonic is missing or invalid` when mnemonic is blank/invalid.

```ts
deriveAddressFromPrivateKey(privateKey: Uint8Array): Address
```
Derives address from private key.

```ts
deriveAddressFromPublicKey(publicKey: Uint8Array): Address
```
Derives address from public key (`keccak256` + chain prefix + `blake2b` checksum + base58).

---

## MnemonicService (`src/services/Mnemonic/index.ts`)

BIP-39 helpers.

```ts
generateMnemonic(strength?: MnemonicStrength): string
```
Generates mnemonic phrase (`12` or `24` words).

```ts
generateMnemonicArray(strength?: MnemonicStrength): string[]
```
Generates and splits mnemonic into words.

```ts
isMnemonicValid(mnemonic: string): boolean
```
Validates mnemonic.

```ts
mnemonicToWordArray(mnemonic: string): string[]
wordArrayToMnemonic(words: string[]): string
```
Conversion helpers.

---

## KeyDerivationService (`src/services/KeyDerivation/index.ts`)

BIP-32/BIP-44 derivation helpers.

```ts
buildBip44Path(options: Bip44PathOptions): string
```
Builds path `m/44'/coinType'/account'/change/index`.

```ts
derivePrivateKey(masterNode: BIP32Interface, path: string): Uint8Array
```
Derives private key bytes from master node and path.

```ts
mnemonicToSeed(mnemonicWords: string[] | string, passphrase?: string): Promise<Uint8Array>
```
Converts mnemonic to seed.

```ts
seedToMasterNode(seed: Uint8Array): BIP32Interface
```
Builds BIP32 master node using `tiny-secp256k1` + `bip32` factory.

```ts
deriveKeyFromMnemonic(...)
deriveNextKeyFromMnemonic(...)
```
Convenience derivation helpers.

---

## KeysManager (`src/services/KeysManager/index.ts`)

secp256k1 key utilities.

```ts
generateRandomKey(length?: number): Uint8Array
generateKeyPair(keyLength?: number): KeyPair
getKeyPairFromPrivateKey(privateKey: Uint8Array): KeyPair
getPublicKeyFromPrivateKey(privateKey: Uint8Array): Uint8Array
convertKeyToHex(key: Uint8Array): string
deriveKeyFromMnemonic(mnemonicWords: string[], options?: Bip44PathOptions): Promise<Uint8Array>
```

`generateMpcKeyPair()` is intentionally unimplemented and throws.

---

## SignerService (`src/services/Signer/index.ts`)

Builds deploy signatures without exposing raw key bytes to callers.

```ts
sign(request: SigningRequest, passwordProvider: PasswordProvider): Promise<SignedResult>
```

Flow:

1. Gets password from `passwordProvider`.
2. Uses `wallet.withSigningCapability(...)` to obtain scoped signing capability.
3. Serializes deploy data (`BinaryWriter`).
4. Hashes with `blake2b-256`.
5. Signs digest with secp256k1 and returns `{ deployer, signature, sigAlgorithm }`.

Security boundary:

- Normal signing path does not return decrypted private key bytes.
- Capability expires after callback scope.

---

## AssetsService (`src/services/AssetsService/index.ts`)

Balance and transfer operations through `BlockchainGateway`.

```ts
transfer(
  fromAddress: Address,
  toAddress: Address,
  amount: bigint,
  wallet: Wallet,
  passwordProvider: PasswordProvider,
  phloLimit?: number
): Promise<string | undefined>
```

Validation behavior:

- Uses checksum-aware `validateAddress()` and returns deterministic address error codes.
- Rejects non-positive amounts.

```ts
getASIBalance(address: Address): Promise<bigint>
```

- Validates address before exploration deploy.

---

## DeployResubmitter (`src/services/Resubmit/DeployResubmitter.ts`)

Retry + resubmission flow for non-read-only deploys.

```ts
resubmit(
  rholangCode: string,
  wallet: Wallet,
  passwordProvider: PasswordProvider,
  phloLimit?: number
): Promise<ResubmitResult>
```

Related exports from `src/services/Resubmit/index.ts`:

- `ResubmitNodeManager`
- `ResubmitConfig`
- `ResubmitResult`

---

## FeeService (`src/services/Fee/index.ts`)

Gas-fee helper utilities.

```ts
generateRandomGasFee(): string
getGasFeeAsNumber(): number
formatGasFee(fee?: string): string
```

---

## BinaryWriter (`src/services/BinaryWriter/index.ts`)

Low-level protobuf-like writer used by signing serialization.

```ts
writeString(fieldNumber: number, value: string): void
writeInt64(fieldNumber: number, value: number): void
getResultBuffer(): Uint8Array
```
