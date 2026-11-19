// Neon Bay — every sound is synthesised with WebAudio: no audio files.
// Engine hum, police siren, pickup blip, crash thud and a small bass loop.
// The context is created on the first user gesture (the Start button), so
// browsers never block it.

export function createAudio() {
  let ctx = null;
  let masterGain = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let started = false;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
    } catch {
      return false;
    }
    return true;
  }

  /** Everything plays through the master gain, so M can mute it all. */
  function out() {
    return masterGain || ctx.destination;
  }

  function blip(freq, seconds, type, volume) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(out());
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  /** A gunshot: a loud noise burst with a fast lowpass sweep. */
  function shotSound() {
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(filter).connect(gain).connect(out());
    source.start();
  }

  // A short filtered-noise burst: the crash thud.
  function crash(intensity) {
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0.25 * Math.min(1, intensity || 1);
    source.connect(filter).connect(gain).connect(out());
    source.start();
  }

  // The synthwave loop: a lazy A-minor bass groove, one note every 0.22 s,
  // a soft pad chord at the top of every second bar (Am – F – C – G), a
  // quiet arpeggio on the off-beats and a kick on every beat. Very quiet.
  const BASS_LINE = [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 82.41, 0, 73.42, 65.41, 0, 49];
  const CHORDS = [
    [110, 130.81, 164.81], // Am
    [87.31, 110, 130.81], // F
    [130.81, 164.81, 196], // C
    [98, 123.47, 146.83], // G
  ];
  const ARP = [220, 261.63, 329.63, 440, 329.63, 261.63];
  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      const step = musicStep;
      musicStep += 1;
      const freq = BASS_LINE[step % BASS_LINE.length];
      if (freq) blip(freq, 0.2, 'triangle', 0.05);
      // Kick on every beat (every 4th step).
      if (step % 4 === 0) {
        const kick = ctx.createOscillator();
        const kg = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(120, ctx.currentTime);
        kick.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
        kg.gain.setValueAtTime(0.12, ctx.currentTime);
        kg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
        kick.connect(kg).connect(out());
        kick.start();
        kick.stop(ctx.currentTime + 0.15);
      }
      // Arpeggio on the off-beats.
      if (step % 2 === 1) {
        blip(ARP[(step >> 1) % ARP.length], 0.16, 'square', 0.018);
      }
      // Pad chord at the top of every second bar (32 steps).
      if (step % 32 === 0) {
        const chord = CHORDS[(step / 32) % CHORDS.length];
        for (const note of chord) blip(note, 3.2, 'sawtooth', 0.012);
      }
    }, 220);
  }

  return {
    /** Call from the Start button's click handler (a user gesture). */
    start() {
      if (started || !ensure()) return;
      started = true;
      if (ctx.state === 'suspended') ctx.resume();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc2 = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc2.type = 'square';
      engineOsc.frequency.value = 50;
      engineOsc2.frequency.value = 100;
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain).connect(out());
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 800;
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(out());
      sirenOsc.start();
      startMusic();
    },
    /** M mutes or unmutes every sound at once. */
    setMuted(next) {
      muted = !!next;
      if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    },
    get muted() {
      return muted;
    },
    shot() {
      shotSound();
    },
    punch() {
      blip(90, 0.1, 'square', 0.2);
    },
    /** speed01: 0 parked to 1 flat out. Called every frame while driving. */
    engine(speed01, driving) {
      if (!ctx || !engineGain) return;
      const target = driving ? 0.05 + 0.05 * speed01 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + 90 * speed01, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(100 + 180 * speed01, ctx.currentTime, 0.1);
    },
    /** wanted > 0 turns the two-tone siren on; time drives the alternation. */
    siren(wanted, time) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.045 : 0, ctx.currentTime, 0.2);
      sirenOsc.frequency.setTargetAtTime(Math.sin(time * 4) > 0 ? 950 : 700, ctx.currentTime, 0.05);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.18);
      window.setTimeout(() => blip(1320, 0.15, 'sine', 0.15), 90);
    },
    crash(intensity) {
      crash(intensity);
    },
    denied() {
      blip(160, 0.15, 'square', 0.08);
    },
  };
}
