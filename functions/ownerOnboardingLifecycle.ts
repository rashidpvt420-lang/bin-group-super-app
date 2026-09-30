import { HttpsError } from "firebase-functions/v2/https";
import type * as FirebaseFirestore from "firebase-admin/firestore";

/**
 * F-5: the single, enforced inspection-first Owner onboarding lifecycle.
 *
 * Every callable that mutates an inspection-first Owner application (intake, contract,
 * payment, property inspections) resolves the application's current state with
 * `resolveOwnerOnboardingState` and asserts its move with `assertOwnerOnboardingTransition`
 * (or `assertOwnerOnboardingActionAllowed` for callables that do not advance the state)
 * BEFORE writing. The new state is persisted on the intake as `ownerOnboardingState`.
 *
 * Rules of this machine:
 *  - States are exact, upper-case strings. Unknown recorded states are REJECTED; they are
 *    never normalised to a default/initial state.
 *  - Only the transitions listed below are legal, and each one names the actor class that may
 *    perform it. Self-transitions are legal only where they are listed explicitly.
 *  - Records created before this machine existed (no `ownerOnboardingState`) are mapped from
 *    their server-written legacy fields by an explicit table; a combination that is not in
 *    the table is rejected (fail closed) rather than guessed.
 */

export const OWNER_ONBOARDING_LIFECYCLE_VERSION = "OWNER_INSPECTION_FIRST_LIFECYCLE_V1";
export const OWNER_ONBOARDING_STATE_FIELD = "ownerOnboardingState";

export const OWNER_ONBOARDING_STATES = [
  "DRAFT",
  "SUBMITTED_FOR_PROPERTY_INSPECTION",
  "SITE_VISITS_SCHEDULED",
  "INSPECTION_EVIDENCE_RECORDED",
  "FINAL_QUOTE_AWAITING_OWNER_SIGNATURE",
  "OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE",
  "PAYMENT_EVIDENCE_PENDING_APPROVAL",
  "PAYMENT_REJECTED",
  "ACTIVE",
  "CHANGES_REQUESTED",
  "REJECTED",
] as const;

export type OwnerOnboardingState = (typeof OWNER_ONBOARDING_STATES)[number];
export type OwnerOnboardingActor = "owner" | "admin" | "finance_admin";

type Edge = { to: OwnerOnboardingState; actors: readonly OwnerOnboardingActor[] };

const OWNER: readonly OwnerOnboardingActor[] = ["owner"];
const ADMIN: readonly OwnerOnboardingActor[] = ["admin"];
const FINANCE: readonly OwnerOnboardingActor[] = ["finance_admin"];

/**
 * The complete transition table. Anything not listed is illegal, including the legacy
 * `signature_pending -> approved` shortcut: activation is reachable only from
 * PAYMENT_EVIDENCE_PENDING_APPROVAL, which is reachable only after the Owner's final signature.
 */
export const OWNER_ONBOARDING_TRANSITIONS: Readonly<Record<OwnerOnboardingState, readonly Edge[]>> = Object.freeze({
  // Account binding (upsertOwnerOnboardingProfile) keeps DRAFT; the five-page submission leaves it.
  DRAFT: [
    { to: "DRAFT", actors: OWNER },
    { to: "SUBMITTED_FOR_PROPERTY_INSPECTION", actors: OWNER },
  ],
  SUBMITTED_FOR_PROPERTY_INSPECTION: [
    { to: "SITE_VISITS_SCHEDULED", actors: ADMIN },
    // Reserved for the F-3 Admin request-changes / reject callable (not implemented yet).
    { to: "CHANGES_REQUESTED", actors: ADMIN },
    { to: "REJECTED", actors: ADMIN },
  ],
  SITE_VISITS_SCHEDULED: [
    { to: "SITE_VISITS_SCHEDULED", actors: ADMIN },
    { to: "INSPECTION_EVIDENCE_RECORDED", actors: ADMIN },
    { to: "CHANGES_REQUESTED", actors: ADMIN },
    { to: "REJECTED", actors: ADMIN },
  ],
  INSPECTION_EVIDENCE_RECORDED: [
    { to: "INSPECTION_EVIDENCE_RECORDED", actors: ADMIN },
    { to: "FINAL_QUOTE_AWAITING_OWNER_SIGNATURE", actors: ADMIN },
    { to: "REJECTED", actors: ADMIN },
  ],
  FINAL_QUOTE_AWAITING_OWNER_SIGNATURE: [
    // Admin may re-issue the final quote or correct visit evidence only before the Owner signs.
    { to: "FINAL_QUOTE_AWAITING_OWNER_SIGNATURE", actors: ADMIN },
    { to: "INSPECTION_EVIDENCE_RECORDED", actors: ADMIN },
    { to: "OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE", actors: OWNER },
  ],
  OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE: [
    { to: "PAYMENT_EVIDENCE_PENDING_APPROVAL", actors: FINANCE },
  ],
  PAYMENT_EVIDENCE_PENDING_APPROVAL: [
    { to: "PAYMENT_EVIDENCE_PENDING_APPROVAL", actors: FINANCE },
    { to: "ACTIVE", actors: FINANCE },
    { to: "PAYMENT_REJECTED", actors: FINANCE },
  ],
  PAYMENT_REJECTED: [
    { to: "PAYMENT_REJECTED", actors: FINANCE },
    { to: "PAYMENT_EVIDENCE_PENDING_APPROVAL", actors: FINANCE },
  ],
  // Onboarding is complete; suspension/termination are Owner-profile / contract workflows.
  ACTIVE: [],
  CHANGES_REQUESTED: [
    { to: "CHANGES_REQUESTED", actors: OWNER },
    { to: "SUBMITTED_FOR_PROPERTY_INSPECTION", actors: OWNER },
  ],
  REJECTED: [],
});

