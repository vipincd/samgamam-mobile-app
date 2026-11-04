# Phase 9 dependency security review — 2026-11-04

The `image-size` exception has been **removed**, not extended. Metro and its companion packages
were upgraded together from 0.83.3 to 0.83.8 using exact patch-series overrides. Expo 54 remains
unchanged. Metro 0.83.8 uses its own image-dimension parser and no longer depends on `image-size`.
No incompatible `image-size` 2.x override was introduced.

The published Metro package was inspected, and compatibility was verified with actual Samgamam
JPEG/PNG asset tests, malformed-image rejection, Expo Doctor, unit tests, and both bundled native
builds. The full UI regressions and GitHub CI verification are recorded in the acceptance report.

The prior exceptions covered [JXL/HEIF denial of service](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
and [ICNS denial of service](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), previously due to expire
November 15, 2026. The affected dependency is absent from the updated lockfile. No remaining
high/critical exception is permitted by `scripts/security-audit.cjs`.

Fresh npm audit: **0 critical, 0 high, 68 moderate, 5 low** (73 affected dependency entries;
transitive propagation included). Raw npm audit still exits 1. The high/critical gate passes.
Moderate/low findings in deepmerge, fast-uri, glob and minimatch remain in build/test dependency
chains. Do not interpret the gate as a vulnerability-free dependency tree. Avoid untrusted build
configuration, schemas and globs, and review compatible upstream updates before production release.
The previously updated node-forge remains outside the current advisory set.

Source: [Metro 0.83.8 package](https://www.npmjs.com/package/metro/v/0.83.8),
[upstream source](https://github.com/react/metro/tree/v0.83.8/packages/metro).
Raw registry/audit output is retained locally under `artifacts/ci-investigation/`; CI runs repeat
the gate against their installed lockfile. Counts can change with registry advisory updates.
