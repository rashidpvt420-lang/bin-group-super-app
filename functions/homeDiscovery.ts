import { randomUUID } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { reserveAiUsageQuota, settleAiUsageQuota } from "./aiUsageQuota";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const openAiKey = defineSecret("OPENAI_API_KEY");

const HOME_RECORD_TYPES = new Set([
  "ROOM_RENT_LISTING",
  "FIND_ROOM_RENT",
  "HOME_RENT_LISTING",
  "PROPERTY_RENT_LISTING",
  "RENTAL_LISTING",
]);
const CLOSED_STATUSES = new Set(["RENTED", "CLOSED", "INACTIVE", "WITHDRAWN"]);
const ALLOWED_PROPERTY_TYPES = new Set(["ALL", "ROOM", "STUDIO", "APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE"]);
const ALLOWED_EMIRATES = new Set(["ALL", "ABU_DHABI", "DUBAI", "SHARJAH", "AJMAN", "UMM_AL_QUWAIN", "RAS_AL_KHAIMAH", "FUJAIRAH"]);
const ALLOWED_FURNISHING = new Set(["ALL", "FURNISHED", "UNFURNISHED", "PARTLY_FURNISHED"]);
const ALLOWED_BEDROOMS = new Set(["ALL", "0", "1", "2", "3", "4_PLUS"]);
const MAX_SAVED_SEARCHES_PER_TENANT = 30;
const ALERT_SEARCH_PAGE_SIZE = 400;

type SearchFilters = {
  query: string;
  propertyType: string;
  emirate: string;
  minRent: number;
  maxRent: number;
  bedrooms: string;
  furnishing: string;
};

