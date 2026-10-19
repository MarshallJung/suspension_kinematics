import React from 'react';
import { G, Line, Path, Rect } from 'react-native-svg';

interface TyreGlyphProps {
  x: number; y: number; width: number; steerDeg: number; actualHeadingDeg: number; toeDeg: number;
  camberDeg: number; isLeft: boolean; enhanced: boolean; selected: boolean; color: string;
}

/** A projected tyre diagram. Display gains never feed back into vehicle physics. */
export function TyreGlyph({ x, y, width, steerDeg, actualHeadingDeg, toeDeg, camberDeg,
  isLeft, enhanced, selected, color }: TyreGlyphProps) {
  const angle = enhanced ? Math.max(-42, Math.min(42, steerDeg * 5 + toeDeg * 12)) : actualHeadingDeg;
  // Negative camber leans the top of either tyre toward the vehicle centreline.
  const lean = enhanced ? Math.max(-15, Math.min(15, (isLeft ? -1 : 1) * camberDeg * 3.5)) : 0;
  const half = width / 2;
  const edge = lean >= 0 ? -half : half;
  return <G transform={`translate(${x},${y}) rotate(${angle})`}>
    <Rect x={-half - 3} y={-39} width={width + 6} height={78} rx={9}
      fill="#05090E" fillOpacity={0.5} stroke="#91A5B8" strokeOpacity={0.65} strokeDasharray="3 3" />
    <Path d={`M ${edge} -33 L ${edge + lean} -37 L ${edge + lean} 31 L ${edge} 35 Z`}
      fill="#8593A2" stroke="#C1CBD5" strokeWidth={0.8} />
    <G transform={`translate(${lean},-3)`}>
      <Rect x={-half} y={-35} width={width} height={70} rx={7}
        fill="#1B2632" stroke={selected ? color : '#A4B1BF'} strokeWidth={selected ? 2.8 : 1.7} />
      <Rect x={-half + 3} y={-30} width={width - 6} height={60} rx={4} fill="#101720" />
      {[-22, -11, 0, 11, 22].map(d => <G key={d}>
        <Line x1={-half + 4} x2={-3} y1={d - 3} y2={d + 1} stroke="#536170" strokeWidth={1.5} />
        <Line x1={half - 4} x2={3} y1={d - 3} y2={d + 1} stroke="#536170" strokeWidth={1.5} />
      </G>)}
      <Line x1={-2} x2={-2} y1={-28} y2={28} stroke="#344354" />
      <Line x1={2} x2={2} y1={-28} y2={28} stroke="#344354" />
      <Line x1={-half + 5} x2={half - 5} y1={-29} y2={-29} stroke={color} strokeWidth={4} />
    </G>
    {enhanced && Math.abs(lean) > 0.5 && <Line x1={0} x2={lean} y1={42} y2={42}
      stroke="#F2C979" strokeWidth={3} strokeLinecap="round" />}
  </G>;
}
