// WebAudio siren + vibration for the ALERTS pane (F4).
// Two-tone sweep so it reads as a real alarm, not a beep.

let ctx = null;
let osc = null;
let gain = null;
let lfo = null;
let lfoGain = null;
let stopTimer = null;

function ensureCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Prime audio on a user gesture so later programmatic sirens are allowed. */
export function primeAudio() {
  ensureCtx();
}

export function startSiren(durationMs = 4000) {
  const ac = ensureCtx();
  if (!ac) return;
  stopSiren();

  osc = ac.createOscillator();
  gain = ac.createGain();
  lfo = ac.createOscillator();
  lfoGain = ac.createGain();

  osc.type = "sawtooth";
  osc.frequency.value = 640;
  lfo.type = "sine";
  lfo.frequency.value = 0.9; // sweep rate
  lfoGain.gain.value = 220; // sweep depth

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.connect(gain);
  gain.connect(ac.destination);

  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.05);

  osc.start();
  lfo.start();

  stopTimer = setTimeout(() => stopSiren(), durationMs);
}

export function stopSiren() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  try {
    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    }
    if (osc) osc.stop((ctx ? ctx.currentTime : 0) + 0.08);
    if (lfo) lfo.stop((ctx ? ctx.currentTime : 0) + 0.08);
  } catch (err) {
    // already stopped
  }
  osc = null;
  gain = null;
  lfo = null;
  lfoGain = null;
}

export function vibrate(pattern = [120, 60, 120, 60, 220]) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch (err) {
    // unsupported
  }
}