type PlainRecord = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

export function isOwnerOnboardingState(value: unknown): value is OwnerOnboardingState {
  return typeof value === "string" && (OWNER_ONBOARDING_STATES as readonly string[]).includes(value);
}

function unknownState(detail: string): never {
  throw new HttpsError(
    "failed-precondition",
    `The Owner application is in an unrecognised onboarding state (${detail}). It must be reviewed by BIN GROUP before any further change.`,
  );
}

function ownerSigned(contract: PlainRecord | null | undefined) {
  return contract?.ownerSigned === true || contract?.signatureState?.ownerSigned === true;
}

/** Legacy intake statuses that existed before submission (account binding / old draft flows). */
const LEGACY_PRE_SUBMISSION_INTAKE_STATES = new Set(["", "DRAFT", "PENDING_OWNER_APPROVAL"]);

export type OwnerOnboardingRecords = {
  intake?: PlainRecord | null;
  contract?: PlainRecord | null;
  payment?: PlainRecord | null;
  /** Linked property_inspections records, when the caller has loaded them. */
  inspections?: Array<PlainRecord | null | undefined>;
};

/**
 * Resolve the application's current lifecycle state.
 * A recorded `ownerOnboardingState` is authoritative and must be an exact known state.
 * Without it (records written before F-5) the state is mapped from server-written legacy
 * fields by an explicit table; unmapped combinations are rejected.
 */
