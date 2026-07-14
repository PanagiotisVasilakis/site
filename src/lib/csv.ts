const FORMULA_PREFIX = /^[=+\-@]/;

/** Encode an untrusted value as a single CSV field, including spreadsheet-formula neutralization. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(',')}\n`;
}
