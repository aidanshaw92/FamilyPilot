import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet } from 'react-native';

import { colors } from '@/src/design-system/tokens';

interface ShareButtonProps {
  title: string;
  path: string;
  size?: number;
  color?: string;
}

// Production web origin, used as the sharable link's base on native (where there's no
// window.location) so a shared link is always a real https URL anyone can open, not a
// familypilot:// scheme link that only works if the recipient has the app installed.
const PRODUCTION_WEB_ORIGIN = 'https://family-pilot-seven.vercel.app';

function venueShareUrl(path: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  const origin = process.env.EXPO_PUBLIC_WEB_URL || PRODUCTION_WEB_ORIGIN;
  return `${origin}${path}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to unsupported.
  }
  return false;
}

export function ShareButton({ title, path, size = 24, color = colors.text.primary }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handlePress = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = venueShareUrl(path);

    if (Platform.OS === 'web') {
      // navigator.share (mobile browsers, some desktop) beats a bare clipboard copy when available.
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : undefined;
      if (nav?.share) {
        try {
          await nav.share({ title, url });
          return;
        } catch {
          // User cancelled the native share sheet, or it's unsupported for this input - fall
          // through to clipboard rather than leaving the tap silently doing nothing.
        }
      }
      if (await copyToClipboard(url)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      return;
    }

    try {
      await Share.share({ message: `${title}\n${url}`, url });
    } catch {
      // User cancelled the native share sheet - nothing to do.
    }
  };

  return (
    <Pressable
      onPress={() => void handlePress()}
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Link copied' : `Share ${title}`}
      hitSlop={8}
      style={styles.hitArea}
    >
      <Ionicons name={copied ? 'checkmark' : 'share-outline'} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
