// Private AI Design Studio media delivery.
//
// Preferred path: a short-lived V4 signed URL. That needs the runtime service
// account to hold iam.serviceAccounts.signBlob (Service Account Token Creator),
// which production has been missing before (see the renewal-pdf signBlob repair).
// When signing is refused we must not fail the whole request - the render has
// already been paid for - so the already-authorised callable response carries the
// image inline as a data URL instead. Access control is unchanged: the caller was
// authorised by the callable before any bytes are read, Storage rules stay closed.

export type MediaFile = {
  getSignedUrl(options: { action: "read"; expires: number }): Promise<[string]>;
  download(): Promise<[Buffer]>;
};

export type MediaBucket = {
  file(path: string): MediaFile;
};

export type ProtectedMediaKind = "reference" | "generated";

// The callable response limit is ~10 MB; base64 inflates by 4/3. Budget:
// (2 MB + 4 MB) * 1.34 ~= 8 MB for a reference + render pair.
export const INLINE_MEDIA_MAX_BYTES: Record<ProtectedMediaKind, number> = {
  reference: 2 * 1024 * 1024,
  generated: 4 * 1024 * 1024,
};

function mimeFromPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function protectedMediaUrl(
  bucket: MediaBucket,
  path: string,
  kind: ProtectedMediaKind,
  ttlMs: number,
  log: (message: string, detail: Record<string, unknown>) => void = () => undefined,
): Promise<string> {
  const file = bucket.file(path);
  try {
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + ttlMs });
    if (url) return url;
  } catch (error: any) {
    log("protected media signing unavailable; using inline delivery", {
      kind,
      reason: String(error?.message || error).slice(0, 200),
    });
  }
  const [buffer] = await file.download();
  if (!buffer?.length || buffer.length > INLINE_MEDIA_MAX_BYTES[kind]) {
    log("protected media too large for inline delivery", { kind, bytes: buffer?.length || 0 });
    return "";
  }
  return `data:${mimeFromPath(path)};base64,${buffer.toString("base64")}`;
}
