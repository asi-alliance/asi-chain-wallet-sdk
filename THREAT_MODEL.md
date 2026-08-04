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
3. Weak or incorrect input validation (addresses, amounts).
4. Offline brute-force attempts on stolen ciphertext.
5. Recovery failure due mnemonic-handling defects.

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