export function resolveOwnerOnboardingState(records: OwnerOnboardingRecords): OwnerOnboardingState {
  const intake = records.intake || null;
  if (!intake) return "DRAFT";

  if (Object.prototype.hasOwnProperty.call(intake, OWNER_ONBOARDING_STATE_FIELD) && intake[OWNER_ONBOARDING_STATE_FIELD] !== null && intake[OWNER_ONBOARDING_STATE_FIELD] !== undefined) {
    const recorded = intake[OWNER_ONBOARDING_STATE_FIELD];
    if (!isOwnerOnboardingState(recorded)) unknownState(`recorded "${text(recorded).slice(0, 80)}"`);
    return recorded;
  }

  const contract = records.contract || null;
  const payment = records.payment || null;
  const intakeState = upper(intake.status);
  const contractState = upper(contract?.status || contract?.contractStatus);
  const paymentState = upper(payment?.status || payment?.paymentStatus);

  if (
    intakeState === "ACTIVE" || contractState === "ACTIVE" || paymentState === "APPROVED" ||
    payment?.paymentVerified === true || contract?.adminApproved === true
  ) return "ACTIVE";
  if (paymentState === "PENDING_ADMIN_APPROVAL") return "PAYMENT_EVIDENCE_PENDING_APPROVAL";
  if (
    ["REJECTED", "PAYMENT_REJECTED"].includes(paymentState) ||
    contractState === "PAYMENT_REJECTED" || intakeState === "PAYMENT_REJECTED"
  ) return "PAYMENT_REJECTED";
  if (contract?.inspectionVerified === true) {
    return ownerSigned(contract) ? "OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE" : "FINAL_QUOTE_AWAITING_OWNER_SIGNATURE";
  }
  if (intakeState === "SUBMITTED_FOR_PROPERTY_INSPECTION") {
    const linked = Array.isArray(intake.inspectionIds) && intake.inspectionIds.some((value: unknown) => Boolean(text(value)));
    if (!linked) return "SUBMITTED_FOR_PROPERTY_INSPECTION";
    const evidenced = (records.inspections || []).some((inspection) => upper(inspection?.evidenceStatus) === "VERIFIED");
    return evidenced ? "INSPECTION_EVIDENCE_RECORDED" : "SITE_VISITS_SCHEDULED";
  }
  if (intakeState === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (LEGACY_PRE_SUBMISSION_INTAKE_STATES.has(intakeState) && !contract && !payment) return "DRAFT";
  return unknownState(`legacy intake "${intakeState.slice(0, 60) || "EMPTY"}", contract "${contractState.slice(0, 60) || "NONE"}", payment "${paymentState.slice(0, 60) || "NONE"}"`);
}

export function canOwnerOnboardingTransition(from: unknown, to: unknown, actor: OwnerOnboardingActor): boolean {
  if (!isOwnerOnboardingState(from) || !isOwnerOnboardingState(to)) return false;
  return OWNER_ONBOARDING_TRANSITIONS[from].some((edge) => edge.to === to && edge.actors.includes(actor));
}

/** Throws unless `from -> to` is a listed transition for `actor`. Unknown states are never normalised. */
export function assertOwnerOnboardingTransition(
  from: unknown,
  to: unknown,
  actor: OwnerOnboardingActor,
): OwnerOnboardingState {
  if (!isOwnerOnboardingState(from)) unknownState(`from "${text(from).slice(0, 80)}"`);
  if (!isOwnerOnboardingState(to)) unknownState(`to "${text(to).slice(0, 80)}"`);
  const edges = OWNER_ONBOARDING_TRANSITIONS[from];
  const edge = edges.find((candidate) => candidate.to === to);
  if (!edge) {
    throw new HttpsError(
      "failed-precondition",
      `Illegal Owner onboarding transition ${from} -> ${to}. Allowed from ${from}: ${edges.map((candidate) => candidate.to).join(", ") || "none"}.`,
    );
  }
  if (!edge.actors.includes(actor)) {
    throw new HttpsError("permission-denied", `Owner onboarding transition ${from} -> ${to} is not permitted for ${actor}.`);
  }
  return to;
}

/** For callables that act on an application without advancing it (e.g. creating a site visit). */
export function assertOwnerOnboardingActionAllowed(
  state: unknown,
  allowed: readonly OwnerOnboardingState[],
  action: string,
): OwnerOnboardingState {
  if (!isOwnerOnboardingState(state)) unknownState(`"${text(state).slice(0, 80)}"`);
  if (!allowed.includes(state)) {
    throw new HttpsError(
      "failed-precondition",
      `${action} is not allowed while the Owner application is ${state}. Allowed: ${allowed.join(", ")}.`,
    );
  }
  return state;
}

/** The intake fields that record a transition. Merge them into the same write as the transition. */
export function ownerOnboardingStatePatch(
  from: OwnerOnboardingState,
  to: OwnerOnboardingState,
  actor: OwnerOnboardingActor,
  actorUid: string,
  at: unknown,
) {
  return {
    [OWNER_ONBOARDING_STATE_FIELD]: to,
    ownerOnboardingStateVersion: OWNER_ONBOARDING_LIFECYCLE_VERSION,
    ownerOnboardingPreviousState: from,
    ownerOnboardingStateActor: actor,
    ownerOnboardingStateChangedBy: actorUid,
    ownerOnboardingStateChangedAt: at,
  };
}

/**
 * Batched writers (not transactions) record the transition with an optimistic-concurrency
 * precondition on the intake snapshot they asserted against. This must be the FIRST write to
 * the intake in the batch; a concurrent change makes the whole batch fail atomically.
 */
export function stageOwnerOnboardingTransition(
  batch: FirebaseFirestore.WriteBatch,
  intakeSnap: FirebaseFirestore.DocumentSnapshot,
  patch: Record<string, unknown>,
) {
  if (!intakeSnap.exists || !intakeSnap.updateTime) {
    throw new HttpsError("failed-precondition", "The Owner application record is missing.");
  }
  batch.update(intakeSnap.ref, patch, { lastUpdateTime: intakeSnap.updateTime });
}

/** Commit a batch that carries a staged transition, mapping a lost race to `aborted`. */
export async function commitOwnerOnboardingBatch(batch: FirebaseFirestore.WriteBatch) {
  try {
    await batch.commit();
  } catch (error: any) {
    const code = error?.code;
    if (code === 9 || code === "failed-precondition" || code === "FAILED_PRECONDITION" || /FAILED_PRECONDITION/.test(String(error?.message || ""))) {
      throw new HttpsError("aborted", "The Owner application changed while this action was running. Refresh and try again.");
    }
    throw error;
  }
}
