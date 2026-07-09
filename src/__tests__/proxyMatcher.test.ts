import { config } from '@/proxy';

describe('proxy matcher', () => {
  it('covers application and API routes while excluding static assets', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/en')).toBe(true);
    expect(matcher.test('/api/check-in')).toBe(true);
    expect(matcher.test('/_next/static/app.js')).toBe(false);
    expect(matcher.test('/images/photo.webp')).toBe(false);
  });
});
