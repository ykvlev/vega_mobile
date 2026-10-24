/**
 * VEGA Stage 2 dark preview: proposed values, not measured pushr values.
 * Dimensions are logical units: web adapters add px, native consumes numbers.
 * No DOM, React, React Native or environment dependency is used here.
 */
export const darkColors = {
  canvas: '#080808',
  surface: '#171719',
  surfaceRaised: '#202023',
  surfaceInset: '#111113',
  textPrimary: '#F7F7F8',
  textSecondary: '#B5B5BE',
  textMuted: '#92929D',
  border: '#343439',
  borderStrong: '#777780',
  primary: '#F5F5F7',
  primaryText: '#111113',
  accent: '#D1FFCA',
  accentText: '#10200D',
  danger: '#FFABAB',
  warning: '#FFE29A',
  success: '#BCE9B4',
  overlay: '#000000B8',
  // Decorative only: do not use as the sole focus or control boundary.
  highlight: '#FFFFFF14',
  highlightStrong: '#FFFFFF26',
  transparent: '#00000000',
} as const;

export const spacing = {
  none: 0,
  hairline: 1,
  micro: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  section: 48,
  hero: 64,
} as const;

export const radii = {
  none: 0,
  input: 16,
  control: 20,
  cardSmall: 24,
  card: 32,
  hero: 40,
  pill: 999,
} as const;

/**
 * Platform-neutral typography. lineHeight is an absolute logical dimension;
 * fontWeight is numeric; letterSpacing uses the same unit as fontSize.
 * The platform adapter resolves fontFamily to a loaded font or system fallback.
 * Inter must not be considered bundled just because its name appears here.
 */
export const typography = {
  hero: {
    fontFamily: 'Inter',
    fontSize: 44,
    lineHeight: 48,
    fontWeight: 800,
    letterSpacing: -1.6,
  },
  screenTitle: {
    fontFamily: 'Inter',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 800,
    letterSpacing: -1,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  cardTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
    letterSpacing: -0.2,
  },
  amount: {
    fontFamily: 'Inter',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: 800,
    letterSpacing: -1,
  },
  body: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 600,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
    letterSpacing: 0,
  },
  button: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
    letterSpacing: -0.1,
  },
  navigation: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    letterSpacing: 0,
  },
} as const;

/** Milliseconds; reduced-motion adapters use reduced rather than animating. */
export const motion = {
  reduced: 0,
  feedback: 120,
  transition: 180,
  reveal: 240,
} as const;

export const layout = {
  pageInset: 24,
  compactPageInset: 16,
  contentMaxWidth: 1200,
  readingMaxWidth: 640,
  cardPadding: 24,
  controlMinHeight: 48,
  touchTargetMin: 48,
  bottomNavigationMinHeight: 64,
  actionDockMinHeight: 80,
} as const;

export const darkTheme = {
  colors: darkColors,
  spacing,
  radii,
  typography,
  motion,
  layout,
} as const;

export type DarkColors = typeof darkColors;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type Typography = typeof typography;
export type DarkTheme = typeof darkTheme;
