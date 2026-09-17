# -*- coding: utf-8 -*-
"""cursive 笔序校正：用 cursive.jpeg 的教学笔序规范（modlens 视觉提取）校正 Borel 骨架数据。

原理：
  - Borel 数据每字母有 1-5 个骨架片段（形状正确、方向/顺序错误）；
  - 教学笔序规范（26 字母起点方位 + 笔画数）决定片段的拼接顺序与方向；
  - 输出：每字母 1 条 base 路径（x 为 2 条），片段端点邻近拼接，方向从规范起点出发。

用法：python -u tools/cursive-fix-from-image.py
输出：data/trace/letter-strokes.borel.corrected.json + tools/.out/fix-report.txt
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "trace" / "letter-strokes.borel.json"
OUT = ROOT / "data" / "trace" / "letter-strokes.borel.corrected.json"
REPORT = ROOT / "tools" / ".out" / "fix-report.txt"

# ── 教学笔序规范（来自 cursive.jpeg，modlens 视觉提取）────────────
# start: 起点锚点 (x, y) 归一化坐标（guides: baseline=65, xHeight=34）
# n: base 笔画数（法语 cursive 基本 1 笔；x 为 2 笔）
# conflict: Borel 形状与教学规范明显冲突，需人工
RULES = {
    "a": dict(start=(72, 38), n=1, ccw=True),
    "b": dict(start=(28, 63), n=1),
    "c": dict(start=(70, 36), n=1, ccw=True),
    "d": dict(start=(70, 36), n=1, ccw=True),
    "e": dict(start=(35, 56), n=1),
    "f": dict(start=(50, 48), n=1),
    "g": dict(start=(72, 38), n=1, ccw=True),
    "h": dict(start=(28, 63), n=1),
    "i": dict(start=(50, 36), n=1, note="竖顶起"),
    "j": dict(start=(30, 62), n=1, note="左侧起"),
    "k": dict(start=(28, 63), n=1),
    "l": dict(start=(28, 63), n=1),
    "m": dict(start=(22, 62), n=1),
    "n": dict(start=(24, 62), n=1),
    "o": dict(start=(72, 38), n=1, ccw=True),
    "p": dict(start=(32, 60), n=1),
    "q": dict(start=(72, 38), n=1, ccw=True),
    "r": dict(start=(28, 63), n=1),
    "s": dict(start=(28, 63), n=1),
    "t": dict(start=(28, 63), n=1),
    "u": dict(start=(28, 63), n=1),
    "v": dict(start=(28, 63), n=1),
    "w": dict(start=(28, 63), n=1),
    "x": dict(start=[(30, 50), (70, 50)], n=2, note="两笔"),
    "y": dict(start=(28, 63), n=1),
    "z": dict(start=(28, 63), n=1),
}


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def pick_start(fragments, anchor):
    """在所有片段端点中选最接近 anchor 的端点，返回 (frag_idx, end_idx)"""
    best = None
    for fi, f in enumerate(fragments):
        for ei in (0, -1):
            d = dist(f[ei], anchor)
            if best is None or d < best[0]:
                best = (d, fi, ei)
    return best[1], best[2]


def splice_one(fragments, anchor):
    """从 anchor 起点拼接全部片段为一条路径。
    贪心端点邻近 + 右流约束（法语 cursive 走向总体向右）。
    返回路径点列。"""
    if not fragments:
        return []
    frags = [list(f) for f in fragments if len(f) >= 6]  # 过滤噪声短片段
    if not frags:
        return []
    fi, ei = pick_start(frags, anchor)
    path = list(frags.pop(fi))
    if ei == -1:
        path.reverse()
    while frags:
        tail = path[-1]
        best = None
        for gi, g in enumerate(frags):
            for ej in (0, -1):
                d = dist(g[ej], tail)
                # 右流约束：连接点 x 比当前尾端更大 → 加分（-惩罚）
                pen = -0.8 * (g[ej][0] - tail[0])
                score = d + pen
                if best is None or score < best[0]:
                    best = (score, gi, ej)
        gi, ej = best[1], best[2]
        seg = list(frags.pop(gi))
        if ej == -1:
            seg.reverse()
        path = path + seg[1:]
    return path


def resample(points, n_min=6, n_max=24, step=3.0):
    """按弧长重采样到 n_min-n_max 点"""
    if len(points) < 2:
        return points
    cum = [0.0]
    for i in range(1, len(points)):
        cum.append(cum[-1] + dist(points[i - 1], points[i]))
    total = cum[-1]
    if total < 1e-6:
        return points
    n = max(n_min, min(n_max, int(round(total / step)) + 1))
    out = []
    for k in range(n):
        t = total * k / (n - 1)
        j = 1
        while j < len(cum) - 1 and cum[j] < t:
            j += 1
        r = (t - cum[j - 1]) / (cum[j] - cum[j - 1] + 1e-9)
        a, b = points[j - 1], points[j]
        out.append([round(a[0] + (b[0] - a[0]) * r, 1), round(a[1] + (b[1] - a[1]) * r, 1)])
    return out


def simplify(points, tol=1.2):
    """RDP 简化"""
    if len(points) < 3:
        return points

    def seg_dist(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        l2 = dx * dx + dy * dy
        if l2 == 0:
            return dist(p, a)
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        return dist(p, (a[0] + t * dx, a[1] + t * dy))

    first, last = points[0], points[-1]
    idx, maxd = -1, 0
    for i in range(1, len(points) - 1):
        d = seg_dist(points[i], first, last)
        if d > maxd:
            maxd, idx = d, i
    if maxd > tol and idx > 0:
        a = simplify(points[: idx + 1], tol)
        b = simplify(points[idx:], tol)
        return a[:-1] + b
    return [first, last]


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    report = []
    out = {}
    # 变音 → 基础字母映射（base 复用校正后的基础字母）
    ACCENT_BASE = {"é": "e", "è": "e", "ê": "e", "à": "a", "ù": "u", "î": "i", "ô": "o", "ç": "c"}
    fixed_base = {}  # ch -> 校正后 base 点列
    for key, g in data.items():
        if key == "_meta" or not key.startswith("cursive:") or not g:
            continue
        ch = key.split(":")[1]
        if ch in ACCENT_BASE:
            continue
        rule = RULES.get(ch)
        if not rule:
            continue
        base = [s["points"] for s in g["strokes"] if s["kind"] == "base"]
        if not base:
            continue
        if rule["n"] == 2:
            anchors = rule["start"]
            groups = [[], []]
            for f in base:
                d0 = min(dist(f[0], anchors[0]), dist(f[-1], anchors[0]))
                d1 = min(dist(f[0], anchors[1]), dist(f[-1], anchors[1]))
                groups[0 if d0 <= d1 else 1].append(f)
            strokes = []
            for gi in range(2):
                p = splice_one(groups[gi], anchors[gi])
                if p:
                    strokes.append(p)
        else:
            strokes = [splice_one(base, rule["start"])]
        new_base = []
        for p in strokes:
            sp = simplify(p)
            sp = resample(sp)
            if len(sp) >= 2:
                new_base.append(sp)
        fixed_base[ch] = new_base

    for key, g in data.items():
        if key == "_meta":
            out[key] = g
            continue
        if not key.startswith("cursive:") or not g:
            out[key] = g
            continue
        ch = key.split(":")[1]
        if ch in ACCENT_BASE:
            # 变音：base = 校正后基础字母，diacritic 保留原音符
            base_strokes = fixed_base.get(ACCENT_BASE[ch], [])
            accents = [s["points"] for s in g["strokes"] if s["kind"] == "diacritic"]
            if not base_strokes:
                out[key] = g
                continue
            new_g = dict(g)
            new_g["strokes"] = [
                {"kind": "base", "points": p} for p in base_strokes
            ] + [{"kind": "diacritic", "points": a} for a in accents]
            new_g["connect"] = {
                "entry": list(base_strokes[0][0]),
                "exit": list(base_strokes[-1][-1]),
            }
            new_g["source"] = dict(
                g.get("source", {}),
                by="Borel 提取 + 图片教学笔序校正（modlens）",
                note=f"base 复用校正后 {ACCENT_BASE[ch]}；音符保留；需教师复核",
            )
            out[key] = new_g
            report.append(f"{ch}: base=校正后{ACCENT_BASE[ch]} 音符{len(accents)}笔")
            continue
        rule = RULES.get(ch)
        if not rule:
            out[key] = g
            continue
        base = [s["points"] for s in g["strokes"] if s["kind"] == "base"]
        accents = [s["points"] for s in g["strokes"] if s["kind"] == "diacritic"]
        if not base:
            out[key] = g
            continue
        new_base = fixed_base.get(ch, [])
        if not new_base:
            out[key] = g
            continue
        new_g = dict(g)
        new_g["strokes"] = [
            {"kind": "base", "points": p} for p in new_base
        ] + [{"kind": "diacritic", "points": a} for a in accents]
        if new_base and new_g["style"] == "cursive":
            new_g["connect"] = {
                "entry": list(new_base[0][0]),
                "exit": list(new_base[-1][-1]),
            }
        new_g["source"] = dict(
            g.get("source", {}),
            by="Borel 提取 + 图片教学笔序校正（modlens）",
            note=f"起点={rule['start']}；{rule.get('note', '')}片段拼接校正；需教师复核",
        )
        out[key] = new_g
        report.append(
            f"{ch}: {len(base)}片段→{len(new_base)}笔 起点={rule['start']} "
            f"{'⚠'+rule.get('note','') if rule.get('note') else ''}"
        )
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(report), "utf-8")
    print("✅ 已写入", OUT)
    print("\n".join(report))


if __name__ == "__main__":
    main()
