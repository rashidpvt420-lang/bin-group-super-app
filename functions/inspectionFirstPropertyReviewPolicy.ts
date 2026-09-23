export const INSPECTION_FIRST_WORKFLOW = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";

export function reviewableInspectionFirstProperty(
  property: { workflowVersion?: unknown; status?: unknown; approvalStatus?: unknown; intakeId?: unknown; propertyId?: unknown },
  intake: { workflowVersion?: unknown; status?: unknown; ownerUid?: unknown; ownerId?: unknown; properties?: unknown } | null,
  ownerUid: string,
  propertyId: string,
): boolean {
  if (property.workflowVersion !== INSPECTION_FIRST_WORKFLOW ||
    property.status !== "PENDING_PROPERTY_INSPECTION" ||
    property.approvalStatus === "APPROVED" || !intake ||
    intake.workflowVersion !== INSPECTION_FIRST_WORKFLOW ||
    intake.status !== "SUBMITTED_FOR_PROPERTY_INSPECTION" ||
    (intake.ownerUid || intake.ownerId) !== ownerUid || !ownerUid) return false;
  return Array.isArray(intake.properties) && intake.properties.some((entry) => {
    const listed = entry as { propertyId?: unknown; id?: unknown };
    return (listed.propertyId || listed.id) === propertyId;
  });
}
