import { describe, expect, it } from 'vitest';

import { SAVED_EXAMPLES_NOTICE, showingSavedExamples } from '@/src/utils/saved-examples-notice';

describe('the saved-examples notice on Explore', () => {
  it('appears only when every venue shown is a bundled example', () => {
    expect(showingSavedExamples([{ provider: 'mock' }, { provider: 'mock' }])).toBe(true);
  });

  it('does not appear for a live list, a mixed list, an empty list or no list', () => {
    expect(showingSavedExamples([{ provider: 'google' }])).toBe(false);
    expect(showingSavedExamples([{ provider: 'mock' }, { provider: 'google' }])).toBe(false);
    expect(showingSavedExamples([{ provider: undefined }])).toBe(false);
    expect(showingSavedExamples([])).toBe(false);
    expect(showingSavedExamples(undefined)).toBe(false);
    expect(showingSavedExamples(null)).toBe(false);
  });

  it('says what happened, in the parent’s words', () => {
    expect(SAVED_EXAMPLES_NOTICE).toBe('Live places aren’t loading right now, so these are saved examples.');
  });
});
