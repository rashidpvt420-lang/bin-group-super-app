/**
 * Technician auto-dispatch eligibility.
 *
 * The automatic dispatcher previously compared only `users.emirate` and a raw
 * substring of `users.trade`/`users.tradeSkills`. The admin HR tools store a
 * technician's coverage as `technicians.primaryEmirate`/`emiratesCovered` and
 * the trade as `specialization`/`primaryTrade`, and nothing writes
 * `users.emirate` or `tradeSkills`, so no technician provisioned through the
 * product could ever be auto-assigned. This module reads both registries and
 * normalises emirates and trades (AC / A-C / HVAC / air conditioning / cooling)
 * before matching. It never relaxes approval, suspension, duty, availability
 * or capacity requirements.
 */

type Profile = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();

export function normalizeLabel(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s/_.\-&+,()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EMIRATE_ALIASES: Record<string, string[]> = {
  dubai: ["dubai", "dxb"],
  abu_dhabi: ["abu dhabi", "abudhabi", "auh", "al ain"],
  sharjah: ["sharjah", "shj"],
  ajman: ["ajman"],
  umm_al_quwain: ["umm al quwain", "umm al qaiwain", "ummalquwain", "uaq"],
  ras_al_khaimah: ["ras al khaimah", "ras al khaima", "rasalkhaimah", "rak"],
  fujairah: ["fujairah", "fujeirah"],
};

export function normalizeEmirate(value: unknown): string {
  const label = normalizeLabel(value);
  if (!label) return "";
  for (const [canonical, aliases] of Object.entries(EMIRATE_ALIASES)) {
    if (aliases.includes(label)) return canonical;
  }
  return label.replace(/ /g, "_");
}

/** Canonical trade -> accepted phrases (whole-word matches after normalisation). */
const TRADE_ALIASES: Record<string, string[]> = {
  hvac: ["hvac", "ac", "a c", "aircon", "air con", "air conditioning", "air conditioner", "airconditioning", "cooling", "chiller", "split unit", "duct cleaning", "refrigeration"],
  electrical: ["electrical", "electric", "electrician", "power", "lighting"],
  plumbing: ["plumbing", "plumber", "water", "drainage", "leak"],
  civil: ["civil", "handyman", "carpentry", "carpenter", "masonry", "painting", "painter", "tiling", "joinery"],
  cleaning: ["cleaning", "deep cleaning", "cleaner", "housekeeping"],
  pest_control: ["pest control", "pest", "fumigation"],
  elevator: ["elevator", "lift"],
  security: ["security", "cctv", "access control"],
  moving: ["moving", "packing", "movers"],
  management: ["management", "property management"],
  general: ["general", "general maintenance", "other", "other maintenance", "multi skilled", "multiskilled", "multi trade", "mep", "facility maintenance", "facilities maintenance"],
};

/** Ticket categories that carry no trade requirement (any qualified, on-duty technician may take them). */
const NO_TRADE_REQUIREMENT = new Set(["", "emergency", "sos"]);

function containsPhrase(label: string, phrase: string) {
  return ` ${label} `.includes(` ${phrase} `);
}

export function canonicalTrades(value: unknown): string[] {
  const label = normalizeLabel(value);
  if (!label) return [];
  const matches = Object.entries(TRADE_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => containsPhrase(label, alias)))
    .map(([canonical]) => canonical);
  return matches.length ? matches : [label];
}

function listValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  if (!single) return [];
  return single.includes(",") ? single.split(",").map(text).filter(Boolean) : [single];
}

export function requiredTicketTrade(ticket: Profile): string | null {
  const raw = text(ticket.complaintCategory || ticket.category || ticket.trade);
  const label = normalizeLabel(raw);
  if (NO_TRADE_REQUIREMENT.has(label)) return null;
  return canonicalTrades(raw)[0] || null;
}

export function technicianTrades(user: Profile, technician: Profile): Set<string> {
  const trades = new Set<string>();
  for (const profile of [user, technician]) {
    const values = [
      ...listValues(profile.tradeSkills),
      ...listValues(profile.skills),
      ...listValues(profile.trades),
      ...listValues(profile.secondaryTrades),
      ...listValues(profile.specialization),
      ...listValues(profile.primaryTrade),
      ...listValues(profile.trade),
      ...listValues(profile.specialty),
    ];
    for (const value of values) for (const trade of canonicalTrades(value)) trades.add(trade);
  }
  return trades;
}

export function technicianEmirates(user: Profile, technician: Profile): Set<string> {
  const emirates = new Set<string>();
  for (const profile of [user, technician]) {
    for (const value of [
      ...listValues(profile.emirate),
      ...listValues(profile.primaryEmirate),
      ...listValues(profile.emiratesCovered),
    ]) {
      const emirate = normalizeEmirate(value);
      if (emirate) emirates.add(emirate);
    }
  }
  return emirates;
}

export type DispatchEligibility = { eligible: boolean; reasons: string[] };

export const DISPATCH_REASON = {
  NOT_ON_DUTY: "not_on_duty",
  NOT_APPROVED: "not_approved_or_suspended",
  UNAVAILABLE: "unavailable_or_on_break",
  NO_CAPACITY: "at_capacity",
  EMIRATE: "emirate_not_covered",
  TRADE: "trade_not_qualified",
} as const;

export function evaluateTechnicianForTicket(params: {
  user: Profile;
  technician?: Profile | null;
  ticketEmirate: unknown;
  requiredTrade: string | null;
}): DispatchEligibility {
  const user = params.user || {};
  const technician = params.technician || {};
  const reasons: string[] = [];
  const statuses = [user.status, technician.status].map((value) => text(value).toLowerCase()).filter(Boolean);
  const approved =
    statuses.some((status) => ["active", "approved"].includes(status)) &&
    !statuses.some((status) => ["suspended", "rejected", "disabled", "inactive", "offboarded"].includes(status)) &&
    user.suspended !== true &&
    technician.suspended !== true;
  if (user.onDuty !== true) reasons.push(DISPATCH_REASON.NOT_ON_DUTY);
  if (!approved) reasons.push(DISPATCH_REASON.NOT_APPROVED);
  if (user.isAvailable === false || user.available === false) reasons.push(DISPATCH_REASON.UNAVAILABLE);
  if (Number(user.currentJobCount || 0) >= Number(user.maxConcurrentJobs || technician.maxConcurrentJobs || 3)) {
    reasons.push(DISPATCH_REASON.NO_CAPACITY);
  }
  const emirate = normalizeEmirate(params.ticketEmirate);
  if (!emirate || !technicianEmirates(user, technician).has(emirate)) reasons.push(DISPATCH_REASON.EMIRATE);
  if (params.requiredTrade && !technicianTrades(user, technician).has(params.requiredTrade)) {
    reasons.push(DISPATCH_REASON.TRADE);
  }
  return { eligible: reasons.length === 0, reasons };
}
