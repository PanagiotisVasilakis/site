import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareStandalone } from '../prepare-standalone.mjs';

describe('prepareStandalone', () => {
  it('replaces stale public/static trees and creates the image cache path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-standalone-'));
    try {
      const standalone = path.join(root, '.next', 'standalone');
      fs.mkdirSync(path.join(root, '.next', 'static'), { recursive: true });
      fs.mkdirSync(path.join(standalone, '.next', 'static'), { recursive: true });
      fs.mkdirSync(path.join(root, 'public'), { recursive: true });
      fs.mkdirSync(path.join(standalone, 'public'), { recursive: true });
      fs.writeFileSync(path.join(standalone, 'server.js'), 'export {};');
      fs.writeFileSync(path.join(root, '.next', 'static', 'current.js'), 'current');
      fs.writeFileSync(path.join(standalone, '.next', 'static', 'stale.js'), 'stale');
      fs.writeFileSync(path.join(root, 'public', 'current.txt'), 'current');
      fs.writeFileSync(path.join(standalone, 'public', 'stale.txt'), 'stale');

      prepareStandalone(root);

      expect(fs.existsSync(path.join(standalone, '.next', 'static', 'current.js'))).toBe(true);
      expect(fs.existsSync(path.join(standalone, '.next', 'static', 'stale.js'))).toBe(false);
      expect(fs.existsSync(path.join(standalone, 'public', 'current.txt'))).toBe(true);
      expect(fs.existsSync(path.join(standalone, 'public', 'stale.txt'))).toBe(false);
      expect(fs.existsSync(path.join(standalone, '.next', 'cache', 'images'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
