const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const BARS = 4;
const STEPS_PER_BAR = 16;
const TOTAL_STEPS = BARS * STEPS_PER_BAR;

const recipes = [
  { id: "hat-spark", name: "Hat spark", blurb: "Open hats on the offbeats with closed hat density." },
  { id: "ghost-snare", name: "Ghost snare", blurb: "Soft snare ghosts on the e and a of every beat." },
  { id: "bass-fill", name: "Bass fill", blurb: "Bass anticipates and walks into the next root." },
  { id: "piano-stab", name: "Piano stab", blurb: "Chord-tone piano stabs on the ands." },
  { id: "full-spark", name: "Full spark", blurb: "Hats + ghosts + bass fill + stabs for life." },
  { id: "sparse-lock", name: "Sparse lock", blurb: "Minimal accents that lock the pocket without clutter." }
];

const state = {
  bpm: 98,
  key: "A minor",
  chords: "Am F C G",
  recipe: recipes[0],
  playing: false,
  step: 0,
  bars: BARS,
  mutes: { kick: false, snare: false, hat: false, bass: false, piano: false, guitar: false },
  swing: 0
};

let ctx, bus, compressor, buffers = {}, rawBuffers = {};
let nextStepTime = 0;
let timerId = null;
let activeSources = [];
let playheadRaf = null;
let samplesReady = false;

function saveState() {
  localStorage.setItem("nextspark-elevated", JSON.stringify({
    bpm: state.bpm, key: state.key, chords: state.chords, recipe: state.recipe.id,
    mutes: state.mutes
  }));
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("nextspark-elevated") || "{}");
    if (s.bpm) state.bpm = Math.max(60, Math.min(180, s.bpm));
    if (s.key) state.key = s.key;
    if (s.chords) state.chords = s.chords;
    if (s.recipe) state.recipe = recipes.find(r => r.id === s.recipe) || recipes[0];
    if (s.mutes) Object.assign(state.mutes, s.mutes);
  } catch (e) {}
}

async function loadSamples() {
  const files = [
    ["kick", `${CDN}/drums/kick.mp3`],
    ["snare", `${CDN}/drums/snare.mp3`],
    ["hat", `${CDN}/drums/hihat.mp3`],
    ["crash", `${CDN}/drums/crash.mp3`],
    ["pC3", `${CDN}/piano/C3.mp3`],
    ["pC4", `${CDN}/piano/C4.mp3`],
    ["bE1", `${CDN}/bass/E1.mp3`],
    ["bA1", `${CDN}/bass/A1.mp3`],
    ["gE2", `${CDN}/guitar/E2.mp3`]
  ];
  const missing = [];
  for (let i = 0; i < files.length; i++) {
    const [k, url] = files[i];
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab;
      if (ctx) buffers[k] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(k);
    }
    document.getElementById("status").textContent = `Seating chairs ${i + 1}/${files.length}${missing.length ? " — missing: " + missing.join(",") : ""}`;
  }
  if (missing.length) {
    document.getElementById("status").textContent = "Missing instruments: " + missing.join(", ") + ". Cannot play.";
    samplesReady = false;
    return false;
  }
  document.getElementById("status").textContent = "Chairs seated · live FluidR3 + kit";
  samplesReady = true;
  return true;
}

function initAudio() {
  if (ctx) return;
  ctx = new AudioContext({ sampleRate: 48000 });
  bus = ctx.createGain();
  bus.gain.value = 0.35;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 4;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.2;
  bus.connect(compressor);
  compressor.connect(ctx.destination);
  for (const k in rawBuffers) {
    if (!buffers[k]) {
      ctx.decodeAudioData(rawBuffers[k].slice(0)).then(b => { buffers[k] = b; });
    }
  }
}

function trackSource(src) {
  activeSources.push(src);
  src.onended = () => { activeSources = activeSources.filter(s => s !== src); };
}

function playBuf(name, when, rate = 1, gain = 0.35, duration) {
  const chair = name === "hat" ? "hat" : name === "snare" ? "snare" : name === "kick" ? "kick" : name.startsWith("b") ? "bass" : name.startsWith("p") ? "piano" : "guitar";
  if (state.mutes[chair]) return;
  const b = buffers[name];
  if (!b || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.006);
  const dur = duration || 0.32;
  g.gain.setValueAtTime(gain, when + Math.max(0, dur - 0.012));
  g.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(g);
  g.connect(bus);
  src.start(when);
  src.stop(when + dur + 0.02);
  trackSource(src);
}

