import { BUILDING_LIST } from '../data/buildings';
import { CROP_MAP } from '../data/crops';
import { RESOURCE_CONFIGS, RESOURCE_ORDER } from '../data/resources';
import { BuildingId, BuildingState } from '../types/building';
import { ActiveEvent } from '../types/event';
import { PlantedCrop } from '../types/game';
import { ResourceAmounts, ResourceNetRate, ResourceType } from '../types/resource';
import { getBuildingEffectiveness } from './buildings';

export function createInitialResources(): ResourceAmounts {
  return {
    oxygen: RESOURCE_CONFIGS.oxygen.initialAmount,
    water: RESOURCE_CONFIGS.water.initialAmount,
    food: RESOURCE_CONFIGS.food.initialAmount,
    energy: RESOURCE_CONFIGS.energy.initialAmount,
  };
}

export function canAffordResources(
  available: ResourceAmounts,
  cost: Partial<ResourceAmounts>
): boolean {
  for (const key of RESOURCE_ORDER) {
    const needed = cost[key] ?? 0;
    if (available[key] < needed) return false;
  }
  return true;
}

export function deductResources(
  available: ResourceAmounts,
  cost: Partial<ResourceAmounts>
): ResourceAmounts {
  return {
    oxygen: Math.max(0, available.oxygen - (cost.oxygen ?? 0)),
    water: Math.max(0, available.water - (cost.water ?? 0)),
    food: Math.max(0, available.food - (cost.food ?? 0)),
    energy: Math.max(0, available.energy - (cost.energy ?? 0)),
  };
}

export function clampResourcesToCapacity(
  resources: ResourceAmounts,
  capacities: ResourceAmounts
): ResourceAmounts {
  return {
    oxygen: Math.max(0, Math.min(capacities.oxygen, Math.round(resources.oxygen))),
    water: Math.max(0, Math.min(capacities.water, Math.round(resources.water))),
    food: Math.max(0, Math.min(capacities.food, Math.round(resources.food))),
    energy: Math.max(0, Math.min(capacities.energy, Math.round(resources.energy))),
  };
}

export interface DailySimulationRates {
  production: ResourceAmounts;
  consumption: ResourceAmounts;
  waterRecycled: number;
  net: Record<ResourceType, ResourceNetRate>;
  hasPowerForLifeSupport: boolean;
}

export function calculateDailyRates(params: {
  buildings: Record<BuildingId, BuildingState>;
  currentResources: ResourceAmounts;
  greenhouseCrop: PlantedCrop | null;
  activeEvent: ActiveEvent | null;
}): DailySimulationRates {
  const { buildings, currentResources, greenhouseCrop, activeEvent } = params;

  const production: ResourceAmounts = { oxygen: 0, water: 0, food: 0, energy: 0 };
  const consumption: ResourceAmounts = {
    oxygen: RESOURCE_CONFIGS.oxygen.dailyCrewConsumption,
    water: RESOURCE_CONFIGS.water.dailyCrewConsumption,
    food: RESOURCE_CONFIGS.food.dailyCrewConsumption,
    energy: RESOURCE_CONFIGS.energy.dailyCrewConsumption,
  };

  // 1. Solar energy generation first
  const solarState = buildings.solar_panels;
  const solarDef = BUILDING_LIST.find((b) => b.id === 'solar_panels')!;
  let solarOutput = (solarDef.dailyProduction.energy ?? 0) * getBuildingEffectiveness(solarState);
  if (activeEvent?.definition.solarPenaltyFactor) {
    solarOutput *= Math.max(0.15, 1 - activeEvent.definition.solarPenaltyFactor);
  }
  production.energy += Math.round(solarOutput);

  // 2. Calculate total energy demand of active powered facilities
  let facilityEnergyDemand = 0;
  for (const def of BUILDING_LIST) {
    if (!def.requiresPower) continue;
    const state = buildings[def.id];
    if (state.status === 'inactive') continue;
    facilityEnergyDemand += def.dailyConsumption.energy ?? 0;
  }

  // Add active crop energy need if greenhouse is running
  const cropDef = greenhouseCrop ? CROP_MAP[greenhouseCrop.cropId] : null;
  if (cropDef && buildings.greenhouse.status !== 'inactive' && !greenhouseCrop?.isMature) {
    facilityEnergyDemand += cropDef.dailyEnergyNeed;
  }

  consumption.energy += facilityEnergyDemand;

  // Determine available power factor for life support facilities
  const totalAvailableEnergy = currentResources.energy + production.energy;
  const powerFactor =
    consumption.energy <= 0
      ? 1
      : totalAvailableEnergy >= consumption.energy
      ? 1
      : totalAvailableEnergy >= 6
      ? Math.max(0.35, totalAvailableEnergy / consumption.energy)
      : 0;
  const hasPowerForLifeSupport = powerFactor > 0;

  // 3. Other facility production and non-energy consumption
  for (const def of BUILDING_LIST) {
    if (def.id === 'solar_panels') continue;
    const state = buildings[def.id];
    if (state.status === 'inactive') continue;

    const eff = getBuildingEffectiveness(state) * (def.requiresPower ? powerFactor : 1);

    if (eff > 0) {
      if (def.dailyProduction.oxygen) {
        production.oxygen += Math.round(def.dailyProduction.oxygen * eff);
      }
      if (def.dailyProduction.water) {
        production.water += Math.round(def.dailyProduction.water * eff);
      }
      if (def.dailyProduction.food) {
        production.food += Math.round(def.dailyProduction.food * eff);
      }
    }

    if (def.dailyConsumption.water && (def.id !== 'greenhouse' || (greenhouseCrop && !greenhouseCrop.isMature))) {
      consumption.water += def.dailyConsumption.water;
    }
  }

  if (cropDef && buildings.greenhouse.status !== 'inactive' && !greenhouseCrop?.isMature) {
    consumption.water += cropDef.dailyWaterNeed;
  }

  // 4. Water recycling recovers a percentage of used water
  const recyclerState = buildings.water_recycling;
  const recyclerDef = BUILDING_LIST.find((b) => b.id === 'water_recycling')!;
  let waterRecycled = 0;
  if (recyclerState.status !== 'inactive' && hasPowerForLifeSupport) {
    const eff = getBuildingEffectiveness(recyclerState) * powerFactor;
    const recoveryRate = (recyclerDef.waterRecoveryRate ?? 0.72) * eff;
    waterRecycled = Math.round(consumption.water * recoveryRate);
    production.water += waterRecycled;
  }

  const net = {} as Record<ResourceType, ResourceNetRate>;
  for (const key of RESOURCE_ORDER) {
    net[key] = {
      production: production[key],
      consumption: consumption[key],
      net: production[key] - consumption[key],
    };
  }

  return {
    production,
    consumption,
    waterRecycled,
    net,
    hasPowerForLifeSupport,
  };
}

export function detectResourceShortages(
  resources: ResourceAmounts
): ResourceType[] {
  const shortages: ResourceType[] = [];
  for (const key of RESOURCE_ORDER) {
    if (resources[key] <= RESOURCE_CONFIGS[key].criticalThreshold) {
      shortages.push(key);
    }
  }
  return shortages;
}
