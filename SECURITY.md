# Security Policy

## Supported Versions

Security fixes are currently provided for:

1. Latest `development` branch.
2. Latest release on the default branch (`main`) after publish.

Older snapshots may not receive patches.

## Reporting a Vulnerability

Please report vulnerabilities privately and include:

1. Affected version/commit hash.
2. Reproduction steps or proof of concept.
3. Impact assessment (confidentiality, integrity, availability).
4. Suggested remediation if available.

Do not open public issues for unpatched vulnerabilities.

## Disclosure Process

Target process:

1. Acknowledge report within 3 business days.
2. Triage and severity assignment within 7 business days.
3. Fix and coordinated disclosure timeline based on severity.
4. Security advisory published after patch availability.

## Scope

In scope:

1. SDK source under `src/`.
2. Build and release artifacts produced from this repository.
3. Security-sensitive storage/signing flows in SDK runtime.

Lower-priority scope:

1. Playground-only UX defects that do not impact SDK security guarantees.

## Security Expectations for Integrators

This SDK is intended for hostile browser environments. Integrators should:

1. Enforce CSP and XSS defenses.
2. Avoid exposing secrets in logs, telemetry, and analytics.
3. Use HTTPS endpoints for node communication.
4. Require strong user passwords and safe account recovery workflows.

## Current Security Roadmap

Tracked in:

1. `security-review.md`
2. `security-improvement-plan.md`
3. `THREAT_MODEL.md`
