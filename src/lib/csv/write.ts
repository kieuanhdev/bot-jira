/**
 * Regex matching CSV formula triggers at the start of a cell:
 * '=', '+', '@', tab, carriage return, or '-' when NOT followed by a numeric literal.
 */
export const CSV_FORMULA_RE = /^(?:[=+@\t\r]|-(?!\d+(?:\.\d+)?$))/;

export interface ToCsvOptions {
  bom?: boolean;
  quoteStrings?: boolean;
}

/**
 * Escapes a cell value according to RFC 4180 and neutralises spreadsheet formula injection.
 */
export function escapeCsvCell(val: unknown, quoteStrings = false): string {
  if (val === null || val === undefined) {
    return quoteStrings ? '""' : "";
  }
  let str = String(val);
  if (CSV_FORMULA_RE.test(str)) {
    str = `'${str}`;
  }
  if (quoteStrings || /[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a 2D array of rows as a standard RFC 4180 CSV string with CRLF line endings.
 */
export function toCsv(rows: unknown[][], opts?: ToCsvOptions): string {
  const bomPrefix = opts?.bom ? "\uFEFF" : "";
  const quoteStrings = opts?.quoteStrings ?? false;
  const content = rows
    .map((row) => row.map((cell) => escapeCsvCell(cell, quoteStrings)).join(","))
    .join("\r\n");
  return bomPrefix + content;
}
