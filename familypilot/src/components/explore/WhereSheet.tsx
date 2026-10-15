import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { lookupArea } from '@/src/services/explore/area-lookup';
import { deviceLocationSupported, requestDeviceLocation } from '@/src/services/explore/device-location';
import { ExploreAnchor } from '@/src/utils/explore-geo';

/**
 * "Where are you looking?" (approved Figma page 10, frame C): the three places Explore can measure from.
 *
 *   My current location   asked only when this is tapped; kept on this phone, in memory, to measure distances; never sent or stored.
 *   My home area          the default: where the family's profile says home is.
 *   Another area          a postcode (NW5 1TL), the first half of one (NW5) or a well-known town, looked up for free.
 *
 * A refusal or a failure is an ordinary answer: it says what happened, keeps the home area, and the other two options stay open.
 */
export function WhereSheet({
  visible,
  onClose,
  home,
  current,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  /** The home area as Explore measures it (may be a stand-in for central London when none is known). */
  home: ExploreAnchor;
  /** What is chosen now. */
  current: ExploreAnchor;
  /** Null means the home area. */
  onChoose: (anchor: ExploreAnchor | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState('');
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null);
  const [busy, setBusy] = useState<'device' | 'area' | null>(null);
  // Each choice supersedes the one before: a slow answer from the phone must not move the parent after they chose something else.
  const attempt = useRef(0);

  useEffect(() => {
    if (visible) setNotice(null);
  }, [visible]);

  // The sheet is a Modal, which on the web mounts beside the app rather than over it, so the page behind stays in the tab order
  // and the reading order unless it is made inert while the sheet is open.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || typeof document === 'undefined') return;
    const root = document.getElementById('root');
    if (!root) return;
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
    return () => {
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    };
  }, [visible]);

  const useDevice = async () => {
    const mine = ++attempt.current;
    setBusy('device');
    setNotice(null);
    const result = await requestDeviceLocation();
    if (mine !== attempt.current) return;
    setBusy(null);
    if (result.ok) {
      onChoose({ kind: 'device', label: 'Near you', detail: 'Your current location', latitude: result.latitude, longitude: result.longitude });
      onClose();
      return;
    }
    onChoose(null);
    setNotice({
      tone: 'warn',
      text:
        result.reason === 'denied'
          ? `Location is off for FamilyPilot, so we are showing places near ${home.standIn ? 'central London' : 'your home area'} instead. You can turn it on in your browser or phone settings, or enter a postcode below.`
          : result.reason === 'timeout'
            ? 'We could not get your location in time, so we are showing places near your home area. Try again, or enter a postcode below.'
            : 'Your location is not available on this device, so we are showing places near your home area. You can enter a postcode below.',
    });
  };

  const useHome = () => {
    attempt.current += 1;
    setBusy(null);
    onChoose(null);
    onClose();
  };

  const useArea = async () => {
    const mine = ++attempt.current;
    setBusy('area');
    setNotice(null);
    const result = await lookupArea(area);
    if (mine !== attempt.current) return;
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: 'warn', text: result.message });
      return;
    }
    onChoose({ kind: 'area', label: result.label, detail: result.detail, latitude: result.latitude, longitude: result.longitude });
    setArea('');
    onClose();
  };

  const option = (kind: ExploreAnchor['kind'], selected: boolean) => ({ checked: selected, testID: `explore-where-option-${kind}` });
  const deviceChecked = current.kind === 'device';
  const homeChecked = current.kind === 'home';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="explore-where-sheet">
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text variant="heading2" accessibilityRole="header">Where are you looking?</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} testID="explore-where-close">
            <Text variant="link">Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {deviceLocationSupported() ? (
            <Pressable
              style={[styles.option, deviceChecked && styles.optionOn]}
              onPress={() => void useDevice()}
              accessibilityRole="radio"
              accessibilityState={{ checked: deviceChecked, busy: busy === 'device' }}
              aria-checked={deviceChecked}
              accessibilityLabel="My current location. Asked only when you tap it."
              testID={option('device', deviceChecked).testID}
            >
              <View style={styles.optionIcon}><Ionicons name="locate-outline" size={20} color={colors.action} /></View>
              <View style={styles.optionText}>
                <Text variant="bodySmall" style={styles.optionTitle}>My current location</Text>
                <Text variant="caption" color={colors.text.secondary}>
                  Asked only when you tap it. Used on this phone to measure distances; never sent or stored.
                </Text>
              </View>
              {busy === 'device' ? <ActivityIndicator color={colors.action} /> : <Radio on={deviceChecked} />}
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.option, homeChecked && styles.optionOn]}
            onPress={useHome}
            accessibilityRole="radio"
            accessibilityState={{ checked: homeChecked }}
            aria-checked={homeChecked}
            accessibilityLabel={`My home area. ${home.standIn ? 'Not set yet.' : home.label}`}
            testID={option('home', homeChecked).testID}
          >
            <View style={styles.optionIcon}><Ionicons name="home-outline" size={20} color={colors.action} /></View>
            <View style={styles.optionText}>
              <Text variant="bodySmall" style={styles.optionTitle}>My home area{home.standIn ? '' : ` · ${home.label.replace(/^Near /, '')}`}</Text>
              <Text variant="caption" color={colors.text.secondary}>
                {home.standIn ? 'Not set yet. Add your postcode in Profile to measure from home.' : 'The area from your family profile.'}
              </Text>
            </View>
            <Radio on={homeChecked} />
          </Pressable>

          <View style={[styles.option, styles.optionColumn, current.kind === 'area' && styles.optionOn]} testID={option('area', current.kind === 'area').testID}>
            <Text variant="bodySmall" style={styles.optionTitle}>Another area</Text>
            <Text variant="caption" color={colors.text.secondary}>
              A London postcode, like NW5 1TL, or just the first part, like NW5. A few well-known towns work too.
            </Text>
            <TextInput
              accessibilityLabel="Postcode or area"
              value={area}
              onChangeText={setArea}
              placeholder="e.g. NW5 1TL"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void useArea()}
              style={styles.input}
              testID="explore-where-input"
            />
            <Button label={busy === 'area' ? 'Looking…' : 'Show places near here'} onPress={() => void useArea()} disabled={busy === 'area' || area.trim().length < 2} size="md" fullWidth testID="explore-where-go" />
          </View>

          {notice ? (
            <View style={[styles.notice, notice.tone === 'warn' && styles.noticeWarn]} accessibilityLiveRegion="polite" testID="explore-where-notice">
              <Text variant="caption" color={notice.tone === 'warn' ? colors.warning[600] : colors.text.secondary}>{notice.text}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View style={[styles.radio, on && styles.radioOn]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {on ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, maxHeight: '90%', ...shadows.bottomSheet },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  close: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, minHeight: 64 },
  optionColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  optionOn: { borderColor: colors.action, backgroundColor: colors.actionSoft },
  optionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { fontFamily: 'Inter_600SemiBold' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.action },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.action },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.text.primary, minHeight: 48, outlineColor: colors.action },
  notice: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.fill },
  noticeWarn: { backgroundColor: colors.tint.yellow },
});
