/**
 * "a" or "an" for a noun phrase, by its first letter: a park, a zoo, an attraction, an activity venue.
 *
 * Deliberately simple: the nouns it is used with are FamilyPilot's own category words, none of which starts with a silent
 * "h" or a "u" sounded as "you". Do not reuse it for arbitrary English without handling those.
 */
export function withIndefiniteArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun.trim()) ? 'an' : 'a'} ${noun}`;
}
