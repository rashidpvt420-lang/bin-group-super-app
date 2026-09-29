import { HttpsError } from "firebase-functions/v2/https";

/**
 * F-1: Owner application (intake / contract / payment / property) records are bound to the
 * Owner who first created them. A client-supplied application ID must never let one Owner
 * overwrite another Owner's records, and must never let an Owner reset an application that
 * has already progressed past submission (inspection, signature, payment, activation).
 */

type PlainRecord = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

/** Client session IDs are RFC 4122 UUIDs generated with crypto.randomUUID(). */
export const UUID_APPLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OWNER_SUBMITTED_INTAKE_STATE = "SUBMITTED_FOR_PROPERTY_INSPECTION";

/** Intake states in which the bound Owner may still (re)submit the five-page application. */
export const OWNER_RESUBMITTABLE_INTAKE_STATES = new Set(["", "DRAFT", "CHANGES_REQUESTED", "PENDING_OWNER_APPROVAL"]);

/** Contract / payment states that prove the application progressed and must never be reset by the Owner. */
const PROGRESSED_CONTRACT_STATES = new Set(["ACTIVE", "PENDING_OWNER_SIGNATURE", "READY_FOR_ACTIVATION", "PENDING_ACTIVATION", "TERMINATED", "SUSPENDED"]);
const PROGRESSED_PAYMENT_STATES = new Set([
  "APPROVED", "PAID", "VERIFIED", "PENDING_ADMIN_APPROVAL", "NOT_DUE_UNTIL_OWNER_FINAL_SIGNATURE", "REJECTED",
]);

export type ApplicationRecords = {
  intake?: PlainRecord | null;
  contract?: PlainRecord | null;
  payment?: PlainRecord | null;
  properties?: Array<PlainRecord | null | undefined>;
};

export type ApplicationBindingDecision = "NEW" | "IDEMPOTENT" | "RESUBMIT";

export function boundOwnerUid(record: PlainRecord | null | undefined): string {
  return text(record?.ownerUid || record?.ownerId);
}

/** Caller-scoped fallbacks used by existing clients when no session UUID exists. */
export function isCallerScopedApplicationId(applicationId: string, callerUid: string): boolean {
  return applicationId === callerUid ||
    applicationId === `owner_${callerUid}` ||
    applicationId === `owner_application_${callerUid}`;
}

/** A brand-new application record may only use an unguessable UUID or a caller-scoped ID. */
export function assertNewApplicationIdAllowed(applicationId: string, callerUid: string) {
  if (UUID_APPLICATION_ID.test(applicationId) || isCallerScopedApplicationId(applicationId, callerUid)) return;
  throw new HttpsError(
    "invalid-argument",
    "The onboarding reference is not a valid application ID. Restart the application to get a new reference.",
  );
}

/** Every existing record for the application must be bound to the caller. */
export function assertApplicationRecordsOwnedBy(callerUid: string, records: ApplicationRecords) {
  const present = [records.intake, records.contract, records.payment, ...(records.properties || [])]
    .filter((record): record is PlainRecord => Boolean(record));
  for (const record of present) {
    const owner = boundOwnerUid(record);
    if (!owner || owner !== callerUid) {
      throw new HttpsError("permission-denied", "This onboarding reference belongs to another account.");
    }
  }
  return present.length;
}

/**
 * Decide whether a five-page submission may write the application records.
 * Throws permission-denied for another Owner's records and failed-precondition for progressed ones.
 */
export function decideOwnerApplicationSubmission(args: {
  callerUid: string;
  applicationId: string;
  records: ApplicationRecords;
}): ApplicationBindingDecision {
  const { callerUid, applicationId, records } = args;
  const presentCount = assertApplicationRecordsOwnedBy(callerUid, records);
  if (!presentCount) {
    assertNewApplicationIdAllowed(applicationId, callerUid);
    return "NEW";
  }
  const intakeState = upper(records.intake?.status);
  if (records.intake && intakeState === OWNER_SUBMITTED_INTAKE_STATE) return "IDEMPOTENT";
  const contractState = upper(records.contract?.status || records.contract?.contractStatus);
  const paymentState = upper(records.payment?.status || records.payment?.paymentStatus);
  const progressed =
    !records.intake ||
    !OWNER_RESUBMITTABLE_INTAKE_STATES.has(intakeState) ||
    PROGRESSED_CONTRACT_STATES.has(contractState) ||
    PROGRESSED_PAYMENT_STATES.has(paymentState) ||
    records.contract?.adminApproved === true ||
    records.payment?.paymentVerified === true;
  if (progressed) {
    throw new HttpsError(
      "failed-precondition",
      `This application has already progressed (${intakeState || contractState || paymentState || "EXISTING_RECORDS"}) and cannot be resubmitted. Contact BIN GROUP to request changes.`,
    );
  }
  return "RESUBMIT";
}

/** OTP requests may only target the caller's own (or a new, well-formed) application. */
export function assertOtpApplicationBinding(args: {
  callerUid: string;
  applicationId: string;
  intake?: PlainRecord | null;
  contract?: PlainRecord | null;
}) {
  const presentCount = assertApplicationRecordsOwnedBy(args.callerUid, { intake: args.intake, contract: args.contract });
  if (!presentCount) assertNewApplicationIdAllowed(args.applicationId, args.callerUid);
}
