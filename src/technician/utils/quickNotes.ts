/** Stored note text stays in English so operations/admin can read it; chips show the technician's language. */
export const QUICK_NOTE_PHRASES: ReadonlyArray<{ key: string; en: string }> = [
  { key: 'tech.job.q.fixed', en: 'Fixed the fault' },
  { key: 'tech.job.q.replaced', en: 'Replaced a part' },
  { key: 'tech.job.q.cleaned', en: 'Cleaned and tested' },
  { key: 'tech.job.q.followup', en: 'Needs a follow-up visit' },
];
export const NO_PARTS_TEXT = 'No parts used';

export function appendPhrase(current: string, phrase: string): string {
  const base = current.trim();
  if (!base) return `${phrase}.`;
  if (base.includes(phrase)) return base;
  return `${base.replace(/[.\s]*$/, '')}. ${phrase}.`;
}
