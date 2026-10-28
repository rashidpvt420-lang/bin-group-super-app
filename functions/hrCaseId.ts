import { createHash } from "node:crypto";

// Deterministic HR case id used for idempotent createStaffHrCase retries.
// The whole client key is hashed (never truncated): the client key embeds upload
// metadata such as the Storage file path after a long common prefix, so truncating
// it collapsed every later upload of the same document type into the first case.
// The uid is always mixed in so two staff members can never share a case id.
export function stableCaseId(uid: string, message: string, suppliedKey: unknown) {
    const rawKey = String(suppliedKey || "").trim().slice(0, 2000);
    const source = `${uid}|${rawKey || message}`;
    return `hrcase_${createHash("sha256").update(source).digest("hex").slice(0, 40)}`;
}
