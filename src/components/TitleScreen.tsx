import { useEffect } from 'react';
import { MarsLogoLockup } from './icons/GameIcons';

interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onStart]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-6 bg-[#292C2B]/45">
      <div className="mars-panel max-w-lg w-full p-8 text-center">
        <MarsLogoLockup />

        <p className="mt-5 text-base font-medium text-[#292C2B] leading-relaxed">
          Step into the boots of junior astronaut <span className="font-bold">NAS</span>. With your
          AI assistant <span className="font-bold">GIL</span>, restore a damaged Mars outpost over
          30 Martian days so your crew can survive another 150 days without Earth resupply.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3 text-left text-xs font-semibold text-[#292C2B]">
          <div className="mars-panel-light p-3">
            <div className="text-[#B94F32] font-bold">1. Restore</div>
            <div className="mt-1 font-normal">
              Fix solar arrays, oxygen, water, and the greenhouse.
            </div>
          </div>
          <div className="mars-panel-light p-3">
            <div className="text-[#477C9B] font-bold">2. Grow &amp; Save</div>
            <div className="mt-1 font-normal">
              Plant 10-day crops and balance daily crew energy.
            </div>
          </div>
          <div className="mars-panel-light p-3">
            <div className="text-[#718B78] font-bold">3. Protect</div>
            <div className="mt-1 font-normal">
              Weather dust storms and shelter from solar radiation.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="mars-btn mt-7 w-full py-3.5 px-6 bg-[#B94F32] hover:bg-[#a64429] text-[#FAF0DC] text-lg font-extrabold tracking-tight cursor-pointer"
        >
          Start Mission
        </button>

        <p className="mt-4 text-xs font-medium text-[#292C2B]/80">
          Click a facility to inspect · Drag or WASD to pan · Scroll to zoom · Esc to pause
        </p>
      </div>
    </div>
  );
}
