import { GameSettings, MaterialType, WeaponCategory } from '../shared/types';

class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private menuLoopTimer: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: Pick<GameSettings, 'masterVolume' | 'sfxVolume' | 'musicVolume'> = {
    masterVolume: 0.75,
    sfxVolume: 0.85,
    musicVolume: 0.45,
  };

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();

      // Pre-generate 1.5s white noise buffer for gunshots, footsteps, explosions
      const sampleRate = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sampleRate * 1.5, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public updateSettings(s: Pick<GameSettings, 'masterVolume' | 'sfxVolume' | 'musicVolume'>) {
    this.settings = s;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.masterVolume, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.04);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume, now, 0.04);
  }

  public playGunshot(category: WeaponCategory, distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    if (distance > 140) return;

    const atten = Math.max(0.08, 1 - distance / 140);
    const now = ctx.currentTime;

    // Noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    let duration = 0.14;
    let startFreq = 1600;
    let punchFreq = 140;

    if (category === 'ESCOPETA') {
      duration = 0.28;
      startFreq = 900;
      punchFreq = 95;
    } else if (category === 'FRANCOTIRADOR') {
      duration = 0.34;
      startFreq = 2400;
      punchFreq = 85;
    } else if (category === 'SUBFUSIL') {
      duration = 0.09;
      startFreq = 1900;
      punchFreq = 180;
    } else if (category === 'EXPLOSIVO') {
      duration = 0.42;
      startFreq = 650;
      punchFreq = 70;
    } else if (category === 'ESPECIAL') {
      // Plasma zap
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.18);
      g.gain.setValueAtTime(0.28 * atten, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);
      return;
    }

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + duration);
    filter.Q.value = 0.9;

    env.gain.setValueAtTime(0.42 * atten, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + duration);

    // Low punch oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(punchFreq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.1);
    oscGain.gain.setValueAtTime(0.35 * atten, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playReload() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 480 : 720, now + offset);
      g.gain.setValueAtTime(0.12, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  public playHitmarker(headshot = false) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(headshot ? 1480 : 940, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 1920 : 620, now + 0.06);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playBuild(material: MaterialType) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = material === 'METAL' ? 'square' : 'triangle';
    const base = material === 'MADERA' ? 180 : material === 'PIEDRA' ? 120 : 320;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.5, now + 0.09);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playExplosion() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.65, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.9);
  }

  public playFootstep() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.08);
  }

  public playPickup() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playVictoryFanfare() {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    const now = ctx.currentTime;
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      g.gain.setValueAtTime(0.24, now + idx * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.55);
      osc.connect(g);
      g.connect(this.musicGain!);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.6);
    });
  }

  public startMenuAmbience() {
    if (this.menuLoopTimer !== null) return;
    const playChord = () => {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running' || !this.musicGain) return;
      const now = ctx.currentTime;
      const chords = [
        [110, 164.81, 220],
        [98, 146.83, 196],
        [130.81, 196, 246.94],
        [110, 164.81, 220],
      ];
      const chord = chords[Math.floor((Date.now() / 4000) % chords.length)];
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 340;
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.055, now + 1.2);
        g.gain.linearRampToValueAtTime(0.001, now + 3.8);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.musicGain!);
        osc.start(now);
        osc.stop(now + 3.9);
      });
    };
    this.menuLoopTimer = window.setInterval(playChord, 4000);
  }

  public stopMenuAmbience() {
    if (this.menuLoopTimer !== null) {
      clearInterval(this.menuLoopTimer);
      this.menuLoopTimer = null;
    }
  }
}

export const gameAudio = new GameAudioEngine();
