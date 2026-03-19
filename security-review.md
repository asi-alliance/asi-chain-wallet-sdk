# Security Review: asi-chain-wallet-sdk

Date: 2026-03-19  
Branch reviewed: `development`  

## 1. Scope and Method

This review combines:

1. Prior concerns (open-source readiness and key-management risks).
2. Current code review of `development` branch.
3. Build and dependency checks on current branch.

Review approach:

1. Manual review of sensitive modules:
   - `src/domains/Deploy/factory`
   - `src/services/Crypto`
   - `src/domains/Wallet`
   - `src/domains/Vault`
   - `src/services/Wallets`
   - `src/utils/validators`
2. Security-sensitive playground paths for leakage patterns.
3. `npm run build` and `npm audit --omit=dev` verification.

## 2. Executive Summary

The repository has improved significantly versus the earlier snapshot:

1. `crypto-js` usage has been replaced with WebCrypto (`AES-GCM` + `PBKDF2`).
2. `elliptic`-based key path was replaced with `@noble/secp256k1`.
3. Build now passes on `development`.
4. `npm audit --omit=dev` reports zero known vulnerabilities.

However, high-impact issues remain:

1. Sensitive secret logging exists, including decrypted private key logging.
2. Deploy terms are generated using unescaped string interpolation, leaving injection risk.
3. Address validation is format-based only and does not validate checksum semantics.

Open-source readiness is therefore improved but not yet security-complete.

## 3. Mitigation Status vs Prior Concerns

| Prior concern | Status | Notes |
|---|---|---|
| `CryptoJS` usage for wallet crypto | Mitigated | WebCrypto is used in `src/services/Crypto/index.ts`. |
| Missing/unclear `Crypto` service visibility | Mitigated | `Crypto` service exists and build resolves imports. |
| `elliptic` dependency advisory | Mitigated | Dependency migrated to noble; audit now clean. |
| Raw key exposure in API | Partially mitigated | Uses `Uint8Array` now, but decrypted key still exposed and logged. |
| localStorage-based storage risk | Open | Ciphertext-at-rest exists, but XSS threat model still material. |
| No threat model / SECURITY.md | Open | No repository security governance docs found. |
| Public API boundary unclear | Open | Broad export surface still present. |

## 4. Detailed Findings

### F-01: Decrypted private key is logged
- Severity: Critical
- Status: Open
- Evidence:
  - `src/domains/Wallet/index.ts:100`
- Details:
  - `Wallet.decrypt()` logs decrypted key material (`console.log("decrypted", decrypted)`).
  - Any console capture, telemetry, extension, or shared debugging flow can leak private keys.
- Risk:
  - Immediate key compromise.
- Recommendation:
  1. Remove plaintext key logging unconditionally.
  2. Add CI linting rule to block secret logging in `src/`.

### F-02: Deploy term injection risk via unescaped interpolation
- Severity: High
- Status: Open
- Evidence:
  - `src/domains/Deploy/factory/index.ts:5`
  - `src/domains/Deploy/factory/index.ts:36`
  - `src/domains/Deploy/factory/index.ts:37`
  - `src/domains/Deploy/factory/index.ts:40`
- Details:
  - Rholang source is assembled using template-string interpolation for addresses and amount.
  - There is no central escaping/encoding layer for deploy string literals.
- Risk:
  - Malformed or crafted values can alter deploy behavior.
- Recommendation:
  1. Implement strict sanitizer/escaper for Rholang string values.
  2. Restrict method signatures to validated `Address` type and validated amounts.
  3. Add tests for injection-like payloads.

### F-03: Address validation is not checksum-aware
- Severity: Medium
- Status: Open
- Evidence:
  - `src/utils/validators/index.ts:35`
- Details:
  - Validation checks prefix/length/alphanumeric only.
  - No decode-and-verify of address payload/checksum.
- Risk:
  - Bad addresses pass validation and can cause transfer failures or user loss.
- Recommendation:
  1. Decode base58 and verify chain prefix/version/checksum.
  2. Reject non-canonical or invalid checksum addresses.

