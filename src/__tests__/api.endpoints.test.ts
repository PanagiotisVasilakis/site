// Vitest globals are enabled; no named imports needed.
import { GET as getCategories } from '../app/api/categories/route';
import { GET as getCategoryItems } from '../app/api/categories/[category]/items/route';
import { GET as getItem } from '../app/api/categories/[category]/items/[slug]/route';
import { NextRequest } from 'next/server';

// Utility helpers to call route handlers with minimal boilerplate.
const makeReq = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

describe('API endpoints (lightweight)', () => {
  it('returns categories list', async () => {
    const res = await getCategories();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.categories)).toBe(true);
    expect(json.categories.length).toBeGreaterThan(0);
    const cat = json.categories[0];
    expect(cat).toHaveProperty('id');
    expect(cat).toHaveProperty('slug');
    expect(cat).toHaveProperty('title');
    expect(cat).toHaveProperty('count');
  });

  it('returns items for a category', async () => {
    const res = await getCategoryItems(makeReq('/api/categories/phones/items'), { params: Promise.resolve({ category: 'phones' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBeGreaterThan(0);
    const item = json.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('slug');
    expect(item).toHaveProperty('name');
  });

  it('returns a single item detail', async () => {
    const slug = 'kalamata-police-station';
    const res = await getItem(makeReq(`/api/categories/phones/items/${slug}`), { params: Promise.resolve({ category: 'phones', slug }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.slug).toBe(slug);
  });

  it('404 for missing item', async () => {
    const res = await getItem(makeReq('/api/categories/phones/items/__nope__'), { params: Promise.resolve({ category: 'phones', slug: '__nope__' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('not_found');
  });
});