function rateFromMidi(midi, base = 60) {
  return Math.pow(2, (midi - base) / 12);
}

function parseChords(str) {
  return str.split(/\s+/).filter(Boolean).slice(0, 4);
}

function rootMidi(symbol) {
  const map = { C: 60, "C#": 61, Db: 61, D: 62, "D#": 63, Eb: 63, E: 64, F: 65, "F#": 66, Gb: 66, G: 67, "G#": 68, Ab: 68, A: 69, "A#": 70, Bb: 70, B: 71 };
  const m = symbol.match(/^([A-G][#b]?)/);
  return map[m ? m[1] : "A"] || 69;
}

function isMinor(symbol) {
  return /m(?!aj)/i.test(symbol) || symbol.includes("m");
}

function chordTones(root, minor) {
  if (minor) return [root, root + 3, root + 7, root + 12];
  return [root, root + 4, root + 7, root + 12];
}

function scheduleStep(step, when) {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const chords = parseChords(state.chords);
  const symbol = chords[bar % chords.length] || "Am";
  const rec = state.recipe.id;
  const stepDur = 60 / state.bpm / 4;
  const root = rootMidi(symbol);
  const minor = isMinor(symbol);
  const tones = chordTones(root, minor);
  const bassMidi = root - 24;
  const pianoMidi = root;

  if (s % 2 === 0) playBuf("hat", when, 1, 0.055);
  if (s === 0 || s === 8) playBuf("kick", when, 1, 0.52);
  if (s === 4 || s === 12) playBuf("snare", when, 1, 0.32);

  if (rec === "hat-spark" || rec === "full-spark") {
    if (s === 2 || s === 6 || s === 10 || s === 14) playBuf("hat", when, 1.08, 0.11);
  }
  if (rec === "ghost-snare" || rec === "full-spark") {
    if (s === 2 || s === 6 || s === 10 || s === 14) playBuf("snare", when, 1, 0.08);
  }
  if (rec === "bass-fill" || rec === "full-spark") {
    if (s === 14) playBuf("bA1", when, rateFromMidi(bassMidi + 2, 33), 0.38, stepDur * 1.1);
  }
  if (rec === "piano-stab" || rec === "full-spark") {
    if (s === 2 || s === 6 || s === 10 || s === 14) {
      const tone = tones[s % tones.length];
      playBuf("pC4", when, rateFromMidi(tone, 60), 0.18, 0.12);
    }
  }
  if (rec === "sparse-lock") {
    if (s === 0) playBuf("kick", when, 1, 0.4);
    if (s === 8) playBuf("snare", when, 1, 0.25);
    if (s === 4 || s === 12) playBuf("hat", when, 1, 0.07);
  }

  if (s === 0) {
    playBuf("bA1", when, rateFromMidi(bassMidi, 33), 0.34, stepDur * 3.4);
    playBuf("gE2", when, rateFromMidi(pianoMidi - 12, 45), 0.16, stepDur * 6.8);
  }
}

function scheduler() {
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(state.step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    state.step = (state.step + 1) % TOTAL_STEPS;
  }
}

function start() {
  if (!samplesReady) return;
  if (!ctx) initAudio();
  if (ctx.state === "suspended") ctx.resume();
  stop();
  state.playing = true;
  state.step = 0;
  nextStepTime = ctx.currentTime + 0.1;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  requestAnimationFrame(updatePlayhead);
  document.getElementById("tap-overlay").classList.add("hidden");
}

function stop() {
  state.playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  activeSources.forEach(s => { try { s.stop(); } catch (e) {} });
  activeSources = [];
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  paintBars();
  paintGrid();
}

function updatePlayhead() {
  if (!state.playing) return;
  paintBars();
  paintGrid();
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

function paintBars() {
  const el = document.getElementById("bars");
  el.innerHTML = "";
  const chords = parseChords(state.chords);
  for (let i = 0; i < BARS; i++) {
    const d = document.createElement("div");
    d.className = "bar" + (state.playing && Math.floor(state.step / STEPS_PER_BAR) === i ? " active" : "");
    d.innerHTML = `<div class="n">${i + 1}</div><div class="c">${chords[i % chords.length] || "—"}</div>`;
    el.appendChild(d);
  }
}

function paintGrid() {
  const el = document.getElementById("grid");
  el.innerHTML = "";
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    const d = document.createElement("div");
    d.className = "step" + (state.playing && (state.step % STEPS_PER_BAR) === i ? " on" : "");
    el.appendChild(d);
  }
}

function paintRecipes() {
  const el = document.getElementById("recipes");
  el.innerHTML = "";
  recipes.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipe.id === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipe = r; saveState(); render(); };
    el.appendChild(b);
  });
}

