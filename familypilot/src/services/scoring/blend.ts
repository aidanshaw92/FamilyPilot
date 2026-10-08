/**
 * The weighted average of the factors that are PRESENT.
 *
 * A factor that is undefined is left out of both the sum and the weight total, so the others are scaled up to fill its
 * place. That is how a preference the family never stated (a budget) takes no part in a score: it is not scored as
 * neutral, which would still move the number, and it is not scored as a pass or a fail. Returns 0 for no factors at all.
 */
export function blendFactors(weights: Readonly<Record<string, number>>, factors: object): number {
  let sum = 0;
  let total = 0;
  for (const key of Object.keys(weights)) {
    const value = (factors as Record<string, unknown>)[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    sum += value * weights[key];
    total += weights[key];
  }
  return total > 0 ? sum / total : 0;
}
