import { CheckCircle2, AlertCircle, XCircle, RotateCcw } from 'lucide-react';
import { GameState } from '../../types/game';

interface MissionReportProps {
  state: GameState;
  onPlayAgain: () => void;
}

export function MissionReport({ state, onPlayAgain }: MissionReportProps) {
  const isFailure = state.screen === 'GAME_OVER';
  const assessment = state.assessment;

  const outcomeBannerStyle = isFailure
    ? 'bg-[#C94B43] text-[#FAF0DC]'
    : assessment?.outcome === 'Sustainable'
    ? 'bg-[#718B78] text-[#FAF0DC]'
    : assessment?.outcome === 'Sustainable with Improvements'
    ? 'bg-[#D77B4A] text-[#FAF0DC]'
    : 'bg-[#C94B43] text-[#FAF0DC]';

  const titleText = isFailure
    ? `Mission Ended on Day ${state.day}`
    : assessment?.outcome ?? 'Mission Complete';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#292C2B]/65 overflow-y-auto">
      <div className="mars-panel max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Outcome Banner */}
        <div className={`px-6 py-4 border-b-2 border-[#292C2B] ${outcomeBannerStyle}`}>
          <div className="text-xs font-bold opacity-90">
            {isFailure
              ? 'Emergency Evacuation'
              : '150-Day Long-Term Sustainability Assessment'}
          </div>
          <h1 className="text-2xl font-extrabold mt-0.5">{titleText}</h1>
        </div>

        {/* Scrollable Report Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          <p className="font-semibold text-[#292C2B] leading-relaxed">
            {isFailure ? state.failureReason : assessment?.summary}
          </p>

          {/* Top Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold tabular-nums">
            <div className="mars-panel-light p-3">
              <div className="text-[#292C2B]/70">Days Survived</div>
              <div className="text-lg font-extrabold mt-0.5 font-mono-tabular">
                {state.day} / {state.maxDays}
              </div>
            </div>
            <div className="mars-panel-light p-3">
              <div className="text-[#292C2B]/70">Tasks Completed</div>
              <div className="text-lg font-extrabold mt-0.5 font-mono-tabular">
                {state.totalTasksCompleted}
              </div>
            </div>
            <div className="mars-panel-light p-3">
              <div className="text-[#292C2B]/70">Crop Harvests</div>
              <div className="text-lg font-extrabold mt-0.5 font-mono-tabular">
                {state.harvestCount}
              </div>
            </div>
            <div className="mars-panel-light p-3">
              <div className="text-[#292C2B]/70">Crew Health</div>
              <div className="text-lg font-extrabold mt-0.5 font-mono-tabular">
                {state.crew.condition}%
              </div>
            </div>
          </div>

          {/* 7 Sustainability Criteria */}
          {assessment && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold">
                <span>150-Day Sustainability Breakdown</span>
                <span className="font-mono-tabular">
                  Overall Score: {assessment.overallScore}/100
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {assessment.criteria.map((item) => (
                  <div
                    key={item.id}
                    className="mars-panel-light p-3 flex items-start gap-2.5"
                  >
                    {item.status === 'pass' ? (
                      <CheckCircle2
                        className="w-4 h-4 text-[#396344] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : item.status === 'warning' ? (
                      <AlertCircle
                        className="w-4 h-4 text-[#D77B4A] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="w-4 h-4 text-[#C94B43] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-xs font-extrabold tabular-nums">
                        <span>{item.label}</span>
                        <span className="font-mono-tabular">{item.score}%</span>
                      </div>
                      <div className="text-[11px] font-medium text-[#292C2B]/80 mt-0.5">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Resources */}
          <div className="mars-panel-light p-3.5 text-xs">
            <div className="font-extrabold mb-2">Final Outpost Reserves</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tabular font-bold">
              <div>Oxygen: {state.resources.oxygen}</div>
              <div>Water: {state.resources.water}</div>
              <div>Food: {state.resources.food}</div>
              <div>Energy: {state.resources.energy}</div>
            </div>
          </div>

          {/* Events & Key Decisions */}
          {(state.eventHistory.length > 0 || state.keyDecisions.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="mars-panel-light p-3 space-y-1.5">
                <div className="font-extrabold">Environmental Events</div>
                {state.eventHistory.length === 0 ? (
                  <div className="text-[#292C2B]/70">No events logged yet.</div>
                ) : (
                  state.eventHistory.slice(-4).map((e, idx) => (
                    <div key={idx} className="font-medium">
                      <span className="font-bold">Day {e.day}:</span> {e.title}
                    </div>
                  ))
                )}
              </div>

              <div className="mars-panel-light p-3 space-y-1.5">
                <div className="font-extrabold">Key Decisions</div>
                {state.keyDecisions.length === 0 ? (
                  <div className="text-[#292C2B]/70">No major actions recorded.</div>
                ) : (
                  state.keyDecisions.slice(-4).map((d, idx) => (
                    <div key={idx} className="font-medium">
                      {d}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 border-t-2 border-[#292C2B] bg-[#FAF0DC] flex justify-end">
          <button
            type="button"
            onClick={onPlayAgain}
            className="mars-btn px-6 py-2.5 bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] text-sm font-extrabold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
