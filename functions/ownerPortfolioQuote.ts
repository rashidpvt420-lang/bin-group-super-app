import { createHash, randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { calculateUaeQuote2026, type QuoteInput, type QuoteOutput } from "./pricing/calculateUaeQuote2026";
import { UAE_PRICING_MATRIX_2026 } from "./pricing/uaePricingMatrix2026";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const QUOTE_SCHEMA_VERSION = "OWNER_PORTFOLIO_QUOTE_V1";
const PRICING_ENGINE_VERSION = `UAE_PRICING_${UAE_PRICING_MATRIX_2026.version}`;
const QUOTE_TTL_MS = 30 * 60 * 1000;
const MAX_PROPERTIES = 50;

type QuotePropertyRequest = { id: string; input: QuoteInput };
type PropertyQuote = { propertyId: string; input: QuoteInput; output: QuoteOutput };
export type OwnerQuoteValidationInput = {
  quoteId?: unknown;
  quoteHash?: unknown;
  inputHash?: unknown;
  portfolioAnnualTotal?: unknown;
  mobilisationDeposit?: unknown;
};

function roleOf(auth: any): string {
  return String(auth?.token?.role || auth?.token?.userRole || auth?.token?.primaryRole || "").trim().toLowerCase();
}

async function assertVerifiedOwner(request: any): Promise<string> {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");
  if (roleOf(request.auth) !== "owner") throw new HttpsError("permission-denied", "Only an owner can issue a portfolio quote.");
  if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active owner account is required.");
  }

  const userRecord = await admin.auth().getUser(request.auth.uid);
  if (userRecord.disabled || userRecord.emailVerified !== true || userRecord.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active owner account is required.");
  }
  return request.auth.uid;
}

function cleanPropertyId(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new HttpsError("invalid-argument", "A valid quote or property ID is required.");
  return id;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function money(value: unknown, label: string): number {
  const result = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(result) || result < 0 || result > 100_000_000) throw new HttpsError("invalid-argument", `${label} is invalid.`);
  return result;
}

function parseProperties(value: unknown): QuotePropertyRequest[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PROPERTIES) {
    throw new HttpsError("invalid-argument", `Provide between 1 and ${MAX_PROPERTIES} properties.`);
  }
  const seen = new Set<string>();
  return value.map((item: any) => {
    const id = cleanPropertyId(item?.id);
    if (seen.has(id)) throw new HttpsError("invalid-argument", `Duplicate property ID: ${id}`);
    seen.add(id);
    if (!item?.input || typeof item.input !== "object" || Array.isArray(item.input)) {
      throw new HttpsError("invalid-argument", `Pricing input is required for property ${id}.`);
    }
    return { id, input: item.input as QuoteInput };
  });
}

function calculatePortfolio(properties: QuotePropertyRequest[]): {
  propertyQuotes: PropertyQuote[];
  portfolioAnnualTotal: number;
  mobilisationDeposit: number;
} {
  const propertyQuotes = properties.map(({ id, input }) => ({ propertyId: id, input, output: calculateUaeQuote2026(input) }));
  const portfolioAnnualTotal = money(
    propertyQuotes.reduce((total, property) => total + Number(property.output.annualTotal || 0), 0),
    "Portfolio annual total",
  );
  if (portfolioAnnualTotal <= 0) throw new HttpsError("failed-precondition", "The server quote produced no payable annual value.");
  const mobilisationDeposit = money(portfolioAnnualTotal * 0.15, "Mobilisation deposit");
  return { propertyQuotes, portfolioAnnualTotal, mobilisationDeposit };
}

