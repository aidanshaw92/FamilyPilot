export const colors = {
  primary: {
    50: '#F5F0FF',
    100: '#EBE0FF',
    200: '#D4C2F0',
    500: '#8B6FC0',
    600: '#7358A8',
    700: '#5C4588',
  },
  secondary: {
    50: '#F0FAF4',
    100: '#D4F0E0',
    500: '#5CB88A',
    600: '#4A9A72',
  },
  accent: {
    50: '#EFF8FD',
    100: '#D6EDFA',
    500: '#6BB8E8',
    600: '#4A9FD4',
  },
  warning: {
    50: '#FDF6EE',
    100: '#FAE8CC',
    500: '#E8A54B',
    600: '#D48E30',
  },
  error: {
    50: '#FDF0EE',
    100: '#F5D4CF',
    500: '#D4756A',
    600: '#B85A50',
  },
  coral: '#E8927C',
  slateBlue: '#8B9FD4',
  steelBlue: '#7BAFD4',
  background: '#F8F7F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  text: {
    primary: '#1A1A2E',
    secondary: '#6B6B80',
    tertiary: '#9B9BA8',
    inverse: '#FFFFFF',
  },
  border: '#E8E6E3',
  borderLight: '#F0EEEB',
  overlay: 'rgba(26, 26, 46, 0.4)',
  gradient: {
    heroStart: 'rgba(26, 26, 46, 0)',
    heroEnd: 'rgba(26, 26, 46, 0.65)',
  },
} as const;

export type ColorToken = typeof colors;
