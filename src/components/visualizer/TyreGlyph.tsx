import React from 'react';
import { G, Line, Path, Rect } from 'react-native-svg';
import type { ThemeMode } from '../../store/useTuningStore';
import {
  computeContactPatchZones,
  computeDisplayWheelAngle,
  zoneHeatColor,
} from './visualMath';

interface TyreGlyphProps {
  x: number;
  y: number;
  width: number;
  steerDeg: number;
  actualHeadingDeg: number;
  toeDeg: number;
  camberDeg: number;
  tirePsi: number;
  optimalPsi: number;
  lateralG: number;
  gripUtilizationPct: number;
  dynamicFzN: number;
  isOutside: boolean;
  isLeft: boolean;
  enhanced: boolean;
  selected: boolean;
  color: string;
  themeMode: ThemeMode;
}

/**
 * Projected top-down tire diagram with 3-zone longitudinal contact-patch
 * shoulder/center heat strips and smooth steering/toe amplification.
 * Display gains never feed back into vehicle physics.
 */
export function TyreGlyph({
  x,
  y,
  width,
  steerDeg,
  actualHeadingDeg,
  toeDeg,
  camberDeg,
  tirePsi,
  optimalPsi,
  lateralG,
  gripUtilizationPct,
  dynamicFzN,
  isOutside,
  isLeft,
  enhanced,
  selected,
  color,
  themeMode,
}: TyreGlyphProps) {
  const angle = computeDisplayWheelAngle(steerDeg, toeDeg, actualHeadingDeg, enhanced);
  // Subtle anchored camber lean inside the wheel well; negative camber tilts top inward.
  const lean = enhanced
    ? Math.max(-4.5, Math.min(4.5, (isLeft ? -1 : 1) * camberDeg * 1.4))
    : 0;
  const half = width / 2;
  const zones = computeContactPatchZones({
    dynamicCamberDeg: camberDeg,
    tirePsi,
    optimalPsi,
    isOutside,
    isLeft,
    lateralG,
    gripUtilizationPct,
    dynamicFzN,
  });

  if (zones.unloaded) {
    return (
      <G transform={`translate(${x},${y}) rotate(${angle})`}>
        <Rect
          x={-half - 2}
          y={-37}
          width={width + 4}
          height={74}
          rx={8}
          fill={themeMode === 'daylight' ? '#FEE2E2' : '#1F1215'}
          fillOpacity={0.45}
          stroke={color}
          strokeWidth={selected ? 2.4 : 1.6}
          strokeDasharray="4 3"
        />
        <Line x1={-half + 5} y1={-20} x2={half - 5} y2={20} stroke={color} strokeWidth={1.8} />
        <Line x1={half - 5} y1={-20} x2={-half + 5} y2={20} stroke={color} strokeWidth={1.8} />
      </G>
    );
  }

  const edge = lean >= 0 ? -half : half;
  const innerW = Math.max(12, width - 6);
  const stripW = innerW / 3;
  const stripStart = -innerW / 2;
  const stripIntensities = [zones.leftZone, zones.centerZone, zones.rightZone];

  return (
    <G transform={`translate(${x},${y}) rotate(${angle})`}>
      {/* Ground contact-patch reference outline */}
      <Rect
        x={-half - 2}
        y={-37}
        width={width + 4}
        height={74}
        rx={8}
        fill="#05090E"
        fillOpacity={themeMode === 'daylight' ? 0.16 : 0.45}
        stroke="#91A5B8"
        strokeOpacity={0.55}
        strokeDasharray="3 3"
      />
      {/* Subtle sidewall face when cambered */}
      {Math.abs(lean) > 0.25 && (
        <Path
          d={`M ${edge} -32 L ${edge + lean} -35 L ${edge + lean} 32 L ${edge} 34 Z`}
          fill="#6E7E8F"
          fillOpacity={0.85}
          stroke="#B4C0CC"
          strokeWidth={0.7}
        />
      )}
      <G transform={`translate(${lean}, 0)`}>
        {/* Tire rubber casing */}
        <Rect
          x={-half}
          y={-34}
          width={width}
          height={68}
          rx={7}
          fill="#18222D"
          stroke={selected ? color : '#9FB0C0'}
          strokeWidth={selected ? 2.8 : 1.6}
        />
        <Rect x={-half + 3} y={-29} width={innerW} height={58} rx={4} fill="#0E151E" />

        {/* 3-zone contact patch load / heat strips (Left / Center / Right) */}
        {stripIntensities.map((intensity, idx) => (
          <Rect
            key={idx}
            x={stripStart + idx * stripW + 0.5}
            y={-28}
            width={Math.max(2, stripW - 1)}
            height={56}
            rx={2}
            fill={zoneHeatColor(intensity, themeMode)}
            fillOpacity={0.38 + 0.48 * Math.min(1, intensity)}
          />
        ))}

        {/* Longitudinal rain/center grooves */}
        <Line
          x1={stripStart + stripW}
          x2={stripStart + stripW}
          y1={-27}
          y2={27}
          stroke="#0B1118"
          strokeWidth={1.3}
        />
        <Line
          x1={stripStart + stripW * 2}
          x2={stripStart + stripW * 2}
          y1={-27}
          y2={27}
          stroke="#0B1118"
          strokeWidth={1.3}
        />

        {/* Diagonal tread sipes */}
        {[-18, -7, 4, 15].map((d) => (
          <G key={d}>
            <Line
              x1={-half + 4}
              x2={-3}
              y1={d - 2}
              y2={d + 2}
              stroke="#0B1118"
              strokeOpacity={0.65}
              strokeWidth={1.4}
            />
            <Line
              x1={half - 4}
              x2={3}
              y1={d - 2}
              y2={d + 2}
              stroke="#0B1118"
              strokeOpacity={0.65}
              strokeWidth={1.4}
            />
          </G>
        ))}

        {/* Front heading marker */}
        <Line x1={-half + 5} x2={half - 5} y1={-28} y2={-28} stroke={color} strokeWidth={3.5} />
      </G>

      {/* Camber lean tick */}
      {enhanced && Math.abs(lean) > 0.35 && (
        <Line
          x1={0}
          x2={lean * 1.4}
          y1={40}
          y2={40}
          stroke="#F2C979"
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      )}
    </G>
  );
}
