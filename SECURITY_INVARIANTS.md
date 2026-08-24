# Security Invariants

This document defines the intended security guarantees for `asi-chain-wallet-sdk`.

## 1. Key Handling Invariants

1. Private key material must never be logged in plaintext.
2. Signing operations must keep decrypted key lifetime as short as possible.
3. Key buffers should be zeroized after signing usage when feasible.
4. Raw key export must be disabled by default and only enabled explicitly for legacy migration.
5. SDK APIs should prefer capability-based signing over raw key export.

### 1a. Signing Session Invariants

1. An unlocked signing session holds the decrypted secret only in volatile
   in-memory state; it is never persisted.
2. Session lifetime is bounded and fixed: it is set at unlock time
   (`autoLockMs`, default 15 min) and is not extended by later activity.
3. Auto-lock and explicit `lock()` must clear the session timer, zeroize
   in-memory key bytes, and drop the resolved data key held by the session.
4. When there is no active session and no password is supplied, the signing
   path must fail closed (`WalletLockedError`) rather than sign.
5. The session policy is configurable; `every-signature` disables session
   holding entirely and requires the password for each signature.
6. A lock must beat a concurrent unlock. An unlock that finishes after the
   session was released must discard and zeroize the secret it decrypted rather
   than install it, and must report `WalletOperationCancelledError`. This is
   enforced by the session generation counter, which `release()` bumps
   unconditionally and `hold()` verifies.
7. Holding a wallet open in memory and holding its signing session are separate
   states. Closing a wallet must always release its session first; releasing a
   session must never require closing the wallet.

### 1a-1. Keyfile Invariants

1. Exporting a wallet keyfile must never decrypt the signing secret. The stored
   ciphertext is copied into the keyfile as-is.
2. A wallet keyfile must be refused before serialization when the supplied
   password does not match the wallet.
3. The account list inside a wallet keyfile must be encrypted, so a keyfile
   discloses neither key material nor the number and derivation indexes of the
   wallet's accounts.
4. Importing a wallet keyfile must re-encrypt the secret locally with a newly
   generated data key and fresh salts. The exporting side's ciphertext must never
   become the local at-rest ciphertext.
5. A keyfile must be validated before use: envelope type, version, wallet type,
   and both encrypted sections. A decrypted secret whose shape contradicts the
   declared wallet type must be rejected.
6. A failed decryption and a malformed file must surface as distinct errors, so a
   wrong password is never reported as a corrupt file or the reverse.
7. Account keyfiles must contain no key material and must never be accepted as a
   wallet keyfile.

### 1b. Key Fingerprint Invariants

1. A key fingerprint must be derived only from public material: `sha256` of the
   public key for a private-key signer, `sha256(masterPublicKey || chainCode)`
   for an HD signer.
2. A fingerprint must never be reversible to key material and must never be
   derived from, or stored alongside, a plaintext secret or seed. Any seed
   materialized to compute one must be zeroized before returning.
3. Fingerprints are persisted in plaintext by design, so duplicate detection can
   run while every wallet is closed. Nothing else may be inferred from them.
4. Duplicate detection must reject a wallet or account whose fingerprint already
   exists, and must do so without decrypting stored secrets.

## 2. Storage Invariants

1. Vault data persisted to browser storage must remain encrypted at rest.
2. Decryption requires the correct user password, either directly or through the
   active session it unlocked.
3. Locking the vault must clear unlocked in-memory wallet/seed collections.
4. Storage adapters must be explicit about environment assumptions.
5. Non-secret user data persisted per signer (transaction reservations) must be
   encrypted with that signer's data key, never with the signing secret and never
   in plaintext.
6. Reading or writing that data must fail closed (`WalletLockedError`) when there
   is neither an active session nor a supplied password.
7. Teardown must not race persistence. `close()` and `clearPersistence()` must
   invalidate in-flight work and then drain it under a bounded timeout before
   clearing storage, so an operation started before a logout cannot write after
   it.
8. A wallet whose creation or opening completes after a teardown must be
   discarded and locked instead of being published into post-teardown state.
9. A closed `Client` must stay closed: state-changing methods must fail with
   `DomainClosedError` rather than partially operate on released resources.

### 2a. Storage Schema Invariants

1. Persisted data carries a schema version. Compatibility must be verified before
   any other table is opened or created, so an SDK that cannot read the current
   schema never modifies it.
2. Storage written by a newer SDK build must be refused, never rewritten or
   downgraded.
3. Every migration must take a backup first and must restore it on failure,
   including dropping tables the migration created.
4. A migration that fails and rolls back successfully must leave storage readable
   by the previous build.
5. A failed rollback must be recorded persistently and must permanently block
   further automatic migration of that storage.
6. An interrupted migration must never resume on an unknown or non-resumable
   state.
7. Every schema error must report whether storage is still intact, so an
   integrator can distinguish "update the SDK" from "restore from an export".
8. The schema metadata table must be excluded from migration backups and rollback
   cleanup, so the bookkeeping survives the operation it describes.

### 2b. Account Removal Invariants

1. A wallet must never be left with zero accounts. Removing the last account of
   an HD wallet must be refused.
2. Account removal must be refused on private-key wallets, whose single account
   is the wallet itself; removing the wallet is a separate, explicit operation.
3. Removing an account must not silently change which account is active unless
   the removed account was the active one.

## 3. Deploy Integrity Invariants

1. User-controlled strings interpolated into deploy terms must be escaped.
2. Address inputs must pass checksum-aware validation before transfer/build.
3. Amount inputs must be validated as positive before deploy creation.
4. Imported private keys must be validated for length and secp256k1 range before
   a wallet is created from them, so an unusable key is refused up front rather
   than at signing time.
5. Node-supplied amounts must be parsed strictly. A balance that cannot be read
   or parsed must surface as `BalanceUnavailableError`, never as `0`, so an
   unreachable node is never mistaken for an empty account.
6. Integer values in node and indexer responses must survive JSON parsing without
   precision loss, so an amount is never silently rounded before it is used.

## 4. Recovery Invariants

1. Methods that generate mnemonics must return recovery material to callers.
2. SDK changes must not silently break deterministic wallet recovery flows.

## 5. Documentation Invariants

1. Security-relevant documentation must match runtime implementation.
2. Crypto settings in docs and code must remain consistent.
3. Security policy and threat model must be present and updated with material changes.
