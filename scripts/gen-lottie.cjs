/**
 * 生成 Lottie 资产（Phase 4 / Dev-Plan T4.1）
 *
 * 用确定性脚本手写最小可用的 Lottie 形状动画，替代外部资产依赖：
 * - felix-idle / felix-happy / felix-encourage：小狐狸 Félix 三态（_idle 呼吸浮动 / happy 弹跳 / encourage 摇头鼓励）
 * - confetti：撒花（≤1.5s，CSS/Canvas 之外的第三种实现保留备用——运行时主体用 CSS Confetti，本文件为 Mascot 体系备用）
 *
 * 体积约束：单文件 ≤ 100KB、合计 ≤ 500KB（PRD §7.3 验收），实际各 ~5KB。
 * 运行：node scripts/gen-lottie.cjs
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "lottie");
fs.mkdirSync(OUT, { recursive: true });

// ── 形状构造辅助 ────────────────────────────────────────────────
const fill = (hex, o = 100) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    ty: "fl",
    c: { a: 0, k: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1] },
    o: { a: 0, k: o },
    r: 1,
    nm: "fill",
    hd: false,
  };
};
const transform = () => ({
  ty: "tr",
  p: { a: 0, k: [0, 0] },
  a: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 },
  o: { a: 0, k: 100 },
});
const ellipse = (cx, cy, rx, ry, hex) => ({
  ty: "gr",
  nm: "e",
  np: 2,
  cix: 2,
  bm: 0,
  ix: 1,
  hd: false,
  it: [
    { ty: "el", d: 1, s: { a: 0, k: [rx * 2, ry * 2] }, p: { a: 0, k: [cx, cy] }, nm: "el", hd: false },
    fill(hex),
    transform(),
  ],
});
const triangle = (pts, hex) => ({
  ty: "gr",
  nm: "t",
  np: 2,
  cix: 2,
  bm: 0,
  ix: 1,
  hd: false,
  it: [
    {
      ty: "sh",
      d: 1,
      ks: {
        a: 0,
        k: {
          c: true,
          v: pts,
          i: pts.map(() => [0, 0]),
          o: pts.map(() => [0, 0]),
        },
      },
      nm: "sh",
      hd: false,
    },
    fill(hex),
    transform(),
  ],
});

// 关键帧辅助（值数组 + 帧序列）
const kf = (frames) => ({
  a: 1,
  k: frames.map(([t, s], i) =>
    i === frames.length - 1
      ? { t, s }
      : {
          i: { x: [0.42], y: [1] },
          o: { x: [0.58], y: [0] },
          t,
          s,
        }
  ),
});
const still = (v) => ({ a: 0, k: v });

// ── Félix 三态（200×200，狐狸脸：双耳 + 头 + 白吻部 + 鼻 + 眼）──
function foxLayer(mood) {
  const shapes = [
    triangle([[38, 84], [58, 18], [96, 52]], "E8790A"), // 左耳
    triangle([[162, 84], [142, 18], [104, 52]], "E8790A"), // 右耳
    ellipse(100, 112, 70, 66, "F97316"), // 头
    ellipse(100, 142, 46, 32, "FFF7ED"), // 吻部
    ellipse(100, 128, 9, 7, "7C2D12"), // 鼻
    ellipse(72, 98, 8, 9, "1F2937"), // 左眼
    ellipse(128, 98, 8, 9, "1F2937"), // 右眼
  ];
  let p, r, s;
  if (mood === "idle") {
    // 呼吸浮动 + 轻微摆头
    p = kf([[0, [100, 118, 0]], [30, [100, 104, 0]], [60, [100, 118, 0]]]);
    r = kf([[0, [0]], [30, [3]], [60, [0]]]);
    s = still([100, 100, 100]);
  } else if (mood === "happy") {
    // 弹跳挤压（squash & stretch）
    p = kf([[0, [100, 130, 0]], [12, [100, 92, 0]], [26, [100, 122, 0]], [40, [100, 100, 0]], [60, [100, 100, 0]]]);
    s = kf([[0, [96, 92, 100]], [12, [110, 106, 100]], [26, [94, 96, 100]], [40, [102, 100, 100]], [60, [100, 100, 100]]]);
    r = kf([[0, [0]], [20, [-4]], [40, [0]], [60, [0]]]);
  } else {
    // encourage：左右摇头 + 小幅上跳两下
    r = kf([[0, [0]], [10, [-12]], [20, [12]], [30, [-8]], [40, [8]], [50, [0]], [60, [0]]]);
    p = kf([[0, [100, 118, 0]], [14, [100, 106, 0]], [28, [100, 116, 0]], [42, [100, 106, 0]], [60, [100, 118, 0]]]);
    s = still([100, 100, 100]);
  }
  return {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: "felix",
    sr: 1,
    ks: { o: still(100), r, p, a: still([100, 115, 0]), s },
    ao: 0,
    shapes,
    ip: 0,
    op: 60,
    st: 0,
  };
}

function makeFelix(mood) {
  return JSON.stringify({
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 60,
    w: 200,
    h: 200,
    nm: `felix-${mood}`,
    ddd: 0,
    assets: [],
    layers: [foxLayer(mood)],
  });
}

// ── 撒花 confetti（400×600，45 帧 ≈ 1.5s，PRD 时长上限）────────
function makeConfetti() {
  // 确定性伪随机
  let seed = 20260907;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const colors = ["EF4444", "F59E0B", "10B981", "3B82F6", "8B5CF6", "EC4899"];
  const layers = [];
  for (let i = 0; i < 14; i++) {
    const x = 16 + rnd() * 368;
    const w = 8 + rnd() * 8;
    const h = 12 + rnd() * 10;
    const delay = Math.floor(rnd() * 12);
    const spin = 180 + Math.floor(rnd() * 360) * (rnd() > 0.5 ? 1 : -1);
    const drift = Math.floor((rnd() - 0.5) * 90);
    layers.push({
      ddd: 0,
      ind: i + 1,
      ty: 4,
      nm: `c${i}`,
      sr: 1,
      ks: {
        o: kf([[30, [100]], [45, [0]]]),
        r: kf([[0, [0]], [45, [spin]]]),
        p: kf([[0, [x, -20, 0]], [45, [x + drift, 620, 0]]]),
        a: still([0, 0, 0]),
        s: still([100, 100, 100]),
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          nm: "p",
          np: 2,
          cix: 2,
          bm: 0,
          ix: 1,
          hd: false,
          it: [
            { ty: "rc", d: 1, s: { a: 0, k: [w, h] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 3 }, nm: "rc", hd: false },
            fill(colors[i % colors.length]),
            transform(),
          ],
        },
      ],
      ip: delay,
      op: 45,
      st: 0,
    });
  }
  return JSON.stringify({
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 45,
    w: 400,
    h: 600,
    nm: "confetti",
    ddd: 0,
    assets: [],
    layers,
  });
}

const files = {
  "felix-idle.json": makeFelix("idle"),
  "felix-happy.json": makeFelix("happy"),
  "felix-encourage.json": makeFelix("encourage"),
  "confetti.json": makeConfetti(),
};
let total = 0;
for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), data);
  total += Buffer.byteLength(data);
  console.log(`${name}  ${(Buffer.byteLength(data) / 1024).toFixed(1)} KB`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB (budget 500 KB)`);
