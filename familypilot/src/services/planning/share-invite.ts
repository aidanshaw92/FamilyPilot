import { Platform, Share } from 'react-native';

/**
 * Hands an invitation link to the person to send however they like.
 *
 * Tries the system share sheet first (messages, WhatsApp, email), then the clipboard on the web, and reports which
 * worked so the screen can say "Link copied". The link is also shown as plain, selectable text beside the buttons, so
 * a device with neither still has a way to copy it by hand. No package is added for this.
 */
export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

export async function shareInvite(message: string, url: string): Promise<ShareOutcome> {
  try {
    const result = await Share.share(Platform.OS === 'ios' ? { message, url } : { message });
    if (result.action === Share.sharedAction) return 'shared';
    if (result.action === Share.dismissedAction) return 'failed';
  } catch {
    // the web share sheet may be unavailable; copy instead
  }
  return (await copyText(message)) ? 'copied' : 'failed';
}
