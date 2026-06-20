import { onRequest } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import * as admin from "firebase-admin";

const whatsappToken = defineSecret("WHATSAPP_TOKEN");
const whatsappPhoneNumberId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const whatsappVerifyToken = defineSecret("WHATSAPP_VERIFY_TOKEN");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type WhatsAppTextMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
  audio?: { id?: string; mime_type?: string; sha256?: string };
  document?: { id?: string; filename?: string; mime_type?: string; sha256?: string; caption?: string };
};

type WhatsAppWebhookValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: WhatsAppTextMessage[];
  statuses?: Array<Record<string, unknown>>;
};

type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: WhatsAppWebhookValue;
    }>;
  }>;
};

function extractText(message: WhatsAppTextMessage): string {
  if (message.type === "text") return String(message.text?.body || "").trim();
  if (message.type === "image") return String(message.image?.caption || "[image]").trim();
  if (message.type === "document") return String(message.document?.caption || message.document?.filename || "[document]").trim();
  if (message.type === "audio") return "[voice-note]";
  return `[${message.type || "unknown"}]`;
}

function inferTicketCategory(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("ac") || lower.includes("a/c") || lower.includes("air condition") || lower.includes("air-condition")) return "AC";
  if (lower.includes("leak") || lower.includes("water") || lower.includes("pipe") || lower.includes("plumb")) return "Plumbing";
  if (lower.includes("electric") || lower.includes("power") || lower.includes("light") || lower.includes("socket")) return "Electrical";
  if (lower.includes("pest") || lower.includes("insect") || lower.includes("cockroach")) return "Pest control";
  if (lower.includes("door") || lower.includes("lock") || lower.includes("paint") || lower.includes("handyman")) return "Handyman";
  return "General maintenance";
}

function inferUrgency(text: string): "emergency" | "high" | "normal" {
  const lower = text.toLowerCase();
  if (lower.includes("fire") || lower.includes("smoke") || lower.includes("electric shock") || lower.includes("flood") || lower.includes("emergency")) return "emergency";
  if (lower.includes("urgent") || lower.includes("no power") || lower.includes("no water") || lower.includes("major leak")) return "high";
  return "normal";
}

async function sendWhatsAppText(to: string, body: string) {
  const token = whatsappToken.value();
  const phoneNumberId = whatsappPhoneNumberId.value();
  if (!token || !phoneNumberId || !to) return;

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("WhatsApp send failed", { status: response.status, errorText });
  }
}

async function persistInboundMessage(args: {
  entryId: string;
  changeField: string;
  value: WhatsAppWebhookValue;
  message: WhatsAppTextMessage;
}) {
  const text = extractText(args.message);
  const from = String(args.message.from || "").trim();
  const contact = args.value.contacts?.find((item) => item.wa_id === from) || args.value.contacts?.[0];
  const category = inferTicketCategory(text);
  const urgency = inferUrgency(text);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const intakeRef = db.collection("communication_intake").doc(args.message.id || db.collection("communication_intake").doc().id);
  await intakeRef.set({
    channel: "whatsapp",
    source: "whatsapp_cloud_api",
    provider: "meta",
    status: "ticket_draft_pending_review",
    waId: from,
    contactName: contact?.profile?.name || "",
    displayPhoneNumber: args.value.metadata?.display_phone_number || "",
    phoneNumberId: args.value.metadata?.phone_number_id || "",
    messageId: args.message.id || "",
    messageType: args.message.type || "unknown",
    messageText: text,
    category,
    urgency,
    language: "auto",
    optInRequired: true,
    humanReviewRequired: true,
    entryId: args.entryId,
    changeField: args.changeField,
    rawMessage: args.message,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });

  await db.collection("maintenance_ledger").add({
    source: "whatsapp_intake",
    channel: "whatsapp",
    status: "intake_received",
    intakeId: intakeRef.id,
    waId: from,
    category,
    urgency,
    messageText: text,
    ledgerEvent: "WHATSAPP_INTAKE_RECEIVED",
    createdAt: timestamp,
  });

  return { intakeId: intakeRef.id, from, category, urgency };
}

export const whatsappWebhook = onRequest(
  {
    region: "us-central1",
    cors: false,
  },
  async (req, res) => {
    if (req.method === "GET") {
      const mode = String(req.query["hub.mode"] || "");
      const token = String(req.query["hub.verify_token"] || "");
      const challenge = String(req.query["hub.challenge"] || "");

      if (mode === "subscribe" && token === whatsappVerifyToken.value()) {
        res.status(200).send(challenge);
        return;
      }

      res.status(403).send("WhatsApp webhook verification failed.");
      return;
    }

    if (req.method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).send("Method not allowed.");
      return;
    }

    const body = req.body as WhatsAppWebhookBody;
    const entryCount = Array.isArray(body.entry) ? body.entry.length : 0;
    const processed: Array<{ intakeId: string; from: string; category: string; urgency: string }> = [];

    try {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value: WhatsAppWebhookValue = change.value || {};
          for (const message of value.messages || []) {
            const persisted = await persistInboundMessage({
              entryId: entry.id || "",
              changeField: change.field || "",
              value,
              message,
            });
            processed.push(persisted);
            if (persisted.from) {
              await sendWhatsAppText(
                persisted.from,
                `BIN GROUP received your ${persisted.category} request. Reference: ${persisted.intakeId}. Our team will review and convert it into a maintenance ticket if action is required.`
              );
            }
          }

          if (Array.isArray(value.statuses) && value.statuses.length > 0) {
            await db.collection("whatsapp_status_events").add({
              channel: "whatsapp",
              provider: "meta",
              entryId: entry.id || "",
              changeField: change.field || "",
              statuses: value.statuses,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }

      res.status(200).json({ ok: true, entryCount, processedCount: processed.length });
    } catch (error) {
      console.error("WhatsApp webhook processing failed", error);
      res.status(500).json({ ok: false, error: "WHATSAPP_WEBHOOK_PROCESSING_FAILED" });
    }
  }
);