function cleanString(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanUpper(value: unknown, max = 60) {
  return cleanString(value, max).toUpperCase();
}

function cleanNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function uniqueStrings(value: unknown, maxItems = 30, maxLength = 180) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanString(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function safeUrls(value: unknown, maxItems = 12) {
  return uniqueStrings(value, maxItems, 1200).filter((item) => /^https:\/\//i.test(item));
}

function annualRent(data: FirebaseFirestore.DocumentData) {
  const annual = cleanNumber(data.annualRent, 0, 100_000_000);
  if (annual > 0) return annual;
  const monthly = cleanNumber(data.monthlyRent, 0, 10_000_000);
  return monthly > 0 ? monthly * 12 : 0;
}

function recordType(data: FirebaseFirestore.DocumentData) {
  return cleanUpper(data.recordType || data.listingType, 80);
}

function isVerifiedPublicListing(data: FirebaseFirestore.DocumentData | undefined | null) {
  if (!data) return false;
  return HOME_RECORD_TYPES.has(recordType(data))
    && data.active === true
    && data.approved === true
    && data.hasBinContract === true
    && data.verifiedByAdmin === true
    && data.notRented !== false
    && !CLOSED_STATUSES.has(cleanUpper(data.status || "AVAILABLE", 40));
}

function publicListing(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: cleanString(data.unitTitle || data.title || data.propertyName || "BIN verified home", 140),
    propertyName: cleanString(data.propertyName, 120),
    propertyType: cleanUpper(data.propertyType || "HOME", 40),
    area: cleanString(data.area || data.community || data.city, 120),
    emirate: cleanUpper(data.emirate, 40),
    annualRent: annualRent(data),
    monthlyRent: cleanNumber(data.monthlyRent, 0, 10_000_000),
    bedrooms: cleanNumber(data.bedrooms, 0, 30),
    bathrooms: cleanNumber(data.bathrooms, 0, 30),
    areaSqFt: cleanNumber(data.areaSqFt, 0, 1_000_000),
    furnishing: cleanUpper(data.furnishing || (data.furnished === true ? "FURNISHED" : ""), 40),
    availableFrom: cleanString(data.availableFrom, 40),
    numberOfCheques: cleanNumber(data.numberOfCheques, 0, 24),
    securityDeposit: cleanNumber(data.securityDeposit, 0, 10_000_000),
    imageUrls: safeUrls(data.imageUrls || data.photos),
    amenities: uniqueStrings(data.amenities, 30, 80),
    permitNumber: cleanString(data.permitNumber, 120),
    permitVerified: data.permitVerified === true,
    permitVerificationUrl: /^https:\/\//i.test(cleanString(data.permitVerificationUrl, 1200))
      ? cleanString(data.permitVerificationUrl, 1200)
      : "",
    verifiedByAdmin: true,
    availabilityStatus: "AVAILABLE",
  };
}

function normalizeFilters(value: unknown): SearchFilters {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const propertyType = cleanUpper(raw.propertyType || "ALL", 40);
  const emirate = cleanUpper(raw.emirate || "ALL", 40);
  const furnishing = cleanUpper(raw.furnishing || "ALL", 40);
  const bedrooms = cleanUpper(raw.bedrooms || "ALL", 20);
  const minRent = cleanNumber(raw.minRent, 0, 100_000_000);
  const maxRentRaw = cleanNumber(raw.maxRent, 0, 100_000_000);
  const maxRent = maxRentRaw > 0 && maxRentRaw >= minRent ? maxRentRaw : 0;
  return {
    query: cleanString(raw.query, 180).toLowerCase(),
    propertyType: ALLOWED_PROPERTY_TYPES.has(propertyType) ? propertyType : "ALL",
    emirate: ALLOWED_EMIRATES.has(emirate) ? emirate : "ALL",
    minRent,
    maxRent,
    bedrooms: ALLOWED_BEDROOMS.has(bedrooms) ? bedrooms : "ALL",
    furnishing: ALLOWED_FURNISHING.has(furnishing) ? furnishing : "ALL",
  };
}

function listingHaystack(data: FirebaseFirestore.DocumentData) {
  return [
    data.title,
    data.unitTitle,
    data.propertyName,
    data.area,
    data.community,
    data.city,
    data.emirate,
    data.propertyType,
    ...(Array.isArray(data.amenities) ? data.amenities : []),
  ].map((value) => cleanString(value, 160).toLowerCase()).join(" ");
}

function matchesFilters(data: FirebaseFirestore.DocumentData, filters: SearchFilters) {
  if (!isVerifiedPublicListing(data)) return false;
  const terms = filters.query.split(/\s+/).filter(Boolean);
  const haystack = listingHaystack(data);
  if (terms.length && !terms.every((term) => haystack.includes(term))) return false;
  if (filters.propertyType !== "ALL" && cleanUpper(data.propertyType, 40) !== filters.propertyType) return false;
  if (filters.emirate !== "ALL" && cleanUpper(data.emirate, 40) !== filters.emirate) return false;
  const rent = annualRent(data);
  if (filters.minRent > 0 && rent > 0 && rent < filters.minRent) return false;
  if (filters.maxRent > 0 && (rent <= 0 || rent > filters.maxRent)) return false;
  const beds = cleanNumber(data.bedrooms, 0, 30);
  if (filters.bedrooms === "4_PLUS" && beds < 4) return false;
  if (filters.bedrooms !== "ALL" && filters.bedrooms !== "4_PLUS" && beds !== Number(filters.bedrooms)) return false;
  if (filters.furnishing !== "ALL") {
    const furnishing = cleanUpper(data.furnishing || (data.furnished === true ? "FURNISHED" : ""), 40);
    if (furnishing !== filters.furnishing) return false;
  }
  return true;
}

function tokenRole(auth: any) {
  const token = auth?.token || {};
  return cleanString(token.role || token.userRole || token.primaryRole, 50).toLowerCase();
}

function assertTenantAuth(auth: any) {
  const uid = cleanString(auth?.uid, 128);
  if (!uid) throw new HttpsError("unauthenticated", "Sign in with a tenant account first.");
  if (auth?.token?.suspended === true) throw new HttpsError("permission-denied", "This account is suspended.");
  if (tokenRole(auth) !== "tenant") throw new HttpsError("permission-denied", "Tenant access required.");
  return uid;
}

async function verifiedListings(limit = 120) {
  const rows: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
  const pageSize = Math.max(100, Math.min(400, limit * 2));
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (rows.length < limit) {
    let queryRef: FirebaseFirestore.Query = db.collection("contractorProfiles")
      .where("active", "==", true)
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) queryRef = queryRef.startAfter(cursor);

    const snapshot = await queryRef.get();
    if (snapshot.empty) break;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (!isVerifiedPublicListing(data)) continue;
      rows.push({ id: docSnap.id, data });
      if (rows.length >= limit) break;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1] || null;
    if (snapshot.size < pageSize) break;
  }

  return rows;
}

export const getPublicHomeDiscoveryListings = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
  timeoutSeconds: 20,
}, async () => {
  const rows = await verifiedListings(100);
  return {
    listings: rows.map((row) => publicListing(row.id, row.data)),
    publicDataPolicy: "SANITIZED_VERIFIED_LISTINGS_ONLY",
    exactAddressExposed: false,
    ownerIdentityExposed: false,
    generatedAt: new Date().toISOString(),
  };
});

