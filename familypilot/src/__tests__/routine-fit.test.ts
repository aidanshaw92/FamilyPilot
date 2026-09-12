import { describe, expect, it } from 'vitest';

import { createEmptyProfile } from '@/src/utils/profile-defaults';
import { evaluateRoutineFit } from '@/src/utils/routine-fit';

const withRoutines = (routines: NonNullable<ReturnType<typeof createEmptyProfile>['routines']>) => ({
  ...createEmptyProfile(),
  routines,
});

describe('evaluateRoutineFit', () => {
  it('returns no reason or caution when the profile has no routines', () => {
    expect(evaluateRoutineFit(createEmptyProfile(), 10)).toEqual({ reason: null, caution: null });
  });

  it('returns nothing when the only routine time has already passed today', () => {
    const profile = withRoutines([
      { id: 'r1', label: 'Morning nap', kind: 'nap', time: '09:00', durationMinutes: 60, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 14, 0); // 2pm
    expect(evaluateRoutineFit(profile, 10, now)).toEqual({ reason: null, caution: null });
  });

  it('gives a positive "leave by" reason when there is still time before a nap', () => {
    const profile = withRoutines([
      { id: 'r1', label: 'Afternoon nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 9, 0); // 9am, plenty of runway
    const fit = evaluateRoutineFit(profile, 30, now);
    expect(fit).toEqual({ reason: 'Leave by 12:30pm to be home in time for Afternoon nap', caution: null });
  });

  it('gives a positive "leave by" reason for a feed routine, matching the "home for lunch" example', () => {
    const profile = withRoutines([
      { id: 'r1', label: 'Lunch', kind: 'feed', time: '12:30', durationMinutes: 30, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 9, 0); // 9am
    const fit = evaluateRoutineFit(profile, 30, now); // 30 min drive, leave by 12:00 for lunch
    expect(fit).toEqual({ reason: 'Leave by 12:00pm to be home in time for Lunch', caution: null });
  });

  it('warns instead when leaving right now would already miss the routine', () => {
    const profile = withRoutines([
      { id: 'r1', label: 'Afternoon nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 12, 45); // 12:45pm — a 30 min drive means leaving by 12:30 was needed
    const fit = evaluateRoutineFit(profile, 30, now);
    expect(fit).toEqual({ reason: null, caution: 'A visit today may run into Afternoon nap time (around 1:00pm)' });
  });

  it('picks whichever of nap or feed comes soonest', () => {
    const profile = withRoutines([
      { id: 'r1', label: 'Afternoon nap', kind: 'nap', time: '15:00', durationMinutes: 60, atHome: true },
      { id: 'r2', label: 'Lunch', kind: 'feed', time: '12:30', durationMinutes: 30, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 9, 0);
    const fit = evaluateRoutineFit(profile, 15, now);
    expect(fit.reason).toContain('Lunch');
  });

  it('ignores routines that have already passed even when a later one remains', () => {
    const profile = withRoutines([
      { id: 'r1', label: 'Morning nap', kind: 'nap', time: '09:00', durationMinutes: 60, atHome: true },
      { id: 'r2', label: 'Lunch', kind: 'feed', time: '12:30', durationMinutes: 30, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 10, 0); // morning nap already passed
    const fit = evaluateRoutineFit(profile, 15, now);
    expect(fit.reason).toContain('Lunch');
  });

  it('falls back to a generic label for an unlabelled nap', () => {
    const profile = withRoutines([
      { id: 'r1', label: '', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 9, 0);
    expect(evaluateRoutineFit(profile, 10, now).reason).toContain('nap');
  });

  it('falls back to a generic label for an unlabelled feed', () => {
    const profile = withRoutines([
      { id: 'r1', label: '', kind: 'feed', time: '13:00', durationMinutes: 30, atHome: true },
    ]);
    const now = new Date(2026, 0, 1, 9, 0);
    expect(evaluateRoutineFit(profile, 10, now).reason).toContain('feed');
  });
});
