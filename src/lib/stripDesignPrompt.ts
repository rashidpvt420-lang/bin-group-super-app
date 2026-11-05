const PROMPT_KEYS = ['prompt', 'conceptPrompt', 'customPrompt', 'imagePrompt', 'providerPrompt'];

/** Drops the image-generation prompt before a design record is kept in the UI. */
export function stripDesignPrompt<T extends Record<string, unknown>>(record: T): T {
  const next: Record<string, unknown> = { ...record };
  for (const key of PROMPT_KEYS) delete next[key];
  if (Array.isArray(record.concepts)) {
    next.concepts = record.concepts.map((concept) => {
      if (!concept || typeof concept !== 'object') return concept;
      const row = { ...(concept as Record<string, unknown>) };
      for (const key of PROMPT_KEYS) delete row[key];
      return row;
    });
  }
  return next as T;
}
