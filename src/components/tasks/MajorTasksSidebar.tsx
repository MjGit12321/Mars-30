import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Cpu,
  Droplets,
  Loader2,
  MapPin,
  Shield,
  Sparkles,
  Sprout,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { TOTAL_DAY_HOURS } from '../../data/mission';
import { TASK_DEFINITIONS } from '../../data/tasks';
import { validateTask } from '../../systems/tasks';
import { BuildingCategory, BuildingId } from '../../types/building';
import { GameState } from '../../types/game';
import { BuildingIcon } from '../icons/GameIcons';

interface MajorTasksSidebarProps {
  state: GameState;
  onLocateBuilding: (buildingId: BuildingId) => void;
  onClose: () => void;
}

const MAJOR_TASK_PRIORITY: string[] = [
  'restore_solar_panels',
  'restore_oxygen_generator',
  'restore_water_recycling',
  'restore_greenhouse',
  'restore_radiation_shelter',
  'restore_energy_storage',
  'restore_oxygen_storage',
  'restore_maintenance_facility',
];

export interface AvailableTaskItem {
  id: string;
  taskName: string;
  buildingId: BuildingId;
  buildingName: string;
  hours?: number;
  kind: 'major' | 'minor' | 'special' | 'ongoing';
}

export function getAvailableTaskItems(state: GameState): AvailableTaskItem[] {
  const items: AvailableTaskItem[] = [];

  // Urgent Shelter Action if Radiation Storm is active and shelter is usable
  if (
    state.activeEvent?.definition.radiationLevel &&
    !state.crew.inShelter &&
    state.buildings.radiation_shelter.restoredOnce &&
    state.buildings.radiation_shelter.status !== 'inactive'
  ) {
    items.push({
      id: 'special_shelter',
      taskName: 'Hide Crew in Shelter!',
      buildingId: 'radiation_shelter',
      buildingName: 'Radiation Shelter',
      kind: 'special',
    });
  }

  // Ripe Greenhouse Harvest
  if (state.greenhouseCrop?.isMature && state.hoursElapsed + 1 <= TOTAL_DAY_HOURS) {
    items.push({
      id: 'special_harvest',
      taskName: 'Harvest Food!',
      buildingId: 'greenhouse',
      buildingName: 'Greenhouse',
      hours: 1,
      kind: 'special',
    });
  }

  // Ongoing animated task
  if (state.ongoingTask) {
    const t = TASK_DEFINITIONS.find((x) => x.id === state.ongoingTask?.taskId);
    if (t) {
      items.push({
        id: `ongoing_${t.id}`,
        taskName: t.title,
        buildingId: t.buildingId,
        buildingName: BUILDING_DEFINITIONS[t.buildingId].shortName,
        hours: t.timeHours,
        kind: 'ongoing',
      });
    }
  }

  // Available Major Tasks (strictly executable right now)
  for (const id of MAJOR_TASK_PRIORITY) {
    const task = TASK_DEFINITIONS.find((t) => t.id === id);
    if (!task) continue;
    if (state.ongoingTask?.taskId === task.id) continue;
    if (validateTask(task, state).canExecute) {
      const bState = state.buildings[task.buildingId];
      const def = BUILDING_DEFINITIONS[task.buildingId];
      items.push({
        id: task.id,
        taskName: bState.restoredOnce ? `Repair ${def.shortName}` : task.title,
        buildingId: task.buildingId,
        buildingName: def.shortName,
        hours: task.timeHours,
        kind: 'major',
      });
    }
  }

  // Available Minor Tasks (strictly executable right now)
  for (const task of TASK_DEFINITIONS) {
    if (task.category !== 'minor') continue;
    if (state.ongoingTask?.taskId === task.id) continue;
    if (validateTask(task, state).canExecute) {
      const def = BUILDING_DEFINITIONS[task.buildingId];
      items.push({
        id: task.id,
        taskName: task.title,
        buildingId: task.buildingId,
        buildingName: def.shortName,
        hours: task.timeHours,
        kind: 'minor',
      });
    }
  }

  return items;
}

