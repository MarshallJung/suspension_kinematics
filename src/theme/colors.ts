import { ThemeMode } from '../store/useTuningStore';

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
    bgPrimary: '#0B0F17',
    bgSecondary: '#111827',
    bgCard: '#161F30',
    bgElevated: '#1E293B',
    border: '#2E3C56',
    borderSubtle: '#1E293B',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    accentPrimary: '#38BDF8',
    accentSecondary: '#F59E0B',
    understeerColor: '#38BDF8',
    oversteerColor: '#F97316',
    neutralColor: '#10B981',
    warningColor: '#F59E0B',
    criticalColor: '#EF4444',
    tracksideBadgeBg: 'rgba(16, 185, 129, 0.18)',
    tracksideBadgeText: '#34D399',
    shopBadgeBg: 'rgba(139, 92, 246, 0.18)',
    shopBadgeText: '#C4B5FD',
    canvasBg: '#090D14',
    canvasGrid: '#162032',
    chassisFill: '#1E293B',
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
    accentPrimary: '#0284C7',
    accentSecondary: '#D97706',
    understeerColor: '#0284C7',
    oversteerColor: '#EA580C',
    neutralColor: '#059669',
    warningColor: '#D97706',
    criticalColor: '#DC2626',
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
