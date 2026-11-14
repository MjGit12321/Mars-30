import { BUILDING_DEFINITIONS } from '../data/buildings';
import { CROP_MAP } from '../data/crops';
import {
  calculateOvertimeFatigue,
  computeWorkClockMetrics,
  getPhaseForDay,
  MAX_DAILY_HOURS,
  MAX_MISSION_DAYS,
  TOTAL_DAY_HOURS,
  WORK_START_HOUR,
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
import {
  applyInitialEventImpact,
  applyMajorEventDecision,
  BuildingEventImpact,
  createActiveEventForDay,
  createScarsForEvent,
  generateMissionEventSchedule,
  resolveEventAtEndOfDay,
} from '../systems/events';
import { getPostDaySummaryGilHint } from '../systems/gil';
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
import { applyTaskExecution, getEffectiveTaskCosts, validateTask } from '../systems/tasks';
import { BuildingId } from '../types/building';
import { DaySummary, GameState, PendingCrewAction, ScreenMode } from '../types/game';
import { ResourceAmounts } from '../types/resource';

function formatOvertimeLabel(hours: number): string {
  const totalMins = Math.max(1, Math.round(hours * 60));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs <= 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export type WorldFeedbackEvent =
  | {
      type: 'task_assigned';
      buildingId: BuildingId;
      taskKind: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';
      label: string;
    }
  | {
      type: 'work_started';
      buildingId: BuildingId;
      taskKind: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';
      duration: number;
      label: string;
    }
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
  | { type: 'decision'; choiceTitle: string; buildingImpacts?: BuildingEventImpact[] }
  | { type: 'event_impact'; eventId: string; buildingImpacts: BuildingEventImpact[] }
  | { type: 'sleep_start' }
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
    hoursElapsed: WORK_START_HOUR,
    overtimeHours: 0,
    sleepPhase: 'idle',
    sleepingRemaining: 0,
    ongoingTask: null,
    pendingAction: null,
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
    environmentalScars: [],
    modifiers: {
      solarOutputBonusPct: 0,
      stormDamageFactor: 1,
      extraDustNextStorm: 0,
      cropBoostDaysLeft: 0,
      lastDecisionNote: null,
      decisionHistory: [],
    },
    lastDaySummary: null,
    gilDayHint: null,
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
  private workTicker: ReturnType<typeof setInterval> | undefined;
  private eventAnimTimer: ReturnType<typeof setInterval> | undefined;
  private sleepTimer: ReturnType<typeof setInterval> | undefined;
  private idleTimeTimer: ReturnType<typeof setInterval> | undefined;

  private stopIdleTimeTicker() {
    if (this.idleTimeTimer !== undefined) {
      globalThis.clearInterval(this.idleTimeTimer);
      this.idleTimeTimer = undefined;
    }
  }

  private startIdleTimeTicker() {
    if (this.idleTimeTimer !== undefined) return;
    // Automatic time progression: 1 in-game minute every 2 real-time seconds
    this.idleTimeTimer = globalThis.setInterval(() => {
      const cur = this.state;
      if (
        cur.screen !== 'PLAYING' ||
        cur.sleepPhase !== 'idle' ||
        cur.sleepingRemaining > 0 ||
        cur.lastDaySummary ||
        cur.gilDayHint ||
        (cur.activeEvent && !cur.activeEvent.resolved) ||
        cur.pendingAction !== null ||
        cur.hoursElapsed >= TOTAL_DAY_HOURS
      ) {
        return;
      }

      const clock = computeWorkClockMetrics(cur.hoursElapsed + 1 / 60);
      if (clock.hoursElapsed !== cur.hoursElapsed) {
        this.setState({
          ...cur,
          ...clock,
        });
      }
    }, 2000);
  }

  private stopWorkTicker() {
    if (this.workTicker !== undefined) {
      globalThis.clearInterval(this.workTicker);
      this.workTicker = undefined;
    }
  }

  private startWorkTicker() {
    this.stopWorkTicker();
    this.workTicker = globalThis.setInterval(() => {
      const cur = this.state;
      if (cur.screen !== 'PLAYING' || cur.sleepPhase !== 'idle') {
        return;
      }
      const act = cur.pendingAction;
      if (!act || act.phase !== 'working') {
        this.stopWorkTicker();
        return;
      }

      const nextRem = Math.max(0, Number((act.workRemainingSec - 0.1).toFixed(2)));
      const progress = Math.min(
        1,
        Math.max(0, (act.workDurationSec - nextRem) / Math.max(0.1, act.workDurationSec))
      );
      const targetApplied = act.timeHoursTotal * progress;
      const deltaHours = Math.max(0, targetApplied - act.timeHoursApplied);
      const clock = computeWorkClockMetrics(cur.hoursElapsed + deltaHours);

      if (nextRem <= 0) {
        this.stopWorkTicker();
        this.state = {
          ...cur,
          ...clock,
          pendingAction: {
            ...act,
            workRemainingSec: 0,
            timeHoursApplied: targetApplied,
          },
        };
        this.completePendingAction();
      } else {
        this.setState({
          ...cur,
          ...clock,
          pendingAction: {
            ...act,
            workRemainingSec: nextRem,
            timeHoursApplied: targetApplied,
          },
        });
      }
    }, 100);
  }

  private stopSleepTicker() {
    if (this.sleepTimer !== undefined) {
      globalThis.clearInterval(this.sleepTimer);
      this.sleepTimer = undefined;
    }
  }

  private startSleepTicker() {
    this.stopSleepTicker();
    this.sleepTimer = globalThis.setInterval(() => {
      const cur = this.state;
      if (cur.screen !== 'PLAYING' || cur.sleepPhase !== 'sleeping') return;
      if (cur.sleepingRemaining <= 0) {
        this.stopSleepTicker();
        this.completeEndDay();
        return;
      }

      const nextRemaining = Math.max(0, Number((cur.sleepingRemaining - 0.2).toFixed(2)));
      if (nextRemaining <= 0) {
        this.stopSleepTicker();
        this.completeEndDay();
      } else {
        this.setState({
          ...cur,
          sleepingRemaining: nextRemaining,
        });
      }
    }, 200);
  }

  private stopEventAnimationTicker() {
    if (this.eventAnimTimer !== undefined) {
      globalThis.clearInterval(this.eventAnimTimer);
      this.eventAnimTimer = undefined;
    }
  }

  private startEventAnimationTicker() {
    this.stopEventAnimationTicker();
    this.eventAnimTimer = globalThis.setInterval(() => {
      const cur = this.state;
      if (cur.screen !== 'PLAYING') return;
      const evt = cur.activeEvent;
      if (!evt || evt.animationRemaining <= 0) {
        this.stopEventAnimationTicker();
        return;
      }

      const nextRemaining = Math.max(0, Number((evt.animationRemaining - 0.25).toFixed(2)));
      let updatedState: GameState = {
        ...cur,
        activeEvent: {
          ...evt,
          animationRemaining: nextRemaining,
        },
      };

      const impactTriggerAt = evt.animationDuration >= 20 ? 2.5 : 1.8;
      if (!evt.initialDamageApplied && nextRemaining <= impactTriggerAt) {
        const { nextState: impactedState, buildingImpacts } = applyInitialEventImpact(updatedState);
        const nextCapacities = calculateResourceCapacities(impactedState.buildings);
        updatedState = {
          ...impactedState,
          capacities: nextCapacities,
          resources: clampResourcesToCapacity(impactedState.resources, nextCapacities),
        };
        soundFX.playAlert();
        this.setState(updatedState);
        if (buildingImpacts.length > 0) {
          this.emitFeedback({
            type: 'event_impact',
            eventId: evt.definition.id,
            buildingImpacts,
          });
        }
      } else {
        this.setState(updatedState);
      }

      if (nextRemaining <= 0) {
        this.stopEventAnimationTicker();
      }
    }, 250);
  }

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
    this.startIdleTimeTicker();
  }

  public restartMission(newSeed?: number) {
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
    soundFX.playSelect();
    const fresh = createInitialGameState(
      newSeed ?? Math.floor(Date.now() % 100000)
    );
    fresh.screen = 'PLAYING';
    fresh.audioMuted = this.state.audioMuted;
    fresh.selectedBuildingId = null;
    this.setState(fresh);
    this.startIdleTimeTicker();
  }

  public returnToTitle() {
    this.stopWorkTicker();
    this.stopEventAnimationTicker();
    this.stopSleepTicker();
    this.stopIdleTimeTicker();
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
    if (screen === 'PLAYING') {
      this.startIdleTimeTicker();
    }
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
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working'
    ) {
      return;
    }

    const task = TASK_DEFINITIONS.find((t) => t.id === taskId);
    if (!task) return;

    const validation = validateTask(task, this.state);
    if (!validation.canExecute) return;

    const taskKind: 'restore' | 'repair' | 'clean' =
      task.dustCleared && task.category === 'minor'
        ? 'clean'
        : task.category === 'major'
        ? 'restore'
        : 'repair';
    const workDurationSec = taskKind === 'restore' ? 3.0 : 2.4;
    const costs = getEffectiveTaskCosts(task, this.state);

    const action: PendingCrewAction = {
      id: `act_${Date.now()}_${task.id}`,
      kind: 'task',
      buildingId: task.buildingId,
      taskId: task.id,
      taskKind,
      assignedCrew: 'NAS',
      label: task.title,
      phase: 'walking',
      workDurationSec,
      workRemainingSec: workDurationSec,
      timeHoursTotal: costs.timeHours,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });
    this.emitFeedback({
      type: 'task_assigned',
      buildingId: task.buildingId,
      taskKind,
      label: task.title,
    });
  }

  public notifyCrewArrived(actionId: string) {
    const cur = this.state;
    if (
      cur.screen !== 'PLAYING' ||
      cur.sleepPhase !== 'idle' ||
      cur.sleepingRemaining > 0 ||
      !cur.pendingAction ||
      cur.pendingAction.id !== actionId ||
      cur.pendingAction.phase !== 'walking'
    ) {
      return;
    }

    const act = cur.pendingAction;
    if (act.kind === 'task') {
      const task = TASK_DEFINITIONS.find((t) => t.id === act.taskId);
      if (!task || !validateTask(task, cur).canExecute) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    } else if (act.kind === 'plant') {
      const check = canPlantCrop({
        cropId: act.cropId ?? '',
        greenhouse: cur.buildings.greenhouse,
        currentCrop: cur.greenhouseCrop,
        resources: cur.resources,
        hoursElapsed: cur.hoursElapsed,
        inShelter: cur.crew.inShelter,
      });
      if (!check.ok) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    } else if (act.kind === 'harvest') {
      const remainingHour = Math.max(0, 1 - act.timeHoursApplied);
      if (
        cur.crew.inShelter ||
        !cur.greenhouseCrop?.isMature ||
        cur.hoursElapsed + remainingHour > TOTAL_DAY_HOURS
      ) {
        this.setState({ ...cur, pendingAction: null, ongoingTask: null });
        return;
      }
    }

    const workingAction: PendingCrewAction = {
      ...act,
      phase: 'working',
      workRemainingSec: act.workDurationSec,
    };

    this.setState({
      ...cur,
      pendingAction: workingAction,
      ongoingTask:
        act.kind === 'task' && act.taskId
          ? { taskId: act.taskId, buildingId: act.buildingId }
          : null,
    });
    this.emitFeedback({
      type: 'work_started',
      buildingId: workingAction.buildingId,
      taskKind: workingAction.taskKind,
      duration: workingAction.workDurationSec,
      label: workingAction.label,
    });
    this.startWorkTicker();
  }

  public completePendingAction() {
    const cur = this.state;
    if (cur.screen !== 'PLAYING' || cur.sleepPhase !== 'idle') return;
    const act = cur.pendingAction;
    if (!act) return;

    this.stopWorkTicker();
    const cleanState: GameState = {
      ...cur,
      pendingAction: null,
      ongoingTask: null,
    };

    if (act.kind === 'task') {
      const task = TASK_DEFINITIONS.find((t) => t.id === act.taskId);
      if (!task || !validateTask(task, cleanState, act.timeHoursApplied).canExecute) {
        this.setState(cleanState);
        return;
      }

      const prevCondition = cleanState.buildings[task.buildingId].condition;
      let nextState = applyTaskExecution(task, cleanState, act.timeHoursApplied);
      const nextCapacities = calculateResourceCapacities(nextState.buildings);
      nextState = {
        ...nextState,
        ongoingTask: null,
        pendingAction: null,
        capacities: nextCapacities,
        resources: clampResourcesToCapacity(nextState.resources, nextCapacities),
      };

      soundFX.playRepair();
      this.setState(nextState);
      const taskKind: 'restore' | 'repair' | 'clean' =
        task.dustCleared && task.category === 'minor'
          ? 'clean'
          : task.category === 'major'
          ? 'restore'
          : 'repair';
      const conditionGain = Math.max(
        0,
        nextState.buildings[task.buildingId].condition - prevCondition
      );
      this.emitFeedback({
        type: 'task',
        buildingId: task.buildingId,
        label: task.title,
        taskKind,
        conditionGain,
      });
    } else if (act.kind === 'plant' && act.cropId) {
      const check = canPlantCrop({
        cropId: act.cropId,
        greenhouse: cleanState.buildings.greenhouse,
        currentCrop: cleanState.greenhouseCrop,
        resources: cleanState.resources,
        hoursElapsed: cleanState.hoursElapsed,
        inShelter: cleanState.crew.inShelter,
        preAppliedTimeHours: act.timeHoursApplied,
      });
      if (!check.ok) {
        this.setState(cleanState);
        return;
      }

      const result = plantCropInGreenhouse({
        cropId: act.cropId,
        day: cleanState.day,
        resources: cleanState.resources,
        hoursElapsed: cleanState.hoursElapsed,
        preAppliedTimeHours: act.timeHoursApplied,
      });

      soundFX.playRepair();
      this.setState({
        ...cleanState,
        greenhouseCrop: result.crop,
        resources: result.resources,
        hoursElapsed: result.hoursElapsed,
        hoursRemaining: result.hoursRemaining,
        overtimeHours: result.overtimeHours,
        keyDecisions: [
          ...cleanState.keyDecisions,
          `Day ${cleanState.day}: Planted Greenhouse crops`,
        ],
      });
      this.emitFeedback({ type: 'plant', buildingId: 'greenhouse' });
    } else if (act.kind === 'harvest') {
      const result = harvestMatureCrop({
        crop: cleanState.greenhouseCrop,
        resources: cleanState.resources,
        capacities: cleanState.capacities,
        hoursElapsed: cleanState.hoursElapsed,
        inShelter: cleanState.crew.inShelter,
        preAppliedTimeHours: act.timeHoursApplied,
      });
      if (result.harvestedAmount <= 0) {
        this.setState(cleanState);
        return;
      }

      soundFX.playHarvest();
      this.setState({
        ...cleanState,
        greenhouseCrop: result.crop,
        resources: result.resources,
        hoursElapsed: result.hoursElapsed,
        hoursRemaining: result.hoursRemaining,
        overtimeHours: result.overtimeHours,
        harvestCount: cleanState.harvestCount + 1,
        keyDecisions: [
          ...cleanState.keyDecisions,
          `Day ${cleanState.day}: Harvested +${result.harvestedAmount} Food`,
        ],
      });
      this.emitFeedback({
        type: 'harvest',
        buildingId: 'greenhouse',
        amount: result.harvestedAmount,
      });
    }
  }

  public restCrew() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working'
    ) {
      return;
    }
    const res = performCrewShortRest(
      this.state.crew,
      this.state.hoursElapsed,
      this.state.buildings
    );
    if (!res.rested) return;

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: null,
      ongoingTask: null,
      crew: res.crew,
      hoursElapsed: res.hoursElapsed,
      hoursRemaining: res.hoursRemaining,
      overtimeHours: res.overtimeHours,
    });
  }

  public toggleCrewShelter() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working'
    ) {
      return;
    }
    const shelter = this.state.buildings.radiation_shelter;
    if (!shelter.restoredOnce || shelter.status === 'inactive') return;

    const nextInShelter = !this.state.crew.inShelter;
    // Keep crew inside Radiation Shelter until active radiation danger passes on End Day
    if (!nextInShelter && this.state.activeEvent?.definition.radiationLevel) {
      return;
    }

    soundFX.playSelect();
    const note =
      nextInShelter && this.state.activeEvent?.definition.radiationLevel
        ? `Day ${this.state.day}: Moved crew to Radiation Storm Shelter`
        : null;

    this.setState({
      ...this.state,
      pendingAction: null,
      ongoingTask: null,
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
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working'
    ) {
      return;
    }
    const check = canPlantCrop({
      cropId,
      greenhouse: this.state.buildings.greenhouse,
      currentCrop: this.state.greenhouseCrop,
      resources: this.state.resources,
      hoursElapsed: this.state.hoursElapsed,
      inShelter: this.state.crew.inShelter,
    });
    if (!check.ok) return;

    const cropDef = CROP_MAP[cropId];
    const workDurationSec = 2.4;
    const action: PendingCrewAction = {
      id: `act_${Date.now()}_plant_${cropId}`,
      kind: 'plant',
      buildingId: 'greenhouse',
      cropId,
      taskKind: 'plant',
      assignedCrew: 'NAS',
      label: cropDef ? `Plant ${cropDef.name}` : 'Plant Crops',
      phase: 'walking',
      workDurationSec,
      workRemainingSec: workDurationSec,
      timeHoursTotal: 1,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });
    this.emitFeedback({
      type: 'task_assigned',
      buildingId: 'greenhouse',
      taskKind: 'plant',
      label: action.label,
    });
  }

  public harvestCrop() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working'
    ) {
      return;
    }
    if (
      this.state.crew.inShelter ||
      !this.state.greenhouseCrop?.isMature ||
      this.state.hoursElapsed + 1 > TOTAL_DAY_HOURS
    ) {
      return;
    }

    const workDurationSec = 2.4;
    const action: PendingCrewAction = {
      id: `act_${Date.now()}_harvest`,
      kind: 'harvest',
      buildingId: 'greenhouse',
      taskKind: 'harvest',
      assignedCrew: 'NAS',
      label: 'Harvest Crops',
      phase: 'walking',
      workDurationSec,
      workRemainingSec: workDurationSec,
      timeHoursTotal: 1,
      timeHoursApplied: 0,
    };

    soundFX.playSelect();
    this.setState({
      ...this.state,
      pendingAction: action,
      ongoingTask: null,
    });
    this.emitFeedback({
      type: 'task_assigned',
      buildingId: 'greenhouse',
      taskKind: 'harvest',
      label: action.label,
    });
  }

  public acknowledgeActiveEvent() {
    if (
      !this.state.activeEvent ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0
    ) {
      return;
    }
    if (this.state.activeEvent.definition.choices?.length && !this.state.activeEvent.selectedChoiceId) {
      return;
    }
    this.setState({
      ...this.state,
      activeEvent: {
        ...this.state.activeEvent,
        resolved: true,
      },
    });
  }

  public chooseEventDecision(choiceId: string) {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0
    ) {
      return;
    }
    if (!this.state.activeEvent || this.state.activeEvent.resolved) return;

    const { nextState, buildingImpacts } = applyMajorEventDecision(choiceId, this.state);
    const nextCapacities = calculateResourceCapacities(nextState.buildings);
    const finalState: GameState = {
      ...nextState,
      capacities: nextCapacities,
      resources: clampResourcesToCapacity(nextState.resources, nextCapacities),
    };

    soundFX.playRepair();
    this.setState(finalState);
    this.emitFeedback({
      type: 'decision',
      choiceTitle: finalState.activeEvent?.mitigationSummary ?? 'Decision applied',
      buildingImpacts,
    });
  }

  public dismissDaySummary() {
    if (!this.state.lastDaySummary) return;
    const prevSummary = this.state.lastDaySummary;
    const nextState: GameState = {
      ...this.state,
      lastDaySummary: null,
    };
    const gilDayHint = getPostDaySummaryGilHint(nextState, prevSummary);
    soundFX.playSelect();
    this.setState({
      ...nextState,
      gilDayHint,
    });
  }

  public dismissGilDayHint() {
    if (!this.state.gilDayHint) return;
    soundFX.playSelect();
    this.setState({
      ...this.state,
      gilDayHint: null,
    });
  }

  public endDay() {
    if (
      this.state.screen !== 'PLAYING' ||
      this.state.sleepPhase !== 'idle' ||
      this.state.sleepingRemaining > 0 ||
      this.state.pendingAction?.phase === 'working'
    ) {
      return;
    }
    this.stopWorkTicker();
    soundFX.playSelect();
    this.setState({
      ...this.state,
      sleepPhase: 'returning',
      sleepingRemaining: 3,
      selectedBuildingId: null,
      pendingAction: null,
      ongoingTask: null,
    });
    this.emitFeedback({ type: 'sleep_start' });
  }

  public beginHabitatSleep() {
    if (this.state.screen !== 'PLAYING' || this.state.sleepPhase !== 'returning') return;
    this.setState({
      ...this.state,
      sleepPhase: 'sleeping',
      sleepingRemaining: 3,
    });
    this.startSleepTicker();
  }

  public completeEndDay() {
    if (this.state.screen !== 'PLAYING') return;

    this.stopSleepTicker();
    this.stopWorkTicker();
    const current: GameState = {
      ...this.state,
      sleepPhase: 'idle',
      sleepingRemaining: 0,
      ongoingTask: null,
      pendingAction: null,
    };
    const rates = calculateDailyRates({
      buildings: current.buildings,
      currentResources: current.resources,
      greenhouseCrop: current.greenhouseCrop,
      activeEvent: current.activeEvent,
      modifiers: current.modifiers,
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
    let consumedExtraDust = false;
    let nextEventHistory = [...current.eventHistory];

    let nextScars = [...(current.environmentalScars ?? [])];
    if (current.activeEvent) {
      const eventRes = resolveEventAtEndOfDay({
        activeEvent: current.activeEvent,
        buildings: nextBuildings,
        resources: postEventResources,
        crew: current.crew,
        modifiers: current.modifiers,
      });
      nextBuildings = eventRes.buildings;
      postEventResources = eventRes.resources;
      radiationGain = eventRes.radiationGain;
      crewEnergyPenalty = eventRes.crewEnergyPenalty;
      buildingImpacts = eventRes.buildingImpacts;
      consumedExtraDust = eventRes.consumedExtraDust;

      if (!nextScars.some((s) => s.day === current.day && s.eventId === current.activeEvent!.definition.id)) {
        nextScars = [...nextScars, ...createScarsForEvent(current.activeEvent.definition, current.day)].slice(-28);
      }

      nextEventHistory.push({
        day: current.day,
        eventId: current.activeEvent.definition.id,
        title: current.activeEvent.definition.title,
        severity: current.activeEvent.definition.severity,
        choiceTitle: current.activeEvent.mitigationSummary || undefined,
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
          nextBuildings[bId] = applyBuildingConditionChange(nextBuildings[bId], -3, false, 'wear');
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
      cropBoostDaysLeft: current.modifiers.cropBoostDaysLeft,
    });

    // Update carry-over modifiers at end of day
    const nextModifiers = {
      ...current.modifiers,
      cropBoostDaysLeft: Math.max(0, current.modifiers.cropBoostDaysLeft - 1),
      extraDustNextStorm: consumedExtraDust ? 0 : current.modifiers.extraDustNextStorm,
      lastDecisionNote: null,
    };

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
        `Overtime Fatigue: Worked ${formatOvertimeLabel(current.overtimeHours)} overtime — crew starts next day with -${overtimeFatiguePenalty}% energy.`
      );
    }
    if (cropUpdate.justMatured) {
      summaryNotes.push('Greenhouse crops are ripe and ready to harvest!');
    }
    if (current.activeEvent?.mitigationSummary) {
      summaryNotes.push(`Decision Applied: ${current.activeEvent.mitigationSummary}.`);
    }
    if (current.modifiers.cropBoostDaysLeft > 0 && cropUpdate.growthDelta > 0) {
      summaryNotes.push('Overdrive greenhouse lights sped up crop growth.');
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
        'Oxygen reserves dropped to zero. Restore and maintain the Oxygen Generation System earlier to keep breathable air flowing.';
    } else if (finalResources.water <= 0) {
      failureReason =
        'Water supplies ran completely dry. Restore the Water Recovery System early to recover used water.';
    } else if (finalResources.food <= 0) {
      failureReason =
        'Food rations ran out. Restore the Greenhouse and plant crops early so harvests arrive in time.';
    } else if (crewUpdate.crew.condition <= 10) {
      failureReason =
        'Crew condition reached a critical level from shortages or radiation exposure.';
    }

    if (failureReason) {
      this.stopIdleTimeTicker();
      soundFX.playAlert();
      this.setState({
        ...current,
        screen: 'GAME_OVER',
        sleepPhase: 'idle',
        sleepingRemaining: 0,
        ongoingTask: null,
        pendingAction: null,
        resources: finalResources,
        capacities: nextCapacities,
        buildings: nextBuildings,
        crew: crewUpdate.crew,
        greenhouseCrop: cropUpdate.crop,
        activeEvent: null,
        eventHistory: nextEventHistory,
        modifiers: nextModifiers,
        lastDaySummary: daySummary,
        gilDayHint: null,
        failureReason,
      });
      return;
    }

    // Check End of Day 30 -> Long-Term Sustainability Assessment
    if (current.day >= MAX_MISSION_DAYS) {
      this.stopIdleTimeTicker();
      const completedState: GameState = {
        ...current,
        sleepPhase: 'idle',
        sleepingRemaining: 0,
        ongoingTask: null,
        pendingAction: null,
        resources: finalResources,
        capacities: nextCapacities,
        buildings: nextBuildings,
        crew: crewUpdate.crew,
        greenhouseCrop: cropUpdate.crop,
        activeEvent: null,
        eventHistory: nextEventHistory,
        modifiers: nextModifiers,
        lastDaySummary: null,
        gilDayHint: null,
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

    // Advance to next Martian day (starts at 5:00 AM)
    this.stopEventAnimationTicker();
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
      hoursElapsed: WORK_START_HOUR,
      overtimeHours: 0,
      sleepPhase: 'idle',
      sleepingRemaining: 0,
      ongoingTask: null,
      pendingAction: null,
      phase: getPhaseForDay(nextDay),
      resources: finalResources,
      capacities: nextCapacities,
      buildings: nextBuildings,
      crew: crewUpdate.crew,
      greenhouseCrop: cropUpdate.crop,
      activeEvent: nextEvent,
      eventHistory: nextEventHistory,
      environmentalScars: nextScars,
      modifiers: nextModifiers,
      lastDaySummary: daySummary,
      gilDayHint: null,
    });
    this.emitFeedback({ type: 'end_day', day: nextDay, buildingImpacts });
    if (nextEvent && nextEvent.animationRemaining > 0) {
      this.startEventAnimationTicker();
    }
  }
}

export const gameStore = new GameStore();

// Helper for getting Building display name safely
export function getFacilityName(id: BuildingId): string {
  return BUILDING_DEFINITIONS[id].name;
}
