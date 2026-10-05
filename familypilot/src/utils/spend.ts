/** A venue whose estimated spend says it costs nothing. Unknown spend is not free. */
export function isFreeSpend(estimatedSpend: string | undefined | null): boolean {
  const spend = estimatedSpend?.trim().toLowerCase() ?? '';
  return spend === 'free' || spend.startsWith('free') || spend.startsWith('£0');
}
