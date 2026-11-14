import { Leaf, Play, RotateCcw, Shield, Sun, Users, Wrench, Zap } from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { ActiveEvent, DecisionIconType } from '../../types/event';
import { DaySummary, GilMessage } from '../../types/game';
import { BuildingIcon, EventIcon, GilAvatarIcon } from '../icons/GameIcons';

function DecisionChoiceIcon({ icon }: { icon: DecisionIconType }) {
  const cls = 'w-5 h-5 shrink-0';
  switch (icon) {
    case 'shield':
      return <Shield className={cls} aria-hidden="true" />;
    case 'zap':
      return <Zap className={cls} aria-hidden="true" />;
    case 'wrench':
      return <Wrench className={cls} aria-hidden="true" />;
    case 'sun':
      return <Sun className={cls} aria-hidden="true" />;
    case 'leaf':
      return <Leaf className={cls} aria-hidden="true" />;
    case 'users':
      return <Users className={cls} aria-hidden="true" />;
  }
}

export function EventModal({
  event,
  onAcknowledge,
  onSelectDecision,
}: {
  event: ActiveEvent;
  onAcknowledge: () => void;
  onSelectDecision?: (choiceId: string) => void;
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
  const choices = event.definition.choices ?? [];
  const hasChoices = choices.length > 0 && Boolean(onSelectDecision);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#292C2B]/55">
      <div
        className={`mars-panel w-full overflow-hidden max-h-[92vh] flex flex-col ${
          hasChoices ? 'max-w-lg' : 'max-w-md'
        }`}
      >
        <div
          className={`px-5 py-3.5 border-b-2 border-[#292C2B] flex items-center gap-3 shrink-0 ${headerBg}`}
        >
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

        <div className="p-5 space-y-3 text-sm overflow-y-auto">
          <p className="font-semibold text-[#292C2B] leading-relaxed">
            {event.definition.summary}
          </p>

          {!hasChoices && affectedBuildings.length > 0 && (
            <div className="mars-panel-light p-2.5 space-y-1.5">
              <div className="text-[11px] font-extrabold text-[#292C2B]/80">
                Systems at Risk
              </div>
              <div className="flex flex-wrap gap-1.5">
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

          {hasChoices ? (
            <div className="space-y-2">
              {choices.slice(0, 3).map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => onSelectDecision?.(choice.id)}
                  className="mars-btn w-full p-3 bg-[#FAF0DC] hover:bg-[#FFF8EB] text-left flex items-start gap-3 cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0 ${
                      choice.urgency === 'alert'
                        ? 'bg-[#D77B4A] text-[#FAF0DC]'
                        : choice.urgency === 'warning'
                        ? 'bg-[#477C9B] text-[#FAF0DC]'
                        : 'bg-[#718B78] text-[#FAF0DC]'
                    }`}
                  >
                    <DecisionChoiceIcon icon={choice.icon} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-sm font-extrabold text-[#292C2B] leading-tight">
                      {choice.title}
                    </div>
                    <p className="text-xs font-semibold text-[#292C2B]/85 leading-snug">
                      {choice.shortDesc}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <span className="px-2 py-0.5 rounded-md bg-[#E3F1E6] border border-[#718B78] text-[10px] font-extrabold text-[#2F5B3B]">
                        + {choice.benefitTag}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#FDE8E6] border border-[#C94B43]/60 text-[10px] font-extrabold text-[#B94F32]">
                        ! {choice.riskTag}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mars-panel-light p-3 text-xs space-y-1">
                <div className="font-extrabold text-[#B94F32]">What to Do</div>
                <p className="font-medium text-[#292C2B]">{event.definition.recommendedAction}</p>
              </div>
              <p className="text-xs font-medium text-[#292C2B]/80 leading-relaxed">
                <span className="font-bold">Mars Science: </span>
                {event.definition.scienceContext}
              </p>
            </>
          )}

          {!hasChoices && (
            <button
              type="button"
              onClick={onAcknowledge}
              className="mars-btn w-full py-2.5 px-4 bg-[#292C2B] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
            >
              Acknowledge &amp; Respond
            </button>
          )}
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

export function GilDayHintModal({
  message,
  onDismiss,
}: {
  message: GilMessage;
  onDismiss: () => void;
}) {
  const accentColor =
    message.urgency === 'alert'
      ? '#C94B43'
      : message.urgency === 'warning'
      ? '#B94F32'
      : '#477C9B';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`GIL Morning Hint: ${message.headline}`}
      onClick={onDismiss}
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#292C2B]/50 backdrop-blur-sm animate-backdrop-fade cursor-pointer"
    >
      <div className="mars-panel max-w-md w-full p-5 sm:p-6 bg-[#FAF0DC] animate-gil-modal-in space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-[#F1D8A8] border-2 border-[#292C2B] shadow-[0_3px_0_#292C2B] flex items-center justify-center shrink-0">
            <GilAvatarIcon
              className="w-16 h-16"
              mood={message.urgency}
              emotion={message.emotion}
              isSpeaking={true}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="inline-block px-2 py-0.5 rounded-md bg-[#477C9B] text-[#FAF0DC] text-[10px] font-extrabold uppercase tracking-wide mb-1">
              GIL AI Assistant
            </div>
            <h2
              className="text-base sm:text-lg font-extrabold leading-tight"
              style={{ color: accentColor }}
            >
              {message.headline}
            </h2>
          </div>
        </div>

        <p className="text-sm font-bold text-[#292C2B] leading-relaxed bg-[#F1D8A8]/55 p-3.5 rounded-xl border-2 border-[#292C2B]/20">
          {message.body}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="mars-btn w-full py-2.5 px-4 bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
        >
          Got It! Let&apos;s Go
        </button>
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
