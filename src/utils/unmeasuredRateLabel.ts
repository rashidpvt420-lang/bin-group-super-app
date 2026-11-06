/** A stored 0 with no completed sample is the creation default, not a measured rate. */
export function unmeasuredRateLabel(prefix: string, value: unknown, sampleCount?: unknown): string {
  const samples = Number(sampleCount);
  const measuredSamples = Number.isFinite(samples) && samples > 0;
  const rate = Number(value);
  const measuredRate = Number.isFinite(rate) && rate > 0;
  if (!measuredSamples && !measuredRate) return `${prefix}: not enough data`;
  const shown = Number.isFinite(rate) ? Math.round(rate) : 0;
  return `${prefix} ${shown}%`;
}
