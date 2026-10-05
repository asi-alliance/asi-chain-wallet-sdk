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

Teardown:

- `DEFAULT_DRAIN_TIMEOUT_MS: number` — how long `LifecycleGuard.drain` waits for
  in-flight operations before giving up (10s). It bounds `Client.close` and
  `Client.clearPersistence` so a hung request cannot block a logout forever.

Storage schema:

- `CURRENT_STORAGE_VERSION: number` — the schema version this build writes (`1`).
- `BASELINE_STORAGE_VERSION: number` — the version assumed for storage that
  carries no schema record yet (`1`). Migrations may only declare versions in
  `BASELINE + 1 .. CURRENT`.

Data export:

- `ExportFormat` — `"json"` | `"csv"` (const object + matching type).
- `KeyfileTypes` — enum of envelope `type` tags: `WALLET` (`"asi-wallet-keyfile"`)
  and `ACCOUNT` (`"asi-account-keyfile"`). Replaces the single
  `ASI_WALLET_KEYFILE` constant, because the two keyfile kinds must not be
  interchangeable.
- `ASI_WALLET_KEYFILE_VERSION: number` — keyfile envelope version (`1`); import
  refuses anything else.
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
- `SCALA_FAULT_TOLERANCE_THRESHOLD: number` — finalization threshold (0.99).
- `INVALID_BLOCK_NUMBER: number` — sentinel for a failed block-number read (-1).
- `DEFAULT_BIP_44_PATH_OPTIONS` — `{ coinType: ASI_COIN_TYPE, account: 0, change: 0, index: 0 }`.

Numeric-format patterns, shared so the same rule is not re-typed per call site:

- `DIGITS_ONLY_REGEX` — `/^\d+$/`, the atomic-amount parser's accepted form.
- `CANONICAL_INTEGER_REGEX` — `/^(0|[1-9]\d*)$/`, an integer with no leading
  zeros. Used by `Bip44Path.parse`, where `044'` and `44'` must not be the same
  path.
- `INTEGER_REGEX` / `DECIMAL_REGEX` — signed integer and decimal forms.
- `NON_NEGATIVE_INTEGER_REGEX` / `NON_NEGATIVE_DECIMAL_REGEX` — the unsigned
  forms, behind the `isSerializedInteger` and `isSerializedDecimal` guards that
  validate amounts coming back out of the vault.

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

toUint8Array(value: unknown): Uint8Array
```

`toUint8Array` moved here from `@utils/functions`. It is a decoder, which is what
this module is for, and the move also broke the cycle between the codec and the
guards: the guards need `toUint8Array` to check a stored private key, and
`toUint8Array` needs the byte guards, so the two could not both live in
`functions`.

It accepts the four shapes a byte array can take once it has been through JSON:
a `Uint8Array`, a Node `Buffer` envelope (`{ type: "Buffer", data: [...] }`), a
plain array, and an index-keyed object. **Every element is now checked**: each
entry must be an integer in `0 … 255`, and for an index-keyed object the keys
must be `"0"`, `"1"`, … in order, with no gaps and nothing extra. Without those
checks, `Uint8Array.from` coerced whatever it found — `null` and a fractional
value became `0`, `Object.values` on `{ 1: 2, 0: 1 }` produced bytes in an
arbitrary order — and a tampered record silently decoded into a different, valid
looking key. An unsupported shape or a bad byte throws.

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
parseAtomicAmount(value: unknown): bigint | null
```

`parseAtomicAmount` is the strict inbound parser for an atomic amount of unknown
provenance. It accepts a non-negative safe integer `number` or a string of digits
only, and returns `null` for everything else — floats, negatives, values beyond
`Number.MAX_SAFE_INTEGER`, and non-numeric input. `AssetsService` uses it on the
node's balance expression so an unparsable value becomes
`BalanceUnavailableError` rather than a silently wrong `BigInt`.