export const saveHomeDiscoverySearch = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
}, async (request) => {
  const uid = assertTenantAuth(request.auth);
  const existing = await db.collection("homeDiscoverySavedSearches")
    .where("userId", "==", uid)
    .limit(MAX_SAVED_SEARCHES_PER_TENANT + 1)
    .get();
  if (existing.size >= MAX_SAVED_SEARCHES_PER_TENANT) {
    throw new HttpsError("resource-exhausted", `You can keep up to ${MAX_SAVED_SEARCHES_PER_TENANT} saved home searches. Delete one before saving another.`);
  }

  const filters = normalizeFilters(request.data?.filters);
  const searchId = randomUUID();
  const ref = db.collection("homeDiscoverySavedSearches").doc(`${uid}_${searchId}`);
  await ref.set({
    searchId,
    userId: uid,
    role: "tenant",
    label: cleanString(request.data?.label, 80) || "Saved home search",
    filters,
    alertsEnabled: request.data?.alertsEnabled !== false,
    source: "tenant_home_discovery_wave2",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { searchId, filters, alertsEnabled: request.data?.alertsEnabled !== false };
});

export const listHomeDiscoverySavedSearches = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
}, async (request) => {
  const uid = assertTenantAuth(request.auth);
  const snapshot = await db.collection("homeDiscoverySavedSearches")
    .where("userId", "==", uid)
    .limit(MAX_SAVED_SEARCHES_PER_TENANT)
    .get();
  return {
    searches: snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        searchId: cleanString(data.searchId, 128),
        label: cleanString(data.label, 80),
        filters: normalizeFilters(data.filters),
        alertsEnabled: data.alertsEnabled === true,
      };
    }),
  };
});

export const deleteHomeDiscoverySavedSearch = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
}, async (request) => {
  const uid = assertTenantAuth(request.auth);
  const searchId = cleanString(request.data?.searchId, 128);
  if (!/^[A-Za-z0-9-]{16,128}$/.test(searchId)) throw new HttpsError("invalid-argument", "A valid saved search id is required.");
  await db.collection("homeDiscoverySavedSearches").doc(`${uid}_${searchId}`).delete();
  return { deleted: true, searchId };
});

function inferNaturalPreferences(text: string) {
  const lower = text.toLowerCase();
  const maxMatch = lower.match(/(?:under|max(?:imum)?|up to|budget)\s*(?:aed\s*)?([\d,.]+)\s*(k)?/i);
  const maxRent = maxMatch
    ? Number(String(maxMatch[1]).replace(/,/g, "")) * (maxMatch[2] ? 1000 : 1)
    : 0;
  const bedsMatch = lower.match(/(\d+)\s*(?:br|bed|beds|bedroom|bedrooms)\b/i);
  const bedrooms = bedsMatch ? Number(bedsMatch[1]) : null;
  const propertyType = ["room", "studio", "apartment", "villa", "townhouse", "penthouse"]
    .find((type) => lower.includes(type)) || "";
  const emiratePairs: Array<[string, string]> = [
    ["abu dhabi", "ABU_DHABI"], ["dubai", "DUBAI"], ["sharjah", "SHARJAH"],
    ["ajman", "AJMAN"], ["ras al khaimah", "RAS_AL_KHAIMAH"], ["fujairah", "FUJAIRAH"],
    ["umm al quwain", "UMM_AL_QUWAIN"],
  ];
  const emirate = emiratePairs.find(([needle]) => lower.includes(needle))?.[1] || "";
  return {
    maxRent: Number.isFinite(maxRent) ? maxRent : 0,
    bedrooms,
    propertyType: propertyType.toUpperCase(),
    emirate,
    furnishing: lower.includes("unfurnished") ? "UNFURNISHED" : lower.includes("furnished") ? "FURNISHED" : "",
  };
}

function deterministicScore(id: string, data: FirebaseFirestore.DocumentData, queryText: string) {
  const natural = inferNaturalPreferences(queryText);
  const haystack = listingHaystack(data);
  const terms = queryText.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 3;
  const rent = annualRent(data);
  const beds = cleanNumber(data.bedrooms, 0, 30);
  if (natural.maxRent > 0) score += rent > 0 && rent <= natural.maxRent ? 12 : -12;
  if (natural.bedrooms !== null) score += beds === natural.bedrooms ? 10 : -Math.min(8, Math.abs(beds - natural.bedrooms) * 2);
  if (natural.propertyType) score += cleanUpper(data.propertyType, 40) === natural.propertyType ? 10 : -4;
  if (natural.emirate) score += cleanUpper(data.emirate, 40) === natural.emirate ? 8 : -5;
  if (natural.furnishing) score += cleanUpper(data.furnishing, 40) === natural.furnishing ? 5 : -2;
  if (safeUrls(data.imageUrls || data.photos).length > 0) score += 2;
  if (data.permitVerified === true) score += 2;
  return { id, score };
}

