import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BatteryCharging,
  ClipboardList,
  Clock,
  Coffee,
  Pause,
  ShieldAlert,
  Sun,
  Sunrise,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  formatMartianClock,
  TOTAL_DAY_HOURS,
} from '../../data/mission';
import { RESOURCE_CONFIGS, RESOURCE_ORDER } from '../../data/resources';
import { calculateDailyRates, detectResourceShortages } from '../../systems/resources';
import { GameState } from '../../types/game';
import { ResourceType } from '../../types/resource';
import { EventIcon, ResourceIcon } from '../icons/GameIcons';

interface GameHUDProps {
  state: GameState;
  availableTaskCount: number;
  leftDrawerOpen: boolean;
  onToggleLeftDrawer: () => void;
  onRestCrew: () => void;
  onPause: () => void;
  onToggleMute: () => void;
  onSelectBuilding: (id: GameState['selectedBuildingId']) => void;
}

const SHORTAGE_MESSAGE: Record<
  ResourceType,
  { text: string; target: GameState['selectedBuildingId'] }
> = {
  oxygen: { text: 'Low Air! Fix Oxygen', target: 'oxygen_generator' },
  water: { text: 'Low Water! Fix Recycler', target: 'water_recycling' },
  food: { text: 'Low Food! Check Greenhouse', target: 'greenhouse' },
  energy: { text: 'Low Power! Check Solar', target: 'solar_panels' },
};

