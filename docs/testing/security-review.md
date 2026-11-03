# Phase 9 dependency security review — 2026-11-03

The raw npm audit contains 74 affected dependency entries (transitive propagation included): 0 critical, 1 high, 68 moderate, 5 low. The exception-aware gate passes; the raw audit exits 1. This is not a clean security audit.

## High severity exceptions

Metro 0.83.3 depends on image-size 1.2.1 and calls its default callable export. The published 2.0.4 API uses a named `imageSize` export. A forced major override is not safe without a compatible Metro change. Both existing image-size exceptions expire 2026-11-15; the deadline was not extended. Only trusted, reviewed repository image assets may enter the build pipeline. Untrusted image ingestion remains unsafe.

node-forge is already 1.4.2 in the lockfile and no longer appears in the current audit. Its obsolete exception was removed.

## Remaining advisory inventory

- deepmerge (low): [deepmerge mergeObject() allows prototype poisoning of returned objects](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
- fast-uri (moderate): [fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding](https://github.com/advisories/GHSA-w74x-v6f9-j3xg).
- fast-uri (low): [fast-uri vulnerable to improper path equivalence in relative reference normalization](https://github.com/advisories/GHSA-xhq7-xmqj-769h).
- fast-uri (moderate): [fast-uri vulnerable to host confusion via unchecked WHATWG host canonicalization](https://github.com/advisories/GHSA-wjr9-j795-jxcr).
- fast-uri (low): [fast-uri vulnerable to scheme injection via an unescaped first-segment colon in suffix references](https://github.com/advisories/GHSA-333x-w4r6-6crp).
- glob (moderate): [Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
- image-size (high): [image-size: JXL and HEIF parsers allow denial of service through infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
- image-size (high): [image-size: ICNS parser allows denial of service through an infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr).
- minimatch (moderate): [minimatch has potential denial of service via globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).

Moderate/low findings remain in schema/URI parsing, glob matching/traversal and test/build configuration merging. They are reported risks, not silently allowlisted high-severity findings. Revisit compatible Expo/Metro/Jest/ESLint dependency updates before release; do not feed untrusted schemas, globs or build configuration to these tools. The existing gate rejects unknown high/critical advisories and invalid/incomplete registry responses.

Evidence: `evidence/phase-9/continuation/audit.log`, `security-final.log`, and `image-size-upstream.txt`. Registry checks found image-size 2.0.4, latest 1.x 1.2.1, and node-forge 1.4.2. Audit metadata changed between registry requests (55 then 68 moderate); the final recorded review uses 68.