### F-04: Raw decrypted key bytes still exposed at API boundary
- Severity: Medium
- Status: Partial
- Evidence:
  - `src/domains/Wallet/index.ts:93`
  - `src/services/Signer/index.ts:21`
- Details:
  - `wallet.decrypt(password)` returns raw private key bytes.
  - Signer zeroizes in-memory buffer (`fill(0)`), which is good, but callers can still obtain key bytes directly.
- Risk:
  - Key exfiltration remains possible in integrator misuse paths.
- Recommendation:
  1. Move to capability/session-based signing API where raw key is never returned.
  2. Keep decryption internal to signer flow.

### F-05: localStorage threat remains material in browser model
- Severity: Medium
- Status: Open (architectural risk)
- Evidence:
  - `src/domains/Vault/index.ts:74`
  - `src/domains/Vault/index.ts:90`
  - `src/domains/BrowserStorage/index.ts:22`
- Details:
  - Vault and storage persist encrypted data in localStorage.
  - Encryption at rest helps, but XSS or extension compromise still elevates risk.
- Risk:
  - Theft of encrypted blobs and metadata; increased brute-force pressure.
- Recommendation:
  1. Document browser threat model clearly.
  2. Add optional hardened storage adapters where possible.
  3. Add password policy and lockout/rate-limit strategy at app layer.

### F-06: Documentation drift in crypto claims
- Severity: Low-Medium
- Status: Open
- Evidence:
  - `src/services/Crypto/index.ts:38` (100k iterations)
  - `README.md:188` (claims 200k)
  - `README.md:295` (references `crypto-js`, no longer dependency)
- Details:
  - Security docs and implementation are inconsistent.
- Risk:
  - False assumptions by users/auditors and integration errors.
- Recommendation:
  1. Align README/docs with implementation.
  2. Add versioned crypto profile section with migration notes.

### F-07: Autogenerated mnemonic is not returned consistently
- Severity: Medium
- Status: Open
- Evidence:
  - `src/services/Wallets/index.ts:48`
  - `src/services/Wallets/index.ts:68`
- Details:
  - Method generates mnemonic when omitted but returns `{ ..., mnemonic }` where `mnemonic` may be `undefined`.
- Risk:
  - Account recovery failure in consuming apps.
- Recommendation:
  1. Return `mnemonicToUse` consistently as output.
  2. Add regression tests for no-input mnemonic generation path.

### F-08: Security governance artifacts are missing
- Severity: Medium (process risk)
- Status: Open
- Evidence:
  - No `SECURITY.md` or explicit threat-model document in repository.
- Details:
  - Lacks disclosure policy, threat assumptions, and security invariants.
- Risk:
  - Slower vulnerability handling and inconsistent integrator expectations.
- Recommendation:
  1. Add `SECURITY.md` and `THREAT_MODEL.md`.
  2. Define supported versions, reporting process, and response SLAs.

## 5. Positive Security Changes Observed

1. WebCrypto migration:
   - `src/services/Crypto/index.ts`
2. Noble secp256k1 migration:
   - `src/services/KeysManager/index.ts`
   - `src/services/Signer/index.ts`
3. Vault lock now clears both wallets and seeds:
   - `src/domains/Vault/index.ts:106-108`
4. Build and packaging are functional on reviewed branch.
5. Dependency audit currently clean.

## 6. Verification Results

Commands executed during review:

1. `npm run build`  
   Result: Pass on `development`.
2. `npm audit --omit=dev --json` (temp lockfile environment)  
   Result: 0 vulnerabilities reported.

## 7. Conclusion

Current state is materially improved from the earlier snapshot and closer to open-source readiness.  
Security maturity is not yet sufficient for "secure-by-default" posture due to unresolved high-impact runtime issues (secret logging and deploy interpolation risk) plus governance/documentation gaps.

Recommended path: execute the improvement plan in `security-improvement-plan.md`, then re-run review and release-gate checks.
