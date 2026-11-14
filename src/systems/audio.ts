class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.08,
    delay = 0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playSelect() {
    this.playTone(480, 0.07, 'triangle', 0.06);
  }

  public playRepair() {
    this.playTone(392, 0.09, 'triangle', 0.08, 0);
    this.playTone(523.25, 0.11, 'triangle', 0.08, 0.07);
    this.playTone(659.25, 0.14, 'sine', 0.08, 0.14);
  }

  public playHarvest() {
    this.playTone(523.25, 0.09, 'sine', 0.08, 0);
    this.playTone(659.25, 0.09, 'sine', 0.08, 0.06);
    this.playTone(783.99, 0.15, 'sine', 0.09, 0.12);
  }

  public playEndDay() {
    this.playTone(330, 0.12, 'sine', 0.07, 0);
    this.playTone(440, 0.16, 'sine', 0.07, 0.1);
  }

  public playAlert() {
    this.playTone(320, 0.12, 'sawtooth', 0.05, 0);
    this.playTone(260, 0.16, 'sawtooth', 0.05, 0.13);
  }

  public playVictory() {
    this.playTone(523.25, 0.12, 'triangle', 0.08, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.08, 0.1);
    this.playTone(783.99, 0.14, 'triangle', 0.08, 0.2);
    this.playTone(1046.5, 0.26, 'sine', 0.09, 0.32);
  }
}

export const soundFX = new SoundEffectsEngine();
