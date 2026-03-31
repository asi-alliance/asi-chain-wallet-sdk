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
- Key-handling boundary:
  - Raw key export is disabled by default.
  - Signing uses scoped decrypted-key callbacks with post-use zeroization.
- Source of truth:
  - `src/services/Signer/index.ts`
  - `src/domains/Wallet/index.ts`

## 4. Versioning and Migration Notes

- Encrypted payloads include a required `version` field.
- Current decrypt behavior only accepts version `2` payloads.
- Future crypto changes must:
  1. Introduce a new version number.
  2. Keep deterministic migration guidance in this document.
  3. Avoid silent fallback to weaker/legacy parameters.

## 5. KDF Cost Evaluation

- Current status: retained at `100_000` PBKDF2 iterations.
- Rationale: preserves compatibility and predictable runtime in browser targets while current security tasks are being completed.
- Follow-up policy: re-evaluate iteration cost with benchmark data before each major release and update migration notes if increased.
