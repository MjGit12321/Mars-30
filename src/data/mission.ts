import { MissionPhaseInfo, MissionPhaseNumber } from '../types/game';

export const MAX_MISSION_DAYS = 30;
export const MAX_DAILY_HOURS = 10;
export const TOTAL_DAY_HOURS = 24;

/**
 * Converts elapsed hours since 12:00 AM (0..24) into a 12-hour clock string (12:00 AM – 11:59 PM).
 */
export function formatMartianClock(hoursElapsed: number): string {
  const clamped = Math.max(0, Math.min(TOTAL_DAY_HOURS, hoursElapsed));
  if (clamped >= TOTAL_DAY_HOURS) {
    return '11:59 PM';
  }
  const totalMinutes = Math.round(clamped * 60);
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins.toString().padStart(2, '0')} ${period}`;
}

/**
 * Each hour worked past normal working hours (10:00 AM) causes 5% crew fatigue the next day (capped at 40%).
 */
export function calculateOvertimeFatigue(overtimeHours: number): number {
  if (overtimeHours <= 0) return 0;
  return Math.min(40, Math.round(overtimeHours * 5));
}

export const MISSION_PHASES: Record<MissionPhaseNumber, MissionPhaseInfo> = {
  1: {
    phase: 1,
    title: 'Arrival and Discovery',
    dayRangeLabel: 'Day 1',
    objectives: [
      'Inspect the damaged Jezero Crater outpost facilities.',
      'Restore the Solar Panels so the outpost has steady electricity.',
      'End Day 1 when ready to begin Phase 2.',
    ],
  },
  2: {
    phase: 2,
    title: 'Establish the Outpost',
    dayRangeLabel: 'Days 2–10',
    objectives: [
      'Restore the Oxygen Generator and Water Recycling System.',
      'Restore the Greenhouse and plant crops early for future harvests.',
      'Handle your first minor and major Mars environmental events.',
    ],
  },
  3: {
    phase: 3,
    title: 'Survival and Adaptation',
    dayRangeLabel: 'Days 11–20',
    objectives: [
      'Harvest mature crops and replant to build food reserves.',
      'Restore the Radiation Shelter and backup storage facilities.',
      'Keep facility conditions high through dust storms and quakes.',
    ],
  },
  4: {
    phase: 4,
    title: 'Final Test',
    dayRangeLabel: 'Days 21–30',
    objectives: [
      'Prepare reserves and shelter protection for the Day 29 Global Dust Storm.',
      'Repair critical damage on Day 30 before the 150-day assessment.',
    ],
  },
};

export function getPhaseForDay(day: number): MissionPhaseNumber {
  if (day <= 1) return 1;
  if (day <= 10) return 2;
  if (day <= 20) return 3;
  return 4;
}
