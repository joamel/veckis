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

// check.wav — Kristall A6 full volym (1760 Hz, 650ms)
{
  const n = Math.floor(SR * 0.65);
  const samples = Array.from({length: n}, (_, i) => {
    const tN = i / n;
    const t = i / SR;
    return 20000 * Math.min(t / 0.001, 1) * Math.exp(-3.5 * tN) * Math.sin(2 * Math.PI * 1760 * t);
  });
  writeFileSync('app/assets/sounds/check.wav', makeWav(samples));
  console.log('check.wav — Kristall A6, 1760 Hz, 650ms');
}

// delete.wav — Reverse-cymbal längre (400ms, stiger sedan klipps)
{
  const totalSamples = Math.floor(SR * 0.4);
  let lp = 0;
  const samples = Array.from({length: totalSamples}, (_, i) => {
    const tN = i / totalSamples;
    const cutoff = 600 + 9000 * tN;
    const a = 1 / (1 + SR / (2 * Math.PI * cutoff));
    lp = lp + a * ((Math.random() * 2 - 1) - lp);
    const env = tN < 0.78 ? tN / 0.78 : Math.exp(-30 * (tN - 0.78));
    return 20000 * env * lp;
  });
  writeFileSync('app/assets/sounds/delete.wav', makeWav(samples));
  console.log('delete.wav — Reverse-cymbal längre, 400ms');
}
