import { writeFileSync } from 'fs';

const SR = 44100;

function clamp(x) { return Math.max(-32767, Math.min(32767, Math.round(x))); }
function makeWav(samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  samples.forEach((s, i) => buf.writeInt16LE(clamp(s), 44 + i * 2));
  return buf;
}

// check.wav — Dubbel-ding: C6 (1047 Hz) + E6 (1319 Hz), 600ms
// Mobiloptimerad: mellanhög frekvens med mjuk svans
{
  const n = Math.floor(SR * 0.6);
  const samples = Array.from({length: n}, (_, i) => {
    const tN = i / n;
    const t = i / SR;
    const attack = Math.min(t / 0.002, 1);
    const a1 = attack * Math.exp(-3.5 * tN);
    const t2 = Math.max(0, t - 0.09);
    const n2 = Math.max(0, tN - 0.15);
    const a2 = (t > 0.09 ? Math.min(t2 / 0.002, 1) : 0) * Math.exp(-3.5 * n2);
    return 19000 * (a1 * Math.sin(2 * Math.PI * 1047 * t) + a2 * Math.sin(2 * Math.PI * 1319 * t2));
  });
  writeFileSync('app/assets/sounds/check.wav', makeWav(samples));
  console.log('check.wav — Dubbel-ding C6+E6, 600ms');
}

// delete.wav — Nedåtnota: E4 (330 Hz) → E3 (165 Hz), ren ton med övertoner, 280ms
// Klassisk "dismiss/ta bort"-känsla, mobiloptimerad mellanlåg frekvens
{
  const n = Math.floor(SR * 0.28);
  let phase = 0;
  const samples = Array.from({length: n}, (_, i) => {
    const tN = i / n;
    const t = i / SR;
    const freq = 330 * Math.pow(165 / 330, tN);
    phase += 2 * Math.PI * freq / SR;
    const env = Math.min(t / 0.008, 1) * Math.exp(-5 * tN);
    const wave = Math.sin(phase) * 0.60
               + Math.sin(phase * 2) * 0.25
               + Math.sin(phase * 3) * 0.10
               + Math.sin(phase * 4) * 0.05;
    return 20000 * env * wave;
  });
  writeFileSync('app/assets/sounds/delete.wav', makeWav(samples));
  console.log('delete.wav — Nedåtnota E4→E3, 280ms');
}
