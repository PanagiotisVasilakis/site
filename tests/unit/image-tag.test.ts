import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (command: string, args: string[]) => execFileSync(command, args, { encoding: 'utf8' }).trim();

describe('docker image tag', () => {
  it('names the image after the checked-out commit and marks uncommitted trees as dirty', () => {
    const tag = run('bash', ['scripts/image-tag.sh']);
    const commit = run('git', ['rev-parse', '--verify', 'HEAD']);
    const dirty = run('git', ['status', '--porcelain']) !== '';

    expect(tag).toBe(`villa-app:${commit.slice(0, 12)}${dirty ? '-dirty' : ''}`);
    expect(tag).not.toContain('latest');
  });
});
