import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../data/buildings';
import { RESOURCE_CONFIGS } from '../data/resources';
import { BuildingId, BuildingState, BuildingStatus } from '../types/building';
import { ResourceAmounts, ResourceType } from '../types/resource';

export function createInitialBuildings(): Record<BuildingId, BuildingState> {
  const result = {} as Record<BuildingId, BuildingState>;
  for (const def of BUILDING_LIST) {
    result[def.id] = {
      id: def.id,
      status: def.initialStatus,
      condition: def.initialCondition,
      dustLevel: def.id === 'solar_panels' ? 55 : 0,
      restoredOnce: def.initialStatus === 'operational',
      timesMaintained: 0,
      hasVisibleDamage: def.initialStatus !== 'operational',
    };
  }
  return result;
}

export function getStatusFromCondition(
  condition: number,
  currentlyInactive: boolean
): BuildingStatus {
  if (currentlyInactive && condition < 50) return 'inactive';
  if (condition <= 15) return 'inactive';
  if (condition < 65) return 'damaged';
  return 'operational';
}

export function getBuildingEffectiveness(building: BuildingState): number {
  if (building.status === 'inactive' || building.status === 'maintenance') {
    return 0;
  }
  const baseFactor = Math.max(0.35, building.condition / 100);
  if (building.id === 'solar_panels') {
    const dustPenalty = 1 - (building.dustLevel / 100) * 0.5;
    return Number((baseFactor * dustPenalty).toFixed(2));
  }
  return Number(baseFactor.toFixed(2));
}

export function applyBuildingConditionChange(
  building: BuildingState,
  delta: number,
  forceOperational = false,
  damageCause?: BuildingState['damageCause']
): BuildingState {
  const nextCondition = Math.max(0, Math.min(100, Math.round(building.condition + delta)));
  let nextStatus: BuildingStatus;

  if (forceOperational && nextCondition >= 50) {
    nextStatus = nextCondition >= 65 ? 'operational' : 'damaged';
  } else {
    nextStatus = getStatusFromCondition(nextCondition, building.status === 'inactive');
  }

  const hasVisibleDamage =
    delta < 0
      ? nextCondition < 92 || Boolean(building.hasVisibleDamage)
      : nextStatus !== 'operational';

  const nextCause: BuildingState['damageCause'] = !hasVisibleDamage
    ? undefined
    : delta < 0
    ? damageCause ?? building.damageCause
    : building.damageCause;

  return {
    ...building,
    condition: nextCondition,
    status: nextStatus,
    restoredOnce: building.restoredOnce || nextStatus === 'operational',
    hasVisibleDamage,
    damageCause: nextCause,
  };
}

export function calculateResourceCapacities(
  buildings: Record<BuildingId, BuildingState>
): ResourceAmounts {
  const capacities: ResourceAmounts = {
    oxygen: RESOURCE_CONFIGS.oxygen.baseCapacity,
    water: RESOURCE_CONFIGS.water.baseCapacity,
    food: RESOURCE_CONFIGS.food.baseCapacity,
    energy: RESOURCE_CONFIGS.energy.baseCapacity,
  };

  for (const def of BUILDING_LIST) {
    if (!def.storageBonus) continue;
    const state = buildings[def.id];
    if (!state || state.status === 'inactive') continue;

    const effectiveness = state.status === 'operational' ? 1 : Math.max(0.5, state.condition / 100);
    for (const key of Object.keys(def.storageBonus) as ResourceType[]) {
      const bonus = def.storageBonus[key] ?? 0;
      capacities[key] += Math.round(bonus * effectiveness);
    }
  }

  return capacities;
}

export function isBuildingOperational(
  buildings: Record<BuildingId, BuildingState>,
  id: BuildingId
): boolean {
  const b = buildings[id];
  return Boolean(b && (b.status === 'operational' || b.status === 'damaged'));
}

export function getOperationalBuildingCount(
  buildings: Record<BuildingId, BuildingState>
): number {
  return Object.values(buildings).filter((b) => b.status === 'operational').length;
}

export function getBuildingDefinition(id: BuildingId) {
  return BUILDING_DEFINITIONS[id];
}
