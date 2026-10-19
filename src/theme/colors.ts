import type { ThemeMode } from '../store/useTuningStore';

export interface ThemePalette {
  mode: ThemeMode;
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgElevated: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentPrimary: string; // Porsche Guards Red / Racing Cyan
  accentSecondary: string;
  understeerColor: string; // Cool Blue / Cyan (Push)
  oversteerColor: string; // Warm Orange / Red (Loose / Rotation)
  neutralColor: string; // Emerald Green (Balanced)
  warningColor: string;
  criticalColor: string;
  tracksideBadgeBg: string;
  tracksideBadgeText: string;
  shopBadgeBg: string;
  shopBadgeText: string;
  canvasBg: string;
  canvasGrid: string;
  chassisFill: string;
  chassisStroke: string;
}

export const THEMES: Record<ThemeMode, ThemePalette> = {
  dark: {
    mode: 'dark',
    bgPrimary: '#0A111A',
    bgSecondary: '#101B28',
    bgCard: '#121F2D',
    bgElevated: '#1A2A3B',
    border: '#2C3E50',
    borderSubtle: '#1A2A3B',
    textPrimary: '#ECF3F8',
    textSecondary: '#B7C7D5',
    textMuted: '#91A5B8',
    accentPrimary: '#65D6CC',
    accentSecondary: '#E7B76B',
    understeerColor: '#65D6CC',
    oversteerColor: '#F97316',
    neutralColor: '#10B981',
    warningColor: '#E7B76B',
    criticalColor: '#EF4444',
    tracksideBadgeBg: 'rgba(16, 185, 129, 0.18)',
    tracksideBadgeText: '#34D399',
    shopBadgeBg: 'rgba(139, 92, 246, 0.18)',
    shopBadgeText: '#C4B5FD',
    canvasBg: '#0C1622',
    canvasGrid: '#192837',
    chassisFill: '#1A2A3B',
    chassisStroke: '#64748B',
  },
  daylight: {
    mode: 'daylight',
    bgPrimary: '#F1F5F9',
    bgSecondary: '#E2E8F0',
    bgCard: '#FFFFFF',
    bgElevated: '#F8FAFC',
    border: '#94A3B8',
    borderSubtle: '#CBD5E1',
    textPrimary: '#0F172A',
    textSecondary: '#1E293B',
    textMuted: '#475569',
    accentPrimary: '#006F74',
    accentSecondary: '#955800',
    understeerColor: '#006F74',
    oversteerColor: '#B74714',
    neutralColor: '#007958',
    warningColor: '#955800',
    criticalColor: '#B91C1C',
    tracksideBadgeBg: '#D1FAE5',
    tracksideBadgeText: '#065F46',
    shopBadgeBg: '#EDE9FE',
    shopBadgeText: '#5B21B6',
    canvasBg: '#FFFFFF',
    canvasGrid: '#E2E8F0',
    chassisFill: '#E2E8F0',
    chassisStroke: '#334155',
  },
};
