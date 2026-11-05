# Mobile Dependency Security Exceptions

**Date:** 2026-11-05  
**Baseline SHA:** `f5e11b4bb60ef2b7ef58d029b6b3ba4879f2cfa7`  
**Task:** `MOB-01 Mobile Release Hardening`  
**Toolchain:** Expo SDK 54 / React Native 0.81.5  
**Remediation Owner:** Mobile Toolchain / SG-FORGE  
**Review deadline:** 2026-11-15  

## Policy

Mobile CI fails on any high- or critical-severity npm advisory unless the advisory is explicitly listed in `scripts/security-audit.cjs` and the exception has not expired.

Exceptions are advisory-specific, package-specific, and time-bounded. A new advisory ID, a critical advisory, a different affected package, or an expired exception fails CI.

No exception in this file authorizes ignoring a critical advisory.

## Current temporary exceptions

| Advisory | Package | Severity | Reason for temporary exception | Compensating controls | Owner | Review deadline | Remaining release risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None | — | — | No temporary high or critical exceptions are active or required. | CI security audit gate (`scripts/security-audit.cjs`) fails closed on any high or critical advisory. | SG-FORGE | 2026-11-15 | None for high/critical. |

Current audit findings: **0 critical, 0 high, 26 moderate, 7 low** (total 33). The high/critical audit gate passes with zero active exceptions.

## Remediated and retired advisories

| Advisory | Package | Severity | Resolution and Evidence |
| --- | --- | --- | --- |
| `GHSA-5p2g-fcmc-qvqq` | `image-size` | High | Retired. Metro and companion packages pinned at `0.83.8`, removing `image-size` completely from the dependency tree. Asset dimensions and malformed asset handling verified in `tests/security/metro-assets.test.cjs`. `tests/security/audit-gate.test.cjs` verifies that any re-introduction of this advisory fails closed. |
| `GHSA-w3rx-r6r6-pgpr` | `image-size` | High | Retired. Same as above; package removed from Metro 0.83.8 dependency tree. |
| `GHSA-86w9-cpqp-85rv` | `node-forge` | High | Remediated. Updated to `node-forge` 1.4.2 via non-breaking dependency resolution. No longer reported in npm audit. |
| — | `@babel/core` | Moderate | Overridden to `7.29.6` in package.json overrides. |
| — | `fast-uri` | Moderate | Overridden to `3.1.8` in package.json overrides. |

## Remaining moderate and low advisories

The 26 moderate and 7 low advisories currently reported by npm audit fall into build-time and developer-only tooling:

1. `fast-uri` (`GHSA-w74x-v6f9-j3xg`, `GHSA-wjr9-j795-jxcr` moderate; `GHSA-xhq7-xmqj-769h`, `GHSA-333x-w4r6-6crp` low):
   - Reached through `@expo/config` and `@expo/cli` during build and configuration validation.
   - Compensating controls: Not bundled into client application code or executed at runtime on mobile devices.
   - Release risk: Negligible.

2. `glob` (`GHSA-3g3m-2fjr-6pw4` moderate) and `minimatch` (`GHSA-g3hv-75wg-m249` moderate):
   - Reached transitively through `@typescript-eslint` and developer toolchains.
   - Compensating controls: Development/build-time only; never included in the application bundle.
   - Release risk: Negligible.

3. `deepmerge` (`GHSA-gcqx-w48m-w2h4` low):
   - Reached transitively through `@jest/core` in test infrastructure.
   - Compensating controls: Test-only dependency.
   - Release risk: None.

4. `uuid` (moderate):
   - Reached through Xcode project tooling dependency (`uuid@7.0.3`).
   - Compensating controls: Build-time tooling only.
   - Release risk: Negligible.

All moderate and low findings remain monitored and will be re-evaluated during the next planned toolchain upgrade (e.g., PR #2 Expo SDK 58 / React Native 0.88 upgrade).

## Removal and re-evaluation criteria

1. If any high or critical advisory appears, CI fails immediately unless an authorized, time-bounded exception is approved.
2. Moderate and low advisories will be updated during the upcoming Expo 58 toolchain upgrade.
3. The next security exception review deadline is **2026-11-15**.
