export type RentRow = { dueDate: string; amount: string; chequeNumber: string };

/** Split an annual rent into N cheques, spaced evenly from the first due date. Pure, exported for tests. */
export function splitAnnualRent(annualRent: number, cheques: number, firstDueDate: string): RentRow[] {
  if (!(annualRent > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) || ![1, 2, 3, 4, 6, 12].includes(cheques)) return [];
  const totalFils = Math.round(annualRent * 100);
  const base = Math.floor(totalFils / cheques);
  const [y, m, d] = firstDueDate.split('-').map(Number);
  return Array.from({ length: cheques }, (_, i) => {
    const monthIndex = m - 1 + (12 / cheques) * i;
    const lastDay = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
    const date = new Date(Date.UTC(y, monthIndex, Math.min(d, lastDay)));
    const fils = i === cheques - 1 ? totalFils - base * (cheques - 1) : base;
    return { dueDate: date.toISOString().slice(0, 10), amount: (fils / 100).toFixed(2), chequeNumber: '' };
  });
}

