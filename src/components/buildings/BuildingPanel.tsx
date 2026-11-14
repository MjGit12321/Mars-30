import { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Shield,
  Sparkles,
  Sprout,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { CROP_DEFINITIONS, CROP_MAP } from '../../data/crops';
import { TOTAL_DAY_HOURS } from '../../data/mission';
import { canPlantCrop } from '../../systems/greenhouse';
import { getEffectiveTaskCosts, getTasksForBuilding, validateTask } from '../../systems/tasks';
import { BuildingId } from '../../types/building';
import { GameState } from '../../types/game';
import { ResourceType } from '../../types/resource';
import { BuildingIcon, ResourceIcon } from '../icons/GameIcons';

interface BuildingPanelProps {
  state: GameState;
  onClose: () => void;
  onExecuteTask: (taskId: string) => void;
  onPlantCrop: (cropId: string) => void;
  onHarvestCrop: () => void;
  onToggleShelter: () => void;
}

export function BuildingPanel({
  state,
  onClose,
  onExecuteTask,
  onPlantCrop,
  onHarvestCrop,
  onToggleShelter,
}: BuildingPanelProps) {
  const [showScience, setShowScience] = useState(false);

  if (!state.selectedBuildingId) return null;

  const id: BuildingId = state.selectedBuildingId;
  const def = BUILDING_DEFINITIONS[id];
  const bState = state.buildings[id];
  const allTasks = getTasksForBuilding(id);

  const needsRestorationFirst = !bState.restoredOnce || bState.status === 'inactive';
  const isDamaged = !needsRestorationFirst && bState.status === 'damaged';

  const statusText = needsRestorationFirst
    ? 'Needs Fix!'
    : isDamaged
    ? 'Repair Needed'
    : id === 'solar_panels' && bState.dustLevel >= 35
    ? 'Dusty!'
    : 'Working!';

  const statusColor = needsRestorationFirst
    ? '#C94B43'
    : isDamaged || statusText === 'Dusty!'
    ? '#D77B4A'
    : '#396344';

  // Show ONLY actions the player can currently perform
  const availableTasks = allTasks.filter((t) => validateTask(t, state).canExecute);

  // Blocked task hint (if building needs something, why can't we run a task?)
  const primaryPendingTask = allTasks.find((t) => {
    if (needsRestorationFirst && t.category === 'minor' && !t.setsOperational) return false;
    const v = validateTask(t, state);
    return !v.canExecute && v.reason !== 'Already restored' && v.reason !== 'Condition is already at peak' && v.reason !== 'Panels are already clean';
  });
  const pendingReason = primaryPendingTask ? validateTask(primaryPendingTask, state).reason : null;

  const activeCrop = state.greenhouseCrop ? CROP_MAP[state.greenhouseCrop.cropId] : null;
  const canHarvestNow =
    id === 'greenhouse' &&
    Boolean(state.greenhouseCrop?.isMature) &&
    state.hoursElapsed + 1 <= TOTAL_DAY_HOURS;

  const availableCrops =
    id === 'greenhouse' && !needsRestorationFirst && !state.greenhouseCrop
      ? CROP_DEFINITIONS.filter(
          (crop) =>
            canPlantCrop({
              cropId: crop.id,
              greenhouse: bState,
              currentCrop: state.greenhouseCrop,
              resources: state.resources,
              hoursElapsed: state.hoursElapsed,
            }).ok
        )
      : [];

  const canUseShelter =
    id === 'radiation_shelter' && !needsRestorationFirst;

  const hasAnyAction =
    availableTasks.length > 0 ||
    canHarvestNow ||
    availableCrops.length > 0 ||
    canUseShelter;

  return (
    <aside
      className="w-full h-full max-h-full pointer-events-auto flex flex-col min-h-0"
      aria-label={`${def.name} panel`}
    >
      <div className="mars-panel flex flex-col max-h-full overflow-hidden rounded-2xl">
        {/* Icon-first Header with Big Close Button */}
        <div className="px-3.5 py-3 border-b-2 border-[#292C2B] flex items-center justify-between gap-2.5 bg-[#FAF0DC]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
              <BuildingIcon id={id} className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold leading-tight truncate">{def.name}</h2>
              <div
                className="mt-0.5 flex items-center gap-1 text-xs font-extrabold"
                style={{ color: statusColor }}
              >
                {statusText === 'Working!' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{statusText}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close building card"
            className="p-2 rounded-xl hover:bg-[#E9B77B]/60 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-3 overflow-y-auto space-y-3 text-sm">
          {/* Brief Purpose + Health Bar */}
          <div className="mars-panel-light p-2.5 space-y-2">
            <p className="text-xs font-bold text-[#292C2B] leading-snug">
              {def.description}
            </p>

            <div>
              <div className="flex justify-between text-[11px] font-extrabold mb-1 tabular-nums">
                <span>Health</span>
                <span>{bState.condition}%</span>
              </div>
              <div className="h-2.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${bState.condition}%`,
                    backgroundColor:
                      bState.condition >= 65
                        ? '#718B78'
                        : bState.condition >= 35
                        ? '#D77B4A'
                        : '#C94B43',
                  }}
                />
              </div>
            </div>

            {id === 'solar_panels' && bState.dustLevel > 10 && (
              <div className="text-[11px] font-extrabold text-[#B94F32] tabular-nums">
                Dust on panels: {bState.dustLevel}%
              </div>
            )}
          </div>

          {/* Growing Crop Progress Bar (informational while growing) */}
          {id === 'greenhouse' && state.greenhouseCrop && activeCrop && !state.greenhouseCrop.isMature && (
            <div className="mars-panel-light p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#396344] tabular-nums">
                <span className="flex items-center gap-1.5">
                  <Sprout className="w-4 h-4" aria-hidden="true" />
                  {activeCrop.name}
                </span>
                <span>
                  Day {Math.floor(state.greenhouseCrop.growthProgress)}/{state.greenhouseCrop.growthDaysRequired}
                </span>
              </div>
              <div className="h-2.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#718B78]"
                  style={{
                    width: `${Math.min(
                      100,
                      (state.greenhouseCrop.growthProgress /
                        state.greenhouseCrop.growthDaysRequired) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ONLY AVAILABLE ACTIONS */}
          <div className="space-y-2">
            {/* Radiation Shelter Toggle (only once restored) */}
            {canUseShelter && (
              <button
                type="button"
                onClick={onToggleShelter}
                className={`mars-btn w-full p-2.5 rounded-xl flex items-center gap-3 text-left cursor-pointer ${
                  state.crew.inShelter
                    ? 'bg-[#E9B77B] text-[#292C2B]'
                    : 'bg-[#477C9B] text-[#FAF0DC]'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-[#292C2B]" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold leading-tight">
                    {state.crew.inShelter ? 'Go Back Outside' : 'Hide Crew Inside!'}
                  </div>
                  <div className="text-[11px] font-semibold opacity-90">
                    {state.crew.inShelter
                      ? 'Crew is safe inside right now'
                      : 'Protects crew from solar storms'}
                  </div>
                </div>
              </button>
            )}

            {/* Mature Harvest Button */}
            {canHarvestNow && activeCrop && (
              <button
                type="button"
                onClick={onHarvestCrop}
                className="mars-btn w-full p-2.5 rounded-xl bg-[#718B78] text-[#FAF0DC] flex items-center gap-3 text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                  <ResourceIcon type="food" className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold leading-tight">
                    Harvest +{activeCrop.harvestFoodYield} Food!
                  </div>
                  <div className="text-[11px] font-bold opacity-95 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    <span>1h</span>
                  </div>
                </div>
              </button>
            )}

            {/* Available Crop Planting Buttons */}
            {availableCrops.map((crop) => (
              <button
                key={crop.id}
                type="button"
                onClick={() => onPlantCrop(crop.id)}
                className="mars-btn w-full p-2.5 rounded-xl bg-[#718B78] text-[#FAF0DC] flex items-center gap-3 text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                  <Sprout className="w-5 h-5 text-[#396344]" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold leading-tight">
                    Plant {crop.name}
                  </div>
                  <div className="text-[11px] font-bold opacity-95 flex flex-wrap items-center gap-2 mt-0.5 tabular-nums">
                    <span>+{crop.harvestFoodYield} Food</span>
                    <span>· {crop.growthDays} days</span>
                    <span>· {crop.seedWaterCost}W {crop.seedEnergyCost}E</span>
                  </div>
                </div>
              </button>
            ))}

            {/* Available Repair / Clean / Restore Buttons */}
            {availableTasks.map((task) => {
              const costs = getEffectiveTaskCosts(task, state);
              const projectedHoursElapsed = state.hoursElapsed + costs.timeHours;
              const entersOvertime = projectedHoursElapsed > state.maxDailyHours;
              const isMajor = task.category === 'major';

              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onExecuteTask(task.id)}
                  className={`mars-btn w-full p-2.5 rounded-xl flex items-center gap-3 text-left cursor-pointer ${
                    isMajor
                      ? 'bg-[#B94F32] text-[#FAF0DC]'
                      : 'bg-[#E9B77B] text-[#292C2B]'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                    {task.dustCleared ? (
                      <Sparkles className="w-5 h-5 text-[#D77B4A]" aria-hidden="true" />
                    ) : (
                      <Wrench className="w-5 h-5 text-[#B94F32]" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold leading-tight">
                      {task.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold opacity-95 tabular-nums">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {costs.timeHours}h
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Zap className="w-3 h-3" aria-hidden="true" />
                        -{costs.crewEnergyCost}%
                      </span>
                      {Object.entries(task.resourceCost).map(([resKey, amount]) => (
                        <span key={resKey} className="inline-flex items-center gap-0.5">
                          <ResourceIcon
                            type={resKey as ResourceType}
                            className="w-3.5 h-3.5"
                          />
                          -{amount}
                        </span>
                      ))}
                      {entersOvertime && (
                        <span className="inline-flex items-center gap-0.5 text-[#FAF0DC] bg-[#292C2B]/80 px-1.5 py-0.5 rounded text-[10px]">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                          Overtime
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Cheerful Empty State when nothing can be clicked right now */}
            {!hasAnyAction && (
              <div className="mars-panel-light p-3 text-center space-y-1">
                {pendingReason ? (
                  <>
                    <div className="text-xs font-extrabold text-[#B94F32]">
                      {pendingReason}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-[#396344]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>All Good Here!</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quiet Optional Mars Fact */}
          <div>
            <button
              type="button"
              onClick={() => setShowScience((prev) => !prev)}
              className="text-[11px] font-extrabold text-[#477C9B] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              {showScience ? 'Hide Fact' : 'Fun Mars Fact'}
            </button>
            {showScience && (
              <p className="mt-1.5 mars-panel-light p-2.5 text-xs font-semibold text-[#292C2B] leading-snug">
                {def.scienceNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
