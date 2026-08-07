import { Redirect } from 'expo-router';

/** Internal tools entry — direct URL only, not linked from consumer app. */
export default function InternalIndex() {
  return <Redirect href="/internal/enrichment" />;
}
