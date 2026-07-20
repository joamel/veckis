/**
 * Ljud-sandbox v5
 * PLING 2 & 4: full/nära full volym
 * RADERA: 8 nya helt annorlunda karaktärer
 */

import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import * as readline from 'readline';

const SR = 44100;
mkdirSync('./sandbox-sounds', { recursive: true });

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
function gen(durSec, fn) {
  const n = Math.floor(SR * durSec);
  return Array.from({length: n}, (_, i) => fn(i, i / n, i / SR));
}

// ── PLING: bara 2 och 4, på 0.85–0.9x ───────────────────────────────
const checkSounds = [
  { name: 'Dubbel-ding (ping+kvint, 650ms) — 0.9x', gen: () => gen(0.65, (i, tN, t) => {
    const a1 = Math.min(t/0.002,1)*Math.exp(-3.5*tN);
    const t2=Math.max(0,t-0.09); const n2=Math.max(0,tN-0.14);
    const a2=(t>0.09?Math.min(t2/0.002,1):0)*Math.exp(-3.5*n2);
    return 17000*(a1*Math.sin(2*Math.PI*1047*t)+a2*Math.sin(2*Math.PI*1319*t2));
  })},

  { name: 'Kristall A6 (1760 Hz, 650ms) — 0.9x', gen: () => gen(0.65, (i, tN, t) => {
    return 18000*Math.min(t/0.001,1)*Math.exp(-3.5*tN)*Math.sin(2*Math.PI*1760*t);
  })},

  { name: 'Dubbel-ding — full volym', gen: () => gen(0.65, (i, tN, t) => {
    const a1 = Math.min(t/0.002,1)*Math.exp(-3.5*tN);
    const t2=Math.max(0,t-0.09); const n2=Math.max(0,tN-0.14);
    const a2=(t>0.09?Math.min(t2/0.002,1):0)*Math.exp(-3.5*n2);
    return 19000*(a1*Math.sin(2*Math.PI*1047*t)+a2*Math.sin(2*Math.PI*1319*t2));
  })},

  { name: 'Kristall A6 — full volym', gen: () => gen(0.65, (i, tN, t) => {
    return 20000*Math.min(t/0.001,1)*Math.exp(-3.5*tN)*Math.sin(2*Math.PI*1760*t);
  })},
];

// ── RADERA: 8 nya karaktärer ──────────────────────────────────────────
const deleteSounds = [
  // 1. Gummiband-pluck — snärtigt, descending twang
  { name: 'Gummiband (pluck 280→80 Hz, 250ms)', gen: () => {
    let phase = 0;
    return gen(0.25, (i, tN, t) => {
      const freq = 280 * Math.pow(80/280, tN);
      phase += 2*Math.PI*freq/SR;
      const harmonics = Math.sin(phase) + Math.sin(phase*2)*0.4 + Math.sin(phase*3)*0.15;
      const env = Math.exp(-7*tN);
      return 19000 * env * harmonics * 0.65;
    });
  }},

  // 2. Whip-crack — uppåt sen snabbt nedåt, som ett piskrapp
  { name: 'Piskrapp (upp 200→1500→80 Hz, 200ms)', gen: () => {
    let phase = 0;
    return gen(0.2, (i, tN, t) => {
      // Först upp (0–20%), sedan snabbt ned
      const rising = tN < 0.2;
      const freq = rising
        ? 200 * Math.pow(1500/200, tN/0.2)
        : 1500 * Math.pow(80/1500, (tN-0.2)/0.8);
      phase += 2*Math.PI*freq/SR;
      const env = rising ? tN/0.2 : Math.exp(-5*(tN-0.2)/0.8);
      return 18000 * env * Math.sin(phase);
    });
  }},

  // 3. Nedåtnota — melodisk descend, E4→E3, tydlig ton-karaktär
  { name: 'Nedåtnota (E4→E3, 300ms)', gen: () => {
    let phase = 0;
    return gen(0.3, (i, tN, t) => {
      const freq = 330 * Math.pow(165/330, tN);
      phase += 2*Math.PI*freq/SR;
      const env = Math.min(tN/0.008,1)*Math.exp(-5*tN);
      return 20000 * env * (Math.sin(phase)*0.6+Math.sin(phase*2)*0.25+Math.sin(phase*3)*0.1+Math.sin(phase*4)*0.05);
    });
  }},

  // 4. Reverse-cymbal — brus som STIGER och klipps, "zap bort"
  { name: 'Reverse-cymbal (stiger sedan klipps, 200ms)', gen: () => {
    const totalSamples = Math.floor(SR*0.2);
    let lp = 0;
    return Array.from({length: totalSamples}, (_, i) => {
      const tN = i/totalSamples;
      // Noise stiger i amplitud, klipps vid 80%
      const cutoff = 800 + 8000*tN;
      const a = 1/(1+SR/(2*Math.PI*cutoff));
      lp = lp+a*((Math.random()*2-1)-lp);
      const env = tN < 0.8 ? tN/0.8 : Math.exp(-30*(tN-0.8));
      return 20000 * env * lp;
    });
  }},

  // 5. Dissolvera — brus + ton försvinner gradvis (kort)
  { name: 'Dissolvera (ton+brus uttonar, 280ms)', gen: () => {
    let phase = 0, lp = 0;
    return gen(0.28, (i, tN, t) => {
      const freq = 400*Math.pow(80/400, tN);
      phase += 2*Math.PI*freq/SR;
      const a = 1/(1+SR/(2*Math.PI*(freq*3)));
      lp = lp+a*((Math.random()*2-1)-lp);
      const env = Math.pow(1-tN, 2.5);
      return 18000*env*(Math.sin(phase)*0.55+lp*0.45);
    });
  }},

  // 6. Dull thud — ett enda tungt slag utan resonans
  { name: 'Thud (tungt slag, 180ms)', gen: () => {
    let phase = 0;
    return gen(0.18, (i, tN, t) => {
      const freq = 60*Math.pow(30/60, Math.min(tN*4,1));
      phase += 2*Math.PI*freq/SR;
      const noise = (Math.random()*2-1)*Math.exp(-20*tN)*0.3;
      const env = Math.min(tN/0.004,1)*Math.exp(-15*tN);
      return 22000*env*(Math.sin(phase)+noise);
    });
  }},

  // 7. Zipper-rip — amplitudmodulerat brus, som att riva av ett plåster
  { name: 'Riv-ljud (plåster, 150ms)', gen: () => {
    const totalSamples = Math.floor(SR*0.15);
    let lp = 0;
    return Array.from({length: totalSamples}, (_, i) => {
      const tN = i/totalSamples;
      // Snabb amplitud-modulation = "riv"-känsla
      const mod = 0.5 + 0.5*Math.sin(2*Math.PI*60*tN);
      const a = 1/(1+SR/(2*Math.PI*6000));
      lp = lp+a*((Math.random()*2-1)-lp);
      const env = Math.exp(-6*tN)*mod;
      return 21000*env*lp;
    });
  }},

  // 8. Mjuk dismiss — en kort men tydlig "fsh" luftstöt (inte för aggressiv)
  { name: 'Fsh (mjuk luftstöt, 220ms)', gen: () => {
    const totalSamples = Math.floor(SR*0.22);
    let lp = 0;
    return Array.from({length: totalSamples}, (_, i) => {
      const tN = i/totalSamples;
      const cutoff = 5000*Math.pow(300/5000, tN);
      const a = 1/(1+SR/(2*Math.PI*cutoff));
      lp = lp+a*((Math.random()*2-1)-lp);
      const env = Math.min(tN/0.03,1)*Math.exp(-6*tN);
      return 22000*env*lp;
    });
  }},
];

