import { HttpsError, onCall } from "firebase-functions/v2/https";

// Preserve the deployed callable name so a production deployment overwrites any
// earlier implementation instead of leaving an orphaned cloud endpoint alive.
// The public Design Studio remains unavailable until its replacement resolves
// ownership, pricing, request creation and protected render delivery on server.
export const generateAIDesignConceptImages = onCall(
  {
    cors: true,
    region: "europe-west3",
    enforceAppCheck: true,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in before accessing AI Design Studio.");
    }
    throw new HttpsError(
      "failed-precondition",
      "AI Design Studio is temporarily unavailable while the server-authoritative request and protected image workflow completes production review.",
    );
  },
);
