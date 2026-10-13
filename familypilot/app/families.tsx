import { Redirect } from 'expo-router';

/** The old Families tab's address: it lands on Together's Your families. */
export default function FamiliesRedirect() {
  return <Redirect href={{ pathname: '/together', params: { view: 'families' } } as never} />;
}
