import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AdjustmentScope } from '../../engine';
import { ThemePalette } from '../../theme/colors';
import { RangeControl } from './RangeControl';

interface ParameterSliderProps {
  label: string; value: number; baselineValue?: number; min: number; max: number;
  step: number; unit: string; scope?: AdjustmentScope; leftHint?: string;
  rightHint?: string; allowOutOfRangeInput?: boolean; decimals?: number; onChange: (nextVal: number) => void; theme: ThemePalette;
}

export function ParameterSlider({ label, value, baselineValue, min, max, step, unit,
  scope, leftHint, rightHint, allowOutOfRangeInput = false, decimals = 0, onChange, theme }: ParameterSliderProps) {
  const dirty = useRef(false);
  const [draft, setDraft] = useState(value.toFixed(decimals));
  useEffect(() => { dirty.current = false; setDraft(value.toFixed(decimals)); }, [value, decimals]);
  const commitValue = (next: number) => {
    if (!Number.isFinite(next)) { setDraft(value.toFixed(decimals)); return; }
    const final = Number(Math.max(min, Math.min(max, next)).toFixed(decimals));
    setDraft(value.toFixed(decimals));
    if (final !== value) onChange(final);
  };
  const commitDraft = () => {
    // Merely focusing a rounded display must not quantize the underlying value.
    if (!dirty.current) return;
    dirty.current = false;
    const requested = draft.trim() === '' ? value : Number(draft);
    if (allowOutOfRangeInput) {
      setDraft(value.toFixed(decimals));
      if (Number.isFinite(requested) && requested > 0 && requested !== value) onChange(requested);
    } else commitValue(requested);
  };
  const delta = baselineValue === undefined ? 0 : Number((value - baselineValue).toFixed(decimals));
  return <View style={[styles.container, { borderBottomColor: theme.borderSubtle }]}>
    <View style={styles.header}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
      {scope && <Text style={[styles.scope, { color: theme.textMuted }]}>{scope === 'shop' ? 'SHOP' : 'TRACKSIDE'}</Text>}
    </View>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min} onPress={() => commitValue(value - step)}
        style={[styles.step, { borderColor: theme.border, opacity: value <= min ? 0.35 : 1 }]}>
        <Text style={[styles.stepText, { color: theme.textSecondary }]}>−</Text>
      </Pressable>
      <RangeControl label={label} value={value} min={min} max={max} step={step}
        baselineValue={baselineValue} onChange={commitValue} theme={theme} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`}
        disabled={value >= max} onPress={() => commitValue(value + step)}
        style={[styles.step, { borderColor: theme.border, opacity: value >= max ? 0.35 : 1 }]}>
        <Text style={[styles.stepText, { color: theme.textSecondary }]}>+</Text>
      </Pressable>
      <View style={[styles.number, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <TextInput accessibilityLabel={`${label} value`} value={draft} onChangeText={text => { dirty.current = true; setDraft(text); }}
          onBlur={commitDraft} onSubmitEditing={commitDraft} selectTextOnFocus keyboardType="numbers-and-punctuation"
          style={[styles.input, { color: theme.textPrimary }]} />
        <Text style={[styles.unit, { color: theme.textMuted }]}>{unit}</Text>
      </View>
    </View>
    <View style={styles.hints}>
      <Text numberOfLines={1} style={[styles.hint, { color: theme.textMuted }]}>{leftHint ?? `${min} ${unit}`}</Text>
      {delta !== 0 ? <Text style={[styles.delta, { color: theme.accentPrimary }]}>{delta > 0 ? '+' : ''}{delta.toFixed(decimals)} vs baseline</Text>
        : <Text numberOfLines={1} style={[styles.hint, { color: theme.textMuted, textAlign: 'right' }]}>{rightHint ?? `${max} ${unit}`}</Text>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { paddingVertical: 17, borderBottomWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  label: { fontSize: 13, lineHeight: 19, fontWeight: '600', flex: 1 },
  scope: { fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  step: { width: 44, height: 44, borderWidth: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, lineHeight: 24 },
  number: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, height: 44, borderWidth: 1, borderRadius: 7, width: 112, flexShrink: 0 },
  input: { fontSize: 16, fontWeight: '700', textAlign: 'right', flex: 1, width: 1, minWidth: 0, height: '100%', padding: 0, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 11, marginLeft: 5 },
  hints: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  hint: { flex: 1, fontSize: 10, lineHeight: 15 },
  delta: { fontSize: 10, lineHeight: 15, fontWeight: '600' },
});
