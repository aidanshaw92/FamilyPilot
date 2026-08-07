import { Venue } from '@/src/types';

export interface ExploreEditorialSection {
  id: string;
  title: string;
  subtitle?: string;
  venues: Venue[];
}

function isFree(venue: Venue): boolean {
  return venue.estimatedSpend?.toLowerCase().includes('free') ?? false;
}

function isIndoorFriendly(venue: Venue): boolean {
  return venue.category === 'museum' || venue.category === 'soft_play' || venue.category === 'farm';
}

function suitsToddlers(venue: Venue): boolean {
  const text = venue.familyScore.explanation.join(' ').toLowerCase();
  return (
    text.includes('pushchair') ||
    text.includes('ozzie') ||
    text.includes('toddler') ||
    text.includes('baby') ||
    (venue.category === 'farm' && venue.familyScore.score >= 85)
  );
}

/**
 * Group filtered venues into editorial sections for curated Explore discovery.
 * Each venue appears in at most one section. Uses only existing venue attributes.
 */
export function buildExploreEditorialSections(venues: Venue[]): ExploreEditorialSection[] {
  if (venues.length === 0) return [];

  const assigned = new Set<string>();
  const sections: ExploreEditorialSection[] = [];

  const take = (predicate: (venue: Venue) => boolean, max: number): Venue[] => {
    const picked = venues.filter((v) => !assigned.has(v.id) && predicate(v)).slice(0, max);
    picked.forEach((v) => assigned.add(v.id));
    return picked;
  };

  const best = take((v) => v.familyScore.score >= 88, 3);
  if (best.length > 0) {
    sections.push({
      id: 'best',
      title: 'Best for your family',
      subtitle: 'Top matches based on your profile',
      venues: best,
    });
  }

  const toddlers = take(suitsToddlers, 2);
  if (toddlers.length > 0) {
    sections.push({
      id: 'toddlers',
      title: 'Great for toddlers',
      subtitle: 'Pushchair-friendly and age-appropriate',
      venues: toddlers,
    });
  }

  const free = take((v) => isFree(v) && v.driveMinutes <= 25, 2);
  if (free.length > 0) {
    sections.push({
      id: 'free',
      title: 'Free nearby',
      subtitle: 'No entry cost within easy reach',
      venues: free,
    });
  }

  const worthDrive = take((v) => v.driveMinutes >= 25 && v.familyScore.score >= 85, 2);
  if (worthDrive.length > 0) {
    sections.push({
      id: 'worth-drive',
      title: 'Worth the drive',
      subtitle: 'A little further — high family match',
      venues: worthDrive,
    });
  }

  const rainy = take(isIndoorFriendly, 2);
  if (rainy.length > 0) {
    sections.push({
      id: 'rainy',
      title: 'Rainy-day ideas',
      subtitle: 'Indoor or covered options',
      venues: rainy,
    });
  }

  const favourites = take((v) => v.familyScore.score >= 92, 2);
  if (favourites.length > 0) {
    sections.push({
      id: 'favourites',
      title: 'Family favourites',
      subtitle: 'Consistently strong matches',
      venues: favourites,
    });
  }

  const remaining = venues.filter((v) => !assigned.has(v.id));
  if (remaining.length > 0) {
    sections.push({
      id: 'more',
      title: 'More places',
      venues: remaining,
    });
  }

  return sections;
}
