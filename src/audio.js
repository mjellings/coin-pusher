// All sounds are synthesised with Web Audio, so there are no audio files to load.
// Browsers only allow sound after the player interacts, so unlock() is called on the first tap.

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

export function createAudio({ muted = false } = {}) {
  let ctx = null;
  let master = null;
  let humGain = null;
  let noise = null;
  let isMuted = muted;
  let lastClinkAt = 0;
  let lastPingAt = 0;

  function unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : 0.8;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    master.connect(compressor).connect(ctx.destination);
    noise = noiseBuffer(ctx);
    startHum();
  }

  // A low mechanical drone from the pusher motor, swelling a little as it moves.
  function startHum() {
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    for (const [freq, type, level] of [
      [55, "sawtooth", 0.5],
      [110, "sine", 0.35],
      [57.5, "triangle", 0.3],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start();
    }
    filter.connect(humGain).connect(master);
  }

  function tone(freq, { type = "sine", start = 0, attack = 0.002, decay = 0.2, level = 0.2, detune = 0 } = {}) {
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  function tick({ start = 0, level = 0.15, freq = 6000 } = {}) {
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.5, 0.05);
  }

  // Metal on metal: a click plus a few inharmonic partials that ring briefly.
  function clink(strength = 1, { start = 0, pitch = 1 } = {}) {
    const base = (2300 + Math.random() * 900) * pitch;
    const level = 0.05 + 0.1 * Math.min(1, strength);
    tick({ start, level: level * 1.2, freq: 5000 + Math.random() * 3000 });
    tone(base, { start, decay: 0.12 + Math.random() * 0.08, level });
    tone(base * 2.76, { start, decay: 0.08, level: level * 0.5 });
    tone(base * 5.4, { start, decay: 0.05, level: level * 0.25 });
  }

  return {
    unlock,
    get muted() {
      return isMuted;
    },
    setMuted(value) {
      isMuted = value;
      if (master) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.05);
    },
    // Pusher hum follows the pusher's speed.
    update(pusherSpeed) {
      if (humGain) humGain.gain.setTargetAtTime(0.035 + 0.03 * pusherSpeed, ctx.currentTime, 0.1);
    },
    drop() {
      if (!ctx) return;
      // A soft "chunk" as the coin leaves the slot.
      tone(320, { type: "triangle", decay: 0.08, level: 0.12 });
      tick({ level: 0.08, freq: 2500 });
    },
    land(speed) {
      if (!ctx) return;
      // Many coins landing at once would turn to mush, so space the clinks out a little.
      const now = ctx.currentTime;
      if (now - lastClinkAt < 0.035) return;
      lastClinkAt = now;
      clink(speed / 10);
    },
    // A bright plink as a coin bounces off a peg, rising in pitch further down the board.
    peg(speed, height) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastPingAt < 0.03) return;
      lastPingAt = now;
      const freq = 1400 + (10 - height) * 140 + Math.random() * 120;
      const level = 0.03 + 0.04 * Math.min(1, speed / 8);
      tone(freq, { type: "triangle", decay: 0.09, level });
      tone(freq * 2.01, { type: "sine", decay: 0.06, level: level * 0.4 });
    },
    win(value, kind) {
      if (!ctx) return;
      // A cascade of coins into the tray, then a jingle that gets grander with the payout.
      const coins = Math.min(8, 2 + value);
      for (let i = 0; i < coins; i++) clink(0.8, { start: i * 0.05 + Math.random() * 0.03, pitch: 0.85 + Math.random() * 0.3 });
      const melody = kind === "coin" ? ["E5", "G5", "C6"] : ["C5", "E5", "G5", "C6", "E6", "G6"];
      melody.forEach((note, i) => {
        tone(NOTES[note], { type: "square", start: 0.05 + i * 0.07, decay: 0.18, level: 0.04 });
        tone(NOTES[note] * 2, { type: "sine", start: 0.05 + i * 0.07, decay: 0.25, level: 0.03 });
      });
    },
    // A bright arpeggio for a new item in the Collection Book.
    collect() {
      if (!ctx) return;
      ["G5", "C6", "E6", "G6"].forEach((note, i) => {
        tone(NOTES[note], { type: "square", start: i * 0.08, decay: 0.22, level: 0.045 });
        tone(NOTES[note] * 2, { type: "sine", start: i * 0.08, decay: 0.35, level: 0.04 });
      });
    },
    // A finished set: a longer, grander run that ends on a held chord.
    fanfare() {
      if (!ctx) return;
      ["C5", "E5", "G5", "C6", "E6", "G6"].forEach((note, i) => {
        tone(NOTES[note], { type: "square", start: i * 0.09, decay: 0.25, level: 0.045 });
      });
      for (const note of ["C6", "E6", "G6"]) tone(NOTES[note], { type: "triangle", start: 0.6, decay: 1.2, level: 0.06 });
    },
    // The wheel's pointer clicking past a peg, quieter as it slows down.
    wheelTick(speed) {
      if (!ctx) return;
      tick({ level: 0.05 + 0.05 * speed, freq: 3500 });
      tone(900, { type: "triangle", decay: 0.03, level: 0.04 });
    },
    bonus() {
      if (!ctx) return;
      // Rising sparkle when a bonus item appears.
      ["C6", "E6", "G6", "C6"].forEach((note, i) => {
        const f = NOTES[note] * (i === 3 ? 2 : 1);
        tone(f, { type: "sine", start: i * 0.06, decay: 0.3, level: 0.06 });
        tone(f * 1.5, { type: "triangle", start: i * 0.06 + 0.02, decay: 0.2, level: 0.02 });
      });
    },
  };
}

function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
