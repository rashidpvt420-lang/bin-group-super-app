// Pure helpers for onChatMessageSent. The ticket chat pages write
// { senderUid, senderRole, senderName, message, createdAt }; older docs may
// carry senderId/text. Recipients are every other ticket participant, each
// deep-linked to the chat route that exists in their own role app.
export type ChatRole = 'tenant' | 'owner' | 'technician';
export type ChatRecipient = { uid: string; role: ChatRole; url: string };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function chatMessageSender(message: Record<string, unknown> | undefined | null): string {
  return str(message?.senderUid) || str(message?.senderId);
}

export function chatMessageSnippet(message: Record<string, unknown> | undefined | null): string {
  const text = str(message?.message) || str(message?.text);
  if (text) return text.length > 50 ? `${text.substring(0, 50)}...` : text;
  return message?.imageUrl ? 'Sent an image' : 'Sent a message';
}

export function chatRecipients(ticketId: string, ticket: Record<string, unknown>, senderUid: string): ChatRecipient[] {
  const candidates: Array<[ChatRole, string]> = [
    ['tenant', str(ticket.tenantId) || str(ticket.tenantUid) || str(ticket.reporterId)],
    ['owner', str(ticket.ownerId) || str(ticket.ownerUid)],
    ['technician', str(ticket.assignedTechnicianId) || str(ticket.technicianId)],
  ];
  const seen = new Set<string>();
  const out: ChatRecipient[] = [];
  for (const [role, uid] of candidates) {
    if (!uid || uid === senderUid || seen.has(uid)) continue;
    seen.add(uid);
    out.push({ uid, role, url: `/${role}/chat/${encodeURIComponent(ticketId)}` });
  }
  return out;
}