`toAtomicAmount` handles negatives and thousands separators, validates format,
truncates excess fractional digits, and pads to the allowed decimals. It throws
`Error('Invalid number')` for non-finite numbers, `Error('Cannot process empty
amount')` for empty input, and `Error('Invalid amount format')` for malformed
input. `fromAtomicAmount` trims trailing zeros and a bare trailing `.0`.
`fromAtomicAmountToNumber` warns and returns a possibly-imprecise `Number` when the
integer part exceeds `Number.MAX_SAFE_INTEGER`.

### Byte helpers

`toUint8Array` now lives in [Codec](#codec-srcutilscodecindexts).

Secret decryption is not a util: `decryptSignerData` lives on `CryptoService`
(see `SERVICES.md`).

### URL & address helpers

```ts
buildUrl(pathPrefix: string, params?: IUrlParams): string // fills :path params + query string
normalizeAddress(address: string | undefined): string     // trim + lowercase
isSameAddress(address: string | undefined, other: string | undefined): boolean
resolveTransferType(from: string, viewerAddress: string): TransactionType // "send" | "receive"
```

`isSameAddress` compares two addresses after normalization and is **false for two
blanks**: an empty or missing address is not equal to another missing one, which
matters because a reservation's optional `to` is absent for a deploy and must not
be read as matching every account without an address.

`resolveTransferType` is the single definition of transfer direction: a transfer
is `send` when its `from` is the address of whoever is reading it, and `receive`
otherwise. Both the indexer mapper and the reservation fabric call it, which is
what lets one stored reservation be rendered correctly for the sender and for the
recipient.

### Error messages

```ts
getErrorMessage(error: unknown, fallback: string): string
```

Extracts a readable message from anything a `catch` can produce, in order: a
non-blank string, an `Error` (its `message`, or its `name` when the message is
empty), any object with a non-blank string `message`, and finally the `fallback`.
The fallback is normally an `UnknownErrorReason` member naming the subsystem that
failed silently, so a caught `undefined` from browser storage still produces a
sentence. It is the reason no SDK error can now surface with an empty message or
as `[object Object]`.

### Decrypted payload parsing

```ts
parseDecryptedJson<T>(
    payload: string,
    source: CorruptedDataSource,
    isExpectedStructure: (value: unknown) => value is T,
): T
```

The one way plaintext coming out of the vault becomes a typed value. It parses
and then validates, raising `CorruptedDataError` with the given `source` for
either failure. Decryption succeeding only proves the password was right; it says
nothing about the record being the shape the caller expects, which is why both
the signer secret and the reservation payload go through this instead of a bare
`JSON.parse`.

### Selection

```ts
selectByField<T, K extends keyof T>(
    items: T[],
    field: K,
    values: readonly T[K][],
): { selected: T[]; missingValues: T[K][] }
```

Picks the items whose `field` is in `values` and, crucially, reports which
requested values matched nothing. Keyfile import uses it to narrow accounts to
the requested derivation indexes and to reject a selection that names an index
the keyfile does not contain, instead of silently importing a subset.

### Schema stamping

```ts
withSchemaVersion<T extends ITableRecord>(record: T): T
```

Returns the record with a `schemaVersion` defaulted to
`BASELINE_STORAGE_VERSION` when absent. A helper for per-record migrations: it is
not wired into any write path yet, since the current schema version is the
baseline.

### Failure isolation

```ts
runProtected(run: () => void | Promise<void>, onFailure: (error: unknown) => void): void
```

Runs a callback that must never take its caller down with it. A synchronous throw
is caught; a returned thenable (detected through the `isPromiseLike` guard) gets
a `.catch`, so a rejected promise reaches `onFailure` too. It returns `void`
without awaiting anything, which is the point: the caller keeps going regardless.
`ClientEventBus` uses it for every listener invocation and for the error handler
itself.

---

## Validators (`src/utils/validators/index.ts`)

Account-name, address, private-key, URL, node-profile, and reservation-payload
validation. The module is split into two files behind one barrel:

- `primitives.ts` — checks that depend on nothing but a value and a range
  (`isIntegerInRange`, the private-key checks). It imports no domain module.
- `domain.ts` — checks that need SDK types (addresses, node profiles, reservation
  payloads).

The split exists to break import cycles. `Bip44Path` needs `isIntegerInRange`
and the guards need `isPrivateKeyValid`, and both used to pull in the whole
validators barrel, which pulled the domain layer back in. Internal callers import
`@utils/validators/primitives` directly; the barrel stays the public surface.

```ts
isIntegerInRange(value: number, min: number, max: number): boolean
validateAccountName(name: string, maxLength?: number): { isValid: boolean; error?: string }
validateAddress(address: string): AddressValidationResult
isAddress(address: string): address is Address // type-guard over validateAddress
validatePrivateKey(privateKey: Uint8Array): { isValid: boolean; error?: string }
isPrivateKeyValid(privateKey: Uint8Array): boolean              // boolean shorthand
validateUrl(url: string): { isValid: boolean; error?: string } // non-empty http/https URL with a host
isValidUrl(url: string): boolean                               // boolean shorthand
validateNodeApiProfile(profile: unknown): { isValid: boolean; error?: string } // membership in NodeApiProfile
```

`validatePrivateKey` checks both things a raw key can get wrong: the byte length
(`PRIVATE_KEY_LENGTH`, 32) and membership in the secp256k1 scalar range, via
`@noble/secp256k1`'s `isValidPrivateKey` — zero and any value at or above the
curve order are rejected. `Client.createPrivateKeyWallet` runs `isPrivateKeyValid`
before touching storage, so an imported key that could never sign is refused up
front instead of failing later at signing time.

Keyfile validation used to live here as `validateWalletKeyfile` and
`validateWalletKeyfileAccounts`. Both are now private to
[ImportKeyfileService](SERVICES.md#importkeyfileservice-srcservicesimportkeyfileserviceindexts):
they knew about keyfile envelopes and wallet types, which made a leaf utils
module depend on the domain layer. The shape guards they call
(`isEncryptedData`, `isKeyfileWalletAccount`) stayed in `@utils/guards`.

Amount, reservation, and deploy validation:

```ts
ensureValid(result: { isValid: boolean; error?: string }, context: IErrorContext): void
validatePositiveAmount(amount: bigint): { isValid: boolean; error?: string }
validateReservationPayload(payload: TCreateTransactionReservationPayload): { isValid: boolean; error?: string }
validateDeployPayload(payload: TDeployDetails): { isValid: boolean; error?: string }
```

`ensureValid` turns any `{ isValid, error }` result into a throw prefixed with
the caller's `context`, so a validator can be written once and used both as a
predicate and as an assertion without every call site repeating the same three
lines.

`validateReservationPayload` is the boundary check for an externally managed
reservation, run before anything is persisted. In order: a non-empty `deployId`;
a `pendingAmount` above zero; a `gasCost` that is neither negative nor larger
than the amount being reserved. For a `transfer` it then requires a valid
recipient address (full `validateAddress`, so checksum and canonical form
included), a positive `amount`, and — the invariant that makes the reservation
mean anything — `amount + gasCost <= pendingAmount`. A reservation that does not
cover its own transfer plus gas would under-lock the balance and let the account
overspend, so it is refused rather than clamped. `gasCost` defaults to
`GasFee.MAX` for that comparison when the caller omits it.

`validateDeployPayload` is the boundary check every signed deploy passes through,
called from `TransactionService.signDeploy` and therefore covering `deploy` and
`transfer` as well. It rejects a blank `term`, a `phloLimit` or `phloPrice` that
is not an integer between `1` and `Number.MAX_SAFE_INTEGER` (both optional; an
omitted value falls back to the configured default), and a `shardId` that is
present but blank. Putting it at the signing boundary means a caller cannot reach
the signer with a payload the node would reject, whichever entry point it used.

`validateUrl` powers custom-network endpoint validation in
`NetworkConfigProvider`; `validateNodeApiProfile` guards the `nodeApiProfile`
field on the same write paths and is the source of truth behind the
`isNodeApiProfile` guard.

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

Type guards for untrusted values: parsed JSON, decrypted payloads, caught errors,
and discriminated unions. Split the same way as the validators, behind one
barrel:

- `primitives.ts` — structural checks over `unknown` with no SDK types involved.
- `domain.ts` — checks that narrow to an SDK type.

Primitives:

```ts
isRecord(value: unknown): value is Record<string, unknown>
isValidByte(value: unknown): value is number            // integer 0…255
isByteIndexedRecord(value: object): value is Record<string, number> // keys "0","1",… in order
isValueInConst<T extends readonly string[]>(value: unknown, values: T): value is T[number]
isSerializedInteger(value: unknown): value is string    // digits only
isSerializedDecimal(value: unknown): value is string    // digits with an optional fraction
isRecordWithMessage(value: unknown): value is { message: string }
isErrorWithMessage(value: unknown): value is Error
isPromiseLike(value: unknown): value is PromiseLike<unknown>
```

Domain:

```ts
isCustomCreateHDWalletOptions(options: TCreateHDPathWalletOptions): options is { customHDPath: Bip44Path }
isPrivateKeySecretData(secretData: IPrivateKeyCredentials | IHDSecret): secretData is IPrivateKeyCredentials
isNodeApiProfile(value: unknown): value is NodeApiProfile
isStoredSecret(value: unknown): value is TStoredSecret
isSerializedReservationPrivateData(value: unknown): value is ISerializedTransactionReservationPrivateData

isEncryptedData(value: unknown): value is EncryptedData
isKeyfileAccount(value: unknown): value is IKeyfileAccount
isKeyfileWalletAccount(value: unknown): value is IKeyfileWalletAccount
```

`isValueInConst` is what lets a union derived from an `as const` tuple be checked
at runtime against that same tuple — `TRANSACTION_RESERVATION_KINDS` and
`NODE_API_PROFILES` are both used this way, so the type and the check can never
drift apart.

`isStoredSecret` and `isSerializedReservationPrivateData` guard the **decrypt
boundary**. A record that decrypts is not thereby trustworthy: it may have been
written by a different build, or tampered with before encryption, or simply be
the wrong record. `isStoredSecret` requires either a private key that survives
`toUint8Array` and lies inside the secp256k1 range, or a valid BIP-39 mnemonic
with a parseable BIP-44 root path. `isSerializedReservationPrivateData` checks
the account id, the serialized amount, a finite expiration, a known `kind`, and
the details block, where the amounts must match the serialized-decimal form and
the timestamp must parse. Both are called through `parseDecryptedJson`, so a
failure becomes `CorruptedDataError` rather than a malformed object entering the
domain.

The three keyfile guards narrow untrusted parsed JSON at the import boundary,
where nothing about the shape can be assumed. `isEncryptedData` checks the four
fields a ciphertext envelope must carry (`data`, `salt`, `iv`, `version`);
`isKeyfileWalletAccount` accepts `{ name, index }` and `isKeyfileAccount` the
richer `{ name, address, index }` of a standalone account keyfile. Both treat a
`null` index as valid, since private-key accounts have no derivation index.

`isRecordWithMessage` and `isErrorWithMessage` back `getErrorMessage`: the first
accepts any object carrying a non-blank string `message` (a rejected plain object
from a foreign library), the second additionally requires a real `Error`, which
is what `DeployStatusPoller` uses to decide whether a caught value can be
rethrown as-is or has to be wrapped.

`isPromiseLike` is a structural check (`then` is callable) rather than an
`instanceof Promise`, so `runProtected` also catches rejections from async
listeners returning a foreign thenable.

`isNodeApiProfile` narrows untyped values at the storage boundary
(`restoreCustomNetworks`), mirroring how `isValidUrl` sits on top of
`validateUrl`. It reads `NODE_API_PROFILES` through `isValueInConst` rather than
delegating to `validateNodeApiProfile`, which is what keeps the guards free of a
dependency on the validators.

`src/utils/index.ts` re-exports `./guards`, so these are part of the package's
public surface alongside the validators.

---

## Decorators (`src/utils/decorators/index.ts`)

Stage-3 method decorators used across storage, wallets, and the API layer.

Storage guards (on `ITableService` methods):

```ts
EnsureDatabaseInitialized; // awaits this.init() first
EnsureTableExists; // first arg must be an existing table name
SkipIfDatabaseNotInitialized;
SkipIfTableExists;
```

Wallet / client / API guards:

```ts
OnlyHDWallet; // throws HDWalletOnlyOperationError on non-HD wallets
EnsureAccountIsIdle; // throws AccountBusyError when the account has a running operation
EnsureApiClientManagerInitialized; // throws before ApiClientManager.initialize()
EnsureApiClientManagerConfigured; // throws when the network config isn't ready
EnsureWithInsensitiveCacheStorage; // throws when the cache-storage flag is off
```

`OnlyHDWallet` is synchronous and throws a typed
`HDWalletOnlyOperationError` naming the guarded method (read from the decorator
context), so a caller can branch on `code` and show which operation was refused.
It used to be `async` and to throw a plain `Error`, which forced every guarded
method to return a promise even when it was synchronous — `Wallet.removeAccount`
is one, and it can now stay synchronous under the guard.

`EnsureAccountIsIdle` replaces the former `EnsureActiveAccountExist`, which
existed only to assert that a wallet had an active account before signing.
Accounts are now addressed explicitly, so the interesting question is no longer
"is one selected" but "is this one in use": the decorator reads the `accountId`
from the **first argument** of the guarded method, asks the wallet's
`accountOperationsGuard` whether that key has any holders, and throws
`AccountBusyError` if it does. `Wallet.removeAccount` is its only use.

Lifecycle guards:

```ts
EnsureActive; // throws DomainClosedError once the domain has been closed
TrackOperation; // registers the returned promise with this.lifecycleGuard
```

`EnsureActive` works on anything satisfying `IClosableContext` (`isActive()`), so
it pairs with `ClosableDomain`; it names the offending class through
`this.constructor.name` in the error. `Client` puts it on every state-changing
method and leaves pure reads unguarded.

`TrackOperation` expects an `ITrackedOperationContext` (a `lifecycleGuard` field)
and wraps the call in `lifecycleGuard.track`, so the operation is counted among
the pending ones that `drain` waits for. `Client.transfer` and `Client.deploy`
carry it, which is what makes a logout wait for an in-flight deploy instead of
tearing storage out from under it.

Network-registry guards (`src/utils/decorators/networkConfigProvider`):

```ts
EnsureNetworkConfigProviderReady; // throws before the registry is initialized
EnsureNetworkExist; // throws when the network id is unknown
EnsureNetworkNotDefault; // throws when mutating/removing a built-in network
```

Network-busy guards (`src/utils/decorators/apiClientManager`):

```ts
EnsureCurrentNetworkNotBusy; // throws NetworkBusyError when the active network has work in flight
EnsureTargetNetworkNotBusy; // same check against the network id in the first argument
```

Both read `ApiClientManager`'s `NetworkBusyRegistry` and protect
`switchNetwork` / `updateNetwork` / `removeNetwork`.
`EnsureCurrentNetworkNotBusy` passes through untouched while the manager is not
ready yet, because there is no active network to protect at that point.

Reservation-scope guards
(`src/utils/decorators/reservationAdapterManager`,
`src/utils/decorators/transactionReservationsManager`):

```ts
EnsureExclusiveNetwork;     // the first argument's network must be under an exclusive scope
EnsureExclusiveReservation; // the first argument's reservation must be under runExclusive
```

These are structural assertions, not access control. Both guard a method that is
only safe inside a lock its caller is supposed to be holding:
`ReservationAdapterManager.removeNetworkReservations` must run inside
`runExclusiveNetworkAction`, and `TransactionReservationsManager.replace` inside
`runExclusive`. Each reads a predicate off its own context
(`isExclusiveNetwork`, `isExclusiveReservation`) and throws a message naming the
method and the scope it should have been called from. A future call site that
forgets the wrapper fails loudly at the first call instead of corrupting state
under a race that only shows up in production.

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

All fabrics live under `src/fabrics`, a top-level folder next to `src/utils`. Its
`index.ts` re-exports the signer, storage, and client fabrics; the transaction
reservation fabric is imported by its own path. The folder is internal —
`src/index.ts` does not re-export it, so fabrics are not part of the package
public surface; SDK code reaches them through the `@fabrics/*` alias.

### Signer fabric (`src/fabrics/signer.ts`)

Builds and restores the correct `Signer` subclass from encrypted material.

```ts
createSigner(payload: TCreateSignerPayload): Promise<Signer>  // HDSigner / PrivateKeySigner
createImportedSigner(payload: ICreateImportedSignerPayload): Promise<Signer>
restoreSigner(record: ISignerRecord): Signer
```

`createSigner` encrypts two things with the wallet password: the secret itself
and a freshly generated data key (`CryptoService.generateDataKeySecret`). Both
live on the signer as `encryptedSecret` / `encryptedDataKey`, and `restoreSigner`
rebuilds it from the stored record. The data key is what encrypts non-secret user
data such as transaction reservations; it is resolved through
`Signer.resolveDataKey(passwordProvider?)` — an active session already holds it,
otherwise the password decrypts it.

`createSigner` also computes the signer's **fingerprint** while it still has the
plaintext secret in hand, through the single `KeyFingerprintService.fromSecret`
entry point. It travels on `ISignerRecord` as a plaintext field and
`restoreSigner` passes it straight back, so it is available for duplicate
detection without decrypting anything.

`createImportedSigner` builds a signer from an already-decrypted secret, which is
what wallet keyfile import has. It generates a fresh signer id, re-wraps the
secret in a `SecretsProvider` shaped for its type, and delegates to
`createSigner`.

```ts
interface ICreateImportedSignerPayload {
    secret: TDecryptedSecret;
    passwordProvider: SecretsProvider;
}
```

Delegating rather than assembling a signer directly is deliberate: an imported
wallet goes through the same encryption and the same **freshly generated data
key** as one created from scratch. The keyfile's ciphertext is never adopted as
the local at-rest ciphertext, so an imported wallet is encrypted under the
importing user's password with new salts and a new data key, independent of
whatever the exporting side used.

### Node API adapter fabric (`src/fabrics/nodeApiAdapter.ts`)

Builds the `NodeApiAdapter` subclass for a profile — see the adapter section of
`DOMAINS.md`.

```ts
createNodeApiAdapter(profile: NodeApiProfile, apiClientManager: ApiClientManager): NodeApiAdapter
```

### Deploy term fabric (`src/fabrics/deployTermFactory.ts`)

Selects the Rholang term set for a profile: the `Deploy/factory/index.ts` terms for
`SCALA`, the `Deploy/factory/rust.ts` terms for `RUST`.

```ts
createDeployTermFactory(profile: NodeApiProfile): IDeployTermFactory
```

Both fabrics `switch` over `NodeApiProfile` with no `default` clause, so adding a
profile without handling it fails to compile. Unlike the adapter fabric, this one
returns module-level constant tables of function references — there is nothing to
construct or cache.

### Storage fabric (`src/fabrics/storage.ts`)

Selects `BrowserStorage` or `NodeStorage` for the current environment — see the
storage section of `DOMAINS.md`.

```ts
storageFabric(options?: IStorageFabricOptions): ITableService<ITableRecord>
```

### Transaction reservation fabric (`src/fabrics/transactionReservation.ts`)

The single place that shapes an `ITransactionReservation`, so `ReservationAdapter`
never assembles the record inline. It also owns both directions of the storage
serialization boundary.

```ts
TransactionReservationFabric.create(payload: TCreateTransactionReservationPayload, id?: string): ITransactionReservation
TransactionReservationFabric.createTransfer(payload: ICreateTransferReservationPayload, id?: string): ITransactionReservation
TransactionReservationFabric.createDeploy(payload: ICreateDeployReservationPayload, id?: string): ITransactionReservation

TransactionReservationFabric.toCreatePayload(
    meta: TTransactionReservationMeta,
    account: Account,
    networkId: NetworkId,
): TCreateTransactionReservationPayload

TransactionReservationFabric.toPendingTransaction(
    reservation: ITransactionReservation,
    viewerAddress: Address,
): Transaction

TransactionReservationFabric.toPrivateData(
    reservation: ITransactionReservation,
): ISerializedTransactionReservationPrivateData

TransactionReservationFabric.fromStorage(
    record: ITransactionReservationsStorageRecord,
    privateData: ISerializedTransactionReservationPrivateData,
): ITransactionReservation
```

The create payloads are a discriminated union on `kind`, so one entry point
covers both:

```ts
interface IReservationPayload {
    deployId: string;
    networkId: NetworkId;
    account: Account;
    pendingAmount: bigint;
    kind: TransactionReservationKind;
    gasCost?: bigint;
}

interface ICreateTransferReservationPayload extends IReservationPayload {
    kind: "transfer";
    details: { to: Address; amount: bigint };
}

interface ICreateDeployReservationPayload extends IReservationPayload {
    kind: "deploy";
    term?: string;
}

type TCreateTransactionReservationPayload =
    | ICreateTransferReservationPayload
    | ICreateDeployReservationPayload;
```

`create` dispatches on `kind`; the two specific builders remain for the internal
`transfer` and `deploy` paths, which already know which one they are making. All
three take an optional `id`, defaulting to a fresh `generateRandomId()`. Passing
one is what makes an update **id-preserving**: the record is rebuilt from the new
payload without becoming a different reservation, so subscribers, storage keys,
and the caller's handle all stay valid.

`gasCost` is explicit rather than assumed. A transfer previously always reserved
`GasFee.MAX` and a deploy reported its entire `pendingAmount` as gas; a caller
that knows its real cost can now state it, and the defaults only apply when it is
omitted.

`toCreatePayload` is the adapter between the public request shape
(`TTransactionReservationMeta`, which carries plain values) and the internal
payload (which carries a resolved `Account` and network id). `Client` uses it so
the request coming from an integrator never has to contain SDK objects.

`toPendingTransaction` renders a stored reservation as a `Transaction` for one
reader: `status` is always `"pending"` and `detectedBy` always `"manual"`, while
`type` is `"deploy"` for a deploy reservation and otherwise comes from
`resolveTransferType(details.from, viewerAddress)`. This is the function that
replaced the embedded `transaction` field — the reservation stores facts, the
fabric renders a point of view.

`toPrivateData` drops the storage-owned fields (`id`, `networkId` — they live on
the record itself) and serializes `details.timestamp` into an ISO string, so
the payload survives `JSON.stringify` and an `IndexedDB` round trip.
`fromStorage` is its inverse: it recombines a stored record with its decrypted
private data and revives `details.timestamp` into a `Date`.

### Client fabrics (`src/fabrics/client/`)

Composition helpers for `Client`.

```ts
registerEventDispatcher(
    eventBus: IClientEventSource,
    eventDispatcher: IClientEventDispatcher,
): TUnsubscribe
```

Adapts the legacy callback object to the event bus. It walks
`IClientEventDispatcher`, and for each method that is actually present subscribes
a bound listener to the matching `ClientEvent`, collecting the unsubscribes into
one combined `TUnsubscribe`. Absent callbacks register nothing, and binding keeps
`this` intact for dispatchers implemented as class instances.

`Client.create` calls it when `eventDispatcher` is supplied, so the dispatcher
and any `getEventBus()` subscriber are the same mechanism and see the same
events.

Reservation-adapter composition used to live here too, as
`createReservationAdapter`. It is gone: `ReservationAdapterManager` now owns
adapter creation and the change notification itself (see
[SERVICES.md](SERVICES.md#reservationadaptermanager-srcservicesreservationadaptermanagerindexts)).
