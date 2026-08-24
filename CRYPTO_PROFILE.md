# Crypto Profile

This document defines the current cryptographic profile used by `asi-chain-wallet-sdk` and the migration expectations for encrypted payload formats.

## 1. Wallet/Vault Encryption Profile

- Format version: `2`
- Cipher: `AES-GCM`
- Key size: `256` bits
- KDF: `PBKDF2`
- Hash function: `SHA-256`
- PBKDF2 iterations: `100_000`
- Salt length: `16` bytes
- IV length: `12` bytes
- Source of truth: `src/services/Crypto/index.ts`

## 1a. Data Key Profile

- Purpose: encrypt non-signing user data at rest (currently transaction
  reservations) without exposing the signing secret to persistence code.
- Generation: `32` random bytes from `crypto.getRandomValues`, base64-encoded.
- Storage: kept per signer as `encryptedDataKey`, encrypted with the wallet
  password under the profile in section 1.
- Usage: the decrypted data key is the passphrase input to the same
  `AES-GCM` + `PBKDF2` profile when encrypting reservation payloads, so stored
  ciphertext carries its own `salt` / `iv` / `version` like any other payload.
- Availability: resolved through `Signer.resolveDataKey` — an active signing
  session holds it, otherwise the wallet password decrypts it on demand.
- Source of truth:
  - `src/services/Crypto/index.ts`
  - `src/fabrics/signer.ts`
  - `src/domains/Signer/index.ts`

## 1a-1. Wallet Keyfile Profile

- Format version: `1` (`ASI_WALLET_KEYFILE_VERSION`); import rejects any other
  version.
- Envelope: `{ version, type, timestamp }`, where `type` is a `KeyfileTypes`
  member — `asi-wallet-keyfile` (restorable) or `asi-account-keyfile` (a public
  descriptor with no key material).
- Secret: the signer's existing `encryptedSecret`, copied unchanged. Export never
  decrypts it, so no plaintext key exists during export.
- Account list: encrypted with the wallet password under the profile in
  section 1, so a keyfile leaks neither keys nor the wallet's account layout.
- Import: the decrypted secret is re-encrypted locally through the normal signer
  fabric, producing a new signer id, new salts, and a **newly generated data
  key**. The exporting side's ciphertext is never adopted as local at-rest data.
- Password handling: verified against the wallet before export; a failed decrypt
  on import is reported separately from a malformed file.
- Source of truth:
  - `src/services/KeyfileSerializer/index.ts`
  - `src/services/ExportKeyfileService/index.ts`
  - `src/services/ImportKeyfileService/index.ts`
  - `src/fabrics/signer.ts`

## 1b. Key Fingerprint Profile

- Purpose: recognize that a secret is already stored, without decrypting
  anything, so duplicate wallets and accounts can be refused while every wallet
  is closed.
- Hash function: `sha256` (from `@noble/hashes`), hex-encoded.
- Private-key / account input: the `secp256k1` public key.
- HD signer input: the BIP-32 master node's `publicKey || chainCode`. Hashing the
  master node rather than the seed keeps the value stable per mnemonic while
  nothing recoverable is derived from it; the seed is zeroized in a `finally`.
- Storage: plaintext field on the signer and account records, next to the
  encrypted payload. It is public-material-derived and one-way, so it discloses
  nothing the chain does not already expose.
- Not a KDF and not a secret: it never participates in encryption, signing, or
  key derivation.
- Source of truth:
  - `src/services/KeyFingerprint/index.ts`
  - `src/fabrics/signer.ts`
  - `src/domains/Account/index.ts`

## 2. Address Derivation Profile

- Public key curve: `secp256k1`
- Public key hash: `keccak256`
- Address checksum hash: `blake2b` (first 4 bytes / 8 hex chars)
- Encoding: base58
- Source of truth:
  - `src/services/Wallets/index.ts`
  - `src/utils/validators/index.ts`

## 3. Signing Profile

- Signature scheme: `secp256k1`
- Deploy digest hash: `blake2b-256`
- Private key validation: imported keys must be `32` bytes and within the
  `secp256k1` scalar range (`@noble/secp256k1` `isValidPrivateKey`) before a
  wallet is created from them.
- Key-handling boundary:
  - Raw key export is disabled by default.
  - Signing uses scoped decrypted-key callbacks with post-use zeroization.
  - Decrypted-key lifetime is either ephemeral (per-signature, when no session is
    held) or bounded by an in-memory signing session with a fixed, configurable
    auto-lock window; locking/expiry clears and zeroizes the session secret.
  - The session is a distinct object with a generation counter, so an unlock that
    completes after a concurrent lock zeroizes its secret and is cancelled rather
    than installed.
- Source of truth:
  - `src/services/Signer/index.ts`
  - `src/domains/Signer/index.ts`
  - `src/domains/SigningSession/index.ts`
  - `src/domains/AutoTimer/index.ts`
  - `src/domains/Wallet/index.ts`
  - `src/utils/validators/index.ts`

## 4. Versioning and Migration Notes

- Encrypted payloads include a required `version` field.
- Current decrypt behavior only accepts version `2` payloads.
- Future crypto changes must:
  1. Introduce a new version number.
  2. Keep deterministic migration guidance in this document.
  3. Avoid silent fallback to weaker/legacy parameters.

### 4a. Storage Schema Versioning

Distinct from the payload `version` above: that one versions a single ciphertext,
this one versions the shape of persisted storage as a whole.

- Current schema version: `1` (`CURRENT_STORAGE_VERSION`).
- Baseline version: `1` (`BASELINE_STORAGE_VERSION`), assumed for storage that
  carries no schema record yet.
- Declared migrations: none yet; `STORAGE_MIGRATIONS` is empty because existing
  installs are already on the supported version.
- Compatibility is asserted before any table other than the metadata table is
  opened. Storage newer than the running build is refused untouched.
- A crypto profile change that alters stored payloads must ship as a storage
  migration with a new schema version, so the re-encryption is backed by the
  backup and rollback machinery rather than performed opportunistically on read.
- Source of truth:
  - `src/config/index.ts`
  - `src/services/StorageBootstrap/index.ts`
  - `src/services/StorageMigrationRunner/`
  - `src/domains/StorageMetadataStorageRepository/index.ts`

## 5. KDF Cost Evaluation

- Current status: retained at `100_000` PBKDF2 iterations.
- Rationale: preserves compatibility and predictable runtime in browser targets while current security tasks are being completed.
- Follow-up policy: re-evaluate iteration cost with benchmark data before each major release and update migration notes if increased.
