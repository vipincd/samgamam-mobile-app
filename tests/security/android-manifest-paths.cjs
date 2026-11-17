const { existsSync } = require('node:fs');
const { join } = require('node:path');

const RELEASE_MANIFEST_PATHS = [
  'android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml',
  'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
];

function findMergedReleaseManifest(projectRoot) {
  return RELEASE_MANIFEST_PATHS.map((relativePath) => join(projectRoot, relativePath)).find(
    existsSync,
  );
}

module.exports = { findMergedReleaseManifest };
