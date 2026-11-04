const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { getAssetSize } = require('metro/private/Assets');

// Exercise the API Expo's bundler uses after the Metro patch-series remediation.
test('Metro reads the actual Samgamam JPEG and PNG assets', () => {
  assert.deepEqual(getAssetSize('jpg', readFileSync('assets/brand/community.jpg'), 'community.jpg'), { width: 1024, height: 1024 });
  assert.deepEqual(getAssetSize('png', readFileSync('assets/brand/samgamam-logo.png'), 'samgamam-logo.png'), { width: 1591, height: 347 });
});
test('Metro rejects malformed supported image assets', () => {
  assert.throws(() => getAssetSize('png', Buffer.from('not an image'), 'invalid.png'));
});
