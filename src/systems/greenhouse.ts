import { CROP_MAP } from '../data/crops';
import { MAX_DAILY_HOURS, TOTAL_DAY_HOURS } from '../data/mission';
import { BuildingId, BuildingState } from '../types/building';
import { PlantedCrop } from '../types/game';
import { ResourceAmounts } from '../types/resource';
import { getBuildingEffectiveness } from './buildings';
import { canAffordResources, deductResources } from './resources';

export function canPlantCrop(params: {
  cropId: string;
  greenhouse: BuildingState;
  currentCrop: PlantedCrop | null;
  resources: ResourceAmounts;
  hoursElapsed: number;
}): { ok: boolean; reason?: string } {
  const { cropId, greenhouse, currentCrop, resources, hoursElapsed } = params;
  const def = CROP_MAP[cropId];
  if (!def) return { ok: false, reason: 'Unknown crop' };

  if (greenhouse.status === 'inactive') {
    return { ok: false, reason: 'Restore the Greenhouse before planting' };
  }

  if (currentCrop) {
    return { ok: false, reason: 'A crop is already growing in the Greenhouse' };
  }

  if (hoursElapsed + 1 > TOTAL_DAY_HOURS) {
    return { ok: false, reason: 'Past 11:59 PM — End Day to sleep' };
  }

  if (
    !canAffordResources(resources, {
      water: def.seedWaterCost,
      energy: def.seedEnergyCost,
    })
  ) {
    return {
      ok: false,
      reason: `Needs ${def.seedWaterCost} Water and ${def.seedEnergyCost} Energy`,
    };
  }

  return { ok: true };
}

export function plantCropInGreenhouse(params: {
  cropId: string;
  day: number;
  resources: ResourceAmounts;
  hoursElapsed: number;
}): {
  crop: PlantedCrop;
  resources: ResourceAmounts;
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
} {
  const { cropId, day, resources, hoursElapsed } = params;
  const def = CROP_MAP[cropId];
  const nextHoursElapsed = Math.min(TOTAL_DAY_HOURS, hoursElapsed + 1);

  return {
    crop: {
      cropId,
      plantedDay: day,
      growthProgress: 0,
      growthDaysRequired: def.growthDays,
      isMature: false,
      health: 100,
    },
    resources: deductResources(resources, {
      water: def.seedWaterCost,
      energy: def.seedEnergyCost,
    }),
    hoursElapsed: nextHoursElapsed,
    hoursRemaining: Math.max(0, MAX_DAILY_HOURS - nextHoursElapsed),
    overtimeHours: Math.max(0, nextHoursElapsed - MAX_DAILY_HOURS),
  };
}

export function advanceCropGrowth(params: {
  crop: PlantedCrop | null;
  buildings: Record<BuildingId, BuildingState>;
  hadEnoughWater: boolean;
  hadEnoughEnergy: boolean;
  eventPenalty?: number;
}): { crop: PlantedCrop | null; growthDelta: number; justMatured: boolean } {
  const { crop, buildings, hadEnoughWater, hadEnoughEnergy, eventPenalty = 0 } = params;
  if (!crop) return { crop: null, growthDelta: 0, justMatured: false };
  if (crop.isMature) return { crop, growthDelta: 0, justMatured: false };

  const greenhouse = buildings.greenhouse;
  if (greenhouse.status === 'inactive' || !hadEnoughWater || !hadEnoughEnergy) {
    return {
      crop: {
        ...crop,
        health: Math.max(20, crop.health - 15),
      },
      growthDelta: 0,
      justMatured: false,
    };
  }

  const eff = getBuildingEffectiveness(greenhouse);
  const rawGrowth = Math.max(0.3, eff - eventPenalty);
  const nextProgress = Math.min(
    crop.growthDaysRequired,
    Number((crop.growthProgress + rawGrowth).toFixed(2))
  );
  const isMature = nextProgress >= crop.growthDaysRequired;

  return {
    growthDelta: Number((nextProgress - crop.growthProgress).toFixed(2)),
    justMatured: isMature && !crop.isMature,
    crop: {
      ...crop,
      growthProgress: nextProgress,
      isMature,
      health: Math.min(100, crop.health + (eff >= 0.7 ? 5 : 0)),
    },
  };
}

export function harvestMatureCrop(params: {
  crop: PlantedCrop | null;
  resources: ResourceAmounts;
  capacities: ResourceAmounts;
  hoursElapsed: number;
}): {
  crop: PlantedCrop | null;
  resources: ResourceAmounts;
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
  harvestedAmount: number;
} {
  const { crop, resources, capacities, hoursElapsed } = params;
  if (!crop || !crop.isMature || hoursElapsed + 1 > TOTAL_DAY_HOURS) {
    return {
      crop,
      resources,
      hoursElapsed,
      hoursRemaining: Math.max(0, MAX_DAILY_HOURS - hoursElapsed),
      overtimeHours: Math.max(0, hoursElapsed - MAX_DAILY_HOURS),
      harvestedAmount: 0,
    };
  }

  const def = CROP_MAP[crop.cropId];
  const healthFactor = Math.max(0.6, crop.health / 100);
  const yieldAmount = Math.round(def.harvestFoodYield * healthFactor);
  const nextFood = Math.min(capacities.food, resources.food + yieldAmount);
  const actualAdded = nextFood - resources.food;
  const nextHoursElapsed = Math.min(TOTAL_DAY_HOURS, hoursElapsed + 1);

  return {
    crop: null,
    resources: {
      ...resources,
      food: nextFood,
    },
    hoursElapsed: nextHoursElapsed,
    hoursRemaining: Math.max(0, MAX_DAILY_HOURS - nextHoursElapsed),
    overtimeHours: Math.max(0, nextHoursElapsed - MAX_DAILY_HOURS),
    harvestedAmount: actualAdded,
  };
}
