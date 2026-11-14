import { Sun, RotateCcw, Play } from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { ActiveEvent } from '../../types/event';
import { DaySummary } from '../../types/game';
import { BuildingIcon, EventIcon } from '../icons/GameIcons';

export function EventModal({
  event,
  onAcknowledge,
}: {
  event: ActiveEvent;
  onAcknowledge: () => void;
}) {
  if (event.resolved) return null;

  const sevLabel =
    event.definition.severity === 'super_major'
      ? 'Super Major Event'
      : event.definition.severity === 'major'
      ? 'Major Mars Event'
      : 'Minor Mars Event';

  const headerBg =
    event.definition.severity === 'super_major' || event.definition.severity === 'major'
      ? 'bg-[#C94B43] text-[#FAF0DC]'
      : 'bg-[#D77B4A] text-[#FAF0DC]';

  const affectedBuildings = event.definition.targetBuildings ?? [];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#292C2B]/50">
      <div className="mars-panel max-w-md w-full overflow-hidden">
        <div className={`px-5 py-3.5 border-b-2 border-[#292C2B] flex items-center gap-3 ${headerBg}`}>
          <div className="w-12 h-12 rounded-xl bg-[#292C2B]/25 border-2 border-[#FAF0DC]/60 flex items-center justify-center shrink-0">
            <EventIcon phenomenon={event.definition.phenomenon} className="w-9 h-9" />
          </div>
          <div>
            <div className="text-xs font-bold opacity-90">
              Day {event.dayTriggered} · {sevLabel}
            </div>
            <h2 className="text-base font-extrabold leading-tight">{event.definition.title}</h2>
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm">
          <p className="font-semibold text-[#292C2B] leading-relaxed">
            {event.definition.summary}
          </p>

          {affectedBuildings.length > 0 && (
            <div className="mars-panel-light p-2.5 space-y-1.5">
              <div className="text-[11px] font-extrabold text-[#292C2B]/80">
                Systems at Risk
              </div>
              <div className="flex flex-wrap gap-2">
                {affectedBuildings.map((bId) => (
                  <div
                    key={bId}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#FAF0DC] border border-[#292C2B]/35 text-[11px] font-bold text-[#292C2B]"
                  >
                    <BuildingIcon id={bId} className="w-4 h-4 shrink-0" />
                    <span>{BUILDING_DEFINITIONS[bId].shortName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mars-panel-light p-3 text-xs space-y-1">
            <div className="font-extrabold text-[#B94F32]">What to Do</div>
            <p className="font-medium text-[#292C2B]">{event.definition.recommendedAction}</p>
          </div>

          <p className="text-xs font-medium text-[#292C2B]/80 leading-relaxed">
            <span className="font-bold">Mars Science: </span>
            {event.definition.scienceContext}
          </p>

          <button
            type="button"
            onClick={onAcknowledge}
            className="mars-btn w-full py-2.5 px-4 bg-[#292C2B] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
          >
            Acknowledge &amp; Respond
          </button>
        </div>
      </div>
    </div>
  );
}

export function DaySummaryModal({
  summary,
  onContinue,
}: {
  summary: DaySummary;
  onContinue: () => void;
}) {
  const netO2 = summary.production.oxygen - summary.consumption.oxygen;
  const netH2O = summary.production.water - summary.consumption.water;
  const netFood = summary.production.food - summary.consumption.food;
  const netEnergy = summary.production.energy - summary.consumption.energy;

  const formatNet = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#292C2B]/45">
      <div className="mars-panel max-w-md w-full overflow-hidden">
        <div className="px-5 py-3.5 border-b-2 border-[#292C2B] bg-[#FAF0DC] flex items-center gap-2">
          <Sun className="w-5 h-5 text-[#B94F32]" aria-hidden="true" />
          <h2 className="text-base font-extrabold">Day {summary.day} Summary</h2>
        </div>

        <div className="p-5 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-2.5 font-mono-tabular font-bold">
            <div className="mars-panel-light p-2.5 flex justify-between">
              <span>Oxygen Net</span>
              <span className={netO2 >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'}>
                {formatNet(netO2)}
              </span>
            </div>
            <div className="mars-panel-light p-2.5 flex justify-between">
              <span>Water Net</span>
              <span className={netH2O >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'}>
                {formatNet(netH2O)}
              </span>
            </div>
            <div className="mars-panel-light p-2.5 flex justify-between">
              <span>Food Net</span>
              <span className={netFood >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'}>
                {formatNet(netFood)}
              </span>
            </div>
            <div className="mars-panel-light p-2.5 flex justify-between">
              <span>Energy Net</span>
              <span className={netEnergy >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'}>
                {formatNet(netEnergy)}
              </span>
            </div>
          </div>

          <div className="mars-panel-light p-3 space-y-1 font-medium text-[#292C2B]">
            <div>Water Recycled: +{summary.waterRecycled} Water</div>
            <div>Crew Energy Recovered: +{summary.crewEnergyRecovered}%</div>
            {summary.cropGrowthDelta > 0 && (
              <div>Crop Growth Progress: +{summary.cropGrowthDelta.toFixed(1)} days</div>
            )}
            {summary.notes.map((n, i) => (
              <div
                key={i}
                className={`font-bold ${
                  n.startsWith('Overtime Fatigue') ? 'text-[#C94B43]' : 'text-[#396344]'
                }`}
              >
                {n}
              </div>
            ))}
            {summary.shortages.length > 0 && (
              <div className="font-bold text-[#C94B43]">
                Running empty on: {summary.shortages.join(', ')}
              </div>
            )}
          </div>

          {summary.buildingImpacts && summary.buildingImpacts.length > 0 && (
            <div className="mars-panel-light p-2.5 space-y-1.5">
              <div className="text-[11px] font-extrabold text-[#C94B43]">
                Weather Damage Report
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.buildingImpacts.map((impact) => (
                  <div
                    key={impact.buildingId}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#FDE8E6] border border-[#C94B43]/50 text-[11px] font-extrabold text-[#292C2B] tabular-nums"
                  >
                    <BuildingIcon id={impact.buildingId} className="w-4 h-4 shrink-0" />
                    <span>{BUILDING_DEFINITIONS[impact.buildingId].shortName}</span>
                    {impact.conditionDelta < 0 && (
                      <span className="text-[#C94B43]">{impact.conditionDelta}%</span>
                    )}
                    {impact.dustAdded && impact.dustAdded > 0 && (
                      <span className="text-[#B94F32]">+{impact.dustAdded}% Dust</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onContinue}
            className="mars-btn w-full py-2.5 px-4 bg-[#718B78] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
          >
            Start Day {summary.day + 1}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PauseModal({
  onResume,
  onRestart,
  onReturnTitle,
}: {
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#292C2B]/55">
      <div className="mars-panel max-w-sm w-full p-6 text-center space-y-4">
        <h2 className="text-xl font-extrabold">Mission Paused</h2>
        <p className="text-xs font-medium text-[#292C2B]/80">
          Take a moment to review your Jezero Crater strategy.
        </p>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="mars-btn w-full py-2.5 px-4 bg-[#718B78] text-[#FAF0DC] text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            Resume Mission
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="mars-btn w-full py-2.5 px-4 bg-[#E9B77B] text-[#292C2B] text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Restart Mission
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="mars-btn w-full py-2.5 px-4 bg-[#FAF0DC] text-[#292C2B] text-sm font-bold cursor-pointer"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
}
