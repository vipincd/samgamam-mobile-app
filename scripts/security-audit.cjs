const {spawnSync} = require("node:child_process");

const EXCEPTION_EXPIRY = new Date("2026-11-15T00:00:00Z");
const ALLOWED_HIGH_GHSAS = new Map([
  [
    "GHSA-5P2G-FCMC-QVQQ",
    {
      packageName: "image-size",
      reason: "JXL/HEIF infinite-loop DoS; no patched npm release exists as of 2026-10-02",
    },
  ],
  [
    "GHSA-W3RX-R6R6-PGPR",
    {
      packageName: "image-size",
      reason: "ICNS infinite-loop DoS; advertised 2.0.3 patch is not published as of 2026-10-02",
    },
  ],
  [
    "GHSA-86W9-CPQP-85RV",
    {
      packageName: "node-forge",
      reason: "RSA verifier issue in Expo build/certificate tooling; no patched node-forge release exists as of 2026-10-02 and Samgamam runtime code does not import this tooling",
    },
  ],
]);

function extractGhsa(value) {
  const match = String(value ?? "").match(/GHSA-[0-9A-Za-z-]+/i);
  return match ? match[0].toUpperCase() : null;
}

function collectAdvisories(auditJson) {
  const advisories = [];
  for (const vulnerability of Object.values(auditJson.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (!via || typeof via !== "object") continue;
      const ghsa = extractGhsa(via.url) || extractGhsa(via.title) || extractGhsa(via.source);
      advisories.push({
        packageName: via.name || vulnerability.name || "unknown",
        severity: String(via.severity || vulnerability.severity || "").toLowerCase(),
        ghsa,
        title: via.title || "",
        url: via.url || "",
      });
    }
  }
  return advisories;
}

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 20 * 1024 * 1024,
});

let audit;
try {
  audit = JSON.parse(result.stdout || "{}");
} catch (error) {
  console.error("Unable to parse npm audit JSON.");
  console.error(result.stderr || error);
  process.exit(1);
}

const advisories = collectAdvisories(audit);
const highOrCritical = advisories.filter((item) =>
  item.severity === "high" || item.severity === "critical",
);

const now = new Date();
if (highOrCritical.length > 0 && now >= EXCEPTION_EXPIRY) {
  console.error(
    `Mobile dependency audit exceptions expired on ${EXCEPTION_EXPIRY.toISOString()}. Review upstream fixes before extending.`,
  );
  process.exit(1);
}

const rejected = [];
const accepted = [];

for (const advisory of highOrCritical) {
  const exception = advisory.ghsa ? ALLOWED_HIGH_GHSAS.get(advisory.ghsa) : null;
  if (exception && exception.packageName === advisory.packageName) {
    accepted.push(advisory);
    continue;
  }
  rejected.push(advisory);
}

if (rejected.length > 0) {
  console.error("High/critical npm advisories outside the approved mobile exception set:");
  for (const advisory of rejected) {
    console.error(
      `- ${advisory.packageName}: ${advisory.ghsa || advisory.title || advisory.url || "unknown advisory"} (${advisory.severity})`,
    );
  }
  process.exit(1);
}

const uniqueAccepted = new Map(
  accepted.map((item) => [item.ghsa, item]),
);
for (const [ghsa, advisory] of uniqueAccepted) {
  console.warn(
    `Accepted temporary mobile build-tool exception: ${ghsa} (${advisory.packageName}) — ${ALLOWED_HIGH_GHSAS.get(ghsa)?.reason}. Expires ${EXCEPTION_EXPIRY.toISOString()}.`,
  );
}

const metadata = audit.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit gate passed. critical=${metadata.critical ?? 0}, high=${metadata.high ?? 0}, moderate=${metadata.moderate ?? 0}, low=${metadata.low ?? 0}. High/critical direct advisories are either absent or explicitly time-bounded above.`,
);
