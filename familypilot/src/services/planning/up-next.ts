/**
 * What Home puts first when there is something already in motion.
 *
 * A parent who has a day coming up, or an invitation waiting for an answer, does not want a fresh list of ideas first: they want
 * that. This picks the one thing: an invitation that is waiting on them (it is the only thing that is blocked on the parent),
 * otherwise the next plan on or after today. Nothing else is ever offered here, and with neither there is nothing, so Home is
 * exactly the recommendation screen it always was.
 */

export interface UpNextCandidate {
  id: string;
  /** YYYY-MM-DD, in the parent's own day. */
  date: string;
  /** Minutes from midnight of the first stop, to order two plans on one day. */
  start: number;
  title: string;
  /** "Wed 14 Oct · 09:34–13:27" */
  dateSummary: string;
  /** Where it stands, in words: "Sent to Alex’s family · waiting for a reply". */
  note?: string;
}

export interface InvitationCandidate extends UpNextCandidate {
  /** "Sam’s family" */
  from: string;
}

export type UpNext =
  | { kind: 'invitation'; id: string; title: string; dateSummary: string; from: string; when: string }
  | { kind: 'plan'; id: string; title: string; dateSummary: string; note?: string; when: string };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parse = (date: string): Date => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "Today", "Tomorrow", otherwise "Wed 14 Oct". */
export function relativeDay(date: string, today: string): string {
  const days = Math.round((parse(date).getTime() - parse(today).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const d = parse(date);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const byTime = (a: UpNextCandidate, b: UpNextCandidate) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1);

export function pickUpNext(input: { today: string; plans: UpNextCandidate[]; invitations: InvitationCandidate[] }): UpNext | null {
  const { today } = input;
  const invitation = input.invitations.filter((i) => i.date >= today).sort(byTime)[0];
  if (invitation) {
    return { kind: 'invitation', id: invitation.id, title: invitation.title, dateSummary: invitation.dateSummary, from: invitation.from, when: relativeDay(invitation.date, today) };
  }
  const plan = input.plans.filter((p) => p.date >= today).sort(byTime)[0];
  if (plan) return { kind: 'plan', id: plan.id, title: plan.title, dateSummary: plan.dateSummary, note: plan.note, when: relativeDay(plan.date, today) };
  return null;
}
