/**
 * Source citations and estimate labelling for Sovereign AI answers.
 *
 * The AI is advisory only. Every answer is returned with the list of sources it
 * was given, the source ids it actually cited, and a flag for any figure that is
 * not present in a cited source (treated as an estimate). Client-supplied page
 * context is always labelled as non-authoritative. This never approves anything.
 */
import { asSafeText } from "./aiSafety";

export type AiSource = {
  id: string;
  label: string;
  kind: "page-context" | "client-summary" | "rule-guidance";
  authoritative: false;
  excerpt: string;
};

export type AiCitationReport = {
  sources: AiSource[];
  citedSourceIds: string[];
  uncited: boolean;
  containsEstimate: boolean;
  unsupportedFigures: string[];
  labels: { en: string; ar: string };
};

const MAX_SOURCES = 8;

function excerptOf(value: unknown) {
  let raw = "";
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    raw = "";
  }
  return asSafeText(raw, 600);
}

export function buildAiSources(data: any): AiSource[] {
  const sources: AiSource[] = [];
  const ctx = data?.pageContext;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    for (const key of Object.keys(ctx).slice(0, MAX_SOURCES - 1)) {
      const safeKey = asSafeText(key, 60).replace(/[^\w.-]/g, "");
      if (!safeKey) continue;
      sources.push({
        id: `S${sources.length + 1}`,
        label: `Page data: ${safeKey} (shown on your screen, not verified)`,
        kind: "page-context",
        authoritative: false,
        excerpt: excerptOf(ctx[key]),
      });
    }
  }
  const summary = asSafeText(data?.fallbackSummary, 600);
  if (summary && sources.length < MAX_SOURCES) {
    sources.push({
      id: `S${sources.length + 1}`,
      label: "Screen summary (client-supplied, not verified)",
      kind: "client-summary",
      authoritative: false,
      excerpt: summary,
    });
  }
  return sources;
}

export function citationPromptBlock(sources: AiSource[]) {
  const list = sources.length
    ? sources.map((s) => `[${s.id}] ${s.label}`).join("\n")
    : "(no sources supplied)";
  return [
    `Sources you may cite:\n${list}`,
    "Cite the source id in square brackets (e.g. [S1]) after every factual statement taken from a source.",
    "If a number, date, amount, or duration is not stated in a source, prefix it with \"Estimate:\" and do not present it as fact.",
    "If no source supports an answer, say that the authoritative record must be checked.",
  ].join("\n");
}

const FIGURE_RE = /(?:AED\s*)?\d[\d,]*(?:\.\d+)?\s*%?/gi;
const ESTIMATE_RE = /\b(estimate[sd]?|approx(?:imately)?|roughly|around|about)\b|~|تقدير|تقريب/i;

function normaliseFigure(value: string) {
  return value.replace(/AED/i, "").replace(/[\s,]/g, "").replace(/%$/, "");
}

export function annotateAiAnswer(text: string, sources: AiSource[]): AiCitationReport {
  const known = new Set(sources.map((s) => s.id));
  const cited = new Set<string>();
  for (const match of String(text || "").matchAll(/\[(S\d{1,2})\]/g)) {
    if (known.has(match[1])) cited.add(match[1]);
  }
  const citedExcerpts = sources
    .filter((s) => cited.has(s.id))
    .map((s) => s.excerpt.replace(/[\s,]/g, ""))
    .join(" ");
  const unsupported = new Set<string>();
  const stripped = String(text || "").replace(/\[S\d{1,2}\]/g, " ");
  for (const match of stripped.matchAll(FIGURE_RE)) {
    const figure = normaliseFigure(match[0]);
    if (!figure || figure.length < 2) continue; // ignore single digits (list markers, etc.)
    if (!citedExcerpts.includes(figure)) unsupported.add(match[0].trim());
  }
  const unsupportedFigures = [...unsupported].slice(0, 10);
  const containsEstimate = unsupportedFigures.length > 0 || ESTIMATE_RE.test(stripped);
  const uncited = cited.size === 0;
  const en: string[] = [];
  const ar: string[] = [];
  if (uncited) {
    en.push("No source cited — check the authoritative record before acting.");
    ar.push("لا يوجد مصدر مذكور — يرجى مراجعة السجل الرسمي قبل اتخاذ أي إجراء.");
  } else {
    en.push(`Sources: ${[...cited].join(", ")} (screen data, not verified).`);
    ar.push(`المصادر: ${[...cited].join("، ")} (بيانات الشاشة، غير موثقة).`);
  }
  if (containsEstimate) {
    en.push("Contains estimates — figures not found in a cited source are not facts.");
    ar.push("يحتوي على تقديرات — الأرقام غير الموجودة في مصدر مذكور ليست حقائق.");
  }
  return {
    sources,
    citedSourceIds: [...cited],
    uncited,
    containsEstimate,
    unsupportedFigures,
    labels: { en: en.join(" "), ar: ar.join(" ") },
  };
}

export function ruleGuidanceCitation(): AiCitationReport {
  const source: AiSource = {
    id: "R1",
    label: "BIN GROUP built-in rule guidance (general, not your records)",
    kind: "rule-guidance",
    authoritative: false,
    excerpt: "",
  };
  return {
    sources: [source],
    citedSourceIds: ["R1"],
    uncited: false,
    containsEstimate: false,
    unsupportedFigures: [],
    labels: {
      en: "Source: built-in rule guidance only — not your account records.",
      ar: "المصدر: إرشادات عامة مدمجة فقط — وليست سجلات حسابك.",
    },
  };
}
