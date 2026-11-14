import { BUILDING_DEFINITIONS } from '../data/buildings';
import { MAX_DAILY_HOURS, TOTAL_DAY_HOURS } from '../data/mission';
import { TASK_DEFINITIONS } from '../data/tasks';
import { BuildingId } from '../types/building';
import { GameState } from '../types/game';
import { TaskDefinition, TaskValidationResult } from '../types/task';
import { canAffordResources, deductResources } from './resources';
import { applyBuildingConditionChange } from './buildings';

export function getTasksForBuilding(buildingId: BuildingId): TaskDefinition[] {
  return TASK_DEFINITIONS.filter((task) => task.buildingId === buildingId);
}

export function getEffectiveTaskCosts(
  task: TaskDefinition,
  state: GameState
): { timeHours: number; crewEnergyCost: number; conditionBonus: number } {
  const workshop = state.buildings.maintenance_facility;
  const workshopOperational = workshop.status === 'operational';

  // Operational Maintenance Facility reduces repair energy slightly and increases repair effectiveness
  const energyReduction = workshopOperational && task.category === 'minor' ? 3 : 0;
  const conditionBonus = workshopOperational ? 8 : 0;

  return {
    timeHours: task.timeHours,
    crewEnergyCost: Math.max(5, task.crewEnergyCost - energyReduction),
    conditionBonus,
  };
}

export function validateTask(task: TaskDefinition, state: GameState): TaskValidationResult {
  const building = state.buildings[task.buildingId];
  const costs = getEffectiveTaskCosts(task, state);

  // Restoration rule: broken or unrestored systems cannot be cleaned, repaired, or maintained until restored first.
  if (
    task.category === 'minor' &&
    !task.setsOperational &&
    (!building.restoredOnce || building.status === 'inactive')
  ) {
    return {
      canExecute: false,
      reason: 'Restore system first',
    };
  }

  if (task.requiresStatus && !task.requiresStatus.includes(building.status)) {
    return {
      canExecute: false,
      reason: 'Already restored',
    };
  }

  if (task.maxConditionBelow !== undefined && building.condition >= task.maxConditionBelow) {
    return {
      canExecute: false,
      reason: 'Condition is already at peak',
    };
  }

  if (task.minDustAbove !== undefined && building.dustLevel < task.minDustAbove) {
    return {
      canExecute: false,
      reason: 'Panels are already clean',
    };
  }

  if (
    task.requiresBuildingOperational &&
    state.buildings[task.requiresBuildingOperational].status === 'inactive'
  ) {
    const reqName = BUILDING_DEFINITIONS[task.requiresBuildingOperational].name;
    return {
      canExecute: false,
      reason: `Requires ${reqName}`,
    };
  }

  if (state.hoursElapsed + costs.timeHours > TOTAL_DAY_HOURS) {
    return {
      canExecute: false,
      reason: `Past 11:59 PM (needs ${costs.timeHours}h) — End Day`,
    };
  }

  if (state.crew.energy < costs.crewEnergyCost) {
    return {
      canExecute: false,
      reason: 'Crew too tired — Rest or End Day',
    };
  }

  if (!canAffordResources(state.resources, task.resourceCost)) {
    return {
      canExecute: false,
      reason: 'Not enough resources',
    };
  }

  return { canExecute: true };
}

export function applyTaskExecution(task: TaskDefinition, state: GameState): GameState {
  const validation = validateTask(task, state);
  if (!validation.canExecute) {
    return state;
  }

  const costs = getEffectiveTaskCosts(task, state);
  const currentBuilding = state.buildings[task.buildingId];
  let updatedBuilding = applyBuildingConditionChange(
    currentBuilding,
    task.conditionGain + (task.conditionGain > 10 ? costs.conditionBonus : 0),
    Boolean(task.setsOperational)
  );

  if (task.dustCleared) {
    updatedBuilding = {
      ...updatedBuilding,
      dustLevel: Math.max(0, updatedBuilding.dustLevel - task.dustCleared),
    };
  }

  updatedBuilding = {
    ...updatedBuilding,
    timesMaintained: updatedBuilding.timesMaintained + 1,
  };

  const nextResources = deductResources(state.resources, task.resourceCost);
  const buildingDef = BUILDING_DEFINITIONS[task.buildingId];

  const decisionNote =
    task.category === 'major'
      ? `Day ${state.day}: Restored ${buildingDef.name}`
      : null;

  const nextHoursElapsed = Math.min(TOTAL_DAY_HOURS, state.hoursElapsed + costs.timeHours);
  const nextHoursRemaining = Math.max(0, MAX_DAILY_HOURS - nextHoursElapsed);
  const nextOvertimeHours = Math.max(0, nextHoursElapsed - MAX_DAILY_HOURS);

  return {
    ...state,
    hoursElapsed: nextHoursElapsed,
    hoursRemaining: nextHoursRemaining,
    overtimeHours: nextOvertimeHours,
    ongoingTask: { taskId: task.id, buildingId: task.buildingId },
    resources: nextResources,
    crew: {
      ...state.crew,
      energy: Math.max(0, state.crew.energy - costs.crewEnergyCost),
    },
    buildings: {
      ...state.buildings,
      [task.buildingId]: updatedBuilding,
    },
    totalTasksCompleted: state.totalTasksCompleted + 1,
    majorTasksCompleted:
      state.majorTasksCompleted + (task.category === 'major' ? 1 : 0),
    minorTasksCompleted:
      state.minorTasksCompleted + (task.category === 'minor' ? 1 : 0),
    keyDecisions: decisionNote
      ? [...state.keyDecisions, decisionNote]
      : state.keyDecisions,
  };
}
