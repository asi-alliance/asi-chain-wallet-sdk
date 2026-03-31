# Security Invariants

This document defines the intended security guarantees for `asi-chain-wallet-sdk`.

## 1. Key Handling Invariants

1. Private key material must never be logged in plaintext.
2. Signing operations must keep decrypted key lifetime as short as possible.
3. Key buffers should be zeroized after signing usage when feasible.
4. Raw key export must be disabled by default and only enabled explicitly for legacy migration.
5. SDK APIs should prefer capability-based signing over raw key export.

## 2. Storage Invariants

1. Vault data persisted to browser storage must remain encrypted at rest.
2. Decryption requires the correct user password.
3. Locking the vault must clear unlocked in-memory wallet/seed collections.
4. Storage adapters must be explicit about environment assumptions.

## 3. Deploy Integrity Invariants

1. User-controlled strings interpolated into deploy terms must be escaped.
2. Address inputs must pass checksum-aware validation before transfer/build.
3. Amount inputs must be validated as positive before deploy creation.

## 4. Recovery Invariants

1. Methods that generate mnemonics must return recovery material to callers.
2. SDK changes must not silently break deterministic wallet recovery flows.

## 5. Documentation Invariants

1. Security-relevant documentation must match runtime implementation.
2. Crypto settings in docs and code must remain consistent.
3. Security policy and threat model must be present and updated with material changes.