export function GameHUD({
  state,
  availableTaskCount,
  leftDrawerOpen,
  onToggleLeftDrawer,
  onRestCrew,
  onPause,
  onToggleMute,
  onSelectBuilding,
}: GameHUDProps) {
  const rates = calculateDailyRates({
    buildings: state.buildings,
    currentResources: state.resources,
    greenhouseCrop: state.greenhouseCrop,
    activeEvent: state.activeEvent,
  });
  const shortages = detectResourceShortages(state.resources);

  const canRest = TOTAL_DAY_HOURS - state.hoursElapsed >= 2 && state.crew.energy < 95;
  const formattedTime = formatMartianClock(state.hoursElapsed);
  const isOvertime = state.overtimeHours > 0;

  return (
    <header className="w-full shrink-0 pointer-events-none space-y-2">
      <div className="w-full flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
        {/* Left Cluster: Tasks Drawer Toggle + Day/Clock + Crew Energy */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Closable Tasks/Systems Drawer Button */}
          <button
            type="button"
            onClick={onToggleLeftDrawer}
            aria-label={leftDrawerOpen ? 'Close tasks drawer' : 'Open tasks drawer'}
            className={`relative mars-btn h-11 px-3 flex items-center gap-2 cursor-pointer font-extrabold text-xs ${
              leftDrawerOpen
                ? 'bg-[#B94F32] text-[#FAF0DC]'
                : 'bg-[#FAF0DC] hover:bg-[#FFF8EB] text-[#292C2B]'
            }`}
          >
            {leftDrawerOpen ? (
              <X className="w-5 h-5 shrink-0" aria-hidden="true" />
            ) : (
              <ClipboardList className="w-5 h-5 text-[#B94F32] shrink-0" aria-hidden="true" />
            )}
            <span>Tasks</span>
            {!leftDrawerOpen && availableTaskCount > 0 && (
              <span className="min-w-[20px] h-5 px-1 rounded-full bg-[#718B78] text-[#FAF0DC] border border-[#292C2B] text-[11px] font-extrabold flex items-center justify-center tabular-nums">
                {availableTaskCount}
              </span>
            )}
          </button>

          {/* Compact Day & 24h Clock */}
          <div
            className={`h-11 px-3 rounded-xl border-2 border-[#292C2B] shadow-[0_3px_0_#292C2B] flex items-center gap-2.5 tabular-nums ${
              isOvertime
                ? 'bg-[#C94B43] text-[#FAF0DC]'
                : 'bg-[#FAF0DC] text-[#292C2B]'
            }`}
            title={
              isOvertime
                ? `Overtime +${state.overtimeHours}h — Crew will be tired tomorrow!`
                : `Martian Day ${state.day} of ${state.maxDays}`
            }
          >
            <Sun
              className={`w-5 h-5 shrink-0 ${
                isOvertime ? 'text-[#FAF0DC]' : 'text-[#B94F32]'
              }`}
              aria-hidden="true"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">
              Day {state.day}/{state.maxDays}
            </span>
            <span className="opacity-30 font-bold" aria-hidden="true">
              |
            </span>
            <div className="flex items-center gap-1">
              {isOvertime ? (
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="w-4 h-4 text-[#477C9B] shrink-0" aria-hidden="true" />
              )}
              <span className="font-mono-tabular text-xs font-extrabold whitespace-nowrap">
                {formattedTime}
              </span>
              {isOvertime && (
                <span className="text-[10px] font-extrabold uppercase tracking-wide ml-0.5">
                  OT
                </span>
              )}
            </div>
          </div>

          {/* Crew Energy Meter + Rest Button (only shown when available) */}
          <div className="h-11 px-2.5 rounded-xl bg-[#FAF0DC] border-2 border-[#292C2B] shadow-[0_3px_0_#292C2B] flex items-center gap-2 tabular-nums">
            <BatteryCharging
              className={`w-5 h-5 shrink-0 ${
                state.crew.energy <= 25 ? 'text-[#C94B43]' : 'text-[#718B78]'
              }`}
              aria-hidden="true"
            />
            <div className="w-16">
              <div className="flex items-center justify-between text-[11px] font-extrabold leading-none">
                <span>Crew</span>
                <span
                  className={`font-mono-tabular ${
                    state.crew.energy <= 25 ? 'text-[#C94B43]' : 'text-[#292C2B]'
                  }`}
                >
                  {state.crew.energy}%
                </span>
              </div>
              <div className="h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${state.crew.energy}%`,
                    backgroundColor:
                      state.crew.energy <= 25 ? '#C94B43' : '#718B78',
                  }}
                />
              </div>
            </div>

            {canRest && (
              <button
                type="button"
                onClick={onRestCrew}
                title="Rest 2 hours to regain Crew Energy"
                className="mars-btn px-2 py-1 bg-[#718B78] text-[#FAF0DC] text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Coffee className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Rest</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Cluster: 4 Clash-Style Icon-First Resource Bars + Audio & Pause */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
            {RESOURCE_ORDER.map((key) => {
              const cfg = RESOURCE_CONFIGS[key];
              const val = state.resources[key];
              const cap = state.capacities[key];
              const pct = Math.min(100, Math.round((val / Math.max(1, cap)) * 100));
              const net = rates.net[key].net;
              const isLow = shortages.includes(key);
              const barColor = isLow
                ? '#C94B43'
                : key === 'food'
                ? '#718B78'
                : key === 'energy'
                ? '#D77B4A'
                : '#477C9B';

              return (
                <div
                  key={key}
                  className={`h-11 px-2.5 rounded-xl border-2 border-[#292C2B] shadow-[0_3px_0_#292C2B] flex items-center gap-2 min-w-[92px] sm:min-w-[104px] ${
                    isLow ? 'bg-[#FDE8E6]' : 'bg-[#FAF0DC]'
                  }`}
                  title={`${cfg.label}: ${val}/${cap} (${net >= 0 ? `+${net}` : net}/day)`}
                >
                  <ResourceIcon type={key} className="w-6 h-6 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 leading-none">
                      <span className="font-mono-tabular text-xs font-extrabold text-[#292C2B]">
                        {val}
                      </span>
                      <span
                        className={`font-mono-tabular text-[10px] font-extrabold flex items-center ${
                          net > 0
                            ? 'text-[#396344]'
                            : net < 0
                            ? 'text-[#C94B43]'
                            : 'text-[#292C2B]/55'
                        }`}
                      >
                        {net > 0 && <ArrowUp className="w-2.5 h-2.5" aria-hidden="true" />}
                        {net < 0 && <ArrowDown className="w-2.5 h-2.5" aria-hidden="true" />}
                        {net >= 0 ? `+${net}` : net}
                      </span>
                    </div>

                    <div className="h-2 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sound & Pause Icon Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={state.audioMuted ? 'Turn sound on' : 'Turn sound off'}
              className="mars-btn w-11 h-11 bg-[#FAF0DC] hover:bg-[#FFF8EB] flex items-center justify-center cursor-pointer"
            >
              {state.audioMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={onPause}
              aria-label="Pause mission"
              className="mars-btn w-11 h-11 bg-[#FAF0DC] hover:bg-[#FFF8EB] flex items-center justify-center cursor-pointer"
            >
              <Pause className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Single Short Actionable Alert Button (only when an urgent event or shortage needs immediate action) */}
      {(shortages.length > 0 || state.activeEvent) && (
        <div className="w-full flex justify-center pointer-events-none">
          {state.activeEvent ? (
            <button
              type="button"
              onClick={() =>
                onSelectBuilding(
                  state.activeEvent?.definition.radiationLevel
                    ? 'radiation_shelter'
                    : state.activeEvent?.definition.targetBuildings?.[0] ?? 'solar_panels'
                )
              }
              className={`mars-btn pointer-events-auto px-3.5 py-1.5 text-xs font-extrabold flex items-center gap-2 cursor-pointer ${
                state.activeEvent.definition.severity === 'minor'
                  ? 'bg-[#D77B4A] text-[#FAF0DC]'
                  : 'bg-[#C94B43] text-[#FAF0DC]'
              }`}
            >
              <EventIcon phenomenon={state.activeEvent.definition.phenomenon} className="w-5 h-5 shrink-0" />
              <span>
                {state.activeEvent.definition.radiationLevel && !state.crew.inShelter
                  ? `${state.activeEvent.definition.title}! Tap to Hide in Shelter`
                  : state.activeEvent.definition.title}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectBuilding(SHORTAGE_MESSAGE[shortages[0]].target)}
              className="mars-btn pointer-events-auto px-3.5 py-1.5 bg-[#FAF0DC] text-[#C94B43] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{SHORTAGE_MESSAGE[shortages[0]].text}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}

export function EndDayDock({
  state,
  onEndDay,
}: {
  state: GameState;
  onEndDay: () => void;
}) {
  const isOvertime = state.overtimeHours > 0;

  return (
    <footer className="w-full shrink-0 flex justify-center pointer-events-none">
      <button
        type="button"
        onClick={onEndDay}
        className={`mars-btn pointer-events-auto px-5 py-2.5 rounded-2xl flex items-center gap-2.5 cursor-pointer whitespace-nowrap ${
          isOvertime
            ? 'bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC]'
            : 'bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC]'
        }`}
      >
        <Sunrise className="w-6 h-6 shrink-0" aria-hidden="true" />
        <div className="text-left">
          <div className="text-sm font-extrabold leading-none flex items-center gap-1.5">
            <span>{state.day >= state.maxDays ? 'FINISH DAY 30' : 'END DAY'}</span>
            <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-[11px] font-bold opacity-95 mt-0.5 leading-none">
            {state.day >= state.maxDays ? 'See Final Report' : `Next: Day ${state.day + 1}`}
          </div>
        </div>
      </button>
    </footer>
  );
}
