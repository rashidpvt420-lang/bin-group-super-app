import type * as FirebaseFirestore from "firebase-admin/firestore";
// N-25: HR read callables must not turn a failed query into an empty list with success:true.
// A failed section is reported to the caller (and logged) instead of silently rendering as "no data".

export type SettledSection<T> = { section: string; value: T | null; failed: boolean };

export async function settleSection<T>(section: string, read: Promise<T>): Promise<SettledSection<T>> {
  try {
    return { section, value: await read, failed: false };
  } catch (error) {
    console.error(`[hr-read] ${section} query failed`, error instanceof Error ? error.message : error);
    return { section, value: null, failed: true };
  }
}

export function unavailableSections(results: Array<SettledSection<unknown>>): string[] {
  return results.filter((result) => result.failed).map((result) => result.section);
}

// Staff payroll rows are matched by any of the identity fields historically used by payroll
// writers. Query each field directly instead of reading an unfiltered page of the collection
// and filtering in memory (which silently dropped rows once the collection exceeded the page).
export const PAYROLL_STAFF_IDENTITY_FIELDS = ["uid", "staffId", "employeeId", "techId", "technicianId"] as const;

export async function readPayrollForStaff(
  db: FirebaseFirestore.Firestore,
  uid: string,
  perFieldLimit = 100,
): Promise<{ docs: FirebaseFirestore.QueryDocumentSnapshot[] }> {
  const snapshots = await Promise.all(
    PAYROLL_STAFF_IDENTITY_FIELDS.map((field) => db.collection("payroll").where(field, "==", uid).limit(perFieldLimit).get()),
  );
  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) byId.set(document.id, document);
  }
  return { docs: [...byId.values()] };
}
