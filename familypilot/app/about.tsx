import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import {
  ODBL_NOTICE,
  ODBL_URL,
  OGL_URL,
  OSM_COPYRIGHT_URL,
  OSM_CREDIT,
  OS_CREDIT,
  PLACE_LISTS_URL,
  WIKIDATA_LICENCE_URL,
  WIKIDATA_NOTICE,
} from '@/src/services/places/attribution';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as never);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">About FamilyPilot</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Beta programme · How we handle information
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section
          title="FamilyPilot beta"
          body="FamilyPilot is in active development with real families. Some venue details, prices, opening hours and shop availability are estimated or sourced from providers and may not be complete."
        />
        <Section
          title="Recommendations"
          body="Family Fit scores reflect suitability for your family based on the details you share. They are guidance to help you decide, not guarantees."
        />
        <Section
          title="Prices & availability"
          body="We label estimated costs and use phrases like 'Usually stocks' unless information comes directly from a retailer or venue."
        />
        <Section
          title="Your privacy"
          body="We use your general home area, not your full address, to suggest nearby places. Your family details stay private and are not shared with other users."
        />
        <DataLicences />
        <Section
          title="Feedback"
          body="Your feedback helps us improve FamilyPilot before wider release. Use Send feedback on your Profile screen to share what worked and what did not."
        />
      </ScrollView>
    </View>
  );
}

/**
 * Where place data comes from and under what licence. The notice the Open Database Licence asks for (4.3), the Ordnance Survey statement the Open
 * Government Licence asks for, and a link to each licence. Kept as plain text with links so it reads at any text size.
 */
function DataLicences() {
  return (
    <View style={styles.section} testID="about-data-licences">
      <Text variant="heading3">Place data and licences</Text>
      <Text variant="body" color={colors.text.secondary} style={styles.body}>
        Some places are listed from open data. Names, positions and categories come from those sources and are reviewed before they are added; opening hours,
        facilities and who a place suits are shown as not checked until we have looked.
      </Text>
      <LicenceLine text={`${OSM_CREDIT}. ${ODBL_NOTICE}`} links={[['OpenStreetMap copyright', OSM_COPYRIGHT_URL], ['Open Database License', ODBL_URL]]} />
      <LicenceLine text={`${OS_CREDIT}, under the Open Government Licence v3.0.`} links={[['Open Government Licence', OGL_URL]]} />
      <LicenceLine text={WIKIDATA_NOTICE} links={[['Wikidata licensing', WIKIDATA_LICENCE_URL]]} />
      <LicenceLine text="The lists of independently sourced places are public." links={[['Read the lists', PLACE_LISTS_URL]]} />
    </View>
  );
}

function LicenceLine({ text, links }: { text: string; links: Array<[string, string]> }) {
  return (
    <View style={styles.licenceLine}>
      <Text variant="body" color={colors.text.secondary} style={styles.body}>
        {text}
      </Text>
      <View style={styles.links}>
        {links.map(([label, url]) => (
          <Pressable key={url} onPress={() => void Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`${label}, opens in your browser`} hitSlop={8}>
            <Text variant="link" style={styles.link}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text variant="heading3">{title}</Text>
      <Text variant="body" color={colors.text.secondary} style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  content: {
    padding: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  section: {
    marginBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  body: {
    lineHeight: 24,
  },
  licenceLine: { gap: spacing.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  link: { textDecorationLine: 'underline' },
});
