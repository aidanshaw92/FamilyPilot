export const colors = {
  /** The app's one confident accent: warm near-black, not a brand hue. Used for primary
   * buttons, active nav/tab states and links, the way a modern editorial travel app leans on
   * ink rather than a colored brand tint. */
  primary: {
    50: '#EDEAE5',
    100: '#DDD7CD',
    200: '#B6AEA0',
    500: '#1C1A18',
    600: '#0F0E0C',
    700: '#000000',
  },
  secondary: {
    50: '#E3F5EC',
    100: '#C7EBD9',
    500: '#1C8A57',
    600: '#167048',
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
  coral: '#E0654A',
  slateBlue: '#8B9FD4',
  steelBlue: '#7BAFD4',
  background: '#F6F3EE',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: {
    primary: '#171512',
    secondary: '#6B6459',
    tertiary: '#9A9285',
    inverse: '#FFFFFF',
  },
  border: '#E8E2D8',
  borderLight: '#F0EBE2',
  overlay: 'rgba(15, 13, 10, 0.45)',
  gradient: {
    heroStart: 'rgba(15, 13, 10, 0)',
    heroEnd: 'rgba(15, 13, 10, 0.7)',
  },
  /** A dark, immersive band reserved for the single most important moment on a screen (Home's
   * top pick, a venue detail hero) — used sparingly, never as a whole-app background. */
  midnight: {
    start: '#141210',
    end: '#232019',
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
