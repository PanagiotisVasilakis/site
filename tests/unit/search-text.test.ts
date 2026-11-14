import { describe, expect, it } from 'vitest';

import { filterBySearchText } from '@/lib/searchText';

describe('search text normalisation', () => {
  it.each([
    ['ΜΟΥΣΕΙΟ', 'Μουσείο'],
    ['οδοσ', 'Οδός'],
    ['προιοντα', 'Προϊόντα'],
  ])('finds %s in %s', (query, text) => {
    expect(filterBySearchText([{ name: text }], query)).toEqual([{ name: text }]);
  });

  it('matches every field and returns all items for an empty query', () => {
    const items = [{ name: 'Αρχαιολογικό Μουσείο' }, { name: 'Beach', summary: 'Παραλία' }, { description: 'Κάστρο' }];

    expect(filterBySearchText(items, 'ΠΑΡΑΛΙΑ')).toEqual([items[1]]);
    expect(filterBySearchText(items, '  ')).toEqual(items);
  });
});