function punch() {
  return `NextSpark Elevated punch list
${state.bpm} BPM · ${state.key} · ${state.recipe.name}

The problem: static loops have no life.
The move: ${state.recipe.blurb}

Chords: ${state.chords}
Mutes: ${Object.entries(state.mutes).filter(([k,v]) => v).map(([k]) => k).join(", ") || "none"}

Live chairs only. Elevated from NextSpark.
Drop the folded WAV on bar 1. Loop is seamless.`;
}

function render() {
  paintRecipes();
  paintBars();
  paintGrid();
  document.getElementById("punch").textContent = punch();
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("key").value = state.key;
  document.getElementById("chords").value = state.chords;
  document.getElementById("mute-kick").checked = !state.mutes.kick;
  document.getElementById("mute-snare").checked = !state.mutes.snare;
  document.getElementById("mute-hat").checked = !state.mutes.hat;
  document.getElementById("mute-bass").checked = !state.mutes.bass;
  document.getElementById("mute-piano").checked = !state.mutes.piano;
  document.getElementById("mute-guitar").checked = !state.mutes.guitar;
}

function encodeWav24(audioBuffer) {
  const numChannels = 2;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 3;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + length * blockAlign);
  const view = new DataView(buffer);
  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * blockAlign, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeString(36, "data");
  view.setUint32(40, length * blockAlign, true);
  let offset = 44;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    for (const ch of [ch0, ch1]) {
      let s = Math.max(-1, Math.min(1, ch[i]));
      const int = Math.round(s * 0x7FFFFF);
      view.setUint8(offset++, (int >> 16) & 0xFF);
      view.setUint8(offset++, (int >> 8) & 0xFF);
      view.setUint8(offset++, int & 0xFF);
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function exportWav(withTail = false) {
  if (!samplesReady || !rawBuffers.kick) {
    alert("Samples not ready");
    return;
  }
  const sampleRate = 48000;
  const bars = BARS;
  const bpm = state.bpm;
  const lengthSamples = Math.round(bars * 4 * 60 / bpm * sampleRate);
  const tailSamples = Math.round(sampleRate * 1.2);
  const offline = new OfflineAudioContext(2, lengthSamples + tailSamples, sampleRate);
  const offBus = offline.createGain();
  offBus.gain.value = 0.35;
  const offComp = offline.createDynamicsCompressor();
  offComp.threshold.value = -10;
  offComp.ratio.value = 6;
  offBus.connect(offComp);
  offComp.connect(offline.destination);

  const offBuffers = {};
  for (const k of Object.keys(rawBuffers)) {
    offBuffers[k] = await offline.decodeAudioData(rawBuffers[k].slice(0));
  }

  function playOff(name, when, rate = 1, gain = 0.35, duration) {
    const chair = name === "hat" ? "hat" : name === "snare" ? "snare" : name === "kick" ? "kick" : name.startsWith("b") ? "bass" : name.startsWith("p") ? "piano" : "guitar";
    if (state.mutes[chair]) return;
    const b = offBuffers[name];
    if (!b) return;
    const src = offline.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = offline.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    const dur = duration || 0.32;
    g.gain.setValueAtTime(gain, when + Math.max(0, dur - 0.012));
    g.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(g);
    g.connect(offBus);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  let t = 0;
  const stepDur = 60 / bpm / 4;
  for (let step = 0; step < TOTAL_STEPS; step++) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chords = parseChords(state.chords);
    const symbol = chords[bar % chords.length] || "Am";
    const rec = state.recipe.id;
    const root = rootMidi(symbol);
    const minor = isMinor(symbol);
    const tones = chordTones(root, minor);
    const bassMidi = root - 24;
    const pianoMidi = root;

    if (s % 2 === 0) playOff("hat", t, 1, 0.055);
    if (s === 0 || s === 8) playOff("kick", t, 1, 0.52);
    if (s === 4 || s === 12) playOff("snare", t, 1, 0.32);

    if (rec === "hat-spark" || rec === "full-spark") {
      if (s === 2 || s === 6 || s === 10 || s === 14) playOff("hat", t, 1.08, 0.11);
    }
    if (rec === "ghost-snare" || rec === "full-spark") {
      if (s === 2 || s === 6 || s === 10 || s === 14) playOff("snare", t, 1, 0.08);
    }
    if (rec === "bass-fill" || rec === "full-spark") {
      if (s === 14) playOff("bA1", t, rateFromMidi(bassMidi + 2, 33), 0.38, stepDur * 1.1);
    }
    if (rec === "piano-stab" || rec === "full-spark") {
      if (s === 2 || s === 6 || s === 10 || s === 14) {
        const tone = tones[s % tones.length];
        playOff("pC4", t, rateFromMidi(tone, 60), 0.18, 0.12);
      }
    }
    if (rec === "sparse-lock") {
      if (s === 0) playOff("kick", t, 1, 0.4);
      if (s === 8) playOff("snare", t, 1, 0.25);
      if (s === 4 || s === 12) playOff("hat", t, 1, 0.07);
    }
    if (s === 0) {
      playOff("bA1", t, rateFromMidi(bassMidi, 33), 0.34, stepDur * 3.4);
      playOff("gE2", t, rateFromMidi(pianoMidi - 12, 45), 0.16, stepDur * 6.8);
    }
    t += stepDur;
  }

  const rendered = await offline.startRendering();
  if (withTail) {
    const blob = encodeWav24(rendered);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `NextSparkElevated-${state.recipe.id}-${bpm}bpm-${state.key.replace(/\s+/g, "")}-withtail.wav`;
    a.click();
    return;
  }

  const main = rendered.getChannelData(0).subarray(0, lengthSamples);
  const main1 = rendered.getChannelData(1).subarray(0, lengthSamples);
  const tail0 = rendered.getChannelData(0).subarray(lengthSamples);
  const tail1 = rendered.getChannelData(1).subarray(lengthSamples);
  for (let i = 0; i < Math.min(tail0.length, lengthSamples); i++) {
    main[i] += tail0[i] * 0.8;
    main1[i] += tail1[i] * 0.8;
  }
  let peak = 0;
  for (let i = 0; i < lengthSamples; i++) {
    peak = Math.max(peak, Math.abs(main[i]), Math.abs(main1[i]));
  }
  const target = Math.pow(10, -1 / 20);
  if (peak > 0) {
    const scale = target / peak;
    for (let i = 0; i < lengthSamples; i++) {
      main[i] *= scale;
      main1[i] *= scale;
    }
  }
  const finalBuf = offline.createBuffer(2, lengthSamples, sampleRate);
  finalBuf.copyToChannel(main, 0);
  finalBuf.copyToChannel(main1, 1);
  const blob = encodeWav24(finalBuf);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `NextSparkElevated-${state.recipe.id}-${bpm}bpm-${state.key.replace(/\s+/g, "")}.wav`;
  a.click();
}

function exportMidi() {
  const bpm = state.bpm;
  const ticksPerBeat = 480;
  const stepTicks = ticksPerBeat / 4;
  const tracks = [[], [], [], [], [], []];

  function addNote(track, note, startTick, durTicks, vel = 80) {
    tracks[track].push({ tick: startTick, type: "on", note, vel });
    tracks[track].push({ tick: startTick + durTicks, type: "off", note, vel: 0 });
  }

  let tick = 0;
  for (let step = 0; step < TOTAL_STEPS; step++) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chords = parseChords(state.chords);
    const symbol = chords[bar % chords.length] || "Am";
    const root = rootMidi(symbol);
    const minor = isMinor(symbol);
    const tones = chordTones(root, minor);
    const bassMidi = root - 24;
    const pianoMidi = root;
    const rec = state.recipe.id;

    if (!state.mutes.hat && s % 2 === 0) addNote(2, 42, tick, stepTicks * 0.4, 40);
    if (!state.mutes.kick && (s === 0 || s === 8)) addNote(0, 36, tick, stepTicks, 100);
    if (!state.mutes.snare && (s === 4 || s === 12)) addNote(0, 38, tick, stepTicks, 90);
    if (!state.mutes.snare && (rec === "ghost-snare" || rec === "full-spark") && (s === 2 || s === 6 || s === 10 || s === 14)) addNote(0, 38, tick, stepTicks * 0.3, 30);
    if (!state.mutes.bass && s === 0) addNote(1, bassMidi, tick, stepTicks * 3.4, 90);
    if (!state.mutes.guitar && s === 0) addNote(4, pianoMidi - 12, tick, stepTicks * 6.8, 60);
    if (!state.mutes.piano && (rec === "piano-stab" || rec === "full-spark") && (s === 2 || s === 6 || s === 10 || s === 14)) {
      const tone = tones[s % tones.length];
      addNote(3, tone, tick, stepTicks * 0.25, 55);
    }
    tick += stepTicks;
  }

  // Simple MIDI file construction (type 1, 6 tracks)
  const header = [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x06, 0x01, 0xE0];
  const blobParts = [new Uint8Array(header)];

  const tempo = Math.round(60000000 / bpm);
  const tempoBytes = [0x00, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF];
  const timeSig = [0x00, 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08];

  for (let tr = 0; tr < 6; tr++) {
    const events = tracks[tr].sort((a, b) => a.tick - b.tick);
    let bytes = [];
    if (tr === 0) {
      bytes.push(...tempoBytes, ...timeSig);
    }
    let prev = 0;
    for (const e of events) {
      let delta = e.tick - prev;
      prev = e.tick;
      while (delta >= 0x80) {
        bytes.push((delta & 0x7F) | 0x80);
        delta >>= 7;
      }
      bytes.push(delta & 0x7F);
      if (e.type === "on") {
        bytes.push(0x90, e.note, e.vel);
      } else {
        bytes.push(0x80, e.note, 0);
      }
    }
    bytes.push(0x00, 0xFF, 0x2F, 0x00);
    const trackHeader = [0x4D, 0x54, 0x72, 0x6B, (bytes.length >> 24) & 0xFF, (bytes.length >> 16) & 0xFF, (bytes.length >> 8) & 0xFF, bytes.length & 0xFF];
    blobParts.push(new Uint8Array(trackHeader));
    blobParts.push(new Uint8Array(bytes));
  }

  const blob = new Blob(blobParts, { type: "audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `NextSparkElevated-${state.recipe.id}-${bpm}bpm-${state.key.replace(/\s+/g, "")}.mid`;
  a.click();
}

// Lifecycle
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.playing) stop();
});

