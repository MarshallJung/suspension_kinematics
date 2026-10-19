import React from 'react';
import type { RangeControlProps } from './RangeControl';
/** Native HTML range gives web dragging, touch, focus and arrow-key behavior. */
export function RangeControl({ label, value, min, max, step, baselineValue, onChange, theme }: RangeControlProps) {
  const baseline = baselineValue === undefined ? null : Math.max(0, Math.min(100, (baselineValue - min) / (max - min) * 100));
  return <div style={{ flex: 1, minWidth: 40, position: 'relative', display: 'flex', alignItems: 'center', height: 44 }}>
    <input type="range" aria-label={label} min={min} max={max} step="any" value={value}
      onChange={event => {
        const next = min + Math.round((Number(event.currentTarget.value) - min) / step) * step;
        onChange(Math.max(min, Math.min(max, next)));
      }}
      onKeyDown={event => {
        const moves: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 };
        if (event.key === 'Home' || event.key === 'End' || event.key in moves) {
          event.preventDefault();
          onChange(event.key === 'Home' ? min : event.key === 'End' ? max : Math.max(min, Math.min(max, value + moves[event.key])));
        }
      }}
      style={{ width: '100%', margin: 0, height: 44, accentColor: theme.accentPrimary, cursor: 'pointer' }} />
    {baseline !== null && <span aria-hidden="true" style={{ position: 'absolute', top: 16, left: `${baseline}%`, width: 2,
      height: 12, backgroundColor: theme.textMuted, pointerEvents: 'none' }} />}
  </div>;
}
