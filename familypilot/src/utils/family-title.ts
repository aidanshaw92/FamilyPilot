/**
 * "Aidan’s family", or "Your family" when no name has been given.
 *
 * The Profile card used to print `The {parentName} Family`, which read "The  Family" with no name
 * and "The Aidan Shaw Family" when a parent typed their full name into a first-name field.
 */
export function familyTitle(parentName: string | undefined): string {
  const first = (parentName ?? '').trim().split(/\s+/)[0];
  if (!first) return 'Your family';
  return `${first}${/s$/i.test(first) ? '’' : '’s'} family`;
}

/**
 * Another family, as it is shown to the person using the app.
 *
 * A family's `label` comes from three places and means a different thing in each:
 *   - a connection shares its own label, already a family: "Alex’s family" (connection-snapshot.ts);
 *   - a family added by postcode is labelled with the first name typed for them: "Hannah" (AddFamilyByPostcode);
 *   - a household the parent named, or a fixed label: "Shaw family", "The Hills", "A FamilyPilot family".
 * Shown bare, the second reads as a person rather than a family, and every sentence that then added "’s family" to a label
 * of the first kind said "Alex’s family’s family". This is the one place a label becomes a family's display name:
 *   "Hannah" → "Hannah’s family", "James" → "James’ family", "Aidan’s" / "Aidan's" → "Aidan’s family",
 *   "Alex’s family", "Shaw family", "The Hills" → as given.
 * Nothing is looked up or guessed: only the words given are used.
 */
export function familyDisplayName(label: string | null | undefined): string {
  const text = (label ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return 'Another family';
  // Already a family, or a household named in the parent's own words.
  if (/\bfamily$/i.test(text) || /^the\s/i.test(text)) return text;
  // Already possessive, as a parent might type it.
  if (/[’']s$/i.test(text) || /s[’']$/i.test(text)) return `${text.replace(/'/g, '’')} family`;
  return `${text}${/s$/i.test(text) ? '’' : '’s'} family`;
}
