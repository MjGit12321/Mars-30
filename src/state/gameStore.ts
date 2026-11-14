import { BUILDING_DEFINITIONS } from '../data/buildings';
import {
  calculateOvertimeFatigue,
  getPhaseForDay,
  MAX_DAILY_HOURS,
  MAX_MISSION_DAYS,
} from '../data/mission';
import { TASK_DEFINITIONS } from '../data/tasks';
import { evaluateSustainability } from '../systems/assessment';
import { soundFX } from '../systems/audio';
import {
  applyBuildingConditionChange,
  calculateResourceCapacities,
  createInitialBuildings,
} from '../systems/buildings';
import { createInitialCrew, performCrewShortRest, resolveDailyCrewRecovery } from '../systems/crew';
import { BuildingEventImpact } from '../systems/events';
import {
  createActiveEventForDay,
  generateMissionEventSchedule,
  resolveEventAtEndOfDay,
} from '../systems/events';
import {
  advanceCropGrowth,
  canPlantCrop,
  harvestMatureCrop,
  plantCropInGreenhouse,
} from '../systems/greenhouse';
import {
  calculateDailyRates,
  clampResourcesToCapacity,
  createInitialResources,
} from '../systems/resources';
import { applyTaskExecution, validateTask } from '../systems/tasks';
import { BuildingId } from '../types/building';
import { DaySummary, GameState, ScreenMode } from '../types/game';
import { ResourceAmounts } from '../types/resource';

export type WorldFeedbackEvent =
  | {
      type: 'task';
      buildingId: BuildingId;
      label: string;
      taskKind?: 'restore' | 'repair' | 'clean';
      conditionGain?: number;
    }
  | { type: 'plant'; buildingId: 'greenhouse' }
  | { type: 'harvest'; buildingId: 'greenhouse'; amount: number }
  | { type: 'shelter'; inShelter: boolean }
  | { type: 'focus_building'; buildingId: BuildingId }
  | { type: 'end_day'; day: number; buildingImpacts?: BuildingEventImpact[] };

type StateListener = (state: GameState) => void;
type FeedbackListener = (event: WorldFeedbackEvent) => void;

export function createInitialGameState(
  seed = Math.floor(Math.random() * 900000) + 1000
): GameState {
  const buildings = createInitialBuildings();
  const capacities = calculateResourceCapacities(buildings);
  const resources = clampResourcesToCapacity(createInitialResources(), capacities);
  const scheduledEventDays = generateMissionEventSchedule(seed);

  return {
    screen: 'TITLE_MENU',
    day: 1,
    maxDays: MAX_MISSION_DAYS,
    hoursRemaining: MAX_DAILY_HOURS,
    maxDailyHours: MAX_DAILY_HOURS,
    hoursElapsed: 0,
    overtimeHours: 0,
    ongoingTask: null,
    phase: 1,
    resources,
    capacities,
    buildings,
    selectedBuildingId: null,
    crew: createInitialCrew(),
    greenhouseCrop: null,
    harvestCount: 0,
    activeEvent: null,
    scheduledEventDays,
    eventHistory: [],
    lastDaySummary: null,
    failureReason: null,
    assessment: null,
    totalTasksCompleted: 0,
    majorTasksCompleted: 0,
    minorTasksCompleted: 0,
    keyDecisions: [],
    seed,
    audioMuted: false,
  };
}

class GameStore {
  private state: GameState = createInitialGameState();
  private listeners = new Set<StateListener>();
  private feedbackListeners = new Set<FeedbackListener>();
  private ongoingTaskTimer: number | undefined;

