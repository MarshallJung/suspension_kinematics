import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { ThemePalette } from '../../theme/colors';
export interface RangeControlProps {
  label: string; value: number; min: number; max: number; step: number;
  baselineValue?: number; onChange: (value: number) => void; theme: ThemePalette;
}
/** Native continuous input; Metro resolves RangeControl.web.tsx on web. */
export function RangeControl(props: RangeControlProps) {
  const [width, setWidth] = useState(1);
  const latest = useRef(props); latest.current = props;
  const startX = useRef(0);
  const touch = useRef<{ pageX: number; pageY: number; moved: boolean; dragging: boolean } | null>(null);
  const setAt = useCallback((x: number) => {
    const { min, max, step, onChange } = latest.current;
    const raw = min + Math.max(0, Math.min(1, x / width)) * (max - min);
    onChange(Math.max(min, Math.min(max, min + Math.round((raw - min) / step) * step)));
  }, [width]);
  const pan = useMemo(() => {
    return PanResponder.create({
      // Let the surrounding ScrollView keep vertical swipes. A tap commits on
      // release; touching the track to start scrolling must not change setup.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 5 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderGrant: (_, gesture) => {
        if (touch.current) touch.current.dragging = true;
        setAt(startX.current + gesture.dx);
      },
      onPanResponderMove: (_, gesture) => setAt(startX.current + gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        setAt(startX.current + gesture.dx);
        touch.current = null;
      },
      onPanResponderTerminate: () => { touch.current = null; },
    });
  }, [setAt]);
  const pct = Math.max(0, Math.min(100, (props.value - props.min) / (props.max - props.min) * 100));
  return <View {...pan.panHandlers} onLayout={e => setWidth(Math.max(1, e.nativeEvent.layout.width))}
    onTouchStart={event => {
      const { locationX, pageX, pageY } = event.nativeEvent;
      startX.current = locationX;
      touch.current = { pageX, pageY, moved: false, dragging: false };
    }}
    onTouchMove={event => {
      const origin = touch.current;
      if (origin && Math.hypot(event.nativeEvent.pageX - origin.pageX,
        event.nativeEvent.pageY - origin.pageY) > 6) origin.moved = true;
    }}
    onTouchEnd={() => {
      const origin = touch.current;
      if (origin && !origin.moved && !origin.dragging) setAt(startX.current);
      touch.current = null;
    }}
    onTouchCancel={() => { touch.current = null; }}
    accessible accessibilityRole="adjustable" accessibilityLabel={props.label}
    accessibilityValue={{ min: props.min, max: props.max, now: props.value }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => props.onChange(Math.max(props.min, Math.min(props.max,
      props.value + (event.nativeEvent.actionName === 'increment' ? props.step : -props.step))))}
    style={{ flex: 1, minWidth: 40, height: 44, justifyContent: 'center' }}>
    <View pointerEvents="none" style={{ height: 4, borderRadius: 3, backgroundColor: props.theme.border }}>
      <View style={{ width: `${pct}%`, height: 4, backgroundColor: props.theme.accentPrimary, borderRadius: 3 }} />
      {props.baselineValue !== undefined && <View style={{ position: 'absolute', top: -3, height: 10, width: 2,
        backgroundColor: props.theme.textMuted, left: `${Math.max(0, Math.min(100, (props.baselineValue - props.min) / (props.max - props.min) * 100))}%` }} />}
      <View style={{ position: 'absolute', left: `${pct}%`, marginLeft: -7, top: -5,
        width: 14, height: 14, borderRadius: 7, backgroundColor: props.theme.accentPrimary }} />
    </View>
  </View>;
}
