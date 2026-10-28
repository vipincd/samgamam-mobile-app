import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

function imageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? imageFiles(path) : [path];
  }).filter((path) => /\.(png|jpe?g)$/i.test(path));
}

describe('Android image resource compatibility', () => {
  const root = join(__dirname, 'assets');

  test.each(imageFiles(root).map((path) => [relative(root, path), path]))(
    '%s has file contents matching its extension',
    (_name, path) => {
      const bytes = readFileSync(path);
      const signature = extname(path).toLowerCase() === '.png'
        ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : Buffer.from([0xff, 0xd8, 0xff]);

      // Metro accepts a mislabeled JPEG, but Android AAPT rejects it as a PNG.
      expect(bytes.subarray(0, signature.length)).toEqual(signature);
    },
  );
});
