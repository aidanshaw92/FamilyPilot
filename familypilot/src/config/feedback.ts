/**
 * Tester feedback destination. Opens GitHub Issues with a pre-filled body —
 * no credentials required in the client.
 */
export const FEEDBACK_ISSUES_URL =
  'https://github.com/aidanshaw92/FamilyPilot/issues/new?template=tester-feedback.yml';

export function buildFeedbackUrl(fields: {
  rating: number;
  usefulFeature: string;
  biggestProblem: string;
  useAgain: 'yes' | 'no' | 'maybe';
  comments: string;
}): string {
  const body = [
    '## Tester feedback',
    '',
    `**Overall rating:** ${fields.rating}/10`,
    `**Most useful feature:** ${fields.usefulFeature || '—'}`,
    `**Biggest problem:** ${fields.biggestProblem || '—'}`,
    `**Would use again:** ${fields.useAgain}`,
    '',
    '**Comments:**',
    fields.comments || '—',
  ].join('\n');

  const params = new URLSearchParams({
    title: `Tester feedback (${fields.rating}/10)`,
    body,
  });

  return `https://github.com/aidanshaw92/FamilyPilot/issues/new?${params.toString()}`;
}
