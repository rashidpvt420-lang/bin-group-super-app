import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { splitDesignPrompt } from "./designPromptFields";

if (!admin.apps.length) admin.initializeApp();

export const DESIGN_PROMPT_COLLECTION = "design_generation_prompts";

/**
 * Moves any image prompt off a client-readable design document into the
 * server-only collection. A second write with no prompt returns immediately.
 */
async function movePromptOffClientRecord(collectionName: string, id: string, after: FirebaseFirestore.DocumentSnapshot | undefined) {
  if (!after?.exists) return;
  const data = after.data() || {};
  const split = splitDesignPrompt(data);
  if (!split.hasPrompt) return;
  const db = admin.firestore();
  await db.collection(DESIGN_PROMPT_COLLECTION).doc(`${collectionName}_${id}`).set({
    sourceCollection: collectionName,
    sourceId: id,
    ...split.stored,
    storedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const removal: Record<string, unknown> = {
    prompt: FieldValue.delete(),
    conceptPrompt: FieldValue.delete(),
    customPrompt: FieldValue.delete(),
    imagePrompt: FieldValue.delete(),
    providerPrompt: FieldValue.delete(),
  };
  if (split.client.concepts) removal.concepts = split.client.concepts;
  await after.ref.update(removal);
}

export const stripDesignRequestPrompt = onDocumentWritten(
  { document: "design_requests/{requestId}", region: "europe-west3" },
  async (event) => {
    await movePromptOffClientRecord("design_requests", String(event.params.requestId || ""), event.data?.after);
  },
);

export const stripDesignConceptPrompt = onDocumentWritten(
  { document: "design_concepts/{conceptId}", region: "europe-west3" },
  async (event) => {
    await movePromptOffClientRecord("design_concepts", String(event.params.conceptId || ""), event.data?.after);
  },
);
