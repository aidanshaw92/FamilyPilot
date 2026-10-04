import type { Ionicons } from '@expo/vector-icons';

import type { DoodleKind, DoodleTint, IconWellTint, PhotoSlotCategory } from '@/src/components/ui';

/**
 * The Welcome composition, in the Figma frame's own coordinates (393 wide). The screen multiplies
 * every value by `width / 393`, so the collage keeps its arrangement on a 360 and a 430 alike.
 * Kept out of the screen so a test can hold it to the three rules the brief set for the slots and
 * the marks: nothing overlaps a benefit card, nothing is interactive, nothing is a stock photo.
 */
export const WELCOME_DESIGN_WIDTH = 393;

export interface WelcomeSlot {
  id: string;
  /** The editorial subject the slot is reserved for, so a photograph is sourced for it later. */
  subject: string;
  category: PhotoSlotCategory;
  shape: 'rounded' | 'circle';
  icon: keyof typeof Ionicons.glyphMap;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The collage box starts at the frame's y=286 and is 312 tall; slot positions are relative to it. */
export const WELCOME_COLLAGE = {
  height: 312,
  slots: [
    { id: 'farm', subject: 'child with a rabbit at a farm', category: 'farm', shape: 'rounded', icon: 'flower-outline', x: 0, y: 14, w: 150, h: 124 },
    { id: 'cafe', subject: 'coffee and a croissant', category: 'cafe', shape: 'circle', icon: 'cafe-outline', x: 168, y: 34, w: 118, h: 118 },
    { id: 'crafts', subject: 'pottery painting', category: 'activity', shape: 'rounded', icon: 'color-palette-outline', x: 296, y: 26, w: 110, h: 120 },
    { id: 'soft-play', subject: 'toddler on a soft-play frame', category: 'soft_play', shape: 'rounded', icon: 'happy-outline', x: 0, y: 150, w: 150, h: 118 },
    { id: 'puddles', subject: 'wellies in a puddle', category: 'park', shape: 'rounded', icon: 'rainy-outline', x: 160, y: 162, w: 126, h: 112 },
    { id: 'aquarium', subject: 'penguin at an aquarium', category: 'beach', shape: 'circle', icon: 'water-outline', x: 300, y: 158, w: 106, h: 106 },
  ] as const satisfies readonly WelcomeSlot[],
} as const;

export interface WelcomeDoodle {
  id: string;
  kind: DoodleKind;
  tint: DoodleTint;
  size: number;
  rotate?: number;
  x: number;
  y: number;
}

export const WELCOME_DOODLES: readonly WelcomeDoodle[] = [
  { id: 'blob-blush', kind: 'blob', tint: 'blush', size: 45, x: 150, y: 0 },
  { id: 'strokes', kind: 'strokes', tint: 'yellow', size: 24, x: 158, y: 14 },
  { id: 'leaf-mint', kind: 'leaf', tint: 'mint', size: 29, rotate: 20, x: 236, y: 146 },
  { id: 'blob-lilac', kind: 'blob', tint: 'lilac', size: 38, x: 140, y: 274 },
  { id: 'leaf-green', kind: 'leaf', tint: 'green', size: 38, rotate: -30, x: 2, y: 268 },
];

export const WELCOME_BENEFITS: readonly {
  icon: keyof typeof Ionicons.glyphMap;
  tint: IconWellTint;
  title: string;
  subtitle: string;
}[] = [
  { icon: 'leaf-outline', tint: 'mint', title: 'Days out & activities', subtitle: 'Find places that actually suit your family.' },
  { icon: 'people-outline', tint: 'blush', title: 'Personalised recommendations', subtitle: "Based on your children's ages and needs." },
  { icon: 'sparkles-outline', tint: 'lilac', title: 'Less planning, more family time', subtitle: 'Get ideas, itineraries and helpful tips.' },
];