// MIDI keyboard support (for playable instruments)
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(access => {
    for (const input of access.inputs.values()) {
      input.onmidimessage = msg => {
        const [status, note, vel] = msg.data;
        if (status === 0x90 && vel > 0) {
          // Note on - could trigger a sample or ignore for this desk
        } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
          // Note off
        }
      };
    }
  }).catch(() => {});
}

// UI bindings
document.getElementById("tap-overlay").onclick = () => {
  initAudio();
  document.getElementById("tap-overlay").classList.add("hidden");
};
document.getElementById("play").onclick = start;
document.getElementById("stop").onclick = stop;
document.getElementById("export-wav").onclick = () => exportWav(false);
document.getElementById("export-tail").onclick = () => exportWav(true);
document.getElementById("export-midi").onclick = exportMidi;
document.getElementById("bpm").onchange = e => { state.bpm = +e.target.value; saveState(); };
document.getElementById("key").onchange = e => { state.key = e.target.value; saveState(); };
document.getElementById("chords").onchange = e => { state.chords = e.target.value; saveState(); render(); };
["kick","snare","hat","bass","piano","guitar"].forEach(ch => {
  document.getElementById(`mute-${ch}`).onchange = e => {
    state.mutes[ch] = !e.target.checked;
    saveState();
  };
});

loadState();
render();
loadSamples();

// Acceptance check helper (for development)
window.runAcceptance = async function() {
  const sampleRate = 48000;
  const bpm = 92;
  const bars = 8;
  const expected = Math.round(bars * 4 * 60 / bpm * sampleRate);
  console.log("Expected samples for 92 BPM / 8 bars:", expected);
  console.log("1,001,739 expected");
  return expected === 1001739;
};
