# Mobile Dependency Security Exceptions

**Review date:** 2026-11-14 (scheduled review deadline: 2026-11-15)
**Reviewed tree:** PR #5 `agent/sg-forge/mob-01-release-hardening` (Expo SDK 54 / React Native 0.81.5)
**Previous review:** 2026-11-05 at `356542f`
**Remediation owner:** Mobile Toolchain / SG-FORGE
**Status of the 2026-11-15 deadline:** review **completed**; nothing extended (see "Deadline decision")

## Policy (as implemented on this branch)

- `scripts/security-audit.cjs` fails CI on **any** high or critical advisory. On the SDK 54 branch there is **no exception mechanism**: the script contains no allow-list, so a high/critical finding cannot be waived without a reviewed code change. (The previous version of this file said exceptions were "listed in `scripts/security-audit.cjs`"; that describes PR #2's script, not this one.)
- The gate fails closed on an incomplete or unparsable report, and (since this review) when npm counts high/critical packages that it cannot attribute to an advisory.
- Since this review, the gate also prints every advisory ID it sees. The previous review recorded only counts, so four new `node-forge` advisories (published 2026-11-10) went unnoticed.
- Moderate and low advisories do not fail CI. They are recorded below with a disposition. A passing gate is **not** evidence of compliance on its own.

## Current temporary high/critical exceptions

None. Live `npm audit` on 2026-11-14: **critical 0, high 0**.

## Advisory matrix (live, 2026-11-14)

Scope terms:
- **npm scope:** whether the package is in the tree that `npm audit --omit=dev` reports. Expo ships its CLI and config tooling as runtime `dependencies`, so build tooling counts as "prod tree" here.
- **Shipped:** whether any module from the package is in the exported Hermes bundles. Checked against the source maps of `npx expo export --platform all` for unset, `preview` and `production` `APP_ENV`. Each platform bundle has 2,778 modules, and 0 of them come from these packages.

| Package | Advisory | Severity | Path | npm scope | Shipped in app bundle | Non-breaking fix | Prior exception | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fast-uri` 3.1.8 | GHSA-w74x-v6f9-j3xg | moderate | expo-dev-client → expo-dev-launcher → ajv | prod tree | No | **Yes: 3.1.9** | Override pinned 3.1.8, a vulnerable version (advisory published 2026-10-23) | **Remediated:** override set to 3.1.9 |
| `fast-uri` 3.1.8 | GHSA-wjr9-j795-jxcr | moderate | same | prod tree | No | Yes: 3.1.9 | same | **Remediated** |
| `fast-uri` 3.1.8 | GHSA-xhq7-xmqj-769h | low | same | prod tree | No | Yes: 3.1.9 | same | **Remediated** |
| `fast-uri` 3.1.8 | GHSA-333x-w4r6-6crp | low | same | prod tree | No | Yes: 3.1.9 | same | **Remediated** |
| `node-forge` 1.4.2 | GHSA-6cv4-p8m7-4r25 | moderate | expo → @expo/cli (`^1.3.3`), @expo/code-signing-certificates | prod tree | No | **Yes: 1.4.3** (within declared range) | Recorded as "remediated" at 1.4.2; advisories published 2026-11-10 | **Remediated:** lockfile updated to 1.4.3 |
| `node-forge` 1.4.2 | GHSA-w4xr-hqv8-ch44 | moderate | same | prod tree | No | Yes: 1.4.3 | same | **Remediated** |
| `node-forge` 1.4.2 | GHSA-j8rw-jp99-435v | moderate | same | prod tree | No | Yes: 1.4.3 | same | **Remediated** |
| `node-forge` 1.4.2 | GHSA-6889-vf6x-f3g5 | low | same | prod tree | No | Yes: 1.4.3 | same | **Remediated** |
| `glob` 13.0.6 | GHSA-3g3m-2fjr-6pw4 | moderate | expo → @expo/cli (also config, config-plugins, fingerprint, metro-config) | prod tree | No | **No.** Fixed only in 14.0.2, a major version above `@expo/cli`'s range; npm's suggested fix is an Expo downgrade | Listed as "negligible" | **Accept for now (pending owner sign-off).** Runs on the build host only; patterns come from the repository |
| `minimatch` 9.0.9 / 10.2.6 / 3.1.5 | GHSA-g3hv-75wg-m249 | moderate | @expo/cli, @expo/fingerprint; eslint (dev) | prod tree | No | **No.** Fixed only in 11.0.1 (major) | Listed as "negligible" | **Accept for now (pending owner sign-off).** Build host only; patterns come from the repository |
| `deepmerge` 4.3.1 | GHSA-gcqx-w48m-w2h4 | low | expo → @expo/config; jest-config (dev) | prod tree | No | **No patched release exists** | Listed as "test-only". That was incorrect: it is also reached through `@expo/config` | **Accept for now (pending owner sign-off).** Merges the repository's own config on the build host |

After remediation, npm reports 3 unique advisories in 31 package entries (moderate 24 + low 7; npm counts every dependent package). Before remediation it reported 11 unique advisories in 34 entries (moderate 27 + low 7). The previous review recorded 26 moderate, but a live audit on this review date showed 27.

The previous version of this file listed `uuid` (moderate) as remaining. `uuid` is not reported by the live audit and has been dropped from the list.

Supply-chain check for the two updated packages: `npm audit signatures` passed for the installed tree. `fast-uri` 3.1.9 was published 2026-10-19 and `node-forge` 1.4.3 on 2026-11-04. The lockfile was regenerated by npm; only those two entries changed.

## Deadline decision (2026-11-15)

**This branch (Expo SDK 54): close the review. Do not extend.**
- There is no active high/critical exception to extend. The deadline expires with nothing waived.
- All 8 advisories with a non-breaking fix are remediated in this PR.
- The 3 remaining advisories (`glob`, `minimatch`, `deepmerge`) have no non-breaking fix and are build-host tooling only. Their status is **proposed acceptance**, and it needs explicit sign-off from the Mobile Toolchain owner. It is not self-approved by this review.
- **Proposed next review: 2026-12-15, or when PR #2 (Expo 58) merges, whichever comes first.** It must be re-approved explicitly. It must not roll forward silently.

**PR #2 (Expo SDK 58): do not extend its `zod` high exception.**
- PR #2's gate allows GHSA-mrhx-c7xc-m3w5 (`zod` < 4.6.6, high), and the allowance expires `2026-11-15T00:00:00Z`. After that time PR #2's CI fails, which is the intended fail-closed behaviour.
- `@expo/cli` 58.1.16 (pinned in PR #2's lockfile) declares `zod ^3.25.76`. **`@expo/cli` 58.1.18 and later (published 2026-10-31) declare no `zod` dependency.** That makes a patch-level update inside Expo 58 the likely non-breaking fix.
- Recommendation for the PR #2 owner: update `@expo/cli` to at least 58.1.18 through npm, re-run `npm audit`, confirm the CLI does not ship a vendored `zod` 3, and then delete the exception. A new exception is acceptable only with a documented risk decision from the owner, a reason why the patch update fails, and an expiry of no more than 14 days.

## Removal and re-evaluation criteria

1. Any high or critical advisory fails CI immediately. This branch has no waiver path.
2. Re-check `glob`, `minimatch` and `deepmerge` when Expo or Jest releases bring them inside a patched range, and at the next review date above.
3. Any advisory that shows up in the exported app bundle is treated as runtime exposure and re-triaged at its own severity, whatever its npm scope.
