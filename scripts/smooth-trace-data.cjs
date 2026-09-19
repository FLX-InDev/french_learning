#!/usr/bin/env node
/**
 * Smooth trace stroke data without changing the authoring source.
 *
 * Default output:
 *   tools/.out/letter-strokes.smoothed.json
 *
 * The script is intentionally conservative:
 * - only cursive entries are processed by default;
 * - stroke first/last points are kept stable;
 * - connect.entry/connect.exit are rebuilt from the first/last base stroke;
 * - source metadata is annotated so candidates are easy to audit.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_IN = path.join(ROOT, "data", "trace", "letter-strokes.json");
const DEFAULT_OUT = path.join(ROOT, "tools", ".out", "letter-strokes.smoothed.json");

const argv = process.argv.slice(2);

function argValue(name, fallback) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  if (hit === `--${name}`) return true;
  return hit.slice(name.length + 3);
}

const IN_FILE = path.resolve(process.cwd(), argValue("in", DEFAULT_IN));
const OUT_FILE = path.resolve(process.cwd(), argValue("out", DEFAULT_OUT));
const styleFilter = argValue("style", "cursive");
const onlyArg = argValue("only", "");
const onlyRe = onlyArg ? new RegExp(String(onlyArg)) : null;
const rdpEps = Number(argValue("epsilon", 1.1));
const maxPoints = Number(argValue("max-points", 24));
const minPoints = Number(argValue("min-points", 6));
const sampleStep = Number(argValue("step", 4.2));
const smoothPasses = Number(argValue("passes", 2));
const dry = argv.includes("--dry");

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isPoint(p) {
  return Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
}

function cleanPoints(points) {
  const out = [];
  for (const p of points) {
    if (!isPoint(p)) continue;
    const q = [round1(clamp(p[0], 0, 100)), round1(clamp(p[1], 0, 100))];
    if (!out.length || dist(out[out.length - 1], q) >= 0.4) out.push(q);
  }
  if (out.length >= 2 && samePoint(out[0], out[out.length - 1])) return out;
  return out;
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let bestIdx = -1;
  let bestDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestDist > eps && bestIdx > 0) {
    return rdp(points.slice(0, bestIdx + 1), eps)
      .slice(0, -1)
      .concat(rdp(points.slice(bestIdx), eps));
  }
  return [first, last];
}

function catmullRom(points) {
  if (points.length < 3) return points.slice();
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const steps = Math.max(4, Math.ceil(dist(p1, p2) / 1.8));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([clamp(x, 0, 100), clamp(y, 0, 100)]);
    }
  }
  return out;
}

function movingAverage(points, passes) {
  if (points.length < 5) return points.slice();
  let cur = points.slice();
  for (let pass = 0; pass < passes; pass++) {
    const next = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      next.push([
        cur[i - 1][0] * 0.25 + cur[i][0] * 0.5 + cur[i + 1][0] * 0.25,
        cur[i - 1][1] * 0.25 + cur[i][1] * 0.5 + cur[i + 1][1] * 0.25,
      ]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

function arcLengths(points) {
  const acc = [0];
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1] + dist(points[i - 1], points[i]));
  return acc;
}

function resample(points, targetCount) {
  if (points.length < 2) return points.slice();
  const acc = arcLengths(points);
  const total = acc[acc.length - 1];
  if (total <= 0.001) return [points[0], points[points.length - 1]];
  const out = [];
  let j = 1;
  for (let k = 0; k < targetCount; k++) {
    const t = (total * k) / (targetCount - 1);
    while (j < acc.length - 1 && acc[j] < t) j += 1;
    const prev = points[j - 1];
    const next = points[j];
    const span = acc[j] - acc[j - 1] || 1;
    const r = (t - acc[j - 1]) / span;
    out.push([
      round1(clamp(prev[0] + (next[0] - prev[0]) * r, 0, 100)),
      round1(clamp(prev[1] + (next[1] - prev[1]) * r, 0, 100)),
    ]);
  }
  return out;
}

function strokeLength(points) {
  return arcLengths(points).at(-1) || 0;
}

function smoothStroke(points) {
  const clean = cleanPoints(points);
  if (clean.length < 2) return clean;
  if (clean.length === 2) return clean.map((p) => [round1(p[0]), round1(p[1])]);

  const first = clean[0];
  const last = clean[clean.length - 1];
  const simplified = rdp(clean, rdpEps);
  const basis = simplified.length >= 3 ? simplified : clean;
  const dense = movingAverage(catmullRom(basis), smoothPasses);
  const total = strokeLength(dense);
  const target = clamp(Math.round(total / sampleStep) + 1, minPoints, maxPoints);
  const sampled = resample(dense, target);

  sampled[0] = first;
  sampled[sampled.length - 1] = last;
  return sampled;
}

function shouldProcess(key, entry) {
  if (!entry || typeof entry !== "object") return false;
  if (styleFilter !== "all" && entry.style !== styleFilter) return false;
  if (onlyRe && !onlyRe.test(key)) return false;
  return Array.isArray(entry.strokes);
}

function processEntry(key, entry) {
  const before = entry.strokes.reduce((n, s) => n + (Array.isArray(s.points) ? s.points.length : 0), 0);
  const next = JSON.parse(JSON.stringify(entry));
  next.strokes = next.strokes.map((stroke) => ({
    ...stroke,
    points: smoothStroke(stroke.points),
  }));

  const bases = next.strokes.filter((s) => s.kind === "base" && Array.isArray(s.points) && s.points.length >= 2);
  if (next.style === "cursive" && bases.length) {
    next.connect = {
      entry: bases[0].points[0].slice(),
      exit: bases[bases.length - 1].points[bases[bases.length - 1].points.length - 1].slice(),
    };
  }

  next.source = {
    ...(next.source || {}),
    note: `${next.source?.note ? `${next.source.note}；` : ""}smoothed via scripts/smooth-trace-data.cjs (epsilon=${rdpEps}, step=${sampleStep})`,
  };

  const after = next.strokes.reduce((n, s) => n + s.points.length, 0);
  return { entry: next, before, after };
}

if (!fs.existsSync(IN_FILE)) {
  console.error(`Missing input file: ${IN_FILE}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
const out = {};
let processed = 0;
let beforePoints = 0;
let afterPoints = 0;

for (const [key, entry] of Object.entries(data)) {
  if (key === "_meta") continue;
  if (!shouldProcess(key, entry)) {
    out[key] = entry;
    continue;
  }
  const result = processEntry(key, entry);
  out[key] = result.entry;
  processed += 1;
  beforePoints += result.before;
  afterPoints += result.after;
}

out._meta = {
  ...(data._meta || {}),
  smoothing: {
    source: path.relative(ROOT, IN_FILE),
    generator: "scripts/smooth-trace-data.cjs",
    style: styleFilter,
    only: onlyArg || null,
    epsilon: rdpEps,
    sampleStep,
    minPoints,
    maxPoints,
    smoothPasses,
    generatedAt: new Date().toISOString(),
    note: "Non-destructive candidate generated from existing trace data. Review visually before replacing production letter-strokes.json.",
  },
};

if (!dry) {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
}

console.log(`${dry ? "[dry] " : ""}Processed ${processed} entries from ${path.relative(ROOT, IN_FILE)}`);
console.log(`Point count: ${beforePoints} -> ${afterPoints}`);
if (!dry) console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
