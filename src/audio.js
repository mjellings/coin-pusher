// All sounds are synthesised with Web Audio, so there are no audio files to load.
// Browsers only allow sound after the player interacts, so unlock() is called on the first tap.

const MAX_VOICES = 14;

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
    bank = renderBank(ctx);
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

  // Coin sounds are pre-rendered once into a small bank of samples, so each hit is a single
  // buffer playback (cheap on phones) and no two hits in a row sound quite the same.
  let bank = null;
  let voices = 0;
  let lastVariant = {};
  let recentHits = 0;
  let recentAt = 0;

  function play(kind, { level = 0.5, rate = 1, start = 0, pan = 0, bright = 1 } = {}) {
    if (voices >= MAX_VOICES) return;
    const list = bank[kind];
    if (!list.length) return;
    // Pick a variant, never the same one twice running.
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === lastVariant[kind]) i = (i + 1) % list.length;
    lastVariant[kind] = i;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = rate;
    let node = src;
    // Softer hits are duller as well as quieter.
    if (bright < 1) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1500 + 14000 * bright * bright;
      node = node.connect(filter);
    }
    const g = ctx.createGain();
    g.gain.value = level;
    node = node.connect(g);
    if (pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(panner);
    }
    node.connect(master);
    voices++;
    src.onended = () => voices--;
    src.start(t);
  }

  // When lots of coins collide at once, each one gets a bit quieter so the pile doesn't roar.
  function crowdScale() {
    const now = ctx.currentTime;
    recentHits = recentHits * Math.exp(-(now - recentAt) / 0.15) + 1;
    recentAt = now;
    return 1 / Math.sqrt(recentHits);
  }

  // Coins falling into the metal payout tray: a heavy first hit, then a rattle of bounces.
  function trayDrop(count, { start = 0, pan = 0 } = {}) {
    play("tray", { start, level: 0.75, rate: 0.95 + Math.random() * 0.1, pan });
    let t = start + 0.025 + Math.random() * 0.02;
    for (let i = 0; i < count; i++) {
      const strength = 0.8 - (0.5 * i) / count;
      play(i % 2 ? "clack" : "clink", {
        start: t,
        level: 0.25 + 0.3 * strength,
        rate: 0.88 + Math.random() * 0.22,
        bright: 0.5 + 0.5 * strength,
        pan: pan + (Math.random() - 0.5) * 0.3,
      });
      t += 0.03 + Math.random() * 0.06;
    }
  }

  const panFor = (x = 0) => (x / 4) * 0.6;

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
      // A mechanical "chunk" as the coin is fed through the slot.
      tone(150, { type: "triangle", decay: 0.06, level: 0.12 });
      tick({ level: 0.06, freq: 1800 });
      play("clack", { level: 0.3, rate: 0.8 + Math.random() * 0.1, bright: 0.5 });
    },
    // A coin landing on the board or on other coins, weightier and brighter the harder it hits.
    land(speed, x) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastClinkAt < 0.02) return;
      lastClinkAt = now;
      const strength = Math.min(1, speed / 10);
      const level = (0.25 + 0.55 * strength) * crowdScale();
      const pan = panFor(x);
      play("clack", { level, rate: 0.9 + Math.random() * 0.2, bright: 0.45 + 0.55 * strength, pan });
      // Harder hits knock against neighbouring coins too.
      if (strength > 0.35 && Math.random() < 0.7) {
        play("clink", {
          start: 0.012 + Math.random() * 0.03,
          level: level * 0.45,
          rate: 0.92 + Math.random() * 0.18,
          bright: strength,
          pan,
        });
      }
    },
    // A coin falling off the side into the cabinet: a muffled clunk.
    lost(x) {
      if (!ctx) return;
      play("tray", { level: 0.3, rate: 0.75 + Math.random() * 0.1, bright: 0.25, pan: panFor(x) });
    },
    // A short metallic tick as a coin bounces off a steel peg.
    peg(speed, height, x) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastPingAt < 0.025) return;
      lastPingAt = now;
      const strength = Math.min(1, speed / 8);
      play("pin", {
        level: (0.15 + 0.3 * strength) * crowdScale(),
        rate: 0.92 + Math.random() * 0.16,
        bright: 0.5 + 0.5 * strength,
        pan: panFor(x),
      });
    },
    win(value, kind, x) {
      if (!ctx) return;
      // Coins crashing into the tray, then a jingle that gets grander with the payout.
      trayDrop(Math.min(6, 1 + value), { pan: panFor(x) });
      if (kind === "coin" && value <= 1) return;
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

// --- Coin sample bank -------------------------------------------------------------------------
// A coin is a small metal disc, so it rings at a handful of inharmonic frequencies (the modes of a
// free circular plate) that each fade at their own rate. Each partial is split into two slightly
// detuned copies so it shimmers rather than beeps, and a burst of noise gives the initial "chink".
// The "body" is a short thud from whatever the coin hit, which is what gives it weight.

const PLATE_MODES = [1, 1.73, 2.33, 3.91, 4.11, 6.3, 7.2];
const MODE_LEVELS = [1, 0.55, 0.7, 0.4, 0.3, 0.18, 0.1];

// Rendering all the samples takes a moment on a phone, so they're made one at a time between
// frames rather than all at once on the first tap. Sounds that aren't ready yet are skipped.
export function renderBank(ctx, { sync = false } = {}) {
  const bank = {};
  // Round-robin through the kinds so every sound has a variant or two early on.
  const jobs = [];
  for (const [kind, [count, settings]] of Object.entries(COIN_SOUNDS)) {
    bank[kind] = [];
    for (let i = 0; i < count; i++) jobs.push({ kind, settings, round: i });
  }
  jobs.sort((a, b) => a.round - b.round);
  const renderNext = () => {
    const job = jobs.shift();
    if (!job) return;
    const data = renderHit(ctx.sampleRate, job.settings());
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    bank[job.kind].push(buffer);
    if (!sync) setTimeout(renderNext, 0);
  };
  if (sync) while (jobs.length) renderNext();
  else renderNext();
  return bank;
}

const rand = (a, b) => a + Math.random() * (b - a);

// How many variants of each kind of coin sound to make, and the settings for each.
const COIN_SOUNDS = {
  // Coin striking coin: bright ring, little body.
  clink: [8, () => ({ f0: rand(2100, 3000), ring: rand(0.14, 0.22), ringLevel: 1, body: rand(380, 620), bodyLevel: 0.6, click: 0.5 })],
  // Coin dropping flat onto the bed or a pile: a solid clack with a short ring.
  clack: [6, () => ({ f0: rand(1700, 2500), ring: rand(0.06, 0.1), ringLevel: 0.45, body: rand(220, 420), bodyLevel: 1, bodyDecay: 0.03, click: 0.8 })],
  // Coins hitting the metal payout tray: a deep metallic bang with a longer tail.
  tray: [
    3,
    () => ({
      f0: rand(1900, 2600),
      ring: 0.18,
      ringLevel: 0.6,
      body: rand(140, 200),
      bodyLevel: 1.1,
      bodyDecay: 0.06,
      panel: rand(330, 420),
      click: 1,
      length: 0.6,
    }),
  ],
  // Coin glancing off a steel peg: high, short and light.
  pin: [5, () => ({ f0: rand(3000, 3900), ring: rand(0.05, 0.08), ringLevel: 0.8, body: rand(900, 1300), bodyLevel: 0.5, bodyDecay: 0.008, click: 0.6, length: 0.25 })],
};

function renderHit(sampleRate, { f0, ring, ringLevel, body, bodyLevel, bodyDecay = 0.02, panel = 0, click, length = 0.4 }) {
  const n = Math.floor(sampleRate * length);
  const out = new Float32Array(n);
  const dt = 1 / sampleRate;

  // Ringing partials, each split into a detuned pair so they beat against each other.
  PLATE_MODES.forEach((ratio, i) => {
    const freq = f0 * ratio * (1 + (Math.random() - 0.5) * 0.03);
    if (freq > sampleRate * 0.45) return;
    const amp = MODE_LEVELS[i] * ringLevel * (0.7 + Math.random() * 0.6);
    const tau = ring / (1 + i * 0.5);
    for (const detune of [1, 1 + 0.002 + Math.random() * 0.006]) {
      // A decaying sine, stepped by rotating a vector (much cheaper than calling sin per sample).
      const w = 2 * Math.PI * freq * detune * dt;
      const k = Math.exp(-dt / tau);
      const [c, sn] = [Math.cos(w) * k, Math.sin(w) * k];
      const phase = Math.random() * Math.PI * 2;
      let re = Math.cos(phase) * amp * 0.5;
      let im = Math.sin(phase) * amp * 0.5;
      const steps = Math.min(n, Math.ceil(tau * sampleRate * 7));
      for (let s = 0; s < steps; s++) {
        out[s] += im;
        const next = re * c - im * sn;
        im = re * sn + im * c;
        re = next;
      }
    }
  });

  // Low-pitched thuds (the surface the coin hit, and for the tray its metal panel), made by
  // ringing a noise burst through a resonant filter.
  const resonate = (freq, decay, level, q) => {
    const w = (2 * Math.PI * freq) / sampleRate;
    const r = Math.exp(-w / (2 * q));
    const a1 = 2 * r * Math.cos(w);
    const a2 = -r * r;
    let y1 = 0;
    let y2 = 0;
    const exciteLength = Math.floor(sampleRate * 0.004);
    const k = Math.exp(-dt / decay);
    let env = level;
    const steps = Math.min(n, Math.ceil(Math.max(decay, 4 * q / (Math.PI * freq)) * sampleRate * 9));
    for (let s = 0; s < steps; s++) {
      const x = s < exciteLength ? (Math.random() * 2 - 1) * (1 - s / exciteLength) : 0;
      const y = x + a1 * y1 + a2 * y2;
      y2 = y1;
      y1 = y;
      out[s] += y * env * (1 - r) * 4;
      env *= k;
    }
  };
  resonate(body, bodyDecay, bodyLevel, 3);
  if (panel) resonate(panel, 0.22, 0.5, 30);

  // The sharp initial "chink": a couple of milliseconds of high-passed noise.
  const clickLength = Math.floor(sampleRate * 0.003);
  let prev = 0;
  for (let s = 0; s < clickLength; s++) {
    const x = Math.random() * 2 - 1;
    out[s] += (x - prev) * click * 0.5 * (1 - s / clickLength);
    prev = x;
  }

  // Short fade-in to avoid a pop, then normalise.
  const fade = Math.floor(sampleRate * 0.0004);
  for (let s = 0; s < fade; s++) out[s] *= s / fade;
  let peak = 0;
  for (let s = 0; s < n; s++) peak = Math.max(peak, Math.abs(out[s]));
  const scale = peak > 0 ? 0.9 / peak : 0;
  for (let s = 0; s < n; s++) out[s] *= scale;

  return out;
}
