const PRIVATE_CONTEXT_KEY = /(password|passcode|secret|token|api.?key|authorization|cookie|session.?id|email|phone|mobile|iban|bank.?account|account.?number|passport|emirates.?id|national.?id|card.?number|cvv)/i;

const SENSITIVE_TEXT_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bAE(?:[\s-]?\d){21}\b/gi,
  /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/g,
  /(?:\+?971|00971|0)[\s-]?(?:5\d|[234679])(?:[\s-]?\d){7}\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
  /\b\d{8,12}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:sk-(?:proj-)?|AIza)[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:passport|account|iban|emirates\s*id|national\s*id|card|cvv)\s*(?:number|no\.?|#|:)?\s*[A-Z0-9-]{4,}\b/gi,
];

export type SanitizedExternalValue = {
  value: unknown;
  redactions: number;
};

export function asSafeText(value: unknown, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}

export function redactSensitiveText(value: unknown, max = 1600) {
  let text = asSafeText(value, max);
  let redactions = 0;
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, () => {
      redactions += 1;
      return "[REDACTED]";
    });
  }
  return { text, redactions };
}

function sanitizeRecursive(value: unknown, state: { redactions: number }, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_LIMIT]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const result = redactSensitiveText(value, 500);
    state.redactions += result.redactions;
    return result.text;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeRecursive(entry, state, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
    return Object.fromEntries(entries.map(([key, entry]) => {
      if (PRIVATE_CONTEXT_KEY.test(key)) {
        if (entry !== null && entry !== undefined && String(entry).trim()) state.redactions += 1;
        return [key, "[REDACTED]"];
      }
      return [key, sanitizeRecursive(entry, state, depth + 1)];
    }));
  }
  return undefined;
}

export function sanitizeExternalAiValue(value: unknown): SanitizedExternalValue {
  const state = { redactions: 0 };
  return {
    value: sanitizeRecursive(value, state),
    redactions: state.redactions,
  };
}

export function safeExternalAiJson(value: unknown, max = 4500) {
  try {
    const sanitized = sanitizeExternalAiValue(value);
    return {
      text: JSON.stringify(sanitized.value ?? {}).slice(0, max),
      redactions: sanitized.redactions,
    };
  } catch {
    return { text: "{}", redactions: 0 };
  }
}
