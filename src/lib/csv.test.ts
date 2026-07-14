import { describe, expect, it } from 'vitest';

import { csvCell, csvRow } from './csv';

describe('CSV encoding', () => {
  it('escapes quotes and preserves line boundaries inside a quoted cell', () => {
    expect(csvCell('one,"two"')).toBe('"one,""two"""');
    expect(csvRow(['a', 'b'])).toBe('"a","b"\n');
  });

  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])(
    'neutralizes spreadsheet formula prefix %s',
    (value) => expect(csvCell(value)).toBe(`"'${value}"`),
  );
});
