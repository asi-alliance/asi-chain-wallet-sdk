# Utils & Config Reference

This file documents the helper utilities in `src/utils`, the shared fabrics, and
the runtime constants in `src/config`.

---

## Config (`src/config/index.ts`)

Runtime defaults used across the SDK.

- `NATIVE_TOKEN_DECIMALS_AMOUNT: number` — decimals for the native token (8).
- `DEFAULT_ASSET: Asset` — the default `ASI` asset instance.
- `DEFAULT_PHLO_LIMIT: number` — default phlo limit for deploys (500000).
- `DEFAULT_PHLO_PRICE: number` — default phlo price (1).
- `DEFAULT_NODE_STORAGE_DIR: string` — default `node-persist` directory (`./storage`).
- `GasFee: { MIN: 170000n; MAX: 250000n }` — gas fee bounds (`bigint`); `MAX` is
  reserved per pending transfer when computing available balance.
- `DEPLOY_STATUS_POLLING_TIMEOUT: number` — reservation deploy watch timeout (3 min).
- `RESERVATION_EXPIRATION_TIME: number` — reservation TTL (5 min).

Signing-session policy:

- `RequirePassword` — string enum-like const: `"once-per-session"` (default) |
  `"every-signature"`. Controls whether the client holds an unlocked session.
- `DEFAULT_AUTO_LOCK_MS: number` — default session auto-lock delay (15 min).

Data export:

- `ExportFormat` — `"json"` | `"csv"` (const object + matching type).
- `ASI_WALLET_KEYFILE: string` / `ASI_WALLET_KEYFILE_VERSION: number` — keyfile
  envelope `type` tag and version (`"asi-wallet-keyfile"`, `1`).
- `TRANSACTIONS_CSV_HEADERS: string[]` — column order for CSV transaction export.

---

## Constants (`src/utils/constants/index.ts`)

- `PRIVATE_KEY_LENGTH: number` — secp256k1 private key length in bytes (32).
- `ASI_CHAIN_PREFIX: { coinId: string; version: string }` — address payload prefix.
- `ASI_COIN_TYPE: number` — BIP-44 coin type (60).
- `ASI_DECIMALS: number` — ASI decimals (8).
- `HEX_RADIX: number` — hex radix (16).
- `HEX_BYTE_PADDING: number` — hex padding width for buffer conversion (64).
- `POWER_BASE: number` — base for power calculations (10).
- `ASI_BASE_UNIT: bigint` — atomic multiplier `BigInt(POWER_BASE) ** BigInt(ASI_DECIMALS)`.
- `FAULT_TOLERANCE_THRESHOLD: number` — finalization threshold (0.99).
- `INVALID_BLOCK_NUMBER: number` — sentinel for a failed block-number read (-1).
- `DEFAULT_BIP_44_PATH_OPTIONS` — `{ coinType: ASI_COIN_TYPE, account: 0, change: 0, index: 0 }`.

---

## Codec (`src/utils/codec/index.ts`)

Base16/base58/base64 and bigint conversions.

```ts
encodeBase58(hex: string): string       // hex -> bytes -> bs58
decodeBase58(value: string): Uint8Array
decodeBase16(hex: string): Uint8Array   // hex string (no 0x) -> bytes
encodeBase16(bytes: Uint8Array): string // bytes -> lowercase hex
arrayBufferToBase64(buffer: ArrayBuffer): string
base64ToArrayBuffer(base64: string): ArrayBuffer
bufferToBigInt(buffer: Uint8Array): bigint
bigIntToBuffer(num: bigint): Uint8Array // padded to HEX_BYTE_PADDING
```

---

## Functions (`src/utils/functions/index.ts`)

### Ids

```ts
genRandomHex(size: number): string
generateRandomId(): string  // `res_${Date.now()}_${genRandomHex(8)}`
```

### Amount conversion

The amount helpers are now **decimals-parametric** — the token decimals are passed
explicitly (previously hard-coded). `Client.toAtomicAmount` / `toDisplayAmount`
pass `NATIVE_TOKEN_DECIMALS_AMOUNT` for you.

```ts
toAtomicAmount(amount: number | string, decimals: number): bigint
fromAtomicAmountToNumber(atomicAmount: bigint, decimals: number): number
fromAtomicAmount(atomicAmount: bigint, decimals: number): string // = fromAtomicAmountToString
```

