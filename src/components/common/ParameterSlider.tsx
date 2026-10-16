import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AdjustmentScope } from '../../engine';
import { ThemePalette } from '../../theme/colors';

interface ParameterSliderProps {
  label: string;
  value: number;
  baselineValue?: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  scope?: AdjustmentScope;
  leftHint?: string;
  rightHint?: string;
  decimals?: number;
  onChange: (nextVal: number) => void;
  theme: ThemePalette;
}

export const ParameterSlider: React.FC<ParameterSliderProps> = ({
  label,
  value,
  baselineValue,
  min,
  max,
  step,
  unit,
  scope,
  leftHint,
  rightHint,
  decimals = 0,
  onChange,
  theme,
}) => {
  const range = Math.max(0.0001, max - min);
  const progressPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const baselinePct =
    baselineValue !== undefined
      ? Math.max(0, Math.min(100, ((baselineValue - min) / range) * 100))
      : null;

  const deltaFromBaseline =
    baselineValue !== undefined ? Number((value - baselineValue).toFixed(decimals)) : 0;

  const handleStep = (dir: -1 | 1) => {
    const rawNext = value + dir * step;
    const clamped = Math.max(min, Math.min(max, rawNext));
    onChange(Number(clamped.toFixed(decimals)));
  };

  // Allow quick jump across 10 segments along the bar
  const segments = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
          {scope ? (
            <View
              style={[
                styles.scopeBadge,
                {
                  backgroundColor:
                    scope === 'trackside' ? theme.tracksideBadgeBg : theme.shopBadgeBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.scopeBadgeText,
                  {
                    color:
                      scope === 'trackside'
                        ? theme.tracksideBadgeText
                        : theme.shopBadgeText,
                  },
                ]}
              >
                {scope === 'trackside' ? 'TRACKSIDE' : 'SHOP'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.valueGroup}>
          <Text style={[styles.valueText, { color: theme.accentPrimary }]}>
            {value.toFixed(decimals)} {unit}
          </Text>
          {baselineValue !== undefined && Math.abs(deltaFromBaseline) > 1e-4 ? (
            <Text style={[styles.deltaText, { color: theme.accentSecondary }]}>
              ({deltaFromBaseline > 0 ? `+${deltaFromBaseline.toFixed(decimals)}` : deltaFromBaseline.toFixed(decimals)})
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => handleStep(-1)}
          style={[
            styles.stepBtn,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.stepBtnText, { color: theme.textPrimary }]}>−</Text>
        </Pressable>

        <View style={styles.trackWrapper}>
          <View
            style={[
              styles.trackBg,
              { backgroundColor: theme.bgSecondary, borderColor: theme.borderSubtle },
            ]}
          >
            <View
              style={[
                styles.trackFill,
                {
                  width: `${progressPct}%`,
                  backgroundColor: theme.accentPrimary,
                },
              ]}
            />
            {baselinePct !== null ? (
              <View
                style={[
                  styles.baselineTick,
                  {
                    left: `${baselinePct}%`,
                    backgroundColor: theme.accentSecondary,
                  },
                ]}
              />
            ) : null}
          </View>

          {/* Interactive tap segments overlay */}
          <View style={styles.segmentsOverlay}>
            {segments.map((seg) => {
              const targetVal = min + (seg / 10) * range;
              const snappedVal = Number(
                (Math.round(targetVal / step) * step).toFixed(decimals)
              );
              return (
                <Pressable
                  key={seg}
                  style={styles.segmentTouch}
                  onPress={() =>
                    onChange(Math.max(min, Math.min(max, snappedVal)))
                  }
                />
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => handleStep(1)}
          style={[
            styles.stepBtn,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.stepBtnText, { color: theme.textPrimary }]}>+</Text>
        </Pressable>
      </View>

      {leftHint || rightHint ? (
        <View style={styles.hintsRow}>
          <Text style={[styles.hintText, { color: theme.textMuted }]}>
            {leftHint ?? `${min}${unit}`}
          </Text>
          <Text style={[styles.hintText, { color: theme.textMuted }]}>
            {rightHint ?? `${max}${unit}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  scopeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scopeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '800',
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 36,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  trackWrapper: {
    flex: 1,
    height: 30,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  trackFill: {
    height: '100%',
    borderRadius: 5,
  },
  baselineTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    marginLeft: -1.5,
  },
  segmentsOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  segmentTouch: {
    flex: 1,
    height: '100%',
  },
  hintsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  hintText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
