// Neon Bay — every sound is synthesised with WebAudio: no audio files.
// Engine hum, police siren, pickup blip, crash thud and a small bass loop.
// The context is created on the first user gesture (the Start button), so
// browsers never block it.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let started = false;

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

  function blip(freq, seconds, type, volume) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
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
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  // The bass loop: a lazy A-minor groove, one note every 0.22 s, very quiet.
  const BASS_LINE = [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 82.41, 0, 73.42, 65.41, 0, 49];
  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      const freq = BASS_LINE[musicStep % BASS_LINE.length];
      musicStep += 1;
      if (!freq) return;
      blip(freq, 0.2, 'triangle', 0.05);
    }, 220);
  }

  return {
    /** Call from the Start button's click handler (a user gesture). */
    start() {
      if (started || !ensure()) return;
      started = true;
      if (ctx.state === 'suspended') ctx.resume();
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
      filter.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 800;
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      startMusic();
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
