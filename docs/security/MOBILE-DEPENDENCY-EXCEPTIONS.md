# Mobile Dependency Security Status

**Reviewed:** 2026-11-16
**Toolchain:** Expo SDK 58 / React Native 0.88

## Policy and current status

The security gate rejects every high- or critical-severity npm advisory. There
are **no active exceptions or advisory allowlists**. The temporary Zod exception
expired on 2026-11-15 and was removed; Expo 58.0.25+ no longer resolves the
affected Zod 3 advisory in this dependency tree.

The clean-install audit snapshot on 2026-11-16 reported **0 critical and 0
high** findings. The remaining moderate findings are reported by npm as
`GHSA-3g3m-2fjr-6pw4` (`glob`) and `GHSA-g3hv-75wg-m249` (`minimatch`), in
transitive build/test dependencies. They are not waived by the gate. CI runs
the audit against the lockfile at the exact PR head, so the current result must
be rechecked there before merge. npm's proposed remediations require major
toolchain changes (including an Expo downgrade for the `minimatch` advisory);
no unverified override was forced into the SDK 58 dependency graph.

## Previously remediated findings

| Advisory | Package | Resolution |
| --- | --- | --- |
| `GHSA-mrhx-c7xc-m3w5` (high) | `zod` | Removed the expired exception after upgrading Expo to 58.0.25+; no active exception remains. |
| `GHSA-86w9-cpqp-85rv` (high) | `node-forge` | Updated to 1.4.2; exception removed. |
| `GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr` (high) | `image-size` | No longer present in the Expo SDK 58 dependency tree. |
| `GHSA-6pq8-jhm2-2vcw` (moderate) | `qs` | Updated to 6.17.0. |

Metro is not overridden: Expo SDK 58 resolves Metro 0.87.1 while React Native
0.88.1's community CLI resolves Metro 0.87.3 through its own supported path.
`npm ls metro @expo/metro --all` and `npx expo install --check` passed after a
clean `npm ci`.
