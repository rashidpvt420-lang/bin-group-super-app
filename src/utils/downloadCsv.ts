/**
 * Download rows that are already on screen as a CSV file. Client-side only: no server call,
 * no extra data access. Cells are quoted, and a leading = + - @ is escaped so spreadsheet
 * apps do not treat the value as a formula.
 */
export type CsvCell = string | number | boolean | null | undefined;

const escapeCell = (value: CsvCell) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (header: string[], rows: CsvCell[][]) =>
  [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');

export function downloadCsv(fileName: string, header: string[], rows: CsvCell[][]) {
  const blob = new Blob([`\uFEFF${toCsv(header, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
