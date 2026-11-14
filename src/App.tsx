import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { BuildingPanel } from './components/buildings/BuildingPanel';
import { GILPanel } from './components/gil/GILPanel';
import { EndDayDock, GameHUD } from './components/hud/GameHUD';
import {
  DaySummaryModal,
  EventModal,
  GilDayHintModal,
  PauseModal,
} from './components/mission/MissionModals';
import { MissionReport } from './components/mission/MissionReport';
import {
  getAvailableTaskItems,
  MajorTasksSidebar,
} from './components/tasks/MajorTasksSidebar';
import { TitleScreen } from './components/TitleScreen';
import { BUILDING_DEFINITIONS } from './data/buildings';
import { PhaserGameHost } from './game/PhaserGameHost';
import { gameStore, WorldFeedbackEvent } from './state/gameStore';
import { GameState } from './types/game';

export default function App() {
  const [state, setState] = useState<GameState>(() => gameStore.getState());
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = gameStore.subscribe((next) => {
      setState(next);
    });
    return unsubscribe;
  }, []);

  // Immediate clear feedback banner after every player action
  useEffect(() => {
    let timer: number | undefined;
    const unsubFeedback = gameStore.onFeedback((evt: WorldFeedbackEvent) => {
      let msg = '';
      if (evt.type === 'task') {
        const bName = BUILDING_DEFINITIONS[evt.buildingId].shortName;
        msg = `${evt.label} — ${bName} updated!`;
      } else if (evt.type === 'plant') {
        msg = 'Seeds planted in Greenhouse!';
      } else if (evt.type === 'harvest') {
        msg = `Got +${evt.amount} Food!`;
      } else if (evt.type === 'shelter') {
        msg = evt.inShelter
          ? 'All 4 crew & GIL inside Shelter!'
          : 'Crew back outside — tasks ready!';
      } else if (evt.type === 'decision') {
        msg = `Plan chosen: ${evt.choiceTitle}`;
      } else if (evt.type === 'event_impact') {
        msg = 'Outpost systems took weather damage!';
      }
      if (msg) {
        setActionToast(msg);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setActionToast(null), 2800);
      }
    });

    return () => {
      unsubFeedback();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const current = gameStore.getState();
      if (
        current.screen === 'PLAYING' &&
        !current.lastDaySummary &&
        current.gilDayHint &&
        (!current.activeEvent || current.activeEvent.resolved) &&
        (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault();
        gameStore.dismissGilDayHint();
        return;
      }

      if (e.key === 'Escape') {
        if (current.screen === 'PLAYING') {
          if (current.lastDaySummary) {
            gameStore.dismissDaySummary();
          } else if (
            current.activeEvent &&
            !current.activeEvent.resolved &&
            current.activeEvent.animationRemaining <= 0 &&
            !current.activeEvent.definition.choices?.length
          ) {
            gameStore.acknowledgeActiveEvent();
          } else if (leftDrawerOpen) {
            setLeftDrawerOpen(false);
          } else if (current.selectedBuildingId) {
            gameStore.selectBuilding(null);
          } else {
            gameStore.setScreen('PAUSED');
          }
        } else if (current.screen === 'PAUSED') {
          gameStore.setScreen('PLAYING');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftDrawerOpen]);

  const availableTaskCount = getAvailableTaskItems(state).length;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#B94F32]">
      {/* Isolated Phaser 2D Outpost Canvas (always centered and primary focus) */}
      <PhaserGameHost />

      {/* Title Screen */}
      {state.screen === 'TITLE_MENU' && (
        <TitleScreen onStart={() => gameStore.startMission()} />
      )}

      {/* Uncluttered Clash-of-Clans-Inspired Gameplay HUD Shell */}
      {(state.screen === 'PLAYING' || state.screen === 'PAUSED') && (
        <div className="fixed inset-0 z-10 pointer-events-none flex justify-center">
          <div className="w-full max-w-[1440px] h-full p-3 flex flex-col gap-3">
            {/* Row 1: Icon-First Top HUD */}
            <GameHUD
              state={state}
              availableTaskCount={availableTaskCount}
              leftDrawerOpen={leftDrawerOpen}
              onToggleLeftDrawer={() => setLeftDrawerOpen((v) => !v)}
              onRestCrew={() => gameStore.restCrew()}
              onPause={() => gameStore.setScreen('PAUSED')}
              onToggleMute={() => gameStore.toggleMute()}
              onSelectBuilding={(id) =>
                id ? gameStore.focusBuilding(id) : gameStore.selectBuilding(null)
              }
            />

            {/* Row 2: Open Outpost Stage + Closable Side Drawers + Bottom-Left GIL */}
            <div className="relative flex-1 min-h-0 flex items-stretch justify-between gap-3">
              {/* Closable Left Tasks/Systems Drawer */}
              {leftDrawerOpen && (
                <div className="absolute md:static inset-y-0 left-0 z-20 w-[268px] sm:w-[285px] shrink-0 min-h-0 flex flex-col">
                  <MajorTasksSidebar
                    state={state}
                    onClose={() => setLeftDrawerOpen(false)}
                    onLocateBuilding={(id) => {
                      gameStore.focusBuilding(id);
                      if (window.innerWidth < 768) {
                        setLeftDrawerOpen(false);
                      }
                    }}
                  />
                </div>
              )}

              {/* Bottom-Left GIL Portrait & Speech Bubble (anchored unobtrusively when drawer isn't covering mobile) */}
              {!leftDrawerOpen && (
                <div
                  className={`absolute bottom-0 left-0 z-10 pointer-events-none ${
                    state.selectedBuildingId ? 'hidden sm:block' : 'block'
                  }`}
                >
                  <GILPanel state={state} />
                </div>
              )}

              {/* Center Open Stage + Quick Action Toast */}
              <div className="flex-1 min-w-0 relative pointer-events-none">
                {actionToast && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 max-w-full">
                    <div className="mars-panel-light px-4 py-2 rounded-2xl flex items-center gap-2 text-xs font-extrabold text-[#396344] whitespace-nowrap">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{actionToast}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Closable Right Building Action Card */}
              {state.selectedBuildingId && (
                <div className="absolute md:static inset-y-0 right-0 z-20 w-[276px] sm:w-[295px] shrink-0 min-h-0 flex flex-col justify-center">
                  <BuildingPanel
                    state={state}
                    onClose={() => gameStore.selectBuilding(null)}
                    onExecuteTask={(taskId) => gameStore.executeTask(taskId)}
                    onPlantCrop={(cropId) => gameStore.plantCrop(cropId)}
                    onHarvestCrop={() => gameStore.harvestCrop()}
                    onToggleShelter={() => gameStore.toggleCrewShelter()}
                  />
                </div>
              )}
            </div>

            {/* Row 3: Bottom Center END DAY Dock */}
            <EndDayDock state={state} onEndDay={() => gameStore.endDay()} />
          </div>
        </div>
      )}

      {/* Active Environmental Event Alert (opens after live animation completes) */}
      {state.screen === 'PLAYING' &&
        state.activeEvent &&
        !state.activeEvent.resolved &&
        state.activeEvent.animationRemaining <= 0 && (
          <EventModal
            event={state.activeEvent}
            onAcknowledge={() => gameStore.acknowledgeActiveEvent()}
            onSelectDecision={(choiceId) => gameStore.chooseEventDecision(choiceId)}
          />
        )}

      {/* Daily Summary Modal */}
      {state.screen === 'PLAYING' &&
        state.lastDaySummary &&
        (!state.activeEvent || state.activeEvent.resolved) && (
          <DaySummaryModal
            summary={state.lastDaySummary}
            onContinue={() => gameStore.dismissDaySummary()}
          />
        )}

      {/* GIL Morning Hint Modal (centered with blurred/dimmed background after dismissing Day Summary) */}
      {state.screen === 'PLAYING' &&
        !state.lastDaySummary &&
        state.gilDayHint &&
        (!state.activeEvent || state.activeEvent.resolved) && (
          <GilDayHintModal
            message={state.gilDayHint}
            onDismiss={() => gameStore.dismissGilDayHint()}
          />
        )}

      {/* Pause Overlay */}
      {state.screen === 'PAUSED' && (
        <PauseModal
          onResume={() => gameStore.setScreen('PLAYING')}
          onRestart={() => gameStore.restartMission()}
          onReturnTitle={() => gameStore.returnToTitle()}
        />
      )}

      {/* Day 30 Sustainability Assessment or Early Failure Report */}
      {(state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') && (
        <MissionReport
          state={state}
          onPlayAgain={() => gameStore.restartMission()}
        />
      )}
    </main>
  );
}
