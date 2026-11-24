import { useEffect, useRef, useState } from 'react';
import type { SimulationResult, WheelId, WheelTelemetry } from '../../engine';

const WHEELS: WheelId[] = ['FL', 'FR', 'RL', 'RR'];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateWheel(from: WheelTelemetry, to: WheelTelemetry, t: number): WheelTelemetry {
  return {
    ...to,
    staticFzN: lerp(from.staticFzN, to.staticFzN, t),
    dynamicFzN: lerp(from.dynamicFzN, to.dynamicFzN, t),
    longitudinalFxN: lerp(from.longitudinalFxN, to.longitudinalFxN, t),
    lateralFyDemandN: lerp(from.lateralFyDemandN, to.lateralFyDemandN, t),
    maxLateralFyAvailableN: lerp(from.maxLateralFyAvailableN, to.maxLateralFyAvailableN, t),
    maxTotalForceN: lerp(from.maxTotalForceN, to.maxTotalForceN, t),
    gripUtilizationPct: lerp(from.gripUtilizationPct, to.gripUtilizationPct, t),
    dynamicCamberDeg: lerp(from.dynamicCamberDeg, to.dynamicCamberDeg, t),
    camberGainFromBumpDeg: lerp(from.camberGainFromBumpDeg, to.camberGainFromBumpDeg, t),
    camberGainFromSteerDeg: lerp(from.camberGainFromSteerDeg, to.camberGainFromSteerDeg, t),
    steerAngleDeg: lerp(from.steerAngleDeg, to.steerAngleDeg, t),
    slipAngleDeg: lerp(from.slipAngleDeg, to.slipAngleDeg, t),
    suspensionDeflectionMm: lerp(from.suspensionDeflectionMm, to.suspensionDeflectionMm, t),
  };
}

function interpolateSimulation(
  from: SimulationResult,
  to: SimulationResult,
  t: number
): SimulationResult {
  const wheels = {} as Record<WheelId, WheelTelemetry>;
  for (const id of WHEELS) {
    wheels[id] = interpolateWheel(from.wheels[id], to.wheels[id], t);
  }
  return {
    ...to,
    wheels,
    kinematics: {
      ...to.kinematics,
      bodyRollDeg: lerp(from.kinematics.bodyRollDeg, to.kinematics.bodyRollDeg, t),
      bodyPitchDeg: lerp(from.kinematics.bodyPitchDeg, to.kinematics.bodyPitchDeg, t),
      rollMomentArmMm: lerp(from.kinematics.rollMomentArmMm, to.kinematics.rollMomentArmMm, t),
      rollAxisAtCgMm: lerp(from.kinematics.rollAxisAtCgMm, to.kinematics.rollAxisAtCgMm, t),
      effectiveFrontRollCenterMm: lerp(
        from.kinematics.effectiveFrontRollCenterMm,
        to.kinematics.effectiveFrontRollCenterMm,
        t
      ),
      effectiveRearRollCenterMm: lerp(
        from.kinematics.effectiveRearRollCenterMm,
        to.kinematics.effectiveRearRollCenterMm,
        t
      ),
      frontLateralLoadTransferN: lerp(
        from.kinematics.frontLateralLoadTransferN,
        to.kinematics.frontLateralLoadTransferN,
        t
      ),
      rearLateralLoadTransferN: lerp(
        from.kinematics.rearLateralLoadTransferN,
        to.kinematics.rearLateralLoadTransferN,
        t
      ),
      longitudinalLoadTransferN: lerp(
        from.kinematics.longitudinalLoadTransferN,
        to.kinematics.longitudinalLoadTransferN,
        t
      ),
      frontJackingForceN: lerp(
        from.kinematics.frontJackingForceN,
        to.kinematics.frontJackingForceN,
        t
      ),
      rearJackingForceN: lerp(from.kinematics.rearJackingForceN, to.kinematics.rearJackingForceN, t),
      totalAeroDownforceN: lerp(
        from.kinematics.totalAeroDownforceN,
        to.kinematics.totalAeroDownforceN,
        t
      ),
      frontAxleSlipAngleDeg: lerp(
        from.kinematics.frontAxleSlipAngleDeg,
        to.kinematics.frontAxleSlipAngleDeg,
        t
      ),
      rearAxleSlipAngleDeg: lerp(
        from.kinematics.rearAxleSlipAngleDeg,
        to.kinematics.rearAxleSlipAngleDeg,
        t
      ),
    },
    balance: {
      ...to.balance,
      activeScore: lerp(from.balance.activeScore, to.balance.activeScore, t),
    },
  };
}

/**
 * Smoothly interpolates visual telemetry across discrete transitions (phase switch,
 * turn direction flip, archetype change, or recommendation preview toggle) while
 * keeping continuous slider drags instantaneous with zero lag.
 */
export function useAnimatedVisualState(
  target: SimulationResult,
  transitionKey: string,
  durationMs: number = 180
): SimulationResult {
  const [displaySim, setDisplaySim] = useState<SimulationResult>(target);
  const currentRef = useRef<SimulationResult>(target);
  const lastKeyRef = useRef<string>(transitionKey);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const keyChanged = lastKeyRef.current !== transitionKey;
    lastKeyRef.current = transitionKey;

    if (!keyChanged || typeof requestAnimationFrame !== 'function') {
      currentRef.current = target;
      setDisplaySim(target);
      return;
    }

    const from = currentRef.current;
    const startTime = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTime;
      const rawT = Math.min(1, elapsed / durationMs);
      const easedT = 1 - Math.pow(1 - rawT, 3);
      const next = rawT >= 1 ? target : interpolateSimulation(from, target, easedT);
      currentRef.current = next;
      setDisplaySim(next);
      if (rawT < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, transitionKey, durationMs]);

  return displaySim;
}
