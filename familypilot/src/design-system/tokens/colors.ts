/**
 * One restrained palette: a near-white canvas, white surfaces, near-black for every primary
 * control, and grey for everything secondary. Colour is reserved for semantics (trust,
 * caution, error) and for photography, which carries the interface.
 */
export const colors = {
  /** Primary action colour. Near-black charcoal, not a brand hue. */
  primary: {
    50: '#F1F1F2',
    100: '#E3E3E5',
    200: '#C4C4C8',
    500: '#1C1C1E',
    600: '#111113',
    700: '#000000',
  },
  /** Confirmed / positive facts only. Never decoration. */
  secondary: {
    50: '#E8F3EC',
    100: '#CFE6D8',
    500: '#1F7A46',
    600: '#19653A',
  },
  accent: {
    50: '#EAF1F8',
    100: '#D3E3F1',
    500: '#2E77B8',
    600: '#215B90',
  },
  warning: {
    50: '#FBF1E2',
    100: '#F4DFBB',
    500: '#9A6413',
    600: '#7C500F',
  },
  error: {
    50: '#FBEBEA',
    100: '#F4D2CF',
    500: '#C0453C',
    600: '#9C3831',
  },
  coral: '#E2674B',
  slateBlue: '#8B9FD4',
  steelBlue: '#7BAFD4',

  /** Page background: the light grey the white cards sit on. */
  background: '#F2F2F3',
  /** Cards, sheets, floating controls. */
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  /** A quieter fill for chips and inset rows inside a white card. */
  surfaceSunken: '#F5F5F6',

  text: {
    primary: '#1C1C1E',
    secondary: '#6E6E73',
    tertiary: '#9A9AA0',
    inverse: '#FFFFFF',
  },

  /** Hairline borders do the work shadows used to. */
  border: '#E6E6E8',
  borderLight: '#F0F0F1',

  overlay: 'rgba(20, 20, 22, 0.45)',
  /** Translucent dark chrome that floats on photography. */
  glass: {
    dark: 'rgba(20, 20, 22, 0.55)',
    darker: 'rgba(20, 20, 22, 0.78)',
    light: 'rgba(255, 255, 255, 0.92)',
  },
  gradient: {
    /** Bottom-up scrim so white text stays readable over any photo. */
    heroStart: 'rgba(16, 16, 18, 0)',
    heroMid: 'rgba(16, 16, 18, 0.28)',
    heroEnd: 'rgba(16, 16, 18, 0.82)',
  },
  midnight: {
    start: '#141416',
    end: '#232326',
  },
  /** Every category owns a gradient so a card without a photo still reads as designed. */
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
