import { onRequest } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import * as admin from "firebase-admin";
import { verifyWhatsAppSignature } from "./whatsappSignature";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const waToken = defineSecret("WHATSAPP_TOKEN");
const waVerifyToken = defineSecret("WHATSAPP_VERIFY_TOKEN");
const waPhoneId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const waAppSecret = defineSecret("WHATSAPP_APP_SECRET");

// ─── RESPONSE TEMPLATES ───────────────────────────────────────────────────

function welcomeMsg(name?: string) {
  return `🏢 *BIN GROUP Property Care*\n\nHello${name ? ` ${name}` : ""}! Welcome.\n\nReply with a number:\n1️⃣ Raise a maintenance request\n2️⃣ Check my request status\n3️⃣ Speak to the team\n4️⃣ Property details\n\nPowered by BIN GROUP Property OS 🇦🇪`;
}

function maintenanceFormMsg() {
  return `🔧 *New Maintenance Request*\n\nPlease send your message in this format:\n\n*REPAIR: [describe the issue]*\n*PROPERTY: [your unit/villa/address]*\n*URGENT: yes/no*\n\nExample:\nREPAIR: AC not cooling in bedroom\nPROPERTY: Villa 12, Al Jimi\nURGENT: yes\n\nOr send a *photo* of the damage directly! 📸`;
}

async function sendWhatsAppMessage(phoneId: string, token: string, to: string, body: string) {
  await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
}

async function routeMessage(from: string, text: string, phoneId: string, token: string) {
  const lower = text.toLowerCase().trim();

  // Look up user by phone number
  const userSnap = await db.collection("users").where("whatsappNumber", "==", from).limit(1).get();
  const user = userSnap.empty ? null : userSnap.docs[0].data();
  const userName = user?.displayName || user?.name;

  // Session state
  const sessionRef = db.collection("whatsappSessions").doc(from);
  const session = (await sessionRef.get()).data() || {};

  // ── Greetings ──
  if (["hi", "hello", "hey", "مرحبا", "السلام", "1"].includes(lower) || !session.step) {
    await sessionRef.set({ step: "MENU", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await sendWhatsAppMessage(phoneId, token, from, welcomeMsg(userName));
    return;
  }

  // ── Menu routing ──
  if (lower === "1" || lower.includes("maintenance") || lower.includes("repair") || lower.includes("صيانة")) {
    await sessionRef.set({ step: "MAINTENANCE_FORM", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await sendWhatsAppMessage(phoneId, token, from, maintenanceFormMsg());
    return;
  }

  if (lower === "2" || lower.includes("status") || lower.includes("check")) {
    const tickets = await db.collection("maintenanceTickets")
      .where("reporterPhone", "==", from)
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();

    if (tickets.empty) {
      await sendWhatsAppMessage(phoneId, token, from, "📋 No active requests found for your number.\n\nType *1* to raise a new maintenance request.");
    } else {
      const list = tickets.docs.map(d => {
        const t = d.data();
        return `• ${t.title || "Request"} — *${t.status || "Pending"}*`;
      }).join("\n");
      await sendWhatsAppMessage(phoneId, token, from, `📋 *Your Recent Requests:*\n\n${list}\n\nFor full details, visit your BIN GROUP portal.`);
    }
    return;
  }

  if (lower === "3" || lower.includes("speak") || lower.includes("team") || lower.includes("call")) {
    await sendWhatsAppMessage(phoneId, token, from, `📞 *Contact BIN GROUP:*\n\n• Phone: +971 55 7474560\n• WhatsApp: +971 55 2423233\n• Email: ceo@bin-groups.com\n• Location: Al Ain, Abu Dhabi UAE\n\nOffice hours: Sun–Thu 8:00am – 6:00pm`);
    return;
  }

  // ── REPAIR: / PROPERTY: / URGENT: form ──
  if (lower.startsWith("repair:") || (session.step === "MAINTENANCE_FORM" && lower.includes("repair"))) {
    const lines = text.split("\n");
    const repairLine = lines.find(l => l.toLowerCase().startsWith("repair:")) || text;
    const propertyLine = lines.find(l => l.toLowerCase().startsWith("property:")) || "";
    const urgentLine = lines.find(l => l.toLowerCase().startsWith("urgent:")) || "";
    const isUrgent = urgentLine.toLowerCase().includes("yes");

    const ticketRef = db.collection("maintenanceTickets").doc();
    await ticketRef.set({
      title: repairLine.replace(/repair:/i, "").trim(),
      propertyRef: propertyLine.replace(/property:/i, "").trim() || "Not specified",
      priority: isUrgent ? "HIGH" : "NORMAL",
      status: "OPEN",
      source: "whatsapp",
      reporterPhone: from,
      reporterName: userName || "WhatsApp User",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ticketNumber: `WA-${Date.now().toString(36).toUpperCase()}`,
    });

    await sessionRef.set({ step: "MENU", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await sendWhatsAppMessage(phoneId, token, from,
      `✅ *Request Received!*\n\n🎫 Ticket: WA-${Date.now().toString(36).toUpperCase()}\n📍 Property: ${propertyLine.replace(/property:/i, "").trim() || "Not specified"}\n⚡ Priority: ${isUrgent ? "HIGH" : "Normal"}\n\nA BIN GROUP coordinator will contact you within ${isUrgent ? "2 hours" : "24 hours"}.\n\nThank you for trusting BIN GROUP! 🏢`
    );
    return;
  }

  // ── Default ──
  await sendWhatsAppMessage(phoneId, token, from, welcomeMsg(userName));
}

export const whatsappBotWebhook = onRequest({
  cors: false,
  timeoutSeconds: 30,
  maxInstances: 20,
}, async (req, res) => {
  // GET — Meta webhook verification
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = waVerifyToken.value();
    if (!verifyToken) {
      res.status(500).send("WhatsApp webhook verification failed: Verify Token is unconfigured.");
      return;
    }
    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Forbidden");
    }
    return;
  }

  // POST — incoming message
  if (req.method === "POST") {
 review/deployed-hosting-state

    if (!verifyWhatsAppSignature(req, waAppSecret.value())) {
      console.warn("WhatsApp webhook: rejected request with invalid X-Hub-Signature-256.");
      res.status(401).send("Invalid signature");
      return;
    }

 main
    const phoneId = waPhoneId.value();
    const token = waToken.value();
    if (!phoneId || !token) {
      console.error("WhatsApp Bot configuration is missing. Webhook disabled.");
      res.status(500).send("WhatsApp configuration is missing.");
      return;
    }
    res.status(200).send("OK"); // Acknowledge immediately
    try {
      const body = req.body;
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;
      if (!messages?.length) return;

      const msg = messages[0];
      const from = msg.from;

      // Log to Firestore for admin visibility
      await db.collection("whatsappMessages").add({
        from,
        type: msg.type,
        text: msg.type === "text" ? msg.text?.body : `[${msg.type}]`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        raw: JSON.stringify(msg).slice(0, 2000),
      });

      if (msg.type === "text") {
        await routeMessage(from, msg.text?.body || "", phoneId, token);
      } else if (msg.type === "image") {
        await sendWhatsAppMessage(phoneId, token, from,
          "📸 *Photo received!*\n\nTo create a maintenance request from this photo, please reply with:\n\nREPAIR: [describe what you see]\nPROPERTY: [your address]\nURGENT: yes/no"
        );
      } else {
        await routeMessage(from, "", phoneId, token);
      }
    } catch (e) {
      console.error("WhatsApp webhook error:", e);
    }
    return;
  }

  res.status(405).send("Method Not Allowed");
});
