import { BUILDING_DEFINITIONS } from '../data/buildings';
import { EVENT_DEFINITIONS, MINOR_EVENT_IDS } from '../data/events';
import { computeWorkClockMetrics } from '../data/mission';
import { gridManager, WORLD_HEIGHT, WORLD_WIDTH } from '../game/grid/GridManager';
import { BuildingId, BuildingState } from '../types/building';
import { ActiveEvent, EventDefinition } from '../types/event';
import { CrewState, GameState, MissionModifiers, TerrainScar } from '../types/game';
import { ResourceAmounts, ResourceType } from '../types/resource';
import { applyBuildingConditionChange } from './buildings';
import { clampResourcesToCapacity, deductResources } from './resources';

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

  const animationDuration =
    def.severity === 'major' || def.severity === 'super_major' ? 20 : 15;

  return {
    definition: def,
    dayTriggered: day,
    resolved: false,
    shelterUsed: false,
    mitigationSummary: '',
    animationDuration,
    animationRemaining: animationDuration,
    initialDamageApplied: false,
  };
}

const TILE_PX = 72;

export function createScarsForEvent(
  def: EventDefinition,
  day: number
): TerrainScar[] {
  let kind: TerrainScar['kind'] | null = null;
  if (def.phenomenon === 'marsquake') {
    kind = 'quake_fissure';
  } else if (def.phenomenon === 'solar_storm_response') {
    kind = 'solar_scorch';
  } else if (def.phenomenon === 'solar_energetic_particles') {
    kind = 'sep_crater';
  } else if (def.phenomenon === 'global_dust_storm' || def.phenomenon === 'dust_devils') {
    kind = 'dust_drift';
  }
  if (!kind) return [];

  const targets = def.targetBuildings ?? ['main_habitat'];
  const scars: TerrainScar[] = [];
  const offsets: Array<{ dx: number; dy: number }> = [
    { dx: -1.1, dy: 1.15 },
    { dx: 1.15, dy: -0.6 },
    { dx: 0.4, dy: 1.2 },
    { dx: -1.15, dy: -0.7 },
    { dx: 1.1, dy: 1.05 },
  ];

  targets.forEach((bId, idx) => {
    const bDef = BUILDING_DEFINITIONS[bId];
    if (!bDef) return;
    const cx = (bDef.gridX + bDef.widthTiles * 0.5) * TILE_PX;
    const cy = (bDef.gridY + bDef.heightTiles * 0.5) * TILE_PX;
    const halfW = (bDef.widthTiles * TILE_PX) * 0.5;
    const halfH = (bDef.heightTiles * TILE_PX) * 0.5;
    const off = offsets[(idx + day) % offsets.length];
    const rawX = Math.max(40, Math.min(WORLD_WIDTH - 40, Math.round(cx + off.dx * (halfW + 18))));
    const rawY = Math.max(40, Math.min(WORLD_HEIGHT - 40, Math.round(cy + off.dy * (halfH + 18))));
    const safePt = gridManager.pushOutOfBuildings(rawX, rawY, 22);

    scars.push({
      id: `scar_${day}_${def.id}_${bId}`,
      kind,
      x: Math.round(safePt.x),
      y: Math.round(safePt.y),
      size: def.severity === 'super_major' ? 30 : def.severity === 'major' ? 25 : 22,
      eventId: def.id,
      day,
    });
  });

  // Extra surrounding debris / dust drift in open courtyard for Major & Super Major storms
  if (def.severity === 'major' || def.severity === 'super_major') {
    const spotA = gridManager.pushOutOfBuildings(
      Math.round(WORLD_WIDTH * 0.34) + ((day * 37) % 100),
      Math.round(WORLD_HEIGHT * 0.34) + ((day * 23) % 70),
      24
    );
    const spotB = gridManager.pushOutOfBuildings(
      Math.round(WORLD_WIDTH * 0.62) + ((day * 31) % 110),
      Math.round(WORLD_HEIGHT * 0.68) + ((day * 29) % 65),
      24
    );
    scars.push({
      id: `scar_${day}_${def.id}_courtyard_a`,
      kind,
      x: Math.round(spotA.x),
      y: Math.round(spotA.y),
      size: 28,
      eventId: def.id,
      day,
    });
    scars.push({
      id: `scar_${day}_${def.id}_courtyard_b`,
      kind,
      x: Math.round(spotB.x),
      y: Math.round(spotB.y),
      size: 28,
      eventId: def.id,
      day,
    });
  }

  return scars;
}

export interface BuildingEventImpact {
  buildingId: BuildingId;
  conditionDelta: number;
  dustAdded?: number;
}

