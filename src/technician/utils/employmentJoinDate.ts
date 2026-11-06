const JOIN_FIELDS = ["joiningDate", "hireDate", "joinedAt", "dateOfJoining"] as const;

function present(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function readJoinValue(record: Record<string, unknown> | null | undefined): unknown {
  if (!record) return null;
  for (const key of JOIN_FIELDS) {
    if (present(record[key])) return record[key];
  }
  return null;
}

/**
 * HR-saved joining date wins. The account creation date is not a joining date.
 */
export function employmentJoinValue(
  hrProfile?: Record<string, unknown> | null,
  userProfile?: Record<string, unknown> | null,
): unknown {
  return readJoinValue(hrProfile) ?? readJoinValue(userProfile);
}
