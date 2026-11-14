import { MAX_DAILY_HOURS, TOTAL_DAY_HOURS } from '../data/mission';
import { BuildingId, BuildingState } from '../types/building';
import { CrewState } from '../types/game';

export function createInitialCrew(): CrewState {
  return {
    energy: 95,
    condition: 90,
    radiationExposure: 5,
    inShelter: false,
    restedToday: false,
  };
}

export function performCrewShortRest(
  crew: CrewState,
  hoursElapsed: number,
  buildings: Record<BuildingId, BuildingState>
): {
  crew: CrewState;
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
  rested: boolean;
} {
  if (hoursElapsed + 2 > TOTAL_DAY_HOURS || crew.energy >= 98) {
    return {
      crew,
      hoursElapsed,
      hoursRemaining: Math.max(0, MAX_DAILY_HOURS - hoursElapsed),
      overtimeHours: Math.max(0, hoursElapsed - MAX_DAILY_HOURS),
      rested: false,
    };
  }

  const habOperational = buildings.main_habitat.status === 'operational';
  const recovery = habOperational ? 28 : 16;
  const nextHoursElapsed = Math.min(TOTAL_DAY_HOURS, hoursElapsed + 2);

  return {
    hoursElapsed: nextHoursElapsed,
    hoursRemaining: Math.max(0, MAX_DAILY_HOURS - nextHoursElapsed),
    overtimeHours: Math.max(0, nextHoursElapsed - MAX_DAILY_HOURS),
    rested: true,
    crew: {
      ...crew,
      energy: Math.min(100, crew.energy + recovery),
      restedToday: true,
    },
  };
}

export function resolveDailyCrewRecovery(params: {
  crew: CrewState;
  buildings: Record<BuildingId, BuildingState>;
  shortages: string[];
  radiationGain: number;
  overtimeFatiguePenalty?: number;
}): { crew: CrewState; energyRecovered: number; fatiguePenalty: number } {
  const { crew, buildings, shortages, radiationGain, overtimeFatiguePenalty = 0 } = params;
  const habitat = buildings.main_habitat;
  const habFactor =
    habitat.status === 'operational'
      ? 1
      : habitat.status === 'damaged'
      ? 0.65
      : 0.35;

  const baseSleepRecovery = Math.round(45 * habFactor);
  const rawEnergy = Math.min(100, crew.energy + baseSleepRecovery);
  const fatiguePenalty = Math.max(0, overtimeFatiguePenalty);
  const maxAvailableEnergy = Math.max(20, 100 - fatiguePenalty);
  const nextEnergy = Math.max(15, Math.min(maxAvailableEnergy, rawEnergy - fatiguePenalty));
  const energyRecovered = Math.max(0, nextEnergy - crew.energy);

  const nextRadiation = Math.max(
    0,
    Math.min(100, crew.radiationExposure + radiationGain - (radiationGain === 0 ? 1 : 0))
  );

  let conditionDelta = 0;
  if (shortages.length > 0) {
    conditionDelta -= shortages.length * 8;
  } else if (habitat.status === 'operational' && nextRadiation < 40) {
    conditionDelta += 2;
  }

  if (radiationGain >= 15) {
    conditionDelta -= Math.round(radiationGain * 0.45);
  }

  const nextCondition = Math.max(0, Math.min(100, crew.condition + conditionDelta));

  return {
    energyRecovered,
    fatiguePenalty,
    crew: {
      energy: nextEnergy,
      condition: nextCondition,
      radiationExposure: nextRadiation,
      inShelter: false,
      restedToday: false,
    },
  };
}
