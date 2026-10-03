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