function groundedReason(data: FirebaseFirestore.DocumentData, queryText: string) {
  const natural = inferNaturalPreferences(queryText);
  const facts: string[] = [];
  const rent = annualRent(data);
  if (rent > 0) facts.push(`AED ${Math.round(rent).toLocaleString()}/year`);
  const beds = cleanNumber(data.bedrooms, 0, 30);
  facts.push(beds === 0 ? "studio" : `${beds} bed`);
  const area = cleanString(data.area || data.community || data.city, 80);
  if (area) facts.push(area);
  const emirate = cleanString(data.emirate, 40).replace(/_/g, " ");
  if (emirate) facts.push(emirate);
  if (natural.maxRent > 0 && rent > 0 && rent <= natural.maxRent) facts.push("within stated budget");
  if (data.permitVerified === true) facts.push("permit verified");
  return `Matches using live BIN listing facts: ${facts.slice(0, 6).join(" · ")}.`;
}

async function openAiRanking(apiKey: string, queryText: string, candidates: Array<{ id: string; data: FirebaseFirestore.DocumentData }>) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, timeout: 8_000, maxRetries: 0 });
  const inventory = candidates.slice(0, 30).map(({ id, data }) => ({
    id,
    title: cleanString(data.unitTitle || data.title || data.propertyName, 120),
    propertyType: cleanUpper(data.propertyType, 40),
    area: cleanString(data.area || data.community || data.city, 100),
    emirate: cleanUpper(data.emirate, 40),
    annualRent: annualRent(data),
    bedrooms: cleanNumber(data.bedrooms, 0, 30),
    bathrooms: cleanNumber(data.bathrooms, 0, 30),
    furnishing: cleanUpper(data.furnishing, 40),
    amenities: uniqueStrings(data.amenities, 20, 60),
    availableFrom: cleanString(data.availableFrom, 40),
  }));
  const response = await client.responses.create({
    model: process.env.OPENAI_HOME_DISCOVERY_MODEL || "gpt-4.1-mini",
    instructions: [
      "Rank BIN GROUP rental listings for the user's request.",
      "The inventory JSON is authoritative. Never invent a listing, price, location, amenity, availability, fee, or property fact.",
      "Return JSON only in the exact form {\"ids\":[\"listing-id\"]} with at most 5 existing inventory ids, best first.",
      "Do not include explanations or any id not present in the supplied inventory.",
    ].join(" "),
    input: JSON.stringify({ userRequest: queryText, inventory }),
    max_output_tokens: 220,
  });
  const raw = cleanString((response as any).output_text, 4000).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(raw);
  const ids: string[] = Array.isArray(parsed?.ids)
    ? parsed.ids.map((value: unknown) => cleanString(value, 160))
    : [];
  const allowed = new Set(candidates.map((item) => item.id));
  return [...new Set(ids.filter((id) => allowed.has(id)))].slice(0, 5);
}

export const recommendHomeDiscoveryListings = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
  timeoutSeconds: 30,
  secrets: [openAiKey],
}, async (request) => {
  const queryText = cleanString(request.data?.query, 500);
  if (queryText.length < 3) throw new HttpsError("invalid-argument", "Describe the home you are looking for.");
  const reservation = await reserveAiUsageQuota(request.auth, "chat", new Set(["tenant", "admin", "super_admin", "ceo"]));
  let chargeQuota = false;
  try {
    const filters = normalizeFilters(request.data?.filters);
    const rows = (await verifiedListings(100)).filter((row) => matchesFilters(row.data, filters));
    if (!rows.length) {
      await settleAiUsageQuota(reservation, false);
      return { provider: "grounded-rules", grounded: true, recommendations: [], message: "No verified BIN listings currently match those filters." };
    }
    const deterministic = [...rows]
      .map((row) => ({ ...row, score: deterministicScore(row.id, row.data, queryText).score }))
      .sort((left, right) => right.score - left.score);
    let orderedIds = deterministic.slice(0, 5).map((row) => row.id);
    let provider = "grounded-rules";
    const key = openAiKey.value();
    if (key) {
      try {
        const aiIds = await openAiRanking(key, queryText, deterministic);
        if (aiIds.length) {
          const remainder = orderedIds.filter((id) => !aiIds.includes(id));
          orderedIds = [...aiIds, ...remainder].slice(0, 5);
          provider = "openai-grounded-ranking";
          chargeQuota = true;
        }
      } catch (error) {
        console.warn("[HomeDiscoveryAI] provider ranking unavailable; using deterministic ranking", {
          code: (error as any)?.code || (error as any)?.name || "provider-failed",
        });
      }
    }
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const recommendations = orderedIds.map((id) => {
      const row = rowMap.get(id)!;
      return { ...publicListing(row.id, row.data), reason: groundedReason(row.data, queryText) };
    });
    await settleAiUsageQuota(reservation, chargeQuota);
    return {
      provider,
      grounded: true,
      inventoryAuthoritative: true,
      recommendations,
      message: provider === "openai-grounded-ranking"
        ? "AI ranked only current verified BIN inventory; all displayed facts come from the listing database."
        : "Live provider ranking was unavailable; using deterministic matching against current verified inventory.",
    };
  } catch (error) {
    await settleAiUsageQuota(reservation, false).catch(() => undefined);
    throw error;
  }
});