  public getState(): GameState {
    return this.state;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onFeedback(listener: FeedbackListener): () => void {
    this.feedbackListeners.add(listener);
    return () => this.feedbackListeners.delete(listener);
  }

  private setState(next: GameState) {
    this.state = next;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private emitFeedback(event: WorldFeedbackEvent) {
    for (const listener of this.feedbackListeners) {
      listener(event);
    }
  }

  public startMission() {
    soundFX.playSelect();
    this.setState({
      ...this.state,
      screen: 'PLAYING',
      selectedBuildingId: null,
    });
  }

  public restartMission(newSeed?: number) {
    window.clearTimeout(this.ongoingTaskTimer);
    soundFX.playSelect();
    const fresh = createInitialGameState(
      newSeed ?? Math.floor(Date.now() % 100000)
    );
    fresh.screen = 'PLAYING';
    fresh.audioMuted = this.state.audioMuted;
    fresh.selectedBuildingId = null;
    this.setState(fresh);
  }

  public returnToTitle() {
    window.clearTimeout(this.ongoingTaskTimer);
    soundFX.playSelect();
    const fresh = createInitialGameState(this.state.seed);
    fresh.audioMuted = this.state.audioMuted;
    this.setState(fresh);
  }

  public setScreen(screen: ScreenMode) {
    this.setState({
      ...this.state,
      screen,
    });
  }

  public toggleMute() {
    const nextMuted = !this.state.audioMuted;
    soundFX.setMuted(nextMuted);
    this.setState({
      ...this.state,
      audioMuted: nextMuted,
    });
  }

  public selectBuilding(buildingId: BuildingId | null) {
    if (buildingId !== this.state.selectedBuildingId && buildingId !== null) {
      soundFX.playSelect();
    }
    this.setState({
      ...this.state,
      selectedBuildingId: buildingId,
    });
  }

  public focusBuilding(buildingId: BuildingId) {
    soundFX.playSelect();
    this.setState({
      ...this.state,
      selectedBuildingId: buildingId,
    });
    this.emitFeedback({ type: 'focus_building', buildingId });
  }

  public executeTask(taskId: string) {
    if (this.state.screen !== 'PLAYING') return;
    const task = TASK_DEFINITIONS.find((t) => t.id === taskId);
    if (!task) return;

    const validation = validateTask(task, this.state);
    if (!validation.canExecute) return;

    const prevCondition = this.state.buildings[task.buildingId].condition;
    let nextState = applyTaskExecution(task, this.state);
    const nextCapacities = calculateResourceCapacities(nextState.buildings);
    nextState = {
      ...nextState,
      capacities: nextCapacities,
      resources: clampResourcesToCapacity(nextState.resources, nextCapacities),
    };

    soundFX.playRepair();
    this.setState(nextState);
    const taskKind: 'restore' | 'repair' | 'clean' = task.dustCleared && task.category === 'minor'
      ? 'clean'
      : task.category === 'major'
      ? 'restore'
      : 'repair';
    const conditionGain = Math.max(0, nextState.buildings[task.buildingId].condition - prevCondition);
    this.emitFeedback({
      type: 'task',
      buildingId: task.buildingId,
      label: task.title,
      taskKind,
      conditionGain,
    });

    window.clearTimeout(this.ongoingTaskTimer);
    this.ongoingTaskTimer = window.setTimeout(() => {
      if (this.state.ongoingTask?.taskId === task.id) {
        this.setState({
          ...this.state,
          ongoingTask: null,
        });
      }
    }, 900);
  }

  public restCrew() {
    if (this.state.screen !== 'PLAYING') return;
    const res = performCrewShortRest(
      this.state.crew,
      this.state.hoursElapsed,
      this.state.buildings
    );
    if (!res.rested) return;

    soundFX.playSelect();
    this.setState({
      ...this.state,
      crew: res.crew,
      hoursElapsed: res.hoursElapsed,
      hoursRemaining: res.hoursRemaining,
      overtimeHours: res.overtimeHours,
    });
  }

  public toggleCrewShelter() {
    if (this.state.screen !== 'PLAYING') return;
    const nextInShelter = !this.state.crew.inShelter;
    soundFX.playSelect();
    const note =
      nextInShelter && this.state.activeEvent?.definition.radiationLevel
        ? `Day ${this.state.day}: Moved crew to Radiation Shelter`
        : null;

    this.setState({
      ...this.state,
      crew: {
        ...this.state.crew,
        inShelter: nextInShelter,
      },
      keyDecisions: note
        ? [...this.state.keyDecisions, note]
        : this.state.keyDecisions,
    });
    this.emitFeedback({ type: 'shelter', inShelter: nextInShelter });
  }

  public plantCrop(cropId: string) {
    if (this.state.screen !== 'PLAYING') return;
    const check = canPlantCrop({
      cropId,
      greenhouse: this.state.buildings.greenhouse,
      currentCrop: this.state.greenhouseCrop,
      resources: this.state.resources,
      hoursElapsed: this.state.hoursElapsed,
    });
    if (!check.ok) return;

    const result = plantCropInGreenhouse({
      cropId,
      day: this.state.day,
      resources: this.state.resources,
      hoursElapsed: this.state.hoursElapsed,
    });

    soundFX.playRepair();
    this.setState({
      ...this.state,
      greenhouseCrop: result.crop,
      resources: result.resources,
      hoursElapsed: result.hoursElapsed,
      hoursRemaining: result.hoursRemaining,
      overtimeHours: result.overtimeHours,
      keyDecisions: [
        ...this.state.keyDecisions,
        `Day ${this.state.day}: Planted Greenhouse crops`,
      ],
    });
    this.emitFeedback({ type: 'plant', buildingId: 'greenhouse' });
  }

  public harvestCrop() {
    if (this.state.screen !== 'PLAYING') return;
    const result = harvestMatureCrop({
      crop: this.state.greenhouseCrop,
      resources: this.state.resources,
      capacities: this.state.capacities,
      hoursElapsed: this.state.hoursElapsed,
    });
    if (result.harvestedAmount <= 0) return;

    soundFX.playHarvest();
    this.setState({
      ...this.state,
      greenhouseCrop: result.crop,
      resources: result.resources,
      hoursElapsed: result.hoursElapsed,
      hoursRemaining: result.hoursRemaining,
      overtimeHours: result.overtimeHours,
      harvestCount: this.state.harvestCount + 1,
      keyDecisions: [
        ...this.state.keyDecisions,
        `Day ${this.state.day}: Harvested +${result.harvestedAmount} Food`,
      ],
    });
    this.emitFeedback({
      type: 'harvest',
      buildingId: 'greenhouse',
      amount: result.harvestedAmount,
    });
  }

  public acknowledgeActiveEvent() {
    if (!this.state.activeEvent) return;
    this.setState({
      ...this.state,
      activeEvent: {
        ...this.state.activeEvent,
        resolved: true,
      },
    });
  }

  public dismissDaySummary() {
    if (!this.state.lastDaySummary) return;
    this.setState({
      ...this.state,
      lastDaySummary: null,
    });
  }

  public endDay() {
    if (this.state.screen !== 'PLAYING') return;

    const current = this.state;
    const rates = calculateDailyRates({
      buildings: current.buildings,
      currentResources: current.resources,
      greenhouseCrop: current.greenhouseCrop,
      activeEvent: current.activeEvent,
    });

    // Apply net daily resource production and consumption
    const rawResources: ResourceAmounts = {
      oxygen: current.resources.oxygen + rates.production.oxygen - rates.consumption.oxygen,
      water: current.resources.water + rates.production.water - rates.consumption.water,
      food: current.resources.food + rates.production.food - rates.consumption.food,
      energy: current.resources.energy + rates.production.energy - rates.consumption.energy,
    };

    const hadEnoughWater = rawResources.water > 0;
    const hadEnoughEnergy = rates.hasPowerForLifeSupport;

    // Resolve active event effects if any occurred today
    let nextBuildings = { ...current.buildings };
    let postEventResources = { ...rawResources };
    let radiationGain = 0;
    let crewEnergyPenalty = 0;
    let buildingImpacts: BuildingEventImpact[] = [];
    let nextEventHistory = [...current.eventHistory];

    if (current.activeEvent) {
      const eventRes = resolveEventAtEndOfDay({
        activeEvent: current.activeEvent,
        buildings: nextBuildings,
        resources: postEventResources,
        crew: current.crew,
      });
      nextBuildings = eventRes.buildings;
      postEventResources = eventRes.resources;
      radiationGain = eventRes.radiationGain;
      crewEnergyPenalty = eventRes.crewEnergyPenalty;
      buildingImpacts = eventRes.buildingImpacts;

      nextEventHistory.push({
        day: current.day,
        eventId: current.activeEvent.definition.id,
        title: current.activeEvent.definition.title,
        severity: current.activeEvent.definition.severity,
        outcomeSummary: eventRes.outcomeSummary,
      });
    }

    // Gentle operational wear and daily Mars dust accumulation
    if (nextBuildings.solar_panels.status !== 'inactive') {
      nextBuildings.solar_panels = {
        ...nextBuildings.solar_panels,
        dustLevel: Math.min(100, nextBuildings.solar_panels.dustLevel + 3),
      };
    }

    if (current.day % 3 === 0) {
      for (const bId of ['oxygen_generator', 'water_recycling', 'greenhouse'] as BuildingId[]) {
        if (nextBuildings[bId].status === 'operational') {
          nextBuildings[bId] = applyBuildingConditionChange(nextBuildings[bId], -3);
        }
      }
    }

    const nextCapacities = calculateResourceCapacities(nextBuildings);
    const finalResources = clampResourcesToCapacity(postEventResources, nextCapacities);

    // Check depleted resources before crew recovery
    const shortages: string[] = [];
    if (finalResources.oxygen <= 0) shortages.push('Oxygen');
    if (finalResources.water <= 0) shortages.push('Water');
    if (finalResources.food <= 0) shortages.push('Food');
    if (finalResources.energy <= 0 && nextBuildings.solar_panels.status === 'inactive') {
      shortages.push('Energy');
    }

    // Advance greenhouse crop growth
    const cropUpdate = advanceCropGrowth({
      crop: current.greenhouseCrop,
      buildings: nextBuildings,
      hadEnoughWater,
      hadEnoughEnergy,
      eventPenalty: current.activeEvent?.definition.cropGrowthPenalty ?? 0,
    });

    // Crew recovery and radiation effects (including overtime fatigue penalty)
    const overtimeFatiguePenalty = calculateOvertimeFatigue(current.overtimeHours);
    const crewUpdate = resolveDailyCrewRecovery({
      crew: {
        ...current.crew,
        energy: Math.max(0, current.crew.energy - crewEnergyPenalty),
      },
      buildings: nextBuildings,
      shortages,
      radiationGain,
      overtimeFatiguePenalty,
    });

    const summaryNotes: string[] = [];
    if (overtimeFatiguePenalty > 0) {
      summaryNotes.push(
        `Overtime Fatigue: Worked ${current.overtimeHours}h overtime — crew starts next day with -${overtimeFatiguePenalty}% energy.`
      );
    }
    if (cropUpdate.justMatured) {
      summaryNotes.push('Greenhouse crops are ripe and ready to harvest!');
    }
    if (current.activeEvent?.definition.radiationLevel) {
      summaryNotes.push(
        current.crew.inShelter
          ? 'Crew sheltered during radiation burst.'
          : 'Crew exposed to solar radiation outside shelter.'
      );
    }

    const daySummary: DaySummary = {
      day: current.day,
      production: rates.production,
      consumption: rates.consumption,
      waterRecycled: rates.waterRecycled,
      cropGrowthDelta: cropUpdate.growthDelta,
      cropReadyToHarvest: cropUpdate.justMatured,
      crewEnergyRecovered: crewUpdate.energyRecovered,
      overtimeHours: current.overtimeHours,
      fatiguePenalty: overtimeFatiguePenalty,
      buildingImpacts,
      shortages,
      notes: summaryNotes,
    };

    // Check Mission Failure conditions
    let failureReason: string | null = null;
    if (finalResources.oxygen <= 0) {
      failureReason =
        'Oxygen reserves dropped to zero. Restore and maintain the Oxygen Generator earlier to keep breathable air flowing.';
    } else if (finalResources.water <= 0) {
      failureReason =
        'Water supplies ran completely dry. Restore the Water Recycling System early to recover used water.';
    } else if (finalResources.food <= 0) {
      failureReason =
        'Food rations ran out. Restore the Greenhouse and plant crops early so harvests arrive in time.';
    } else if (crewUpdate.crew.condition <= 10) {
      failureReason =
        'Crew condition reached a critical level from shortages or radiation exposure.';
    }

    if (failureReason) {
      soundFX.playAlert();
      this.setState({
        ...current,
        screen: 'GAME_OVER',
        resources: finalResources,
        capacities: nextCapacities,
        buildings: nextBuildings,
        crew: crewUpdate.crew,
        greenhouseCrop: cropUpdate.crop,
        activeEvent: null,
        eventHistory: nextEventHistory,
        lastDaySummary: daySummary,
        failureReason,
      });
      return;
    }

    // Check End of Day 30 -> Long-Term Sustainability Assessment
    if (current.day >= MAX_MISSION_DAYS) {
      const completedState: GameState = {
        ...current,
        resources: finalResources,
        capacities: nextCapacities,
        buildings: nextBuildings,
        crew: crewUpdate.crew,
        greenhouseCrop: cropUpdate.crop,
        activeEvent: null,
        eventHistory: nextEventHistory,
        lastDaySummary: null,
      };
      const assessment = evaluateSustainability(completedState);
      soundFX.playVictory();
      this.setState({
        ...completedState,
        screen: 'MISSION_REPORT',
        assessment,
      });
      return;
    }

    // Advance to next Martian day
    window.clearTimeout(this.ongoingTaskTimer);
    const nextDay = current.day + 1;
    const nextEvent = createActiveEventForDay(nextDay, current.scheduledEventDays);

    if (nextEvent) {
      soundFX.playAlert();
    } else {
      soundFX.playEndDay();
    }

    this.setState({
      ...current,
      day: nextDay,
      hoursRemaining: MAX_DAILY_HOURS,
      hoursElapsed: 0,
      overtimeHours: 0,
      ongoingTask: null,
      phase: getPhaseForDay(nextDay),
      resources: finalResources,
      capacities: nextCapacities,
      buildings: nextBuildings,
      crew: crewUpdate.crew,
      greenhouseCrop: cropUpdate.crop,
      activeEvent: nextEvent,
      eventHistory: nextEventHistory,
      lastDaySummary: daySummary,
    });
    this.emitFeedback({ type: 'end_day', day: nextDay, buildingImpacts });
  }
}

export const gameStore = new GameStore();

// Helper for getting Building display name safely
export function getFacilityName(id: BuildingId): string {
  return BUILDING_DEFINITIONS[id].name;
}
