# Security Improvement Plan: asi-chain-wallet-sdk

Date: 2026-03-19  
Input baseline: `security-review.md`  
Target branch for execution: `development`

## 1. Plan Goals

1. Eliminate high-impact key exposure paths.
2. Prevent deploy-construction injection classes.
3. Establish trustworthy validation and crypto documentation.
4. Add security governance artifacts for open-source readiness.
5. Add repeatable release gates so regressions are blocked automatically.

## 2. Priority Workstreams

## WS-1: Secret-Handling and Logging Elimination

Priority: P0 (Immediate)

Tasks:

1. Remove decrypted key logging in `src/domains/Wallet/index.ts`.
2. Remove or gate all sensitive logs in SDK runtime paths:
   - wallet decrypt outputs
   - signed deploy payload logging
3. Remove mnemonic logging in playground.
4. Add lint or static check to block `console.*` in sensitive SDK paths.

Acceptance criteria:

1. No plaintext key/mnemonic output in SDK runtime logs.
2. CI fails on newly introduced secret logs.
3. Manual transfer/decrypt flow shows no secret material in console.

## WS-2: Deploy Construction Hardening

Priority: P0 (Immediate)

Tasks:

1. Introduce centralized `escapeRholangString()` helper.
2. Refactor deploy factories to use escaped values only.
3. Validate method inputs at service boundaries (address + amount constraints).
4. Add negative tests with injection-like payloads.

Acceptance criteria:

1. Fuzz-style payload tests pass and do not alter deploy template structure.
2. Invalid values are rejected before deploy assembly.
3. Security regression tests run in CI.

## WS-3: Address and Input Validation Upgrade

Priority: P1

Tasks:

1. Replace format-only address checks with decode + checksum verification.
2. Enforce canonical address representations.
3. Add validation error taxonomy and test coverage for bad inputs.

Acceptance criteria:

1. Invalid checksums fail validation.
2. Existing valid addresses pass.
3. Transfer and balance APIs reject invalid addresses deterministically.

## WS-4: Key-Boundary Refactor (Capability-Based Signing)

Priority: P1

Tasks:

1. Introduce signing session/capability interface:
   - no direct raw key return to caller.
2. Deprecate public `wallet.decrypt()` raw-key exposure path.
3. Keep key bytes scoped to signer internals and zeroize buffers after signing.
4. Update playground and SDK call sites.

Acceptance criteria:

1. Public API no longer requires consumers to handle raw private key bytes.
2. Sign flow still supports current wallet operations.
3. Memory handling test validates post-sign buffer zeroization.

## WS-5: Crypto Profile and Doc Alignment

Priority: P1

Tasks:

1. Define and publish crypto profile:
   - KDF function and iteration policy
   - cipher mode and IV policy
   - format versioning and migration notes
2. Align README/docs with implementation:
   - remove stale `crypto-js` references
   - correct iteration count statements
3. Evaluate raising KDF cost and add migration path if changed.

Acceptance criteria:

1. README and docs match code exactly.
2. Versioned migration notes exist for encrypted payloads.
3. Security review can trace claims directly to implementation.

## WS-6: Recovery and Wallet UX Safety Fixes

Priority: P1

Tasks:

1. Fix `createWalletFromMnemonic()` output to always return generated mnemonic.
2. Add tests ensuring recoverability information is not lost.
3. Add explicit warnings/errors for missing recovery data.

Acceptance criteria:

1. Generated mnemonic is always returned in method output.
2. Regression tests cover generated and supplied mnemonic paths.

## WS-7: Security Governance and Open-Source Readiness

Priority: P1

Tasks:

1. Add `SECURITY.md`:
   - vulnerability reporting channel
   - supported versions
   - response SLA
2. Add `THREAT_MODEL.md`:
   - browser XSS
   - extension compromise
   - dependency compromise
   - replay/integrity assumptions
3. Add `SECURITY_INVARIANTS.md`:
   - key handling guarantees
   - storage guarantees
   - signing guarantees

Acceptance criteria:

1. Governance docs exist and are linked from README.
2. Security assumptions and non-goals are explicit.
3. External reviewers can evaluate threat boundaries without guesswork.

## 3. Timeline and Milestones

## Milestone M1 (0-3 days)

Scope:

1. WS-1 complete.
2. WS-2 partial implementation started with tests.

Release gate:

1. No plaintext secret logging.
2. Injection tests added for deploy factory.

## Milestone M2 (4-10 days)

Scope:

1. WS-2 complete.
2. WS-3 complete.
3. WS-6 complete.

Release gate:

1. Address checksum validation enforced in runtime APIs.
2. Mnemonic return bug resolved with tests.

## Milestone M3 (11-20 days)

Scope:

1. WS-4 complete.
2. WS-5 complete.
3. WS-7 complete.

Release gate:

1. Capability-based signing exposed as primary API.
2. Docs and crypto profile aligned.
3. Security governance docs published.

## 4. Ownership Model

Recommended role assignment:

1. Crypto/Key handling owner: senior SDK engineer.
2. Deploy and validation owner: protocol integration engineer.
3. Governance/docs owner: security engineer or tech lead.
4. CI/security testing owner: DevSecOps or release engineer.

## 5. Engineering Release Gates (Must Pass)

Before public release or major version publish, require all of:

1. `npm run build` passes.
2. Security test suite passes (validation + deploy escaping + key handling).
3. `npm audit --omit=dev` clean (or documented exceptions with owner and expiry).
4. No secret-bearing logs in SDK runtime paths.
5. `SECURITY.md` and threat model are present and linked.

## 6. Immediate Action List (Start Now)

1. Remove `console.log("decrypted", ...)` from `Wallet.decrypt`.
2. Remove mnemonic and signed-deploy verbose logs from runtime paths.
3. Implement deploy-string escaping helper and add tests.
4. Fix `createWalletFromMnemonic` return value bug.
5. Open PR for security docs (`SECURITY.md`, `THREAT_MODEL.md`).

---

This plan is designed to convert current progress into a defensible open-source security posture with measurable completion criteria.