async function notifySavedSearchMatches(listingId: string, data: FirebaseFirestore.DocumentData, eventType: "NEW_MATCH" | "PRICE_DROP") {
  if (!isVerifiedPublicListing(data)) return;
  const rent = annualRent(data);
  const listingTitle = cleanString(data.unitTitle || data.title || data.propertyName || "BIN verified home", 100);
  const area = cleanString(data.area || data.community || data.city || data.emirate, 80);
  const eventKey = eventType === "PRICE_DROP" ? `price_${Math.round(rent)}` : "new";
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let queryRef: FirebaseFirestore.Query = db.collection("homeDiscoverySavedSearches")
      .where("alertsEnabled", "==", true)
      .orderBy(FieldPath.documentId())
      .limit(ALERT_SEARCH_PAGE_SIZE);
    if (cursor) queryRef = queryRef.startAfter(cursor);

    const snapshot = await queryRef.get();
    if (snapshot.empty) break;

    const writes: Promise<unknown>[] = [];
    for (const searchDoc of snapshot.docs) {
      const search = searchDoc.data();
      const uid = cleanString(search.userId, 128);
      if (!uid || cleanString(search.role, 30).toLowerCase() !== "tenant") continue;
      const filters = normalizeFilters(search.filters);
      if (!matchesFilters(data, filters)) continue;
      const notificationId = `${searchDoc.id}_${listingId}_${eventKey}`.slice(0, 900);
      const title = eventType === "PRICE_DROP" ? "Price drop on a saved BIN home" : "New BIN home matches your saved search";
      const body = eventType === "PRICE_DROP"
        ? `${listingTitle}${area ? ` in ${area}` : ""} is now AED ${Math.round(rent).toLocaleString()}/year.`
        : `${listingTitle}${area ? ` in ${area}` : ""} now matches your saved home search.`;
      writes.push(db.collection("notifications").doc(notificationId).set({
        recipientId: uid,
        userId: uid,
        recipientRole: "tenant",
        role: "tenant",
        type: eventType === "PRICE_DROP" ? "HOME_PRICE_DROP" : "HOME_NEW_MATCH",
        title,
        body,
        link: "/tenant/homes",
        metadata: {
          listingId,
          savedSearchId: cleanString(search.searchId, 128),
          annualRent: rent,
          eventType,
        },
        source: "home_discovery_saved_search_alert",
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: false }));
    }
    await Promise.all(writes);

    cursor = snapshot.docs[snapshot.docs.length - 1] || null;
    if (snapshot.size < ALERT_SEARCH_PAGE_SIZE) break;
  }
}

export const notifyHomeDiscoveryNewMatches = onDocumentCreated({
  document: "contractorProfiles/{listingId}",
  region: "europe-west3",
  retry: true,
}, async (event) => {
  const snap = event.data;
  if (!snap) return;
  await notifySavedSearchMatches(event.params.listingId, snap.data(), "NEW_MATCH");
});

export const notifyHomeDiscoveryPriceDrops = onDocumentUpdated({
  document: "contractorProfiles/{listingId}",
  region: "europe-west3",
  retry: true,
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const becamePublic = !isVerifiedPublicListing(before) && isVerifiedPublicListing(after);
  if (becamePublic) {
    await notifySavedSearchMatches(event.params.listingId, after, "NEW_MATCH");
    return;
  }
  if (!isVerifiedPublicListing(after)) return;
  const beforeRent = annualRent(before);
  const afterRent = annualRent(after);
  if (beforeRent > 0 && afterRent > 0 && afterRent < beforeRent) {
    await notifySavedSearchMatches(event.params.listingId, after, "PRICE_DROP");
  }
});