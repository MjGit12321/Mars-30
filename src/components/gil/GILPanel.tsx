import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { getContextualGilMessage } from '../../systems/gil';
import { GameState } from '../../types/game';
import { GilAvatarIcon } from '../icons/GameIcons';

interface GILPanelProps {
  state: GameState;
}

export function GILPanel({ state }: GILPanelProps) {
  const message = getContextualGilMessage(state);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    setShowTip(false);
    if (message.urgency === 'alert') {
      setForceOpen(false);
    }
  }, [message.id, message.urgency]);

  const isVisible = forceOpen || dismissedId !== message.id;

  const accentColor =
    message.urgency === 'alert'
      ? '#C94B43'
      : message.urgency === 'warning'
      ? '#B94F32'
      : '#477C9B';

  if (!isVisible) {
    return (
      <div className="pointer-events-auto inline-flex items-end">
        <button
          type="button"
          onClick={() => setForceOpen(true)}
          aria-label="Open GIL helper"
          title="Tap GIL for a tip!"
          className="mars-btn w-14 h-14 rounded-2xl bg-[#FAF0DC] hover:bg-[#FFF8EB] flex items-center justify-center cursor-pointer"
        >
          <GilAvatarIcon
            className="w-10 h-10"
            mood={message.urgency}
            emotion={message.emotion}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto flex items-end gap-2.5 max-w-[320px] sm:max-w-[360px] animate-speech-pop"
      aria-live="polite"
    >
      {/* Large Expressive GIL Portrait Button when speaking */}
      <button
        type="button"
        onClick={() => {
          setDismissedId(message.id);
          setForceOpen(false);
        }}
        title="Tap to tuck GIL away"
        aria-label="Hide GIL tip"
        className="shrink-0 w-20 h-20 rounded-2xl bg-[#FAF0DC] border-2 border-[#292C2B] shadow-[0_4px_0_#292C2B] flex items-center justify-center cursor-pointer hover:bg-[#FFF8EB] transition-transform hover:scale-105"
      >
        <GilAvatarIcon
          className="w-16 h-16"
          mood={message.urgency}
          emotion={message.emotion}
          isSpeaking={true}
        />
      </button>

      {/* Short Clash of Clans-style Speech Bubble */}
      <div className="relative flex-1 min-w-0 mars-panel p-2.5 bg-[#FAF0DC] rounded-2xl">
        <div
          aria-hidden="true"
          className="absolute -left-[9px] bottom-4 w-0 h-0 border-y-[7px] border-y-transparent border-r-[9px] border-r-[#292C2B]"
        />
        <div
          aria-hidden="true"
          className="absolute -left-[6px] bottom-[17px] w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-[#FAF0DC]"
        />

        <div className="flex items-start justify-between gap-1.5">
          <span
            className="text-xs font-extrabold leading-tight"
            style={{ color: accentColor }}
          >
            {message.headline}
          </span>
          <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
            {message.scienceTip && (
              <button
                type="button"
                onClick={() => setShowTip((v) => !v)}
                aria-label="Fun Mars fact"
                title="Fun Mars Fact"
                className="p-1 rounded-md hover:bg-[#E9B77B]/50 cursor-pointer text-[#477C9B]"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDismissedId(message.id);
                setForceOpen(false);
              }}
              aria-label="Close GIL bubble"
              className="p-1 rounded-md hover:bg-[#E9B77B]/50 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="mt-1 text-xs font-bold text-[#292C2B] leading-snug">
          {message.body}
        </p>

        {showTip && message.scienceTip && (
          <div className="mt-2 p-2 rounded-lg bg-[#F1D8A8]/80 border border-[#292C2B]/25 text-[11px] font-semibold text-[#292C2B] leading-snug">
            {message.scienceTip}
          </div>
        )}
      </div>
    </div>
  );
}
