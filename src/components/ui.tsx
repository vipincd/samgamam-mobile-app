import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { theme } from '../theme';

type ButtonVariant = 'ghost' | 'primary' | 'secondary';
type NoticeTone = 'accent' | 'default' | 'success' | 'warning';

export function ScreenIntro(props: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.intro}>
      {props.eyebrow ? <Text style={styles.eyebrow}>{props.eyebrow}</Text> : null}
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.subtitle}>{props.subtitle}</Text>
    </View>
  );
}

export function Surface(props: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surface, props.style]}>{props.children}</View>;
}

export function Button(props: {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: ButtonVariant;
}) {
  const variant = props.variant ?? 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.compact ? styles.buttonCompact : undefined,
        variant === 'secondary' ? styles.buttonSecondary : undefined,
        variant === 'ghost' ? styles.buttonGhost : undefined,
        props.disabled ? styles.buttonDisabled : undefined,
        pressed && !props.disabled ? styles.buttonPressed : undefined,
        props.style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' ? styles.buttonTextSecondary : undefined,
          variant === 'ghost' ? styles.buttonTextGhost : undefined,
          props.textStyle,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function Field(
  props: TextInputProps & {
    label: string;
    helperText?: string;
  },
) {
  const { helperText, label, style, ...inputProps } = props;

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, style]}
        {...inputProps}
      />
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

export function Pill(props: {
  label: string;
  tone?: NoticeTone;
}) {
  const tone = props.tone ?? 'default';

  return (
    <View
      style={[
        styles.pill,
        tone === 'accent' ? styles.pillAccent : undefined,
        tone === 'success' ? styles.pillSuccess : undefined,
        tone === 'warning' ? styles.pillWarning : undefined,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === 'accent' ? styles.pillTextAccent : undefined,
          tone === 'success' ? styles.pillTextSuccess : undefined,
          tone === 'warning' ? styles.pillTextWarning : undefined,
        ]}
      >
        {props.label}
      </Text>
    </View>
  );
}

export function SectionHeader(props: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.subtitle ? <Text style={styles.sectionSubtitle}>{props.subtitle}</Text> : null}
    </View>
  );
}

export function InlineNotice(props: {
  message: string;
  title?: string;
  tone?: NoticeTone;
}) {
  const tone = props.tone ?? 'default';

  return (
    <View
      style={[
        styles.notice,
        tone === 'accent' ? styles.noticeAccent : undefined,
        tone === 'success' ? styles.noticeSuccess : undefined,
        tone === 'warning' ? styles.noticeWarning : undefined,
      ]}
    >
      {props.title ? <Text style={styles.noticeTitle}>{props.title}</Text> : null}
      <Text style={styles.noticeMessage}>{props.message}</Text>
    </View>
  );
}

export function EmptyState(props: {
  title: string;
  message: string;
}) {
  return (
    <Surface style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.emptyMessage}>{props.message}</Text>
    </Surface>
  );
}

export function MetricTile(props: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{props.value}</Text>
      <Text style={styles.metricLabel}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: 8,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 31,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  surface: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: 18,
    ...theme.shadow,
  },
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonCompact: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonSecondary: {
    backgroundColor: theme.colors.tealSoft,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonTextSecondary: {
    color: theme.colors.teal,
  },
  buttonTextGhost: {
    color: theme.colors.text,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.cardAlt,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  helperText: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillAccent: {
    backgroundColor: theme.colors.accentSoft,
  },
  pillSuccess: {
    backgroundColor: theme.colors.successSoft,
  },
  pillWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  pillText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextAccent: {
    color: theme.colors.accent,
  },
  pillTextSuccess: {
    color: theme.colors.success,
  },
  pillTextWarning: {
    color: theme.colors.warning,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    backgroundColor: theme.colors.cardAlt,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  noticeAccent: {
    backgroundColor: theme.colors.accentSoft,
  },
  noticeSuccess: {
    backgroundColor: theme.colors.successSoft,
  },
  noticeWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  noticeTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  noticeMessage: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyMessage: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  metricTile: {
    backgroundColor: theme.colors.cardAlt,
    borderRadius: theme.radius.sm,
    flex: 1,
    gap: 4,
    minWidth: 96,
    padding: 14,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
});
