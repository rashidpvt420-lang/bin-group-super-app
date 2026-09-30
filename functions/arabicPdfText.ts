// N-04: Arabic text preparation for PDFKit.
//
// PDFKit lays each space-delimited word out separately through fontkit. For an Arabic word fontkit
// applies the font's own Arabic shaping (init/medi/fina, lam-alef ligatures) and reverses that
// word's glyphs, so a single Arabic word renders correctly from logical text. What PDFKit does not
// do is bidi at the line level: words are placed left-to-right in the order given, and the old code
// reversed whole strings, turning "13" into "31" and scrambling Latin runs.
//
// This module therefore works at word level for a right-to-left paragraph:
//   - words containing Arabic (and neutral separators between them) form RTL runs whose word
//     order is reversed for display;
//   - Latin / number words ("13", "2026-09-29", "AED", "1,500.00") keep their left-to-right order,
//     and their characters are never reversed;
//   - characters inside Arabic words stay in logical order (fontkit shapes and orders them).
// layoutBidiText() wraps long paragraphs on logical word order first (so the opening words of the
// sentence appear on the first printed line) and positions each word individually.

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const STRONG_RTL = /[\u0590-\u05FF\u0600-\u065F\u066A-\u06EF\u06FA-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_OR_NUMBER = /[A-Za-z0-9\u00C0-\u024F\u0660-\u0669\u06F0-\u06F9]/;

export function isArabic(text: string): boolean {
  return ARABIC.test(String(text || ""));
}

type Direction = "R" | "L" | "N";
const wordDirection = (word: string): Direction =>
  STRONG_RTL.test(word) ? "R" : LTR_OR_NUMBER.test(word) ? "L" : "N";

/** Reorder the words of one RTL line from logical to display (left-to-right) order. */
export function logicalToVisualRtl(text: string): string {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const dirs = words.map(wordDirection);
  // Neutral words (e.g. "-", "/", ":") between two LTR words join that LTR run; otherwise RTL.
  for (let i = 0; i < dirs.length; i += 1) {
    if (dirs[i] !== "N") continue;
    let j = i;
    while (j < dirs.length && dirs[j] === "N") j += 1;
    const prev = i > 0 ? dirs[i - 1] : null;
    const next = j < dirs.length ? dirs[j] : null;
    const resolved: Direction = prev === "L" && next === "L" ? "L" : "R";
    for (let k = i; k < j; k += 1) dirs[k] = resolved;
    i = j - 1;
  }
  const runs: { dir: Direction; words: string[] }[] = [];
  words.forEach((word, index) => {
    const last = runs[runs.length - 1];
    if (last && last.dir === dirs[index]) last.words.push(word);
    else runs.push({ dir: dirs[index], words: [word] });
  });
  return runs
    .reverse()
    .map((run) => (run.dir === "L" ? run.words : [...run.words].reverse()).join(" "))
    .join(" ");
}

/** Prepare a single-line Arabic (RTL) string for PDFKit. Non-Arabic text is returned unchanged. */
export function toVisualArabic(text: string): string {
  const value = String(text ?? "");
  return isArabic(value) ? logicalToVisualRtl(value) : value;
}

/** Bilingual labels such as "Owner / المالك": only the Arabic parts are reordered. */
export function toVisualBilingual(text: string): string {
  if (!text) return text;
  const value = String(text);
  for (const separator of [" / ", " : "]) {
    if (value.includes(separator)) {
      return value.split(separator).map((part) => (isArabic(part) ? toVisualArabic(part) : part)).join(separator);
    }
  }
  return toVisualArabic(value);
}

export type BidiToken = { text: string; x: number; width: number };
export type BidiLine = { tokens: BidiToken[]; width: number };

/** Words of one line in display (left-to-right) order. Base direction is RTL when the text starts with Arabic. */
export function displayWords(text: string): string[] {
  const value = String(text ?? "").trim();
  if (!value) return [];
  if (!isArabic(value)) return value.split(/\s+/);
  const firstStrong = value.split(/\s+/).map(wordDirection).find((dir) => dir !== "N");
  if (firstStrong === "R") return logicalToVisualRtl(value).split(" ");
  // LTR base (e.g. "Owner / المالك"): keep run order, reverse word order inside Arabic runs.
  const words = value.split(/\s+/);
  const out: string[] = [];
  let arabicRun: string[] = [];
  const flush = () => { out.push(...arabicRun.reverse()); arabicRun = []; };
  const NUMERIC = /^[\p{N}\p{P}\p{S}]+$/u;
  words.forEach((word, index) => {
    if (wordDirection(word) === "R") { arabicRun.push(word); return; }
    // Numbers / neutrals between Arabic words stay inside the RTL run (UBA W2/N1), e.g. "لمدة 13 شهراً".
    const nextStrong = words.slice(index + 1).map(wordDirection).find((dir, k) => dir === "R" || !NUMERIC.test(words[index + 1 + k]));
    if (arabicRun.length && NUMERIC.test(word) && nextStrong === "R") { arabicRun.push(word); return; }
    flush();
    out.push(word);
  });
  flush();
  return out;
}

/**
 * Lay out bilingual / RTL text into lines of individually positioned words.
 * Each word is drawn on its own, so PDFKit/fontkit shape one Arabic word at a time (correct
 * joining and glyph order) while this function owns word order, spacing, wrapping and alignment.
 */
export function layoutBidiText(
  text: string,
  opts: { maxWidth: number; measure: (word: string) => number; spaceWidth: number; align?: "left" | "right" | "center" },
): BidiLine[] {
  const logicalWords = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const lineWidth = (line: string) => {
    const words = displayWords(line);
    return words.reduce((sum, word) => sum + opts.measure(word), 0) + Math.max(0, words.length - 1) * opts.spaceWidth;
  };
  for (const word of logicalWords) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && lineWidth(candidate) > opts.maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const align = opts.align || (isArabic(text) && displayWords(text).length && wordDirection(String(text).trim().split(/\s+/)[0]) === "R" ? "right" : "left");
  return lines.map((line) => {
    const words = displayWords(line);
    const width = lineWidth(line);
    let x = align === "right" ? opts.maxWidth - width : align === "center" ? (opts.maxWidth - width) / 2 : 0;
    const tokens = words.map((word) => {
      const token = { text: word, x, width: opts.measure(word) };
      x += token.width + opts.spaceWidth;
      return token;
    });
    return { tokens, width };
  });
}
