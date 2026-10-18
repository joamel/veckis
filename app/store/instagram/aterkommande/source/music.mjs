// Glad "instruktionsvideo"-trudelutt till söndagsreelen: plockad ukulele
// (Karplus-Strong), klockspel, mjuk bas och pop vid scenbytena. Helt
// syntetiserad, så den är fri att använda. Skriver music.wav (44,1 kHz mono).
import { writeFileSync } from 'node:fs';

const SR = 44100, DUR = 27.9, N = Math.round(SR * DUR);
const BPM = 112, BEAT = 60 / BPM, BAR = BEAT * 4;
const uke = new Float32Array(N), glock = new Float32Array(N), bass = new Float32Array(N), fx = new Float32Array(N);

// Enkel deterministisk slump, så att ljudet blir likadant varje körning.
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function pluck(buf, t0, f, amp, len = 1.4, damp = 0.996) {
  const start = Math.round(t0 * SR), p = Math.max(2, Math.round(SR / f));
  const ring = Float32Array.from({ length: p }, () => rnd());
  // Lite mjukare anslag: lågpassa bruset en gång.
  for (let i = 1; i < p; i++) ring[i] = (ring[i] + ring[i - 1]) / 2;
  const n = Math.round(len * SR);
  for (let i = 0; i < n && start + i < N; i++) {
    const j = i % p, nxt = (i + 1) % p;
    const v = ring[j];
    ring[j] = damp * 0.5 * (ring[j] + ring[nxt]);
    buf[start + i] += v * amp;
  }
}
function bell(buf, t0, f, amp, decay = 3.2, len = 1.6) {
  const s = Math.round(t0 * SR);
  for (let i = 0; i < len * SR && s + i < N; i++) {
    const t = i / SR, env = Math.exp(-decay * t) * Math.min(1, t * 400);
    buf[s + i] += amp * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-8 * t));
  }
}
function sine(buf, t0, f, amp, decay, len) {
  const s = Math.round(t0 * SR);
  for (let i = 0; i < len * SR && s + i < N; i++) {
    const t = i / SR;
    buf[s + i] += amp * Math.exp(-decay * t) * Math.min(1, t * 200) * Math.sin(2 * Math.PI * f * t);
  }
}
function pop(buf, t0, amp, f0 = 380, f1 = 950) {
  const s = Math.round(t0 * SR), len = 0.09 * SR;
  let ph = 0;
  for (let i = 0; i < len && s + i < N; i++) {
    const x = i / len, f = f0 + (f1 - f0) * x;
    ph += 2 * Math.PI * f / SR;
    buf[s + i] += amp * Math.sin(ph) * Math.exp(-5 * x) * Math.min(1, i / 40);
  }
}

const hz = m => 440 * Math.pow(2, (m - 69) / 12);
// Ukulele-greppen (G4 C4 E4 A4-stämning), som MIDI-toner.
const CHORDS = {
  C: [67, 60, 64, 72], G: [67, 62, 67, 71], Am: [69, 60, 64, 69], F: [69, 60, 65, 69],
};
const ROOT = { C: 48, G: 43, Am: 45, F: 41 };
const PROG = ['C', 'G', 'Am', 'F'];
// Klockspel: fyra toner per takt, följer ackordet.
const MEL = { C: [76, 79, 84, 79], G: [74, 79, 83, 79], Am: [76, 81, 84, 81], F: [77, 81, 84, 81] };
// Anslag inom takten (i slag) och styrka; "u" = uppslag (strängarna i omvänd ordning).
const STRUM = [[0, 1, 'd'], [1, 0.7, 'd'], [1.5, 0.5, 'u'], [2.5, 0.55, 'u'], [3, 0.75, 'd'], [3.5, 0.5, 'u']];

const END = 23.2; // slutscenen: ett sista ackord som får klinga
let bar = 0;
for (let t = 0; t < END - 0.01; t += BAR, bar++) {
  const ch = PROG[bar % 4];
  for (const [b, a, dir] of STRUM) {
    const at = t + b * BEAT;
    if (at >= END) break;
    const notes = dir === 'd' ? CHORDS[ch] : [...CHORDS[ch]].reverse();
    notes.forEach((m, k) => pluck(uke, at + k * 0.011, hz(m), a * 0.5));
  }
  sine(bass, t, hz(ROOT[ch]), 0.55, 2.2, BEAT * 1.9);
  sine(bass, t + 2 * BEAT, hz(ROOT[ch]), 0.45, 2.2, BEAT * 1.9);
  // Klockspelet börjar efter första takten, så att sucken får andas.
  if (bar >= 1) MEL[ch].forEach((m, k) => { const at = t + k * BEAT; if (at < END) bell(glock, at, hz(m), 0.32); });
}
// Slutackord C som klingar ut, plus en ljus "ding".
CHORDS.C.forEach((m, k) => pluck(uke, END + k * 0.03, hz(m), 0.6, 4.5, 0.9985));
sine(bass, END, hz(48), 0.55, 1.2, 4);
bell(glock, END + 0.1, hz(84), 0.4, 1.6, 4);
bell(glock, END + 0.35, hz(88), 0.3, 1.6, 4);

// Pop vid scenbytena, och ett litet hjärtpling.
for (const t of [3.6, 8.6, 13.6, 18.6]) pop(fx, t + 0.02, 0.5);
bell(fx, 18.6 + 0.8, hz(91), 0.35, 4, 1.2);

// Mixa, tona in/ut och normalisera.
const out = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.15) * Math.min(1, (DUR - t) / 1.6);
  out[i] = (uke[i] * 0.55 + glock[i] * 0.3 + bass[i] * 0.4 + fx[i] * 0.35) * fade;
  peak = Math.max(peak, Math.abs(out[i]));
}
const gain = 0.7 / peak;
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * gain)) * 32767), 44 + i * 2);
writeFileSync(new URL('./music.wav', import.meta.url), pcm);
console.log('music.wav', DUR, 's, peak', peak.toFixed(2));
