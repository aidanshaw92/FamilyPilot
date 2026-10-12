/** A small stable number from text (FNV-1a), for choosing a variant. 0 when there is no seed. */
export function artVariant(seed: string | undefined): number {
  if (!seed) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 8;
}
