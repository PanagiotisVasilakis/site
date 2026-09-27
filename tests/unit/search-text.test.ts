import { describe, expect, it } from 'vitest';

import { getItemsByCategory, pickLocale } from '@/lib/data';
import { filterBySearchText } from '@/lib/searchText';

describe('search text normalisation', () => {
  it.each([
    ['ΜΟΥΣΕΙΟ', 'Μουσείο'],
    ['μουσειο', 'Μουσείο'],
    ['ΟΔΟΣ', 'οδός'],
    ['οδοσ', 'Οδός'],
    ['προιοντα', 'Προϊόντα'],
    ['cafe', 'Café'],
  ])('finds %s in %s', (query, text) => {
    expect(filterBySearchText([{ name: text }], query)).toEqual([{ name: text }]);
  });

  it('matches every field and returns all items for an empty query', () => {
    const items = [{ name: 'Αρχαιολογικό Μουσείο' }, { name: 'Beach', summary: 'Παραλία' }, { description: 'Κάστρο' }];

    expect(filterBySearchText(items, 'ΠΑΡΑΛΙΑ')).toEqual([items[1]]);
    expect(filterBySearchText(items, '  ')).toEqual(items);
  });
});

describe('Greek moments search on the real content', () => {
  const elMoments = getItemsByCategory('moments').map((item) => ({
    name: pickLocale(item, 'name', 'el') ?? item.name,
    summary: pickLocale(item, 'summary', 'el') ?? item.summary,
    description: pickLocale(item, 'description', 'el') ?? item.description,
  }));

  it('finds the museums whether the guest types accents, capitals or neither', () => {
    const accented = filterBySearchText(elMoments, 'μουσείο');

    expect(accented.length).toBeGreaterThan(0);
    expect(filterBySearchText(elMoments, 'ΜΟΥΣΕΙΟ')).toEqual(accented);
    expect(filterBySearchText(elMoments, 'μουσειο')).toEqual(accented);
  });
});
