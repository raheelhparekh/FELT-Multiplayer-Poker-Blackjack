/**
 * Sound & Haptics Engine for FELT.
 *
 * Uses the Web Audio API to synthesize 100% royalty-free, zero-latency,
 * mathematically pure casino audio cues (cards, chips, chimes, shuffles, ticks).
 * Unlocked on first user interaction.
 */

export type SoundCue =
  | "card_deal"
  | "card_flip"
  | "card_shuffle"
  | "chip_place"
  | "chip_stack"
  | "chip_sweep"
  | "your_turn"
  | "timer_tick"
  | "win_small"
  | "win_big"
  | "blackjack"
  | "bust"
  | "push"
  | "rebuy"
  | "chat_pop";

export interface SoundSettings {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  ambienceVolume: number; // 0..1
  muted: boolean;
  hapticsEnabled: boolean;
}

const SETTINGS_KEY = "felt_sound_settings";

const defaultSettings: SoundSettings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.3,
  muted: false,
  hapticsEnabled: true,
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private settings: SoundSettings = defaultSettings;
  private unlocked = false;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        this.settings = { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch {
      this.settings = defaultSettings;
    }
  }

  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore
    }
  }

  public unlock(): void {
    if (this.unlocked) return;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.unlocked = true;
    } catch {
      // AudioContext not supported
    }
  }

  private getEffectiveVolume(type: "sfx" | "ambience" = "sfx"): number {
    if (this.settings.muted) return 0;
    const category = type === "sfx" ? this.settings.sfxVolume : this.settings.ambienceVolume;
    return Math.max(0, Math.min(1, this.settings.masterVolume * category));
  }

  /**
   * Play synthesized sound effect
   */
  public play(cue: SoundCue): void {
    this.unlock();
    if (!this.ctx || this.settings.muted) return;

    const vol = this.getEffectiveVolume("sfx");
    if (vol <= 0.001) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    try {
      switch (cue) {
        case "card_deal": {
          // Soft whoosh + crisp slide
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          filter.type = "bandpass";
          filter.frequency.setValueAtTime(800, now);
          filter.frequency.exponentialRampToValueAtTime(1400, now + 0.08);

          osc.type = "triangle";
          osc.frequency.setValueAtTime(260, now);
          osc.frequency.exponentialRampToValueAtTime(80, now + 0.09);

          gain.gain.setValueAtTime(0.3 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.11);
          break;
        }

        case "card_flip": {
          // Sharp snap
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(450, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);

          gain.gain.setValueAtTime(0.4 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }

        case "card_shuffle": {
          // Riffle burst
          for (let i = 0; i < 7; i++) {
            const t = now + i * 0.04;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(320 + i * 20, t);
            gain.gain.setValueAtTime(0.18 * vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.04);
          }
          break;
        }

        case "chip_place": {
          // Crisp ceramic clack
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1800, now);
          osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);

          gain.gain.setValueAtTime(0.45 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }

        case "chip_stack": {
          // Double clack
          this.play("chip_place");
          setTimeout(() => this.play("chip_place"), 45);
          break;
        }

        case "chip_sweep": {
          // Sweeping slide
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.linearRampToValueAtTime(450, now + 0.15);

          gain.gain.setValueAtTime(0.25 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.22);
          break;
        }

        case "your_turn": {
          // Bright two-tone chime (E5 -> G#5)
          this.triggerHaptic([40, 60, 40]);
          const playTone = (freq: number, start: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.35 * vol, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.26);
          };
          playTone(659.25, now); // E5
          playTone(830.61, now + 0.12); // G#5
          break;
        }

        case "timer_tick": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1200, now);
          gain.gain.setValueAtTime(0.15 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.035);
          break;
        }

        case "win_small": {
          // Major triad upward arpeggio
          const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
          notes.forEach((freq, idx) => {
            const t = now + idx * 0.08;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.35 * vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.26);
          });
          break;
        }

        case "win_big":
        case "blackjack": {
          // Grand fanfare + haptic burst
          this.triggerHaptic([60, 40, 100, 40, 120]);
          const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
          notes.forEach((freq, idx) => {
            const t = now + idx * 0.09;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.4 * vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.42);
          });
          break;
        }

        case "bust": {
          // Low descending thud
          this.triggerHaptic([100]);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);

          gain.gain.setValueAtTime(0.3 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        }

        case "push": {
          // Neutral soft chime
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(440, now);
          gain.gain.setValueAtTime(0.25 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.22);
          break;
        }

        case "rebuy": {
          // Cash register / cha-ching
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = "sine";
          osc2.type = "triangle";
          osc1.frequency.setValueAtTime(987.77, now); // B5
          osc2.frequency.setValueAtTime(1318.51, now + 0.06); // E6

          gain.gain.setValueAtTime(0.35 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc1.stop(now + 0.3);
          osc2.start(now + 0.06);
          osc2.stop(now + 0.35);
          break;
        }

        case "chat_pop": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(700, now);
          osc.frequency.exponentialRampToValueAtTime(1100, now + 0.04);
          gain.gain.setValueAtTime(0.2 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }
      }
    } catch {
      // Audio playback failure safe fallback
    }
  }

  public triggerHaptic(pattern: number[]): void {
    if (!this.settings.hapticsEnabled) return;
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Haptics unsupported
    }
  }
}

export const soundEngine = new SoundEngine();
