import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BatteryCharging,
  ClipboardList,
  Clock,
  Coffee,
  Footprints,
  Moon,
  Pause,
  Shield,
  ShieldAlert,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
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
  oxygen: { text: 'Low Air! Fix Oxygen Generation System', target: 'oxygen_generator' },
  water: { text: 'Low Water! Fix Water Recovery System', target: 'water_recycling' },
  food: { text: 'Low Food! Check Greenhouse', target: 'greenhouse' },
  energy: { text: 'Low Power! Check Solar Panels', target: 'solar_panels' },
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
    modifiers: state.modifiers,
  });
  const shortages = detectResourceShortages(state.resources);

  const isSleepBusy = state.sleepPhase !== 'idle' || state.sleepingRemaining > 0;
  const isWorkingNow = state.pendingAction?.phase === 'working';
  const canRest =
    !isSleepBusy &&
    !isWorkingNow &&
    TOTAL_DAY_HOURS - state.hoursElapsed >= 2 &&
    state.crew.energy < 95;
  const formattedTime = formatMartianClock(state.hoursElapsed);
  const isOvertime = state.overtimeHours > 0;
  const otTotalMins = Math.max(1, Math.round(state.overtimeHours * 60));
  const otHrs = Math.floor(otTotalMins / 60);
  const otMins = otTotalMins % 60;
  const overtimeText =
    otHrs <= 0 ? `${otMins}m` : otMins === 0 ? `${otHrs}h` : `${otHrs}h ${otMins}m`;

  const h = state.hoursElapsed;
  const dayPhase =
    h >= 5.0 && h < 7.5
      ? { label: 'Sunrise', iconColor: 'text-[#D77B4A]', kind: 'sunrise' as const }
      : h >= 7.5 && h < 12.0
      ? { label: 'Morning', iconColor: 'text-[#B94F32]', kind: 'day' as const }
      : h >= 12.0 && h < 17.0
      ? { label: 'Afternoon', iconColor: 'text-[#D77B4A]', kind: 'day' as const }
      : h >= 17.0 && h < 20.0
      ? { label: 'Sunset', iconColor: 'text-[#C94B43]', kind: 'sunset' as const }
      : { label: 'Night', iconColor: 'text-[#477C9B]', kind: 'night' as const };

  return (
    <header className="w-full shrink-0 pointer-events-none space-y-2">
      <div className="w-full flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
        {/* Left Cluster: Icon-Only Tasks Drawer Toggle + Day/Clock + Crew Energy */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Closable Icon-Only Tasks/Systems Drawer Button */}
          <button
            type="button"
            onClick={onToggleLeftDrawer}
            aria-label={leftDrawerOpen ? 'Close tasks drawer' : 'Open tasks drawer'}
            title={leftDrawerOpen ? 'Close tasks' : 'Open tasks'}
            className={`relative mars-btn w-11 h-11 flex items-center justify-center cursor-pointer ${
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
            {!leftDrawerOpen && availableTaskCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#718B78] text-[#FAF0DC] border-2 border-[#292C2B] text-[10px] font-extrabold flex items-center justify-center tabular-nums">
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
                ? `Overtime +${overtimeText} past 9:00 PM — Crew will be tired tomorrow!`
                : `Martian Day ${state.day} of ${state.maxDays} · Work hours: 5:00 AM – 9:00 PM`
            }
          >
            {dayPhase.kind === 'sunrise' ? (
              <Sunrise
                className={`w-5 h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            ) : dayPhase.kind === 'day' ? (
              <Sun
                className={`w-5 h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            ) : dayPhase.kind === 'sunset' ? (
              <Sunset
                className={`w-5 h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            ) : (
              <Moon
                className={`w-5 h-5 shrink-0 ${isOvertime ? 'text-[#FAF0DC]' : dayPhase.iconColor}`}
                aria-hidden="true"
              />
            )}
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
              <span className="text-[10px] font-extrabold opacity-80 hidden sm:inline">
                {dayPhase.label}
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

      {/* Live Event Animation Banner, Sleep Banner, Crew Task Banner OR Actionable Alert Button */}
      {(shortages.length > 0 ||
        state.activeEvent ||
        state.crew.inShelter ||
        isSleepBusy ||
        state.pendingAction) && (
        <div className="w-full flex justify-center pointer-events-none">
          {state.sleepPhase === 'returning' ? (
            <div className="mars-panel pointer-events-auto px-4 py-2 rounded-2xl bg-[#FAF0DC] flex items-center gap-3 max-w-sm w-full">
              <div className="w-9 h-9 rounded-xl bg-[#477C9B] border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]">
                <Footprints className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-extrabold text-[#292C2B] truncate">
                  Crew Walking Back to Habitat...
                </div>
                <div className="text-[11px] font-bold text-[#292C2B]/80 truncate">
                  Waiting for NAS, EVA, KAI & MIA to get inside safely
                </div>
              </div>
            </div>
          ) : isSleepBusy ? (
            <div className="mars-panel pointer-events-auto px-4 py-2 rounded-2xl bg-[#FAF0DC] flex items-center gap-3 max-w-sm w-full">
              <div className="w-9 h-9 rounded-xl bg-[#477C9B] border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]">
                <Moon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-[#292C2B]">
                  <span className="truncate">Crew Sleeping Inside Habitat...</span>
                  <span className="font-mono-tabular px-1.5 py-0.5 rounded bg-[#477C9B] text-[#FAF0DC] text-[11px] shrink-0">
                    {Math.ceil(state.sleepingRemaining)}s
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-[#477C9B] transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, ((3 - state.sleepingRemaining) / 3) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : state.pendingAction ? (
            <button
              type="button"
              onClick={() => onSelectBuilding(state.pendingAction!.buildingId)}
              className="mars-panel pointer-events-auto px-4 py-2 rounded-2xl bg-[#FAF0DC] hover:bg-[#FFF8EB] flex items-center gap-3 max-w-sm w-full text-left cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-[#718B78] border-2 border-[#292C2B] flex items-center justify-center shrink-0 text-[#FAF0DC]">
                {state.pendingAction.phase === 'walking' ? (
                  <Footprints className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Wrench className="w-5 h-5" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-extrabold text-[#292C2B] truncate">
                  {state.pendingAction.phase === 'walking'
                    ? `NAS heading to ${BUILDING_DEFINITIONS[state.pendingAction.buildingId].shortName}...`
                    : `${state.pendingAction.label}...`}
                </div>
                {state.pendingAction.phase === 'walking' ? (
                  <div className="text-[11px] font-bold text-[#292C2B]/80 truncate">
                    Next: {state.pendingAction.label}
                  </div>
                ) : (
                  <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-[#718B78] transition-all duration-100"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            6,
                            ((state.pendingAction.workDurationSec -
                              state.pendingAction.workRemainingSec) /
                              Math.max(0.1, state.pendingAction.workDurationSec)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </button>
          ) : state.activeEvent && state.activeEvent.animationRemaining > 0 ? (
            <div className="mars-panel pointer-events-auto px-4 py-2 rounded-2xl bg-[#FAF0DC] flex items-center gap-3 max-w-md w-full">
              <div className="w-9 h-9 rounded-xl bg-[#C94B43] border-2 border-[#292C2B] flex items-center justify-center shrink-0">
                <EventIcon
                  phenomenon={state.activeEvent.definition.phenomenon}
                  className="w-6 h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-[#292C2B]">
                  <span className="truncate">{state.activeEvent.definition.title}</span>
                  <span className="font-mono-tabular px-1.5 py-0.5 rounded bg-[#C94B43] text-[#FAF0DC] text-[11px] shrink-0">
                    {Math.ceil(state.activeEvent.animationRemaining)}s
                  </span>
                </div>
                <div className="text-[11px] font-bold text-[#292C2B]/80 truncate">
                  {state.activeEvent.initialDamageApplied
                    ? 'Damage hit outpost! Review systems & choose plan...'
                    : 'Watch the phenomenon hit! Tap sparks or buildings to inspect.'}
                </div>
                <div className="h-1.5 w-full bg-[#F1D8A8] border border-[#292C2B] rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-[#C94B43] transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((state.activeEvent.animationDuration -
                            state.activeEvent.animationRemaining) /
                            Math.max(1, state.activeEvent.animationDuration)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : state.crew.inShelter ? (
            <button
              type="button"
              onClick={() => onSelectBuilding('radiation_shelter')}
              className="mars-btn pointer-events-auto px-3.5 py-1.5 bg-[#477C9B] text-[#FAF0DC] text-xs font-extrabold flex items-center gap-2 cursor-pointer"
            >
              <Shield className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {state.activeEvent?.definition.radiationLevel
                  ? 'Crew Safe Inside Radiation Storm Shelter — Work Paused'
                  : 'Crew Inside Radiation Storm Shelter — Work Paused'}
              </span>
            </button>
          ) : state.activeEvent ? (
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
                  ? `${state.activeEvent.definition.title}! Tap to Move Crew to Radiation Storm Shelter`
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
  const isReturning = state.sleepPhase === 'returning';
  const isSleeping =
    state.sleepPhase === 'sleeping' ||
    (state.sleepPhase === 'idle' && state.sleepingRemaining > 0);
  const isWorkingNow = state.pendingAction?.phase === 'working';
  const isBusy = isReturning || isSleeping || isWorkingNow;

  return (
    <footer className="w-full shrink-0 flex justify-center pointer-events-none">
      <button
        type="button"
        onClick={onEndDay}
        disabled={isBusy}
        className={`mars-btn pointer-events-auto px-5 py-2.5 rounded-2xl flex items-center gap-2.5 whitespace-nowrap ${
          isBusy
            ? 'bg-[#477C9B] text-[#FAF0DC] cursor-not-allowed opacity-90'
            : isOvertime
            ? 'bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] cursor-pointer'
            : 'bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] cursor-pointer'
        }`}
      >
        {isReturning ? (
          <Footprints className="w-6 h-6 shrink-0" aria-hidden="true" />
        ) : isSleeping ? (
          <Moon className="w-6 h-6 shrink-0" aria-hidden="true" />
        ) : isWorkingNow ? (
          <Wrench className="w-6 h-6 shrink-0" aria-hidden="true" />
        ) : (
          <Sunrise className="w-6 h-6 shrink-0" aria-hidden="true" />
        )}
        <div className="text-left">
          <div className="text-sm font-extrabold leading-none flex items-center gap-1.5">
            <span>
              {isReturning
                ? 'WALKING HOME...'
                : isSleeping
                ? `SLEEPING... ${Math.ceil(state.sleepingRemaining)}s`
                : isWorkingNow
                ? 'FINISHING TASK...'
                : state.day >= state.maxDays
                ? 'FINISH DAY 30'
                : 'END DAY'}
            </span>
            {!isBusy && <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />}
          </div>
          <div className="text-[11px] font-bold opacity-95 mt-0.5 leading-none">
            {isReturning
              ? 'All crew heading to Habitat'
              : isSleeping
              ? 'Recharging inside Habitat'
              : isWorkingNow
              ? 'Wait for NAS to finish'
              : state.day >= state.maxDays
              ? 'See Final Report'
              : `Next: Day ${state.day + 1}`}
          </div>
        </div>
      </button>
    </footer>
  );
}
