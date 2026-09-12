export const colors = {
  primary: {
    50: '#EEECFD',
    100: '#DCD8FB',
    200: '#B9B0F7',
    500: '#5B4FE8',
    600: '#4A3FD1',
    700: '#332A9E',
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
  background: '#F6F5F9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: {
    primary: '#0A0A0D',
    secondary: '#5C586E',
    tertiary: '#8B87A0',
    inverse: '#FFFFFF',
  },
  border: '#ECE9F2',
  borderLight: '#F3F1F7',
  overlay: 'rgba(10, 10, 13, 0.45)',
  gradient: {
    heroStart: 'rgba(10, 10, 13, 0)',
    heroEnd: 'rgba(10, 10, 13, 0.68)',
  },
  /** A dark, immersive band reserved for the single most important moment on a screen (Home's
   * top pick, a venue detail hero) — used sparingly, never as a whole-app background. */
  midnight: {
    start: '#14101F',
    end: '#241C3D',
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