`toAtomicAmount` handles negatives and thousands separators, validates format,
truncates excess fractional digits, and pads to the allowed decimals. It throws
`Error('Invalid number')` for non-finite numbers, `Error('Cannot process empty
amount')` for empty input, and `Error('Invalid amount format')` for malformed
input. `fromAtomicAmount` trims trailing zeros and a bare trailing `.0`.
`fromAtomicAmountToNumber` warns and returns a possibly-imprecise `Number` when the
integer part exceeds `Number.MAX_SAFE_INTEGER`.

### Byte / secret helpers

```ts
toUint8Array(value: unknown): Uint8Array // accepts Uint8Array, Buffer JSON, arrays, plain objects
decryptSignerData(signerData: EncryptedData, passwordProvider: SecretsProvider): Promise<IHDSecret | IPrivateKeyCredentials>
```

`decryptSignerData` decrypts the stored signer secret and returns either
private-key credentials or an HD secret (with the `rootHDPath` re-parsed into a
`Bip44Path`).

### URL & address helpers

```ts
buildUrl(pathPrefix: string, params?: IUrlParams): string // fills :path params + query string
normalizeAddress(address: string | undefined): string     // trim + lowercase
```

---

## Validators (`src/utils/validators/index.ts`)

Account-name and address validation.

```ts
validateAccountName(name: string, maxLength?: number): { isValid: boolean; error?: string }
validateAddress(address: string): AddressValidationResult
isAddress(address: string): address is Address // type-guard over validateAddress
validateUrl(url: string): { isValid: boolean; error?: string } // non-empty http/https URL with a host
isValidUrl(url: string): boolean                               // boolean shorthand
```

`validateUrl` powers custom-network endpoint validation in
`NetworkConfigProvider`.

`validateAccountName` (default `maxLength` 30) rejects empty names, over-length
names, and forbidden characters `<>:"/\|?*`.

`validateAddress` runs a full decode + checksum check and returns a deterministic
`errorCode` (`AddressValidationErrorCode`):

- `INVALID_PREFIX` — must start with `1111`
- `INVALID_LENGTH` — 50–54 chars
- `INVALID_ALPHABET`
- `INVALID_BASE58`
- `INVALID_HEX_LENGTH`
- `INVALID_CHAIN_PREFIX`
- `INVALID_CHECKSUM`
- `NON_CANONICAL` — re-encoding differs from the input

---

## Guards (`src/utils/guards/index.ts`)

Type guards for wallet/secret discriminated unions.

```ts
isCustomCreateHDWalletOptions(options: TCreateHDPathWalletOptions): options is { customHDPath: Bip44Path }
isPrivateKeySecretData(secretData: IPrivateKeyCredentials | IHDSecret): secretData is IPrivateKeyCredentials
```

---

## Decorators (`src/utils/decorators/index.ts`)

Stage-3 method decorators used across storage, wallets, and the API layer.

Storage guards (on `ITableService` methods):

```ts
EnsureDatabaseInitialized   // awaits this.init() first
EnsureTableExists           // first arg must be an existing table name
SkipIfDatabaseNotInitialized
SkipIfTableExists
```

Wallet / client / API guards:

```ts
OnlyHDWallet                       // throws on non-HD wallets
EnsureActiveAccountExist           // throws when the wallet has no active account
EnsureApiClientManagerInitialized  // throws before ApiClientManager.initialize()
EnsureApiClientManagerConfigured   // throws when the network config isn't ready
EnsureWithInsensitiveCacheStorage  // throws when the cache-storage flag is off
```

Network-registry guards (`src/utils/decorators/networkConfigProvider`):

```ts
EnsureNetworkConfigProviderReady   // throws before the registry is initialized
EnsureNetworkExist                 // throws when the network id is unknown
EnsureNetworkNotDefault            // throws when mutating/removing a built-in network
```

---

## Polyfills (`src/utils/polyfills/index.ts`)

```ts
setupBufferPolyfill(): void
```

Assigns Node's `Buffer` (from the `buffer` package) to `window.Buffer` when
missing. No-op outside the browser. Called by `MnemonicService` and
`KeyDerivationService` at module load.

---

## Fabrics

### Signer fabric (`src/utils/fabrics/signer.ts`)

Builds and restores the correct `Signer` subclass from encrypted material.

```ts
createSigner(payload: TCreateSignerPayload): Promise<Signer>  // encrypts secret, returns HDSigner / PrivateKeySigner
restoreSigner(record: ISignerRecord): Signer
```

### Storage fabric (`src/fabrics/Storage/index.ts`)

Selects `BrowserStorage` or `NodeStorage` for the current environment — see the
storage section of `DOMAINS.md`.

```ts
storageFabric(options?: IStorageFabricOptions): ITableService<ITableRecord>
```