export type EmphasisPart = { text: string; strong: boolean };

/** Split chat text on **bold** and __bold__ so the UI can render emphasis instead of the markers. */
export function splitInlineEmphasis(input: string): EmphasisPart[] {
  const text = String(input ?? '');
  const parts: EmphasisPart[] = [];
  const pattern = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), strong: false });
    const strong = match[1] ?? match[2] ?? '';
    if (strong) parts.push({ text: strong, strong: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false });
  if (!parts.length) parts.push({ text, strong: false });
  return parts;
}
