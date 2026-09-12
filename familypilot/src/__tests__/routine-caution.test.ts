import { describe, expect, it } from 'vitest';

import { createEmptyProfile } from '@/src/utils/profile-defaults';
import { buildRoutineCaution } from '@/src/utils/routine-caution';

const napAt = (time: string) => ({
  ...createEmptyProfile(),
  routines: [{ id: 'r1', label: 'Afternoon nap', kind: 'nap' as const, time, durationMinutes: 60, atHome: true }],
});

describe('buildRoutineCaution', () => {
  it('returns null when the profile has no routines', () => {
    expect(buildRoutineCaution(createEmptyProfile(), 10)).toBeNull();
  });

  it('returns null when the profile has no nap routine', () => {
    const profile = {
      ...createEmptyProfile(),
      routines: [{ id: 'r1', label: 'Lunch', kind: 'feed' as const, time: '12:00', durationMinutes: 30, atHome: true }],
    };
    expect(buildRoutineCaution(profile, 10)).toBeNull();
  });

  it('returns null when today’s nap time has already passed', () => {
    const profile = napAt('09:00');
    const now = new Date(2026, 0, 1, 14, 0); // 2pm
    expect(buildRoutineCaution(profile, 10, now)).toBeNull();
  });

  it('returns null when a short visit comfortably beats the nap', () => {
    const profile = napAt('16:00'); // hours away
    const now = new Date(2026, 0, 1, 9, 0); // 9am
    expect(buildRoutineCaution(profile, 10, now)).toBeNull();
  });

  it('warns when leaving now would run into the nap', () => {
    const profile = napAt('13:00');
    const now = new Date(2026, 0, 1, 12, 0); // noon, nap is in 1 hour
    const caution = buildRoutineCaution(profile, 10, now); // 110 min needed, only 60 available
    expect(caution).toBe('A visit today may run into Afternoon nap time (around 1:00pm)');
  });

  it('falls back to a generic "nap" label when none is given', () => {
    const profile = {
      ...createEmptyProfile(),
      routines: [{ id: 'r1', label: '', kind: 'nap' as const, time: '13:00', durationMinutes: 60, atHome: true }],
    };
    const now = new Date(2026, 0, 1, 12, 0);
    expect(buildRoutineCaution(profile, 10, now)).toContain('nap time');
  });
});