const allSounds = [
  ...checkSounds.map((s, i) => ({ ...s, idx: i+1, label: `PLING ${i+1}`, file: `./sandbox-sounds/check-${i+1}.wav` })),
  ...deleteSounds.map((s, i) => ({ ...s, idx: i+1+checkSounds.length, label: `RADERA ${i+1}`, file: `./sandbox-sounds/delete-${i+1}.wav` })),
];

console.log('\nGenererar ljud...');
allSounds.forEach(s => writeFileSync(s.file, makeWav(s.gen())));

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  LJUD-SANDBOX v5');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n🔔 PLING (1-4): dubbel-ding och kristall på 0.9x och full volym');
checkSounds.forEach((s, i) => console.log(`  ${i+1}. ${s.name}`));
console.log('\n🗑  RADERA (5-12): 8 nya karaktärer');
deleteSounds.forEach((s, i) => console.log(`  ${i+1+checkSounds.length}. ${s.name}`));
console.log('\n"c" = alla plings  "d" = alla radera  "a" = alla  "q" = avsluta\n');

function play(file) {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -c "(New-Object Media.SoundPlayer '${file.replace(/\//g, '\\\\')}').PlaySync()"`, { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      execSync(`afplay "${file}"`, { stdio: 'ignore' });
    } else {
      execSync(`aplay "${file}"`, { stdio: 'ignore' });
    }
  } catch { console.log('  (Kunde inte spela — öppna filen manuellt från ./sandbox-sounds/)'); }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', input => {
  const cmd = input.trim().toLowerCase();
  if (cmd === 'q') { console.log('Hejdå!'); rl.close(); process.exit(0); }
  if (cmd === 'a') { allSounds.forEach(s => { process.stdout.write(`  ▶ ${s.label}: ${s.name}\n`); play(s.file); }); return; }
  if (cmd === 'c') { allSounds.filter(s=>s.label.startsWith('PLING')).forEach(s => { process.stdout.write(`  ▶ ${s.label}: ${s.name}\n`); play(s.file); }); return; }
  if (cmd === 'd') { allSounds.filter(s=>s.label.startsWith('RADERA')).forEach(s => { process.stdout.write(`  ▶ ${s.label}: ${s.name}\n`); play(s.file); }); return; }
  const idx = parseInt(cmd);
  const sound = allSounds.find(s => s.idx === idx);
  if (sound) { process.stdout.write(`  ▶ ${sound.label}: ${sound.name}\n`); play(sound.file); }
  else console.log(`  Välj 1–${allSounds.length}, "c", "d", "a" eller "q".`);
});
