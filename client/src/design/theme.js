/**
 * Design tokens — the single source of truth for how this app looks.
 *
 * Before this existed, every screen carried its own StyleSheet: 38 distinct hardcoded colours
 * across 286 literals in nine files, so nothing quite matched anything else. Anything visual now
 * comes from here, and screens compose primitives (see primitives.js) rather than inventing
 * spacing, type or colour of their own.
 *
 * The palette is deliberately dark: this app is used in shops and storage units, often in poor
 * light, and a bright screen both glares and draws attention.
 */

/** Colour, named by role rather than by hue, so a value can change in one place. */
export const palette = {
  // Surfaces, back to front
  bg: '#0B1220',
  surface: '#141E2E',
  surfaceRaised: '#1C2839',
  surfacePressed: '#243349',
  overlay: 'rgba(6, 11, 20, 0.72)',

  // Lines
  border: '#25334A',
  borderStrong: '#364A66',

  // Text
  text: '#EAF0F7',
  textMuted: '#9FB0C6',
  textFaint: '#6C7E96',
  textOnAccent: '#04101F',

  // One accent for every primary action, plus semantics that mean something specific.
  accent: '#4EA1FF',
  accentDeep: '#1E6FD9',
  good: '#3DD68C',
  warn: '#F5B544',
  bad: '#FF6B6B'
};

/**
 * Semantic groups: foreground, a translucent background, and a border for the same meaning.
 * Screens ask for `tones.good`, never for a green.
 */
export const tones = {
  neutral: { fg: palette.textMuted, bg: 'rgba(159, 176, 198, 0.12)', line: palette.border },
  accent: { fg: palette.accent, bg: 'rgba(78, 161, 255, 0.16)', line: 'rgba(78, 161, 255, 0.42)' },
  good: { fg: palette.good, bg: 'rgba(61, 214, 140, 0.14)', line: 'rgba(61, 214, 140, 0.42)' },
  warn: { fg: palette.warn, bg: 'rgba(245, 181, 68, 0.14)', line: 'rgba(245, 181, 68, 0.42)' },
  bad: { fg: palette.bad, bg: 'rgba(255, 107, 107, 0.14)', line: 'rgba(255, 107, 107, 0.42)' }
};

/** A 4-based spacing scale. Every gap in the app is one of these. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Corner radii. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/** A type scale with exactly six steps and no ad-hoc font sizes. */
export const type = {
  display: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  heading: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  small: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  tiny: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }
};

/** Fixed layout numbers that more than one screen has to agree on. */
export const layout = {
  gutter: 16,
  tabBarHeight: 60,
  hairline: 1
};
