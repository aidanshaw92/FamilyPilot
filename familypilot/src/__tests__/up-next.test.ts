import { describe, expect, it } from 'vitest';

import { pickUpNext, relativeDay } from '@/src/services/planning/up-next';

const plan = (id: string, date: string, start = 600, note?: string) => ({ id, date, start, title: `Day ${id}`, dateSummary: `${date} · 10:00–14:00`, note });
const invite = (id: string, date: string, start = 600) => ({ ...plan(id, date, start), from: 'Sam’s family' });

describe('Home leads with a day already in motion', () => {
  const today = '2026-10-14';

  it('with nothing saved and nothing waiting there is nothing to lead with (Home is unchanged)', () => {
    expect(pickUpNext({ today, plans: [], invitations: [] })).toBeNull();
  });

  it('an invitation waiting for an answer comes before any plan', () => {
    const next = pickUpNext({ today, plans: [plan('a', '2026-10-14')], invitations: [invite('i1', '2026-10-20')] });
    expect(next).toMatchObject({ kind: 'invitation', id: 'i1', from: 'Sam’s family', when: 'Tue 20 Oct' });
  });

  it('otherwise it is the next plan on or after today, earliest first, and its status travels with it', () => {
    const next = pickUpNext({ today, plans: [plan('late', '2026-10-30'), plan('soon', '2026-10-15', 540, 'Alex’s family accepted'), plan('old', '2026-10-01')], invitations: [] });
    expect(next).toMatchObject({ kind: 'plan', id: 'soon', when: 'Tomorrow', note: 'Alex’s family accepted' });
  });

  it('two plans on one day are ordered by their first stop', () => {
    const next = pickUpNext({ today, plans: [plan('pm', today, 900), plan('am', today, 600)], invitations: [] });
    expect(next).toMatchObject({ id: 'am', when: 'Today' });
  });

  it('a day that has passed is never offered, and neither is an invitation to one', () => {
    expect(pickUpNext({ today, plans: [plan('old', '2026-10-13')], invitations: [invite('gone', '2026-10-01')] })).toBeNull();
  });

  it('names the day plainly', () => {
    expect(relativeDay('2026-10-14', today)).toBe('Today');
    expect(relativeDay('2026-10-15', today)).toBe('Tomorrow');
    expect(relativeDay('2026-10-17', today)).toBe('Sat 17 Oct');
  });
});
