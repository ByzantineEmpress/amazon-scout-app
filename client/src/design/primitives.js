/**
 * Shared UI primitives.
 *
 * Every screen is built from these, which is what makes the app feel like one app. They exist so
 * that spacing, radii, type and tone are decided once instead of per file - the thing nine
 * separate StyleSheets could never agree on.
 *
 * Nothing here knows about barcodes, eBay or Amazon; they are purely presentational.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, tones, space, radius, type, layout } from './theme';

/**
 * A screen surface: background, safe-area padding, gutters, and optionally scrolling content.
 */
export function Screen({ children, scroll = false, padded = true, style, contentStyle }) {
  const insets = useSafeAreaInsets();
  const padding = padded ? { paddingHorizontal: layout.gutter } : null;

  if (scroll) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }, style]}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[padding, styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.screen, { paddingTop: insets.top }, padding, style]}>{children}</View>;
}

/** Screen heading with an optional trailing action. */
export function Header({ title, subtitle, right }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={[styles.text, type.title]}>{title}</Text>
        {subtitle ? <Text style={[styles.text, type.small, styles.muted]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A surface group. Becomes pressable (with feedback) when given onPress. */
export function Card({ children, onPress, tone = 'neutral', style, padded = true }) {
  const surface = [styles.card, padded && styles.cardPadded, { borderColor: tones[tone].line }, style];

  if (!onPress) return <View style={surface}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [surface, pressed && styles.cardPressed]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

/**
 * The one button in the app. `variant` says how loud it is, not what it looks like.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  style
}) {
  const paletteFor = {
    primary: { bg: palette.accent, fg: palette.textOnAccent, border: palette.accent },
    secondary: { bg: palette.surfaceRaised, fg: palette.text, border: palette.borderStrong },
    ghost: { bg: 'transparent', fg: palette.textMuted, border: 'transparent' },
    danger: { bg: tones.bad.bg, fg: palette.bad, border: tones.bad.line }
  }[variant];

  const sizeStyle = {
    sm: { paddingVertical: space.xs + 2, paddingHorizontal: space.md },
    md: { paddingVertical: space.md, paddingHorizontal: space.lg },
    lg: { paddingVertical: space.lg, paddingHorizontal: space.xl }
  }[size];

  const textSize = size === 'sm' ? type.small : type.heading;

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.button,
        sizeStyle,
        { backgroundColor: paletteFor.bg, borderColor: paletteFor.border },
        pressed && !disabled && styles.pressed,
        (disabled || loading) && styles.disabled,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={paletteFor.fg} />
      ) : (
        <Text style={[styles.text, textSize, { color: paletteFor.fg }]}>
          {icon ? `${icon}  ` : ''}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A pill: filters, categories, the marketplace. Selected means "this is applied". */
export function Chip({ label, onPress, selected = false, tone = 'accent', style }) {
  const toneFor = tones[selected ? tone : 'neutral'];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: toneFor.bg, borderColor: toneFor.line },
        pressed && styles.pressed,
        style
      ]}
    >
      <Text style={[styles.text, type.small, { color: toneFor.fg }]}>{label}</Text>
    </Pressable>
  );
}

/** A small status label: restriction verdicts, sell-through bands, update notices. */
export function Badge({ label, tone = 'neutral', style }) {
  const toneFor = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: toneFor.bg, borderColor: toneFor.line }, style]}>
      <Text style={[styles.text, type.tiny, { color: toneFor.fg }]}>{label}</Text>
    </View>
  );
}

/** A labelled figure — the unit that prices and rates are shown in. */
export function Stat({ label, value, hint, tone = 'neutral' }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.text, type.tiny, styles.faint]}>{label}</Text>
      <Text style={[styles.text, type.numeric, { color: tones[tone].fg }]}>{value}</Text>
      {hint ? <Text style={[styles.text, type.small, styles.muted]}>{hint}</Text> : null}
    </View>
  );
}

/** What a screen shows instead of an empty list. */
export function EmptyState({ icon, title, body, action }) {
  return (
    <View style={styles.empty}>
      {icon ? <Text style={styles.emptyIcon}>{icon}</Text> : null}
      <Text style={[styles.text, type.heading, styles.center]}>{title}</Text>
      {body ? (
        <Text style={[styles.text, type.body, styles.muted, styles.center, styles.emptyBody]}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** A labelled text field. Forwards its ref, so callers can focus it. */
export const Field = React.forwardRef(function Field({ label, hint, style, ...props }, ref) {
  return (
    <View style={style}>
      {label ? <Text style={[styles.text, type.tiny, styles.faint, styles.fieldLabel]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        style={[styles.text, styles.field]}
        placeholderTextColor={palette.textFaint}
        {...props}
      />
      {hint ? <Text style={[styles.text, type.small, styles.muted, styles.fieldHint]}>{hint}</Text> : null}
    </View>
  );
});

/** A section heading inside a screen. */
export function SectionTitle({ children, right }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.text, type.tiny, styles.faint]}>{children}</Text>
      {right}
    </View>
  );
}

/** A hairline divider. */
export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

/** Inline loading state. */
export function Loading({ label }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={palette.accent} />
      {label ? <Text style={[styles.text, type.small, styles.muted, styles.loadingText]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  fill: { flex: 1 },
  scrollContent: { paddingBottom: space.xxl },
  text: { color: palette.text },
  muted: { color: palette.textMuted },
  faint: { color: palette.textFaint },
  center: { textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md
  },
  headerText: { flex: 1, gap: space.xxs },

  card: {
    backgroundColor: palette.surface,
    borderWidth: layout.hairline,
    borderColor: palette.border,
    borderRadius: radius.lg,
    overflow: 'hidden'
  },
  cardPadded: { padding: space.lg },
  cardPressed: { backgroundColor: palette.surfacePressed },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    minHeight: 44
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.45 },

  chip: {
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    alignSelf: 'flex-start'
  },

  badge: {
    paddingVertical: space.xxs + 1,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: layout.hairline,
    alignSelf: 'flex-start'
  },

  stat: { gap: space.xxs },
  numeric: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm
  },
  emptyIcon: { fontSize: 32, marginBottom: space.xs },
  emptyBody: { maxWidth: 320 },
  emptyAction: { marginTop: space.md },

  field: {
    backgroundColor: palette.surfaceRaised,
    borderWidth: layout.hairline,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 15,
    color: palette.text,
    minHeight: 46
  },
  fieldLabel: { marginBottom: space.xs },
  fieldHint: { marginTop: space.xs },

  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm
  },

  divider: { height: layout.hairline, backgroundColor: palette.border },

  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  loadingText: { marginLeft: space.xs }
});
