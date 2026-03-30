# Utils Reference

This file contains per-function and constant documentation for the helper utilities in `src/utils`.

---

## Codec (src/utils/codec/index.ts)

Encoders and decoders for base16/base58 conversions.

```ts
encodeBase58(hex: string): string
```
Converts a hex string to a Base58-encoded string. Internally decodes hex to bytes then encodes with `bs58`.

```ts
decodeBase16(hex: string): Uint8Array
```
Parses a hex string into a `Uint8Array` of bytes. Accepts lowercase/uppercase hex without 0x prefix.

Example:

```ts
const publicKeyHex = "04ab...";
const publicKeyBytes = decodeBase16(publicKeyHex);
const addressBase58 = encodeBase58(publicKeyHex);
```

---

## Constants (src/utils/constants/index.ts)

Library-wide constants used across services and domains.

- `ASI_CHAIN_PREFIX: { coinId: string; version: string }` — chain payload prefix used for address construction.
- `ASI_COIN_TYPE: number` — coin type used for BIP44 derivation (60).
- `ASI_DECIMALS: number` — number of decimal places for ASI (8).
- `GasFee: { BASE_FEE, VARIATION_RANGE, LABEL, TRANSFER, DEPLOY }` — gas fee constants and defaults.
- `POWER_BASE: number` — base used for power calculations (10).
- `ASI_BASE_UNIT: bigint` — atomic unit multiplier computed as `BigInt(POWER_BASE) ** BigInt(ASI_DECIMALS)`.

Example usage:

```ts
const atomicMultiplier = ASI_BASE_UNIT; // e.g. 10^8
const decimals = ASI_DECIMALS;
```

---

## Functions (src/utils/functions/index.ts)

Amount conversion helpers between human-readable ASI values and atomic integer representation.

Regex and helpers used internally:

- `REGEX_THOUSANDS` — strips thousands separators (commas/spaces).
- `REGEX_AMOUNT_FORMAT` — validates numeric format (integer or decimal).
- `REGEX_TRIM_TRAILING_ZEROS` — trims trailing zeros from fractional part.
- `REGEX_DOT_ZERO` — removes `.0+` at end.

```ts
toAtomicAmount(amount: number | string): bigint
```
Converts a human-readable amount (number or string) into the atomic `bigint` value using `ASI_BASE_UNIT`. Handles negative values and thousands separators, validates format, truncates excessive fractional digits and pads to allowed decimals.

Errors thrown: `Error('Invalid number')` for non-finite numbers, `Error('Cannot process empty amount')` for empty input, `Error('Invalid amount format')` for malformed input.

```ts
fromAtomicAmountToString(atomicAmount: bigint): string
```
Converts an atomic `bigint` amount to a normalized decimal string with the library's decimals. Trims trailing zeros and removes unnecessary `.0`.

```ts
fromAtomicAmountToNumber(atomicAmount: bigint): number
```
Converts atomic `bigint` to JavaScript `number`. If integer part exceeds `Number.MAX_SAFE_INTEGER` a warning is logged and a possibly imprecise `Number` is returned via string conversion.

```ts
fromAtomicAmount = fromAtomicAmountToString
```
Alias for `fromAtomicAmountToString`.

Example conversions with descriptive names:

```ts
const humanAmount = "1,234.56789012";
const atomic = toAtomicAmount(humanAmount); // bigint representing atomic units
const backToString = fromAtomicAmountToString(atomic); // "1234.56789012"
const asNumber = fromAtomicAmountToNumber(atomic); // Number (may be imprecise if very large)
```

---

## Polyfills (src/utils/polyfills/index.ts)

Small runtime polyfills used by services in browser contexts.

```ts
setupBufferPolyfill(): void
```
Ensures `window.Buffer` exists in browser environments by assigning Node's `Buffer` from the `buffer` package when missing. No-op in non-browser environments.

Example:

```ts
setupBufferPolyfill();
// Now code relying on Buffer works in browsers when needed.
```

---

## Validators (src/utils/validators/index.ts)

Validation helpers for account names and addresses.

```ts
validateAccountName(name: string, maxLength: number = 30): { isValid: boolean; error?: string }
```
Validates an account name. Checks for non-empty string, maximum length, and forbidden filesystem characters (`<>:"/\|?*`). Returns `{ isValid: true }` or `{ isValid: false, error: string }`.

```ts
isAddress(address: string): address is Address
```
Type-guard that checks whether `address` is valid after full decode + checksum validation.

```ts
validateAddress(address: string): { isValid: boolean; errorCode?: AddressValidationErrorCode }
```
Performs detailed validation and returns a deterministic `errorCode` when invalid.

`AddressValidationErrorCode` values:

- `INVALID_PREFIX`
- `INVALID_LENGTH`
- `INVALID_ALPHABET`
- `INVALID_BASE58`
- `INVALID_HEX_LENGTH`
- `INVALID_CHAIN_PREFIX`
- `INVALID_CHECKSUM`
- `NON_CANONICAL`

Example:

```ts
const candidateName = "My Account";
const nameValidation = validateAccountName(candidateName);
if (!nameValidation.isValid) console.error(nameValidation.error);

const candidateAddress = "1111...";
if (isAddress(candidateAddress)) {
  // candidateAddress is now narrowed to `Address` type
}

const detailedResult = validateAddress(candidateAddress);
if (!detailedResult.isValid) {
  console.error(detailedResult.errorCode);
}
```
