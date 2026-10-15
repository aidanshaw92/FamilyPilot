import { ExploreResult, ResultRow } from '@/src/utils/explore-results';
import { RadiusMiles } from '@/src/utils/explore-geo';

/**
 * The rows of Explore's list, in order, as plain data: the matches, then the looser readings under their own honest headings,
 * then what was hidden and what could not be checked, only when asked for or when there is nothing else to show.
 */
export type ListItem =
  | { key: string; type: 'card'; row: ResultRow; marker?: string }
  | { key: string; type: 'heading'; text: string; testID?: string }
  | { key: string; type: 'toggle'; kind: 'hidden' | 'notChecked'; text: string; actionLabel: string; testID: string };

/** More cards than this under one heading is a wall, not a list; the rest are a refinement away. */
export const MAX_SIDE_CARDS = 12;

export function buildListItems(
  result: ExploreResult,
  options: { radius: RadiusMiles; scope: 'nearby' | 'all'; showHidden: boolean; showNotChecked: boolean },
): ListItem[] {
  const items: ListItem[] = [];
  const card = (row: ResultRow, prefix: string): ListItem => ({ key: `${prefix}:${row.venue.id}`, type: 'card', row });

  for (const row of result.matches) items.push(card(row, 'match'));

  for (const group of result.also) {
    items.push({ key: `also:${group.id}`, type: 'heading', text: group.label, testID: `explore-also-${group.id}` });
    for (const row of group.rows.slice(0, MAX_SIDE_CARDS)) items.push(card(row, `also-${group.id}`));
  }

  if (result.outside.length) {
    items.push({ key: 'outside', type: 'heading', text: `Named, but more than ${options.radius} miles away`, testID: 'explore-outside' });
    for (const row of result.outside) items.push(card(row, 'outside'));
  }

  if (result.hidden.length) {
    const n = result.hidden.length;
    items.push({
      key: 'toggle:hidden', type: 'toggle', kind: 'hidden', testID: 'explore-hidden-toggle',
      text: options.showHidden
        ? `${n} hidden ${n === 1 ? 'place is' : 'places are'} shown below, each with the reason`
        : `${n} ${n === 1 ? 'place is' : 'places are'} hidden because a confirmed fact rules ${n === 1 ? 'it' : 'them'} out`,
      actionLabel: options.showHidden ? 'Hide again' : 'Show',
    });
    if (options.showHidden) for (const row of result.hidden) items.push({ ...card(row, 'hidden') });
  }

  if (result.notChecked.length) {
    const n = result.notChecked.length;
    const open = options.showNotChecked || result.matches.length === 0;
    items.push({
      key: 'toggle:notChecked', type: 'toggle', kind: 'notChecked', testID: 'explore-notchecked-toggle',
      text: `${n} ${n === 1 ? 'place is' : 'places are'} not checked for ${result.notCheckedFor.join(' or ')}, so not counted as a match`,
      actionLabel: open ? (result.matches.length === 0 ? '' : 'Hide') : 'Show',
    });
    if (open) for (const row of result.notChecked.slice(0, MAX_SIDE_CARDS * 2)) items.push(card(row, 'notchecked'));
  }
  return items;
}
