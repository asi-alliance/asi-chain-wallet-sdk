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

## 4. Recovery Invariants

1. Methods that generate mnemonics must return recovery material to callers.
2. SDK changes must not silently break deterministic wallet recovery flows.

## 5. Documentation Invariants

1. Security-relevant documentation must match runtime implementation.
2. Crypto settings in docs and code must remain consistent.
3. Security policy and threat model must be present and updated with material changes.
