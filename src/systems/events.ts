import { EVENT_DEFINITIONS, MINOR_EVENT_IDS } from '../data/events';
import { BuildingId, BuildingState } from '../types/building';
import { ActiveEvent, EventDefinition } from '../types/event';
import { CrewState } from '../types/game';
import { ResourceAmounts } from '../types/resource';
import { applyBuildingConditionChange } from './buildings';
import { deductResources } from './resources';

function createSeededRng(seed: number): () => number {
  let t = (seed >>> 0) || 1234567;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandomDaysInRange(
  minDay: number,
  maxDay: number,
  count: number,
  rng: () => number
): number[] {
  const days: number[] = [];
  for (let d = minDay; d <= maxDay; d++) {
    days.push(d);
  }
  // Fisher-Yates shuffle
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [days[i], days[j]] = [days[j], days[i]];
  }

  if (count === 1) {
    return [days[0]];
  }

  // Pick 2 distinct days with at least 2 days spacing when possible
  const first = days[0];
  const spaced = days.find((d) => d !== first && Math.abs(d - first) >= 2) ?? days[1];
  return [first, spaced].sort((a, b) => a - b);
}

export function generateMissionEventSchedule(seed: number): Record<number, string> {
  const rng = createSeededRng(seed);

  // Shuffle the 5 minor events so every playthrough gets all 5 in randomized order
  const minorPool = [...MINOR_EVENT_IDS];
  for (let i = minorPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [minorPool[i], minorPool[j]] = [minorPool[j], minorPool[i]];
  }

  // Day 4–8: 1 random minor event
  const [phase2MinorDay] = pickRandomDaysInRange(4, 8, 1, rng);
  // Day 11–19: 2 random minor events
  const [phase3MinorDay1, phase3MinorDay2] = pickRandomDaysInRange(11, 19, 2, rng);
  // Day 21–28: 2 random minor events
  const [phase4MinorDay1, phase4MinorDay2] = pickRandomDaysInRange(21, 28, 2, rng);

  return {
    // Minor events randomized within assigned day ranges
    [phase2MinorDay]: minorPool[0],
    [phase3MinorDay1]: minorPool[1],
    [phase3MinorDay2]: minorPool[2],
    [phase4MinorDay1]: minorPool[3],
    [phase4MinorDay2]: minorPool[4],
    // Major events kept on fixed mission days
    9: 'solar_storm_response', // Day 9–10 window: Solar Storm Response
    20: 'solar_energetic_particles', // Day 20: Solar Energetic Particles
    29: 'global_dust_storm', // Day 29: Global Dust Storm
  };
}

export function createActiveEventForDay(
  day: number,
  schedule: Record<number, string>
): ActiveEvent | null {
  const eventId = schedule[day];
  if (!eventId) return null;
  const def = EVENT_DEFINITIONS[eventId];
  if (!def) return null;

  return {
    definition: def,
    dayTriggered: day,
    resolved: false,
    shelterUsed: false,
    mitigationSummary: '',
  };
}

export interface BuildingEventImpact {
  buildingId: BuildingId;
  conditionDelta: number;
  dustAdded?: number;
}

export function resolveEventAtEndOfDay(params: {
  activeEvent: ActiveEvent;
  buildings: Record<BuildingId, BuildingState>;
  resources: ResourceAmounts;
  crew: CrewState;
}): {
  buildings: Record<BuildingId, BuildingState>;
  resources: ResourceAmounts;
  radiationGain: number;
  crewEnergyPenalty: number;
  buildingImpacts: BuildingEventImpact[];
  outcomeSummary: string;
} {
  const { activeEvent, buildings, resources, crew } = params;
  const def: EventDefinition = activeEvent.definition;

  let nextBuildings = { ...buildings };
  let nextResources = { ...resources };
  const impactMap = new Map<BuildingId, BuildingEventImpact>();

  // Preparedness mitigation: operational Maintenance Facility softens physical storm damage by 30%
  const workshopOperational = buildings.maintenance_facility.status === 'operational';
  const damageMitigation = workshopOperational ? 0.7 : 1;

  if (def.targetBuildings && def.conditionDamage) {
    const damage = Math.max(3, Math.round(def.conditionDamage * damageMitigation));
    for (const id of def.targetBuildings) {
      const before = nextBuildings[id].condition;
      nextBuildings[id] = applyBuildingConditionChange(nextBuildings[id], -damage);
      const actualDelta = nextBuildings[id].condition - before;
      if (actualDelta !== 0) {
        impactMap.set(id, { buildingId: id, conditionDelta: actualDelta });
      }
    }
  }

  if (def.dustAdded) {
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.min(100, beforeDust + def.dustAdded);
    nextBuildings.solar_panels = {
      ...nextBuildings.solar_panels,
      dustLevel: nextDust,
    };
    const existing = impactMap.get('solar_panels') ?? {
      buildingId: 'solar_panels' as BuildingId,
      conditionDelta: 0,
    };
    impactMap.set('solar_panels', {
      ...existing,
      dustAdded: nextDust - beforeDust,
    });
  }

  if (def.resourceLoss) {
    nextResources = deductResources(nextResources, def.resourceLoss);
  }

  // Radiation shelter protection calculation
  let radiationGain = 0;
  const summaryParts: string[] = [];

  if (def.radiationLevel && def.radiationLevel > 0) {
    const shelter = nextBuildings.radiation_shelter;
    if (crew.inShelter && shelter.status !== 'inactive') {
      const shelterEffectiveness = Math.min(0.85, (shelter.condition / 100) * 0.85);
      radiationGain = Math.max(4, Math.round(def.radiationLevel * (1 - shelterEffectiveness)));
      summaryParts.push(`Crew sheltered (${Math.round(shelterEffectiveness * 100)}% blocked)`);
    } else if (crew.inShelter && shelter.status === 'inactive') {
      radiationGain = Math.round(def.radiationLevel * 0.85);
      summaryParts.push('Shelter inactive—minimal shielding');
    } else {
      radiationGain = def.radiationLevel;
      summaryParts.push('Crew stayed outside—high radiation');
    }
  }

  if (def.targetBuildings?.length) {
    summaryParts.push(
      workshopOperational
        ? 'Workshop maintenance softened structural wear'
        : 'Equipment sustained weather wear'
    );
  }

  return {
    buildings: nextBuildings,
    resources: nextResources,
    radiationGain,
    crewEnergyPenalty: def.crewEnergyImpact ?? 0,
    buildingImpacts: Array.from(impactMap.values()),
    outcomeSummary: summaryParts.join(' · ') || 'Weather event passed',
  };
}
