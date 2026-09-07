/**
 * 生成音效 WAV（Phase 4 / Dev-Plan T4.2 触发矩阵）
 *
 * 触发矩阵（PRD §7.3）时长上限逐条生成：
 *   correct 0.45s / encourage 0.7s / star 0.5s / levelup 1.4s / tap 0.15s（默认关）
 * 22050 Hz · 16-bit · 单声道 PCM WAV，每个 ≤ 40KB。
 * 运行：node scripts/gen-sfx.cjs
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "audio", "sfx");
fs.mkdirSync(OUT, { recursive: true });

const SR = 22050;

/** 写 16-bit 单声道 WAV */
function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  const buf = Buffer.concat([header, data]);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB`);
}

const freq = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

/** 一段带衰减包络的正弦音符 */
function note(samples, startSec, durSec, midi, amp) {
  const f = freq(midi);
  const start = Math.floor(startSec * SR);
  const len = Math.floor(durSec * SR);
  for (let i = 0; i < len && start + i < samples.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 6) * (1 - Math.exp(-t * 400)); // 快起慢衰
    samples[start + i] += Math.sin(2 * Math.PI * f * t) * amp * env;
  }
}

function seconds(d) {
  return new Array(Math.floor(d * SR)).fill(0);
}

// correct：E6 → G6 双上行音（0.45s）
{
  const s = seconds(0.45);
  note(s, 0, 0.22, 88, 0.5);
  note(s, 0.2, 0.25, 91, 0.55);
  writeWav("correct.wav", s);
}
// encourage：柔和下行 A4 → E4（0.7s，低幅度，不吓到孩子）
{
  const s = seconds(0.7);
  note(s, 0, 0.32, 69, 0.32);
  note(s, 0.32, 0.36, 64, 0.3);
  writeWav("encourage.wav", s);
}
// star：A6 亮铃 + 泛音（0.5s）
{
  const s = seconds(0.5);
  note(s, 0, 0.45, 93, 0.45);
  note(s, 0, 0.3, 105, 0.12);
  writeWav("star.wav", s);
}
// levelup：C5-E5-G5-C6 上行琶音（1.4s）
{
  const s = seconds(1.4);
  note(s, 0, 0.34, 72, 0.42);
  note(s, 0.32, 0.34, 76, 0.44);
  note(s, 0.64, 0.34, 79, 0.46);
  note(s, 0.96, 0.44, 84, 0.5);
  writeWav("levelup.wav", s);
}
// tap：极短轻响（0.15s）
{
  const s = seconds(0.15);
  note(s, 0, 0.06, 84, 0.25);
  writeWav("tap.wav", s);
}
console.log("done");
