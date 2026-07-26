export const FIRESTORE_IN_QUERY_LIMIT = 30;

const cleanId = (value: unknown) => String(value || '').trim();

export function ticketReferencedPropertyIds(tickets: Array<Record<string, unknown>>): string[] {
  return [...new Set(
    tickets
      .map((ticket) => cleanId(ticket.propertyId))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

export function propertyIdQueryChunks(
  propertyIds: string[],
  batchSize = FIRESTORE_IN_QUERY_LIMIT,
): string[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > FIRESTORE_IN_QUERY_LIMIT) {
    throw new Error(`Property query batch size must be between 1 and ${FIRESTORE_IN_QUERY_LIMIT}.`);
  }
  const uniqueIds = [...new Set(propertyIds.map(cleanId).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    chunks.push(uniqueIds.slice(index, index + batchSize));
  }
  return chunks;
}

export function missingReferencedPropertyIds(
  requestedPropertyIds: string[],
  returnedPropertyIds: string[],
): string[] {
  const returned = new Set(returnedPropertyIds.map(cleanId).filter(Boolean));
  return [...new Set(requestedPropertyIds.map(cleanId).filter(Boolean))]
    .filter((propertyId) => !returned.has(propertyId))
    .sort((left, right) => left.localeCompare(right));
}
