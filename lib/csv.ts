/**
 * CSV export for the log pages.
 */

export interface CsvColumn<T> {
  key: keyof T & string;
  label: string;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T extends object>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const header = columns.map((column) => escapeCell(column.label)).join(",");
  const body = rows.map((row) =>
    columns
      .map((column) =>
        escapeCell((row as Record<string, unknown>)[column.key]),
      )
      .join(","),
  );
  return [header, ...body].join("\r\n");
}