export function applyInitialEventImpact(state: GameState): {
  nextState: GameState;
  buildingImpacts: BuildingEventImpact[];
} {
  const activeEvent = state.activeEvent;
  if (!activeEvent || activeEvent.initialDamageApplied) {
    return { nextState: state, buildingImpacts: [] };
  }

  const def = activeEvent.definition;
  const nextBuildings = { ...state.buildings };
  const impactMap = new Map<BuildingId, BuildingEventImpact>();

  const workshopOperational = nextBuildings.maintenance_facility.status === 'operational';
  const workshopMitigation = workshopOperational ? 0.7 : 1;
  const campaignFactor = state.modifiers?.stormDamageFactor ?? 1;

  if (def.targetBuildings && def.conditionDamage) {
    const damage = Math.max(
      2,
      Math.round(def.conditionDamage * workshopMitigation * campaignFactor)
    );
    for (const id of def.targetBuildings) {
      const before = nextBuildings[id].condition;
      nextBuildings[id] = applyBuildingConditionChange(
        nextBuildings[id],
        -damage,
        false,
        def.phenomenon
      );
      const actualDelta = nextBuildings[id].condition - before;
      if (actualDelta !== 0) {
        impactMap.set(id, { buildingId: id, conditionDelta: actualDelta });
      }
    }
  }

  let consumedExtraDust = false;
  if (def.dustAdded) {
    const extraDust = state.modifiers?.extraDustNextStorm ?? 0;
    consumedExtraDust = extraDust > 0;
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.min(100, beforeDust + def.dustAdded + extraDust);
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

  const existingScars = state.environmentalScars ?? [];
  const hasTodayScars = existingScars.some(
    (s) => s.day === state.day && s.eventId === def.id
  );
  const addedScars = hasTodayScars ? [] : createScarsForEvent(def, state.day);
  const nextScars = [...existingScars, ...addedScars].slice(-28);

  return {
    buildingImpacts: Array.from(impactMap.values()),
    nextState: {
      ...state,
      buildings: nextBuildings,
      environmentalScars: nextScars,
      modifiers: {
        ...state.modifiers,
        extraDustNextStorm: consumedExtraDust ? 0 : state.modifiers.extraDustNextStorm,
      },
      activeEvent: {
        ...activeEvent,
        initialDamageApplied: true,
      },
    },
  };
}

export function applyMajorEventDecision(
  choiceId: string,
  state: GameState
): {
  nextState: GameState;
  buildingImpacts: BuildingEventImpact[];
} {
  const activeEvent = state.activeEvent;
  if (!activeEvent || !activeEvent.definition.choices) {
    return { nextState: state, buildingImpacts: [] };
  }

  const choice = activeEvent.definition.choices.find((c) => c.id === choiceId);
  if (!choice) {
    return { nextState: state, buildingImpacts: [] };
  }

  const fx = choice.immediateEffect;
  const buildingImpacts: BuildingEventImpact[] = [];

  // 1. Apply building health & solar dust deltas
  let nextBuildings = { ...state.buildings };
  if (fx.buildingDeltas) {
    for (const [bId, delta] of Object.entries(fx.buildingDeltas) as Array<[BuildingId, number]>) {
      if (!delta) continue;
      const before = nextBuildings[bId].condition;
      nextBuildings[bId] = applyBuildingConditionChange(
        nextBuildings[bId],
        delta,
        false,
        delta < 0 ? activeEvent.definition.phenomenon : undefined
      );
      const actualDelta = nextBuildings[bId].condition - before;
      if (actualDelta !== 0) {
        buildingImpacts.push({ buildingId: bId, conditionDelta: actualDelta });
      }
    }
  }

  if (fx.solarDustDelta) {
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.max(0, Math.min(100, beforeDust + fx.solarDustDelta));
    nextBuildings.solar_panels = {
      ...nextBuildings.solar_panels,
      dustLevel: nextDust,
    };
  }

  // 2. Apply immediate resource changes
  const nextRawResources: ResourceAmounts = { ...state.resources };
  if (fx.resourcesDelta) {
    for (const key of ['oxygen', 'water', 'food', 'energy'] as ResourceType[]) {
      const delta = fx.resourcesDelta[key] ?? 0;
      nextRawResources[key] = Math.max(0, nextRawResources[key] + delta);
    }
  }
  const nextResources = clampResourcesToCapacity(nextRawResources, state.capacities);

  // 3. Apply crew state & shelter toggle
  const nextCrew: CrewState = {
    ...state.crew,
    energy: Math.max(0, Math.min(100, state.crew.energy + (fx.crewEnergyDelta ?? 0))),
    condition: Math.max(12, Math.min(100, state.crew.condition + (fx.crewConditionDelta ?? 0))),
    radiationExposure: Math.max(
      0,
      Math.min(100, state.crew.radiationExposure + (fx.crewRadiationDelta ?? 0))
    ),
    inShelter: fx.setInShelter !== undefined ? fx.setInShelter : state.crew.inShelter,
  };

  // 4. Advance clock if choice costs work hours
  const addedHours = fx.timeHoursCost ?? 0;
  const clock = computeWorkClockMetrics(state.hoursElapsed + addedHours);

  // 5. Carry-over campaign modifiers
  const nextModifiers: MissionModifiers = {
    solarOutputBonusPct: Math.max(
      -30,
      Math.min(40, state.modifiers.solarOutputBonusPct + (fx.solarOutputBonusPctDelta ?? 0))
    ),
    stormDamageFactor: Math.max(
      0.4,
      Math.min(
        1.5,
        Number(
          (state.modifiers.stormDamageFactor * (fx.stormDamageFactorMultiplier ?? 1)).toFixed(2)
        )
      )
    ),
    extraDustNextStorm: Math.max(
      0,
      state.modifiers.extraDustNextStorm + (fx.extraDustNextStormDelta ?? 0)
    ),
    cropBoostDaysLeft: Math.max(
      state.modifiers.cropBoostDaysLeft,
      fx.cropBoostDays ?? 0
    ),
    lastDecisionNote: {
      id: `dec_${state.day}_${choice.id}`,
      headline: choice.gilHeadline,
      outcome: choice.gilOutcome,
      futureWarning: choice.gilFutureWarning,
      urgency: choice.urgency,
    },
    decisionHistory: [
      ...state.modifiers.decisionHistory,
      {
        day: state.day,
        eventId: activeEvent.definition.id,
        choiceId: choice.id,
        choiceTitle: choice.title,
        summary: choice.gilOutcome,
      },
    ],
  };

  const nextState: GameState = {
    ...state,
    ...clock,
    resources: nextResources,
    buildings: nextBuildings,
    crew: nextCrew,
    modifiers: nextModifiers,
    activeEvent: {
      ...activeEvent,
      resolved: true,
      selectedChoiceId: choice.id,
      shelterUsed: nextCrew.inShelter,
      mitigationSummary: choice.title,
    },
    keyDecisions: [
      ...state.keyDecisions,
      `Day ${state.day}: ${activeEvent.definition.title} — ${choice.title}`,
    ],
  };

  return { nextState, buildingImpacts };
}

export function resolveEventAtEndOfDay(params: {
  activeEvent: ActiveEvent;
  buildings: Record<BuildingId, BuildingState>;
  resources: ResourceAmounts;
  crew: CrewState;
  modifiers?: MissionModifiers;
}): {
  buildings: Record<BuildingId, BuildingState>;
  resources: ResourceAmounts;
  radiationGain: number;
  crewEnergyPenalty: number;
  buildingImpacts: BuildingEventImpact[];
  consumedExtraDust: boolean;
  outcomeSummary: string;
} {
  const { activeEvent, buildings, resources, crew, modifiers } = params;
  const def: EventDefinition = activeEvent.definition;

  let nextBuildings = { ...buildings };
  let nextResources = { ...resources };
  const impactMap = new Map<BuildingId, BuildingEventImpact>();

  // Preparedness mitigation: operational Maintenance Facility softens physical storm damage by 30%,
  // combined with carry-over stormDamageFactor from major event decisions.
  const workshopOperational = buildings.maintenance_facility.status === 'operational';
  const workshopMitigation = workshopOperational ? 0.7 : 1;
  const campaignFactor = modifiers?.stormDamageFactor ?? 1;

  if (!activeEvent.initialDamageApplied && def.targetBuildings && def.conditionDamage) {
    const damage = Math.max(
      2,
      Math.round(def.conditionDamage * workshopMitigation * campaignFactor)
    );
    for (const id of def.targetBuildings) {
      const before = nextBuildings[id].condition;
      nextBuildings[id] = applyBuildingConditionChange(
        nextBuildings[id],
        -damage,
        false,
        def.phenomenon
      );
      const actualDelta = nextBuildings[id].condition - before;
      if (actualDelta !== 0) {
        impactMap.set(id, { buildingId: id, conditionDelta: actualDelta });
      }
    }
  }

  let consumedExtraDust = false;
  if (!activeEvent.initialDamageApplied && def.dustAdded) {
    const extraDust = modifiers?.extraDustNextStorm ?? 0;
    consumedExtraDust = extraDust > 0;
    const beforeDust = nextBuildings.solar_panels.dustLevel;
    const nextDust = Math.min(100, beforeDust + def.dustAdded + extraDust);
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

  if (activeEvent.mitigationSummary) {
    summaryParts.push(`Decision: ${activeEvent.mitigationSummary}`);
  }

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
    consumedExtraDust,
    outcomeSummary: summaryParts.join(' · ') || 'Weather event passed',
  };
}
