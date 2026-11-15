const {spawnSync} = require("node:child_process");

// Mobile dependency audit exception expired on 2026-11-15.
// Zod advisory GHSA-MRHX-C7XC-M3W5 was resolved by upgrading Expo to 58.0.25+.
const ALLOWED_HIGH_GHSAS = new Map([]);

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

const metadata = audit.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit gate passed. critical=${metadata.critical ?? 0}, high=${metadata.high ?? 0}, moderate=${metadata.moderate ?? 0}, low=${metadata.low ?? 0}.`,
);