const SYSTEM_SHORT_PURPOSE: Record<BuildingId, string> = {
  solar_panels: '+40 Energy/day',
  energy_storage: 'Saves +100 Energy',
  oxygen_generator: '+16 Oxygen/day',
  oxygen_storage: 'Saves +80 Oxygen',
  water_recycling: 'Reuses 75% Water',
  water_storage: 'Saves +80 Water',
  greenhouse: 'Grows Mars Food',
  food_storage: 'Saves +120 Food',
  main_habitat: 'Crew Home Base',
  radiation_shelter: 'Storm Bunker',
  maintenance_facility: 'Faster Repairs',
};

export function MajorTasksSidebar({
  state,
  onLocateBuilding,
  onClose,
}: MajorTasksSidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'systems'>('tasks');
  const availableItems = getAvailableTaskItems(state);

  const renderCategoryIcon = (cat: BuildingCategory) => {
    if (cat === 'energy') return <Zap className="w-3.5 h-3.5 text-[#B94F32]" aria-hidden="true" />;
    if (cat === 'life_support')
      return <Droplets className="w-3.5 h-3.5 text-[#477C9B]" aria-hidden="true" />;
    if (cat === 'food') return <Sprout className="w-3.5 h-3.5 text-[#396344]" aria-hidden="true" />;
    return <Shield className="w-3.5 h-3.5 text-[#292C2B]" aria-hidden="true" />;
  };

  const systemSections: Array<{
    key: string;
    label: string;
    color: string;
    category: BuildingCategory;
    buildings: typeof BUILDING_LIST;
  }> = [
    {
      key: 'energy',
      label: 'Power',
      color: '#B94F32',
      category: 'energy',
      buildings: BUILDING_LIST.filter((b) => b.category === 'energy'),
    },
    {
      key: 'life_support',
      label: 'Air & Water',
      color: '#477C9B',
      category: 'life_support',
      buildings: BUILDING_LIST.filter((b) => b.category === 'life_support'),
    },
    {
      key: 'food',
      label: 'Food',
      color: '#396344',
      category: 'food',
      buildings: BUILDING_LIST.filter((b) => b.category === 'food'),
    },
    {
      key: 'safety',
      label: 'Crew & Safety',
      color: '#292C2B',
      category: 'safety',
      buildings: BUILDING_LIST.filter(
        (b) => b.category === 'habitat' || b.category === 'safety'
      ),
    },
  ];

  return (
    <aside
      aria-label="Outpost Tasks & Systems Drawer"
      className="mars-panel pointer-events-auto flex flex-col w-full h-full max-h-full overflow-hidden rounded-2xl"
    >
      {/* Closable Header with Icon Tabs */}
      <div className="px-2.5 py-2 bg-[#FAF0DC] border-b-2 border-[#292C2B] flex items-center gap-1.5 shrink-0">
        <div className="flex-1 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`py-1.5 px-2 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'tasks'
                ? 'bg-[#B94F32] text-[#FAF0DC] border-[#292C2B]'
                : 'bg-[#F1D8A8]/75 text-[#292C2B] border-[#292C2B]/40 hover:bg-[#F1D8A8]'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Do Now</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('systems')}
            className={`py-1.5 px-2 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'systems'
                ? 'bg-[#477C9B] text-[#FAF0DC] border-[#292C2B]'
                : 'bg-[#F1D8A8]/75 text-[#292C2B] border-[#292C2B]/40 hover:bg-[#F1D8A8]'
            }`}
          >
            <Cpu className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Systems</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="p-2 rounded-xl hover:bg-[#E9B77B]/60 cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      {activeTab === 'tasks' ? (
        <div className="p-2.5 overflow-y-auto space-y-2 flex-1 min-h-0">
          {availableItems.length === 0 ? (
            <div className="mars-panel-light p-4 text-center space-y-2">
              <CheckCircle2 className="w-9 h-9 text-[#396344] mx-auto" aria-hidden="true" />
              <div className="text-xs font-extrabold text-[#292C2B]">
                {state.crew.energy < 20
                  ? 'Crew Needs Rest!'
                  : state.hoursElapsed >= 22
                  ? 'Late Night! Tap End Day.'
                  : 'All Ready for Today!'}
              </div>
              <p className="text-[11px] font-semibold text-[#292C2B]/75">
                {state.crew.energy < 20
                  ? 'Tap Rest above or End Day below.'
                  : 'Tap any building or press End Day below.'}
              </p>
            </div>
          ) : (
            availableItems.map((item) => {
              const isSelected = state.selectedBuildingId === item.buildingId;
              const badgeBg =
                item.kind === 'ongoing'
                  ? 'bg-[#477C9B] text-[#FAF0DC]'
                  : item.kind === 'special'
                  ? 'bg-[#718B78] text-[#FAF0DC]'
                  : item.kind === 'major'
                  ? 'bg-[#B94F32] text-[#FAF0DC]'
                  : 'bg-[#E9B77B] text-[#292C2B]';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onLocateBuilding(item.buildingId)}
                  className={`w-full text-left p-2 rounded-xl border-2 bg-[#FAF0DC] hover:bg-[#FFF8EB] cursor-pointer flex items-center gap-2.5 transition-all ${
                    isSelected
                      ? 'border-[#B94F32] ring-2 ring-[#B94F32] shadow-[0_2px_0_#292C2B]'
                      : 'border-[#292C2B]'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0 ${badgeBg}`}
                  >
                    {item.kind === 'ongoing' ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : item.kind === 'special' ? (
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Wrench className="w-4 h-4" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-[#292C2B] truncate">
                      {item.taskName}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-[#292C2B]/70">
                      <span className="truncate">{item.buildingName}</span>
                      {item.hours && (
                        <span className="inline-flex items-center gap-0.5 font-mono-tabular shrink-0">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {item.hours}h
                        </span>
                      )}
                    </div>
                  </div>

                  <MapPin
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-[#B94F32]' : 'text-[#292C2B]/45'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="p-2.5 overflow-y-auto space-y-3 flex-1 min-h-0">
          {systemSections.map((group) => (
            <section key={group.key} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                {renderCategoryIcon(group.category)}
                <h3
                  className="text-[11px] font-extrabold"
                  style={{ color: group.color }}
                >
                  {group.label}
                </h3>
              </div>

              <div className="space-y-1.5">
                {group.buildings.map((def) => {
                  const bState = state.buildings[def.id];
                  const isSelected = state.selectedBuildingId === def.id;
                  const needsFix =
                    !bState.restoredOnce || bState.status === 'inactive';
                  const isDamaged = !needsFix && bState.status === 'damaged';
                  const statusText = needsFix
                    ? 'Fix!'
                    : isDamaged
                    ? 'Repair'
                    : def.id === 'solar_panels' && bState.dustLevel >= 35
                    ? 'Dusty'
                    : 'OK';
                  const statusColor = needsFix
                    ? '#C94B43'
                    : isDamaged || statusText === 'Dusty'
                    ? '#D77B4A'
                    : '#396344';

                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => onLocateBuilding(def.id)}
                      className={`w-full text-left p-2 rounded-xl border-2 bg-[#FAF0DC] hover:bg-[#FFF8EB] cursor-pointer flex items-center gap-2.5 transition-all ${
                        isSelected
                          ? 'border-[#B94F32] ring-2 ring-[#B94F32]'
                          : 'border-[#292C2B]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#F1D8A8] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                        <BuildingIcon id={def.id} className="w-6 h-6" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold text-[#292C2B] truncate">
                            {def.shortName}
                          </span>
                          <span
                            className="text-[10px] font-extrabold shrink-0"
                            style={{ color: statusColor }}
                          >
                            {statusText}
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-[#292C2B]/70 truncate">
                          {SYSTEM_SHORT_PURPOSE[def.id]}
                        </div>
                        <div className="mt-1 h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden">
                          <div
                            className="h-full"
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
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
