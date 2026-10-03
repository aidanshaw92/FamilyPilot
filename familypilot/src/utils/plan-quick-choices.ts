import { weekdayOf } from '@/src/services/planning/plan-view-model';

/**
 * Frame 04's quick answers (nodes 76:30, 76:38): WHEN offers Today, the coming weekend day and
 * "Other date"; START offers 09:30, 10:00, 10:30 and "Other". The pickers slice 4 drew stay behind
 * "Other", so a parent who wants a Tuesday or 08:45 still has them, and a parent who wants Saturday
 * at ten taps twice. Pure, so the weekend arithmetic is tested rather than trusted.
 */
export interface QuickChoice {
  value: string;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** "Sat 20 Sep", the frame's own form. */
export function shortDateLabel(iso: string): string {
  const parts = weekdayOf(iso);
  return parts ? `${parts.short} ${parts.day} ${parts.month}` : iso;
}

/**
 * The coming weekend day: the next Saturday, or tomorrow's Sunday when today is Saturday, and next
 * Saturday when today is Sunday. Never today, because Today is its own chip.
 */
export function nextWeekendDay(today: string): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDays(today, offset);
    const day = weekdayOf(candidate)?.long;
    if (day === 'Saturday' || day === 'Sunday') return candidate;
  }
  return addDays(today, 6);
}

export function dateQuickChoices(today: string): QuickChoice[] {
  const weekend = nextWeekendDay(today);
  return [
    { value: today, label: 'Today' },
    { value: weekend, label: shortDateLabel(weekend) },
  ];
}

export const START_QUICK_CHOICES: QuickChoice[] = [
  { value: '09:30', label: '09:30' },
  { value: '10:00', label: '10:00' },
  { value: '10:30', label: '10:30' },
];