export async function assertOwnerPortfolioQuoteRecord(ownerUid: string, data: OwnerQuoteValidationInput) {
  const quoteId = cleanPropertyId(data?.quoteId);
  const suppliedQuoteHash = String(data?.quoteHash || "").trim().toLowerCase();
  const suppliedInputHash = String(data?.inputHash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(suppliedQuoteHash) || !/^[a-f0-9]{64}$/.test(suppliedInputHash)) {
    throw new HttpsError("invalid-argument", "Valid quote and input hashes are required.");
  }

  const quoteSnap = await db.collection("owner_portfolio_quotes").doc(quoteId).get();
  if (!quoteSnap.exists) throw new HttpsError("not-found", "Server quote not found.");
  const quote = quoteSnap.data() || {};
  if (quote.ownerUid !== ownerUid) throw new HttpsError("permission-denied", "This quote belongs to another owner.");
  if (quote.status !== "ACTIVE") throw new HttpsError("failed-precondition", "This quote is no longer active.");
  if (quote.quoteSchemaVersion !== QUOTE_SCHEMA_VERSION || quote.pricingEngineVersion !== PRICING_ENGINE_VERSION) {
    throw new HttpsError("failed-precondition", "The pricing engine changed. Generate a new quote.");
  }
  if (Number(quote.expiresAtMs || 0) <= Date.now()) throw new HttpsError("failed-precondition", "The quote expired. Generate a new server quote.");
  if (quote.quoteHash !== suppliedQuoteHash || quote.inputHash !== suppliedInputHash) {
    throw new HttpsError("failed-precondition", "Quote integrity validation failed.");
  }

  if (data.portfolioAnnualTotal !== undefined && money(data.portfolioAnnualTotal, "Portfolio annual total") !== Number(quote.portfolioAnnualTotal)) {
    throw new HttpsError("failed-precondition", "Portfolio annual total does not match the server quote.");
  }
  if (data.mobilisationDeposit !== undefined && money(data.mobilisationDeposit, "Mobilisation deposit") !== Number(quote.mobilisationDeposit)) {
    throw new HttpsError("failed-precondition", "Mobilisation deposit does not match the server quote.");
  }

  return {
    valid: true,
    quoteId,
    quoteHash: quote.quoteHash,
    inputHash: quote.inputHash,
    quoteSchemaVersion: quote.quoteSchemaVersion,
    pricingEngineVersion: quote.pricingEngineVersion,
    expiresAtMs: quote.expiresAtMs,
    portfolioAnnualTotal: Number(quote.portfolioAnnualTotal),
    mobilisationDeposit: Number(quote.mobilisationDeposit),
    currency: "AED" as const,
  };
}

export const issueOwnerPortfolioQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const ownerUid = await assertVerifiedOwner(request);
    const properties = parseProperties(request.data?.properties);
    const issuedAtMs = Date.now();
    const expiresAtMs = issuedAtMs + QUOTE_TTL_MS;
    const quoteId = `oq_${ownerUid}_${randomUUID().replace(/-/g, "")}`;
    const inputEnvelope = { ownerUid, quoteSchemaVersion: QUOTE_SCHEMA_VERSION, pricingEngineVersion: PRICING_ENGINE_VERSION, properties };
    const inputHash = sha256(inputEnvelope);
    const calculated = calculatePortfolio(properties);
    const quoteEnvelope = {
      quoteId, ownerUid, quoteSchemaVersion: QUOTE_SCHEMA_VERSION, pricingEngineVersion: PRICING_ENGINE_VERSION,
      issuedAtMs, expiresAtMs, currency: "AED", inputHash, ...calculated,
    };
    const quoteHash = sha256(quoteEnvelope);
    const quoteRecord = { ...quoteEnvelope, quoteHash, status: "ACTIVE" };

    await db.collection("owner_portfolio_quotes").doc(quoteId).create({
      ...quoteRecord,
      issuedAt: admin.firestore.Timestamp.fromMillis(issuedAtMs),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("audit_logs").add({
      action: "OWNER_PORTFOLIO_QUOTE_ISSUED", actorId: ownerUid, actorRole: "owner", quoteId,
      quoteSchemaVersion: QUOTE_SCHEMA_VERSION, pricingEngineVersion: PRICING_ENGINE_VERSION,
      inputHash, quoteHash, propertyCount: properties.length,
      portfolioAnnualTotal: calculated.portfolioAnnualTotal, mobilisationDeposit: calculated.mobilisationDeposit,
      expiresAtMs, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return quoteRecord;
  },
);

export const validateOwnerPortfolioQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => assertOwnerPortfolioQuoteRecord(await assertVerifiedOwner(request), request.data || {}),
);
