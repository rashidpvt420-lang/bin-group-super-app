import * as crypto from "crypto";

// N-21: the open-tracking pixel must never carry the invitation secret. Request URLs are
// written to Cloud Functions request logs and fetched by mail image proxies, so the pixel
// uses a separate random id whose only capability is marking an invitation as opened.
export const OPEN_TRACKING_ID_PATTERN = /^[a-f0-9]{32}$/;

export function newInvitationOpenTrackingId(): string {
    return crypto.randomBytes(16).toString("hex");
}

export function tenantInvitationTrackingPixelUrl(region: string, projectId: string, openTrackingId: string): string {
    return `https://${region}-${projectId}.cloudfunctions.net/trackTenantInvitationOpen?tid=${encodeURIComponent(openTrackingId)}`;
}

export function parseOpenTrackingId(value: unknown): string | null {
    return typeof value === "string" && OPEN_TRACKING_ID_PATTERN.test(value) ? value : null;
}
