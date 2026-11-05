/**
 * Splits the image-generation prompt off a design record.
 * The prompt stays in a server-only collection. Owner, tenant, and admin clients
 * read the design record and must not receive it.
 */
const PROMPT_KEYS = ["prompt", "conceptPrompt", "customPrompt", "imagePrompt", "providerPrompt"] as const;

export type StoredDesignPrompt = {
  prompt?: string;
  conceptPrompt?: string;
  customPrompt?: string;
  imagePrompt?: string;
  providerPrompt?: string;
  conceptPrompts?: Array<{ id: string; prompt: string }>;
};

export function splitDesignPrompt(data: Record<string, unknown> | null | undefined): { hasPrompt: boolean; stored: StoredDesignPrompt; client: Record<string, unknown> } {
  const source = data && typeof data === "object" ? data : {};
  const stored: StoredDesignPrompt = {};
  const client: Record<string, unknown> = { ...source };
  let hasPrompt = false;

  for (const key of PROMPT_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      stored[key] = value;
      hasPrompt = true;
    }
    if (key in client) delete client[key];
  }

  if (Array.isArray(source.concepts)) {
    const conceptPrompts: Array<{ id: string; prompt: string }> = [];
    client.concepts = source.concepts.map((concept, index) => {
      if (!concept || typeof concept !== "object") return concept;
      const row = { ...(concept as Record<string, unknown>) };
      const prompt = typeof row.prompt === "string" ? row.prompt : "";
      if (prompt.trim()) {
        hasPrompt = true;
        conceptPrompts.push({ id: String(row.id || index), prompt });
      }
      delete row.prompt;
      delete row.conceptPrompt;
      delete row.customPrompt;
      return row;
    });
    if (conceptPrompts.length) stored.conceptPrompts = conceptPrompts;
  }

  return { hasPrompt, stored, client };
}
