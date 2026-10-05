/**
 * FamilyPilot's palette, from the three approved identity references (Home, Explore, Welcome;
 * `docs/VISUAL_IDENTITY.md` records the sampled values).
 *
 * Two roles that used to share one near-black are now distinct:
 *   - `ink` is the dark navy that TEXT is set in.
 *   - `action` is the deep green that CONTROLS are drawn in: primary buttons, selected chips, the
 *     floating navigation, the arrow CTA, the filter disc, focus rings.
 * A control that needs emphasis goes green; a word never does, except a link.
 *
 * The three tinted fills (mint, blush, lilac) and the yellow are accents. They appear on idle chips in
 * a rail, on icon wells, on decorative shapes and nowhere large. They carry no meaning: a chip's tint is
 * assigned by its position, not by what it filters.
 */
const INK = '#0D1733';
const ACTION = '#0F4A3E';

export const colors = {
  /** Navy ink: text. `text.primary` is the same value on purpose. */
  ink: INK,
  /** Deep green: the one colour a control is drawn in. */
  action: ACTION,
  actionPressed: '#0B3B32',
  /** The slightly lighter green Home's filter disc and a hovered control use. */
  actionStrong: '#15534A',
  /** Mint behind a green mark: Family Fit on a light surface, the empty-state well. */
  actionSoft: '#E7F3EF',
  /** Quiet neutral fill for wells and information boxes that sit on a white card. */
  fill: '#F3F1EC',
  /** The floating navigation pill and its active disc. */
  nav: {
    pill: ACTION,
    active: '#DDF1E8',
  },
  /** Idle chip and icon-well fills. Decorative; rotated by position. */
  tint: {
    mint: '#E7F3EF',
    blush: '#FBECEA',
    lilac: '#F3ECFB',
    yellow: '#FDF1CC',
  },
  /** The deeper tone of each tint, for a blob or a stronger well. */
  tintStrong: {
    mint: '#DDF1E8',
    blush: '#FADBD8',
    lilac: '#EADFF8',
  },
  /** Saturated accents for icons on the tints and for the decorative marks. */
  brand: {
    mint: '#5FB3A3',
    coral: '#E26B4A',
    violet: '#6B21E8',
    yellow: '#F7C12E',
    green: '#3F9A82',
    /** The pale leaf green of the decorative marks only. */
    leaf: '#8FCDB9',
  },
  /**
   * Legacy brand purple. Retired from consumer chrome; still referenced by the internal enrichment
   * tools. Do not introduce new consumer uses — `design-system-guard.test.ts` fails on them.
   */
  primary: {
    50: '#EEECFD',
    100: '#DCD8FB',
    200: '#B9B0F7',
    500: '#5B4FE8',
    600: '#4A3FD1',
    700: '#332A9E',
  },
  /** Confirmed facts and success: the identity's mid green. */
  secondary: {
    50: '#E7F3EF',
    100: '#DDF1E8',
    500: '#3F9A82',
    600: '#2E7D69',
  },
  accent: {
    50: '#E8F3FB',
    100: '#CFE7F7',
    500: '#2F8FD6',
    600: '#1E72B0',
  },
  warning: {
    50: '#FBF0DD',
    100: '#F5DCAE',
    500: '#A8660C',
    600: '#8A5209',
  },
  error: {
    50: '#FBEAE8',
    100: '#F5CFC9',
    500: '#C4453B',
    600: '#A23730',
  },
  /** The filled save heart. */
  coral: '#E26B4A',
  slateBlue: '#8B9FD4',
  steelBlue: '#7BAFD4',
  /** Warm near-white canvas. Cards are pure white on it. */
  background: '#FBFAF7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: {
    primary: INK,
    secondary: '#626A80',
    // 4.5:1 on white and on the canvas, the AA floor for text. The earlier #8A91A0 was 3.0:1 and was
    // used for the search placeholder, the footnotes and links, which are all text.
    tertiary: '#6B7384',
    inverse: '#FFFFFF',
  },
  border: '#E9E7E1',
  borderLight: '#F1EFEA',
  overlay: 'rgba(13, 23, 51, 0.45)',
  /**
   * Behind a bottom sheet. Lighter than `overlay` because the approved design keeps the venue
   * readable behind the sheet rather than dimming it to a backdrop.
   */
  sheetScrim: 'rgba(13, 23, 51, 0.42)',
  /** A scrim over photography fades to green-black, not neutral black (the Home reference). */
  gradient: {
    heroStart: 'rgba(10, 46, 39, 0)',
    heroMid: 'rgba(10, 46, 39, 0.3)',
    heroEnd: 'rgba(10, 46, 39, 0.72)',
  },
  /** Translucent chrome that sits directly on photography. */
  glass: {
    dark: 'rgba(10, 46, 39, 0.55)',
    darker: 'rgba(10, 46, 39, 0.78)',
    light: 'rgba(255, 255, 255, 0.92)',
    /** The action green with a hint of the photo through it: the deck's CTA, Family Fit on an image. */
    action: 'rgba(15, 74, 62, 0.92)',
  },
  /** The one dark band on a screen, now green: the fallback image gradient, the profile avatars. */
  midnight: {
    start: '#0B3B32',
    end: '#15534A',
  },
  /** Every venue category owns a gradient so a card without a real photo still reads as
   * designed rather than broken — upgrades automatically the moment a real photo exists. */
  categoryGradients: {
    park: ['#2F6B4F', '#8FD9A8'],
    farm: ['#8A5A16', '#E4B168'],
    zoo: ['#6B4A16', '#D9A552'],
    museum: ['#3C31A8', '#8B7CF6'],
    attraction: ['#A3116A', '#F27FC0'],
    activity: ['#A3116A', '#F27FC0'],
    soft_play: ['#A3116A', '#F27FC0'],
    beach: ['#0E5A8F', '#6FD0EA'],
    restaurant: ['#8A3A24', '#F2A888'],
    cafe: ['#8A3A24', '#F2A888'],
    shop: ['#146B5C', '#6FE0C7'],
    hotel: ['#5A1A6B', '#C77FE0'],
  } as const,
} as const;

export type ColorToken = typeof colors;
