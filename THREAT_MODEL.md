# Threat Model: asi-chain-wallet-sdk

Date: 2026-03-19

## 1. Security Objectives

1. Prevent unauthorized signing and key disclosure.
2. Preserve integrity of deploy payload construction.
3. Protect encrypted vault data at rest.
4. Minimize misuse risk from SDK API boundaries.

## 2. Assets to Protect

1. Private keys and mnemonic phrases.
2. Password-derived encryption material.
3. Per-signer data keys, which encrypt non-signing user data at rest
   (transaction reservations) and are themselves stored password-encrypted.
4. Signed deploy payloads before submission.
5. Wallet metadata and vault contents stored in browser storage.
6. Key fingerprints stored in plaintext. These are one-way hashes of public
   material and are not confidential, but they do link stored records to a key
   pair, so they are listed here as metadata rather than as secrets.
7. Exported wallet keyfiles. They carry the encrypted signing secret and an
   encrypted account list, so a keyfile is exactly as sensitive as the vault it
   came from once its password is known.

## 3. Trust Boundaries

1. Browser runtime and JavaScript context (untrusted by default).
2. Local persistence boundary (`IndexedDB` in the browser, `node-persist` in Node).
3. Node/indexer HTTP endpoints.
4. Integrator application code using this SDK.

## 4. Adversary Model

1. Web attacker able to inject script via XSS in host application.
2. Malicious browser extension with DOM/script visibility.
3. Malicious or compromised RPC/indexer endpoint.
4. Supply-chain attacker via dependencies.
5. User-input attacker attempting deploy string manipulation.

## 5. In-Scope Threats

1. Secret leakage through logs/errors/debug tooling.
2. Injection in deploy term construction.
3. Weak or incorrect input validation (addresses, amounts, imported private keys).
4. Offline brute-force attempts on stolen ciphertext.
5. Recovery failure due mnemonic-handling defects.
6. State races around lock and logout: an unlock or a wallet publication that
   completes after the user locked, closed, or logged out, and persistence writes
   landing after a `clearPersistence`.
7. A hostile or faulty node answer being read as valid state, in particular an
   unreadable balance being treated as zero funds, or a large integer amount
   being rounded during JSON parsing.
8. Malicious or corrupted keyfiles supplied as import input: malformed
   structure, a secret contradicting the declared wallet type, or crafted
   account lists.
9. Offline attacks on an exported keyfile, which travels outside the app's
   storage boundary and is only as strong as its password.
10. Storage schema confusion: data written by a different SDK build being read or
    rewritten under the wrong assumptions, or a migration interrupted mid-way
    leaving partially converted data.

## 6. Out-of-Scope / Assumptions

1. Full host-device compromise outside browser threat controls.
2. Physical access attacks on unlocked user devices.
3. Integrator applications that disable baseline web security controls.

## 7. Controls and Mitigations

Current controls:

1. WebCrypto (`AES-GCM`, `PBKDF2`) for encryption.
2. Modern secp256k1 signing path (`@noble/secp256k1`).
3. Vault lock/unlock flow with encrypted-at-rest storage.
4. Bounded in-memory signing sessions: the decrypted secret is held only for a
   fixed, configurable auto-lock window and is zeroized on lock/expiry; the
   signing path fails closed (`WalletLockedError`) when locked.
5. Key separation for stored user data: transaction reservations are encrypted
   with a per-signer data key rather than the signing secret, so persistence code
   never touches key material that can sign.
6. Cancellation on lock: the signing session carries a generation counter, so an
   unlock that resolves after a lock zeroizes its secret and fails with
   `WalletOperationCancelledError` instead of silently reopening the wallet.
7. Bounded teardown: `close()` and `clearPersistence()` invalidate in-flight work
   and drain it under a timeout before clearing storage, and a wallet published
   after that point is discarded rather than exposed.
8. Fail-closed reads: unreadable or unparsable balances raise
   `BalanceUnavailableError` instead of collapsing to zero, so a hostile or
   unreachable node cannot present an account as empty.
9. Duplicate rejection without decryption: wallets and accounts are matched on
   one-way key fingerprints, so re-importing a stored secret is refused while
   everything remains locked.
10. Keyfile boundary validation: structure, envelope type, and version are
    checked before decryption, and the decrypted secret is cross-checked against
    the declared wallet type. Export never decrypts the secret, and import
    re-encrypts it locally with a fresh data key.
11. Version-gated storage: compatibility is asserted before any table is opened,
    migrations run under backup and rollback, and an unrecoverable state is
    reported with `isStorageIntact: false` rather than being migrated on a guess.
12. Precision-preserving response parsing: unsafe integer literals are quoted
    before `JSON.parse`, so chain amounts are never silently rounded in transit.

Planned/required controls:

1. Remove secret-bearing logs in all SDK runtime paths.
2. Escape and validate deploy interpolation inputs.
3. Strengthen address checksum validation.
4. Enforce safer signing boundaries to avoid raw key exposure.
5. Align crypto docs and runtime profile with versioned migration notes.

## 8. Residual Risk

Even with encryption-at-rest, browser XSS remains a major risk vector for wallet SDK consumers.  
An active signing session widens this window: while unlocked, the decrypted secret is reachable in memory, so integrators should keep `autoLockMs` conservative (or use `every-signature`) for high-risk contexts.  
Security posture depends on both SDK controls and host-app hardening (CSP, trusted rendering, extension awareness).
