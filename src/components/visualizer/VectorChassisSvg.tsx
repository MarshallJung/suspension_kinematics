import React from 'react';
import {
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import type { VehicleSetup } from '../../engine';
import type { ThemePalette } from '../../theme/colors';
import { TOP_DOWN_POSITIONS } from './visualMath';

interface VectorChassisSvgProps {
  setup: VehicleSetup;
  theme: ThemePalette;
}

/**
 * Pure SVG top-down sports/GT chassis silhouette aligned to TOP_DOWN_POSITIONS.
 * Reflects drivetrain powertrain layout, aero wing/splitter sizing, and track/wheelbase
 * cues cleanly in both Dark and Daylight modes.
 */
export function VectorChassisSvg({ setup, theme }: VectorChassisSvgProps) {
  const isDaylight = theme.mode === 'daylight';
  const cx = 350;
  const fY = TOP_DOWN_POSITIONS.FL.y; // 152
  const rY = TOP_DOWN_POSITIONS.RL.y; // 414

  // Subtle track & aero visual modulation while preserving crisp wheel-arch clearance
  const fHalf = Math.max(82, Math.min(92, 86 * (setup.frontTrackMm / 1550)));
  const rHalf = Math.max(84, Math.min(94, 88 * (setup.rearTrackMm / 1558)));
  const doorHalf = 78;

  const aeroFactor = Math.max(0, Math.min(1.5, setup.aeroClA / 1.2));
  const rearAeroWeight = (100 - setup.aeroFrontBalancePct) / 100;
  const frontAeroWeight = setup.aeroFrontBalancePct / 100;
  const splitterExtend = 3 + aeroFactor * frontAeroWeight * 12;
  const wingChord = 7 + aeroFactor * rearAeroWeight * 14;
  const showWing = setup.aeroClA > 0.15 && rearAeroWeight > 0.25;

  const bodyTop = 58;
  const bodyBottom = 492;

  // Sculpted widebody silhouette with carved wheel-arch cutouts around y=152 and y=414
  const bodyPath = [
    `M ${cx - 56} ${bodyTop + 14}`,
    `Q ${cx} ${bodyTop - 10} ${cx + 56} ${bodyTop + 14}`,
    `C ${cx + fHalf} ${bodyTop + 28} ${cx + fHalf + 4} ${fY - 46} ${cx + fHalf - 2} ${fY - 38}`,
    // Front right wheel well recess
    `Q ${cx + 68} ${fY - 36} ${cx + 68} ${fY}`,
    `Q ${cx + 68} ${fY + 36} ${cx + fHalf - 2} ${fY + 38}`,
    // Door / rocker side skirt
    `L ${cx + doorHalf} ${fY + 58}`,
    `L ${cx + doorHalf} ${rY - 56}`,
    `L ${cx + rHalf - 2} ${rY - 38}`,
    // Rear right wheel well recess
    `Q ${cx + 68} ${rY - 36} ${cx + 68} ${rY}`,
    `Q ${cx + 68} ${rY + 36} ${cx + rHalf - 2} ${rY + 38}`,
    // Rear haunch to tail
    `C ${cx + rHalf + 2} ${rY + 56} ${cx + 70} ${bodyBottom - 4} ${cx + 54} ${bodyBottom}`,
    `Q ${cx} ${bodyBottom + 8} ${cx - 54} ${bodyBottom}`,
    `C ${cx - 70} ${bodyBottom - 4} ${cx - rHalf - 2} ${rY + 56} ${cx - rHalf + 2} ${rY + 38}`,
    // Rear left wheel well recess
    `Q ${cx - 68} ${rY + 36} ${cx - 68} ${rY}`,
    `Q ${cx - 68} ${rY - 36} ${cx - rHalf + 2} ${rY - 38}`,
    `L ${cx - doorHalf} ${rY - 56}`,
    `L ${cx - doorHalf} ${fY + 58}`,
    `L ${cx - rHalf + 2} ${fY + 38}`,
    // Front left wheel well recess
    `Q ${cx - 68} ${fY + 36} ${cx - 68} ${fY}`,
    `Q ${cx - 68} ${fY - 36} ${cx - fHalf + 2} ${fY - 38}`,
    `C ${cx - fHalf - 4} ${fY - 46} ${cx - fHalf} ${bodyTop + 28} ${cx - 56} ${bodyTop + 14}`,
    'Z',
  ].join(' ');

  // Powertrain layout visual cues
  const hasFrontDrive = setup.frontTorqueSplitPct > 0;
  const hasRearDrive = setup.frontTorqueSplitPct < 100;
  const engineBlockY =
    setup.drivetrain === 'RR'
      ? 434
      : setup.drivetrain === 'MR'
      ? 338
      : 108;
  const engineBlockH = setup.drivetrain === 'FF' ? 38 : 48;
  const engineBlockW = setup.drivetrain === 'FF' ? 56 : 44;

  const powertrainStroke = isDaylight ? '#475569' : '#64748B';
  const glassStroke = isDaylight ? '#475569' : '#4C6178';
  const wingFill = isDaylight ? '#1E293B' : '#0B131D';

  return (
    <G>
      <Defs>
        <LinearGradient id="vcBodyGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop
            offset="0%"
            stopColor={isDaylight ? '#CBD5E1' : '#142231'}
          />
          <Stop
            offset="50%"
            stopColor={isDaylight ? '#F1F5F9' : '#24374D'}
          />
          <Stop
            offset="100%"
            stopColor={isDaylight ? '#CBD5E1' : '#142231'}
          />
        </LinearGradient>
        <LinearGradient id="vcGlassGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={isDaylight ? '#334155' : '#0D1824'} />
          <Stop offset="100%" stopColor={isDaylight ? '#1E293B' : '#070E16'} />
        </LinearGradient>
      </Defs>

      {/* Soft ground shadow beneath chassis */}
      <Rect
        x={cx - 86}
        y={bodyTop + 12}
        width={172}
        height={bodyBottom - bodyTop - 6}
        rx={42}
        fill="#000000"
        fillOpacity={isDaylight ? 0.08 : 0.34}
      />

      {/* Front aero splitter */}
      <Path
        d={`M ${cx - 64} ${bodyTop + 18} Q ${cx} ${bodyTop - splitterExtend} ${cx + 64} ${bodyTop + 18} L ${cx + 56} ${bodyTop + 26} Q ${cx} ${bodyTop + 12} ${cx - 56} ${bodyTop + 26} Z`}
        fill={isDaylight ? '#334155' : '#0E1722'}
        stroke={theme.accentPrimary}
        strokeOpacity={setup.aeroClA > 0 ? 0.55 : 0.15}
        strokeWidth={1.2}
      />

      {/* Main car body shell */}
      <Path
        d={bodyPath}
        fill="url(#vcBodyGrad)"
        stroke={theme.chassisStroke}
        strokeWidth={2}
      />

      {/* Subtle racing centerline accent */}
      <Line
        x1={cx}
        y1={bodyTop + 6}
        x2={cx}
        y2={bodyBottom + 2}
        stroke={theme.accentPrimary}
        strokeOpacity={0.18}
        strokeWidth={4}
      />

      {/* Hood aero vents */}
      <Path
        d={`M ${cx - 32} 102 L ${cx - 14} 102 L ${cx - 18} 138 L ${cx - 36} 138 Z`}
        fill={isDaylight ? '#64748B' : '#0E1824'}
        fillOpacity={0.5}
      />
      <Path
        d={`M ${cx + 32} 102 L ${cx + 14} 102 L ${cx + 18} 138 L ${cx + 36} 138 Z`}
        fill={isDaylight ? '#64748B' : '#0E1824'}
        fillOpacity={0.5}
      />

      {/* Powertrain / Drivetrain Cutaway Cues */}
      <G opacity={0.55}>
        {/* Engine block */}
        <Rect
          x={cx - engineBlockW / 2}
          y={engineBlockY}
          width={engineBlockW}
          height={engineBlockH}
          rx={6}
          fill={isDaylight ? '#94A3B8' : '#0B141E'}
          stroke={powertrainStroke}
          strokeWidth={1.2}
          strokeDasharray="3 2"
        />
        {/* Driveshaft for FR / AWD */}
        {(setup.drivetrain === 'FR' || setup.drivetrain === 'AWD') && (
          <Line
            x1={cx}
            y1={156}
            x2={cx}
            y2={rY}
            stroke={powertrainStroke}
            strokeWidth={3}
          />
        )}
        {/* Driven half-shafts */}
        {hasFrontDrive && (
          <Line
            x1={TOP_DOWN_POSITIONS.FL.x + 12}
            y1={fY}
            x2={TOP_DOWN_POSITIONS.FR.x - 12}
            y2={fY}
            stroke={theme.accentPrimary}
            strokeOpacity={0.65}
            strokeWidth={2.5}
          />
        )}
        {hasRearDrive && (
          <Line
            x1={TOP_DOWN_POSITIONS.RL.x + 12}
            y1={rY}
            x2={TOP_DOWN_POSITIONS.RR.x - 12}
            y2={rY}
            stroke={theme.accentSecondary}
            strokeOpacity={0.65}
            strokeWidth={2.5}
          />
        )}
      </G>

      {/* Side mirrors */}
      <Path
        d={`M ${cx - doorHalf} 206 L ${cx - doorHalf - 15} 214 L ${cx - doorHalf - 12} 225 L ${cx - doorHalf} 218 Z`}
        fill={theme.chassisFill}
        stroke={theme.chassisStroke}
        strokeWidth={1.4}
      />
      <Path
        d={`M ${cx + doorHalf} 206 L ${cx + doorHalf + 15} 214 L ${cx + doorHalf + 12} 225 L ${cx + doorHalf} 218 Z`}
        fill={theme.chassisFill}
        stroke={theme.chassisStroke}
        strokeWidth={1.4}
      />

      {/* Swept front windshield */}
      <Path
        d={`M ${cx - 52} 216 Q ${cx} 196 ${cx + 52} 216 L ${cx + 46} 266 Q ${cx} 256 ${cx - 46} 266 Z`}
        fill="url(#vcGlassGrad)"
        fillOpacity={0.85}
        stroke={glassStroke}
        strokeWidth={1.3}
      />

      {/* Cabin roof */}
      <Path
        d={`M ${cx - 46} 268 Q ${cx} 259 ${cx + 46} 268 L ${cx + 44} 342 Q ${cx} 348 ${cx - 44} 342 Z`}
        fill={isDaylight ? '#E2E8F0' : '#1E3044'}
        fillOpacity={0.78}
        stroke={theme.chassisStroke}
        strokeWidth={1.2}
      />

      {/* Rear window */}
      <Path
        d={`M ${cx - 44} 344 Q ${cx} 350 ${cx + 44} 344 L ${cx + 48} 396 Q ${cx} 404 ${cx - 48} 396 Z`}
        fill="url(#vcGlassGrad)"
        fillOpacity={0.85}
        stroke={glassStroke}
        strokeWidth={1.3}
      />

      {/* Rear wing (scales with aero C_L A and rear aero balance) */}
      {showWing && (
        <G>
          <Line x1={cx - 40} y1={468} x2={cx - 40} y2={486} stroke={theme.chassisStroke} strokeWidth={2.5} />
          <Line x1={cx + 40} y1={468} x2={cx + 40} y2={486} stroke={theme.chassisStroke} strokeWidth={2.5} />
          <Rect
            x={cx - 80}
            y={484}
            width={160}
            height={wingChord}
            rx={3}
            fill={wingFill}
            stroke={theme.accentSecondary}
            strokeOpacity={0.75}
            strokeWidth={1.4}
          />
          {/* Wing endplates */}
          <Rect x={cx - 83} y={482} width={4} height={wingChord + 4} rx={1.5} fill={theme.chassisStroke} />
          <Rect x={cx + 79} y={482} width={4} height={wingChord + 4} rx={1.5} fill={theme.chassisStroke} />
        </G>
      )}
    </G>
  );
}
