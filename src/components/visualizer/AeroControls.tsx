import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  aeroClAFromReferenceDownforce, calculateAeroDownforceN,
  kmhToMph, mphToKmh, newtonsToLbs,
} from '../../engine';
import { useTuningStore } from '../../store/useTuningStore';
import { ThemePalette } from '../../theme/colors';
import { ParameterSlider } from '../common/ParameterSlider';

const NEWTONS_PER_POUND_FORCE = 4.4482216152605;

export function AeroControls({ theme }: { theme: ThemePalette }) {
  const { setup, driver, pinnedBaseline, updateSetup, updateDriver } = useTuningStore();
  // This is a choice of units for the rating, not a second physical aero parameter.
  const [referenceSpeedMph, setReferenceSpeedMph] = useState(100);
  const referenceSpeedKmh = mphToKmh(referenceSpeedMph);
  const ratedDownforceLb = newtonsToLbs(calculateAeroDownforceN(setup.aeroClA, referenceSpeedKmh));
  const baselineRatedLb = pinnedBaseline
    ? newtonsToLbs(calculateAeroDownforceN(pinnedBaseline.setup.aeroClA, referenceSpeedKmh)) : undefined;
  const currentDownforceLb = newtonsToLbs(calculateAeroDownforceN(setup.aeroClA, driver.speedKmh));
  const frontShare = setup.aeroFrontBalancePct / 100;
  const speedRatioSquared = Math.pow(driver.speedKmh / referenceSpeedKmh, 2);

  return <View>
    <View style={[styles.summary, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
      <Text style={[styles.eyebrow, { color: theme.accentPrimary }]}>AERO AT THIS CORNER SPEED</Text>
      <View style={styles.resultRow}>
        <Text style={[styles.result, { color: theme.textPrimary }]}>{Math.round(currentDownforceLb)} <Text style={styles.resultUnit}>lb downforce</Text></Text>
        <Text style={[styles.speed, { color: theme.textSecondary }]}>{kmhToMph(driver.speedKmh).toFixed(1)} mph</Text>
      </View>
      <Text style={[styles.body, { color: theme.textSecondary }]}>Front axle +{Math.round(currentDownforceLb * frontShare)} lb · Rear axle +{Math.round(currentDownforceLb * (1 - frontShare))} lb</Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>Rated force × (corner speed ÷ reference speed)² = {speedRatioSquared.toFixed(2)}× the rating.</Text>
    </View>

    <ParameterSlider label="Downforce reference speed" value={referenceSpeedMph}
      min={20} max={200} step={5} unit="mph" onChange={setReferenceSpeedMph} theme={theme} />
    <Text style={[styles.note, { color: theme.textMuted }]}>Enter the speed quoted with your aero data, then enter its total downforce. Changing the reference speed updates the displayed rating while preserving the current aero configuration.</Text>

    <ParameterSlider label="Rated total downforce" value={ratedDownforceLb} baselineValue={baselineRatedLb}
      min={0} max={Math.max(3000, Math.ceil(ratedDownforceLb / 500) * 500)} step={25} unit="lb"
      leftHint="0 lb · no downforce" rightHint={`At ${referenceSpeedMph} mph`}
      onChange={lb => updateSetup({ aeroClA: aeroClAFromReferenceDownforce(lb * NEWTONS_PER_POUND_FORCE, referenceSpeedKmh) })}
      theme={theme} />
    <Pressable accessibilityRole="button" accessibilityLabel="Set downforce to zero"
      onPress={() => updateSetup({ aeroClA: 0 })} style={[styles.zeroButton, { borderColor: theme.border }]}>
      <Text style={[styles.zeroLabel, { color: theme.textSecondary }]}>Set no downforce</Text>
    </Pressable>
    <ParameterSlider label="Modeled corner speed" value={kmhToMph(driver.speedKmh)}
      baselineValue={pinnedBaseline ? kmhToMph(pinnedBaseline.driver.speedKmh) : undefined}
      min={0} max={200} step={5} decimals={1} unit="mph"
      leftHint="0 mph · no aero load" rightHint="200 mph"
      onChange={mph => updateDriver({ speedKmh: mphToKmh(mph) })} theme={theme} />
    <ParameterSlider label="Front aero balance" value={setup.aeroFrontBalancePct}
      baselineValue={pinnedBaseline?.setup.aeroFrontBalancePct} min={0} max={100} step={1} unit="%"
      leftHint="0% · all rear" rightHint="100% · all front"
      onChange={aeroFrontBalancePct => updateSetup({ aeroFrontBalancePct })} theme={theme} />
    <Text style={[styles.note, { color: theme.textMuted }]}>The four wheel loads include this downforce and the selected front/rear split. Downforce adds normal load, not vehicle mass. Speed and lateral G are separate inputs; a speed change also changes the estimated steering angle.</Text>
    <Text style={[styles.note, { color: theme.textMuted }]}>Assumes constant aero coefficient and balance, air density 1.225 kg/m³, and no separate aero pitching moment, drag or ride-height sensitivity. Profile defaults are illustrative; use measured or published aero data for your vehicle.</Text>
  </View>;
}

const styles = StyleSheet.create({
  summary: { padding: 16, borderRadius: 10, borderWidth: 1, gap: 9, marginBottom: 2 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  resultRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  result: { fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
  resultUnit: { fontSize: 14, fontWeight: '500' },
  speed: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 12, lineHeight: 18 },
  note: { fontSize: 11, lineHeight: 17, marginTop: 8, marginBottom: 6 },
  zeroButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 7, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', marginTop: 10 },
  zeroLabel: { fontSize: 12, fontWeight: '600' },
});
