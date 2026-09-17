# -*- coding: utf-8 -*-
"""
Borel cursive 骨架笔顺提取（内容轨工具 · T6-08 / trace-data-spec v1.6）

输入:  tools/fonts/Borel-Regular.ttf  (Borel, Rosalie Wagner, SIL OFL 1.1)
输出:  data/trace/letter-strokes.borel.json   —— 34 个 cursive 字形草稿
       data/trace/preview-borel.html          —— 人工校对预览（离线单文件）
       tools/.out/contact-sheet.png           —— 自检图（四线格 + 笔画序号 + 方向箭头）

原理：TTF 只存填充轮廓不存笔顺；法式 cursive 为一笔等宽连笔，
对字形掩码做 Zhang-Suen 骨架化得到中心线 ≈ 运笔路径，
再拆分独立连通域（i/j 点、ç 软音符、变音音符 = diacritic）并定向。

⚠ 产物为草稿：仍须按 trace-data-spec §10（11–13）人工校对后方可转正。
"""
import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "tools" / "fonts" / "Borel-Regular.ttf"
OUT_JSON = ROOT / "data" / "trace" / "letter-strokes.borel.json"
OUT_HTML = ROOT / "data" / "trace" / "preview-borel.html"
OUT_SHEET = ROOT / "tools" / ".out" / "contact-sheet.png"

RENDER = 300          # 渲染字号(px)，决定骨架精度
CANVAS_W, CANVAS_H = 450, 650
BASELINE_Y = 450      # 渲染画布基线
PAD_X = 75

# 规格参考线（spec §4）：按 Borel 真实度量自适应推导，
# 上下留 2 单位边距，保证 94 字形集内坐标全部 ∈ [0,100]
ASC_N, DESC_N = 2.0, 98.0
# 传统参考的锚定值仅作注释保留：xHeight 38 / baseline 74
# （Borel 上伸≈2.03×x-height、下伸≈1.05×x-height，无法同时命中 8/38/74/96，
#   按 spec §7.4「线须与字形实际伸展一致」推导。）

BASE_LETTERS = list("abcdefghijklmnopqrstuvwxyz")
ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"]
SOURCE_BY = "内容轨·Borel骨架提取"


# ── 字体与渲染 ────────────────────────────────────────────────

def load_font() -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), RENDER)


def check_cmap(chars):
    from fontTools.ttLib import TTFont
    cmap = TTFont(str(FONT)).getBestCmap()
    missing = [c for c in chars if ord(c) not in cmap]
    if missing:
        sys.exit(f"字体缺少字形: {missing}")


def render_mask(font, ch: str) -> np.ndarray:
    """渲染单字符为二值掩码，基线锚定 BASELINE_Y。"""
    img = Image.new("L", (CANVAS_W, CANVAS_H), 0)
    d = ImageDraw.Draw(img)
    d.text((PAD_X, BASELINE_Y), ch, font=font, fill=255, anchor="ls")
    a = np.asarray(img) > 60  # 低阈值：保住 Borel 的细入笔钩（抗锯齿边缘也计入）
    ys, xs = np.nonzero(a)
    if len(xs) == 0:
        sys.exit(f"空字形: {ch!r}")
    return a


def glyph_metrics(font) -> dict:
    """从渲染像素度量四线格（Borel 直立、ascender≈2×x-height）。"""
    def top(ch):
        a = render_mask(font, ch)
        return np.nonzero(a)[0].min()

    def bottom(ch):
        a = render_mask(font, ch)
        return np.nonzero(a)[0].max()

    xh_px = BASELINE_Y - top("x")
    asc_px = BASELINE_Y - min(top(c) for c in "bdlhk")
    desc_px = max(bottom(c) for c in "gjpqyz") - BASELINE_Y
    return {"xh": xh_px, "asc": asc_px, "desc": desc_px}


# ── 骨架化 ────────────────────────────────────────────────────

def thinning(img: np.ndarray) -> np.ndarray:
    """Zhang-Suen 细化（numpy 向量化）。"""
    img = img.astype(np.uint8)
    changed = True
    nb = [
        (0, 1), (-1, 1), (-1, 0), (-1, -1),
        (0, -1), (1, -1), (1, 0), (1, 1),
    ]  # P2..P9 顺序
    while changed:
        changed = False
        for step in (0, 1):
            p = [np.roll(np.roll(img, -dy, 0), -dx, 1) for dy, dx in nb]
            p2, p3, p4, p5, p6, p7, p8, p9 = p
            b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            a = sum(
                ((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8)
                for i in range(8)
            )
            cond = (
                (img == 1) & (b >= 2) & (b <= 6) & (a == 1)
                & (
                    ((p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0))
                    if step == 0
                    else ((p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0))
                )
            )
            if cond.any():
                img[cond] = 0
                changed = True
    return img.astype(bool)


def _nbrs(sk, p):
    y, x = p
    return [
        (y + dy, x + dx)
        for dy in (-1, 0, 1) for dx in (-1, 0, 1)
        if (dy, dx) != (0, 0)
        and 0 <= y + dy < sk.shape[0]
        and 0 <= x + dx < sk.shape[1]
        and sk[y + dy, x + dx]
    ]


def _deg_map(sk: np.ndarray) -> np.ndarray:
    H, W = sk.shape
    d = np.zeros(sk.shape, np.int32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ys_d = slice(max(0, -dy), H - max(0, dy))
            ys_s = slice(max(0, dy), H - max(0, -dy))
            xs_d = slice(max(0, -dx), W - max(0, dx))
            xs_s = slice(max(0, dx), W - max(0, -dx))
            d[ys_d, xs_d] += sk[ys_s, xs_s]
    return d


def prune_spurs(skel: np.ndarray, min_len: float) -> np.ndarray:
    """剪短毛刺：反复删除长度 ≤ min_len 的端点分支（保留分叉节点像素）。
    独立小组件（i/j 的点等）整体跳过，避免把点剪没。"""
    sk = skel.copy()
    changed = True
    while changed:
        changed = False
        comps, lbl = components(sk)
        small = np.zeros_like(sk)
        for c in comps:
            if len(c) <= max(12, 2.5 * min_len):
                small[c[:, 0], c[:, 1]] = True
        ds = _deg_map(sk)
        ds[small] = 0  # 小组件不参与剪除
        for ey, ex in list(zip(*np.nonzero(sk & (ds == 1) & ~small))):
            e = (int(ey), int(ex))
            if not sk[e]:
                continue
            path = [e]
            prev, cur = None, e
            stop = "dead"
            while True:
                ns = [p for p in _nbrs(sk, cur) if p != prev and not small[p]]
                if len(ns) >= 3 or len(ns) == 0:
                    stop = "node" if len(ns) >= 3 else "dead"
                    break
                nxt = ns[0]
                dcur = len(_nbrs(sk, nxt))
                prev, cur = cur, nxt
                path.append(cur)
                if dcur >= 3:
                    stop = "node"
                    break
                if dcur == 1:
                    stop = "end2"
                    break
                if len(path) > min_len:
                    stop = "long"
                    break
            if stop in ("node", "dead", "end2") and len(path) <= max(min_len, 2):
                drop = path[:-1] if stop == "node" else path
                for p in drop:
                    sk[p] = False
                changed = True
    return sk


# ── 骨架图 → 笔画 ─────────────────────────────────────────────

def components(mask: np.ndarray):
    """8 连通域标记，返回 [像素坐标数组] 的列表。"""
    from collections import deque
    lbl = np.full(mask.shape, -1, np.int32)
    comps = []
    for y, x in zip(*np.nonzero(mask)):
        if lbl[y, x] != -1:
            continue
        cid = len(comps)
        q = deque([(y, x)])
        lbl[y, x] = cid
        pts = []
        while q:
            cy, cx = q.popleft()
            pts.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if (
                        0 <= ny < mask.shape[0]
                        and 0 <= nx < mask.shape[1]
                        and mask[ny, nx]
                        and lbl[ny, nx] == -1
                    ):
                        lbl[ny, nx] = cid
                        q.append((ny, nx))
        comps.append(np.array(pts))
    return comps, lbl


def walk_edges(skel: np.ndarray):
    """骨架 → 边列表。边 = (points, node_a, node_b)；node = 端点/分叉像素。"""
    ys, xs = np.nonzero(skel)
    deg = {}
    for y, x in zip(ys, xs):
        deg[(y, x)] = sum(
            skel[y + d1, x + d2]
            for d1 in (-1, 0, 1) for d2 in (-1, 0, 1)
            if (d1, d2) != (0, 0)
            and 0 <= y + d1 < skel.shape[0]
            and 0 <= x + d2 < skel.shape[1]
        )
    nodes = {p for p, d in deg.items() if d != 2}
    visited = set()
    edges = []

    def nbrs(p):
        y, x = p
        return [
            (y + d1, x + d2)
            for d1 in (-1, 0, 1) for d2 in (-1, 0, 1)
            if (d1, d2) != (0, 0)
            and 0 <= y + d1 < skel.shape[0]
            and 0 <= x + d2 < skel.shape[1]
            and skel[y + d1, x + d2]
        ]

    for start in nodes:
        for nxt in nbrs(start):
            if (start, nxt) in visited or (nxt, start) in visited:
                continue
            path = [start, nxt]
            visited.add((start, nxt))
            prev, cur = start, nxt
            while cur not in nodes:
                for p in nbrs(cur):
                    if p != prev:
                        visited.add((cur, p))
                        path.append(p)
                        prev, cur = cur, p
                        break
                else:
                    break
            edges.append({"pts": path, "a": path[0], "b": path[-1]})
    return edges


def _vdir(a, b):
    v = np.array([b[1] - a[1], b[0] - a[0]], float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else np.array([1.0, 0.0])


def stitch_paths(paths) -> list:
    """把同属一笔的碎段按端点邻近度拼接为单条折线（长音符 ^ 常断成两半）。"""
    if not paths:
        return []
    segs = [list(p) for p in paths if len(p)]
    if len(segs) == 1:
        return segs[0]
    # 从最靠左的段开始
    segs.sort(key=lambda p: min(q[1] for q in p))
    out = segs.pop(0)
    while segs:
        tail = out[-1]
        best_i, best_d, best_rev = None, 1e18, False
        for i, s in enumerate(segs):
            d1 = (s[0][0] - tail[0]) ** 2 + (s[0][1] - tail[1]) ** 2
            d2 = (s[-1][0] - tail[0]) ** 2 + (s[-1][1] - tail[1]) ** 2
            if d1 < best_d:
                best_i, best_d, best_rev = i, d1, False
            if d2 < best_d:
                best_i, best_d, best_rev = i, d2, True
        s = segs.pop(best_i)
        out = out + (s[::-1] if best_rev else s)
    return out


def merge_nearby(strokes, radius: float = 8.0) -> list:
    """端点邻近的碎段拼回同一笔（贪心追踪在分叉处死端重开造成的断点）。
    真实的多笔字母（如 t 的横杠）端点相距远，不受影响。"""
    sts = [list(s) for s in strokes]
    changed = True
    while changed:
        changed = False
        for i in range(len(sts)):
            for j in range(i + 1, len(sts)):
                combos = []
                for fa in (False, True):
                    for fb in (False, True):
                        a = sts[i][::-1] if fa else sts[i]
                        b = sts[j][::-1] if fb else sts[j]
                        d = (a[-1][0] - b[0][0]) ** 2 + (a[-1][1] - b[0][1]) ** 2
                        combos.append((d, a, b))
                d, a, b = min(combos)
                if d <= radius * radius:
                    sts[i] = a + b[1:]
                    del sts[j]
                    changed = True
                    break
            if changed:
                break
    return sts


def splice_into(strokes, radius: float = 8.0) -> list:
    """碎片端点若落在宿主折线内部（±radius），把碎片插入宿主 ——
    修复「追踪在中途扭结断开、断点位于另一段中部」的情形（如 i 的折返杆）。"""
    sts = sorted((list(s) for s in strokes), key=len, reverse=True)
    changed = True
    while changed:
        changed = False
        for fi in range(1, len(sts)):
            frag = sts[fi]
            best = None  # (dist, host_idx, insert_idx, rev)
            for hi, host in enumerate(sts):
                if hi == fi:
                    continue
                for idx in range(1, len(host) - 1):
                    for end_pt, rev in ((frag[0], False), (frag[-1], True)):
                        d = math.hypot(
                            host[idx][0] - end_pt[0], host[idx][1] - end_pt[1]
                        )
                        if best is None or d < best[0]:
                            best = (d, hi, idx, rev)
            if best and best[0] <= radius:
                _, hi, idx, rev = best
                frag = sts.pop(fi)
                host_idx = hi - 1 if hi > fi else hi
                host = sts[host_idx]
                ins = frag[::-1] if rev else frag
                sts[host_idx] = host[: idx + 1] + ins[1:] + host[idx:]
                changed = True
                break
    return sts


def assemble_strokes(paths_px, base_y_px, norm, min_len=10):
    """碎片图拓扑遍历：从入口走到出口，余段独立成笔。
    返回 (pixel 坐标笔画列表)。"""
    if not paths_px:
        return []
    paths = [p for p in paths_px if len(p) >= 4]
    if len(paths) <= 1:
        return [p for p in paths if len(p) >= min_len]

    eps = {}
    for pi, p in enumerate(paths):
        for pt, is_start in [(p[0], True), (p[-1], False)]:
            k = (round(pt[0]), round(pt[1]))
            eps.setdefault(k, []).append((pi, is_start))
    merged = {}
    nodes = []
    assigned = {}
    for k in eps:
        if k in assigned:
            continue
        comp = [k]
        q = [k]
        assigned[k] = True
        while q:
            cur = q.pop()
            for dy in (-3, 0, 3):
                for dx in (-3, 0, 3):
                    nb = (cur[0] + dy, cur[1] + dx)
                    if nb in eps and nb not in assigned:
                        assigned[nb] = True
                        comp.append(nb)
                        q.append(nb)
        idx = len(nodes)
        nodes.append(comp)
        for c in comp:
            merged[c] = idx

    node_deg = [0] * len(nodes)
    for k, refs in eps.items():
        node_deg[merged[k]] += len(refs)

    def entry_key(ni):
        ys = [k[0] for k in nodes[ni]]
        xs = [k[1] for k in nodes[ni]]
        return -(sum(ys) / len(ys)) + 0.1 * (sum(xs) / len(xs))

    def exit_key(ni):
        ys = [k[0] for k in nodes[ni]]
        xs = [k[1] for k in nodes[ni]]
        return (sum(ys) / len(ys)) - 0.1 * (sum(xs) / len(xs))

    deg1 = [ni for ni, d in enumerate(node_deg) if d == 1]
    if not deg1:
        deg1 = list(range(len(nodes)))
    entry_node = min(deg1, key=entry_key)
    exit_node = min(deg1, key=exit_key)

    used = [False] * len(paths)
    result = []
    cur_node = entry_node

    while True:
        found = False
        for k in nodes[cur_node]:
            if k not in eps:
                continue
            for pi, is_start in eps[k]:
                if used[pi]:
                    continue
                used[pi] = True
                p = paths[pi]
                seg = p if is_start else p[::-1]
                result.extend(seg if not result else seg[1:])
                other_end = p[-1] if is_start else p[0]
                other_k = (round(other_end[0]), round(other_end[1]))
                cur_node = merged.get(other_k, cur_node)
                found = True
                break
            if found:
                break
        if not found:
            break

    strokes = []
    if len(result) >= min_len:
        strokes.append(result)
    # 未使用段独立成笔（如 t 横杠）
    for pi, p in enumerate(paths):
        if not used[pi] and len(p) >= min_len:
            strokes.append(p)
    return strokes


def trace_strokes(skel: np.ndarray, min_len: int = 10) -> list:
    """贪心方向追踪：消耗式行走骨架，分叉处沿最接近当前运笔方向的分支继续。
    比图论合并鲁棒（天然穿过扭结/自交叉），毛刺残段由 min_len 过滤。"""
    sk = skel.copy()

    def nbrs(p):
        y, x = p
        return [
            (y + dy, x + dx)
            for dy in (-1, 0, 1) for dx in (-1, 0, 1)
            if (dy, dx) != (0, 0)
            and 0 <= y + dy < sk.shape[0]
            and 0 <= x + dx < sk.shape[1]
            and sk[y + dy, x + dx]
        ]

    def trace_from(start):
        path = [start]
        sk[start] = False
        prev, cur = None, start
        while True:
            ns = nbrs(cur)
            if not ns:
                break
            if len(ns) == 1:
                nxt = ns[0]
            elif prev is None:
                # 无航向：优先延续度=2 的邻居，减少起步跑进毛刺的概率
                nxt = min(ns, key=lambda p: abs(len(nbrs(p)) - 2))
            else:
                # 平滑航向：最近 8 步的整体方向（抗锯齿扭结干扰）
                k = min(8, len(path) - 1)
                v = _vdir(path[-1 - k], cur)
                nxt = min(ns, key=lambda p: float(np.dot(v, _vdir(cur, p))))
            prev, cur = cur, nxt
            path.append(nxt)
            sk[nxt] = False
        return path

    strokes = []
    # 先从端点（度=1）起笔，再处理纯环
    endpoints = [p for p in zip(*np.nonzero(sk)) if len(nbrs(p)) == 1]
    for p in endpoints:
        if sk[p]:
            strokes.append(trace_from(p))
    while sk.any():
        p = next(zip(*np.nonzero(sk)))
        strokes.append(trace_from(p))
    return [s for s in strokes if len(s) >= min_len]


# ── 采样 / 简化 ───────────────────────────────────────────────

def resample(path, step: float):
    if len(path) < 2:
        return path
    pts = np.array(path, float)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    total = cum[-1]
    if total == 0:
        return path
    n = max(2, int(round(total / step)) + 1)
    t = np.linspace(0, total, n)
    out = []
    for ti in t:
        i = np.searchsorted(cum, ti)
        i = min(i, len(seg) - 1)
        if seg[i] == 0:
            out.append(pts[i])
        else:
            r = (ti - cum[i]) / seg[i]
            out.append(pts[i] * (1 - r) + pts[i + 1] * r)
    return [tuple(p) for p in out]


def dp_simplify(pts, eps):
    if len(pts) < 3:
        return list(pts)
    pts_a = np.array(pts, float)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b, seg = pts_a[i], pts_a[j], pts_a[i + 1: j]
        ab = b - a
        L = np.linalg.norm(ab)
        if L == 0:
            dist = np.linalg.norm(seg - a, axis=1)
        else:
            cross = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0]))
            dist = cross / L
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = i + 1 + k
            keep[m] = True
            stack += [(i, m), (m, j)]
    return [p for p, kk in zip(pts, keep) if kk]


def simplify_to_range(path, lo=6, hi=24):
    for eps in (1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0, 9.0):
        s = dp_simplify(path, eps)
        if lo <= len(s) <= hi:
            return s
    s = dp_simplify(path, 9.0)
    return s if len(s) >= lo else path


# ── 归一化坐标 ────────────────────────────────────────────────

class Norm:
    """渲染像素 → 规格 0–100 坐标（Borel 真实度量，纵向适配 [ASC_N, DESC_N]，水平居中）。"""

    def __init__(self, m, bbox):
        self.s = (DESC_N - ASC_N) / (m["asc"] + m["desc"])
        self.b = DESC_N - m["desc"] * self.s      # 基线的 norm y
        left, right, _, _ = bbox
        self.w_norm = (right - left) * self.s
        self.left = left

    def x(self, px):
        return (px - self.left) * self.s + max(2.0, (100.0 - self.w_norm) / 2)

    def y(self, py):
        return self.b - (BASELINE_Y - py) * self.s

    def pt(self, p):
        return (round(self.x(p[1]), 1), round(self.y(p[0]), 1))


def stroke_direction_start(pts_norm, base_y):
    """起笔端点选择：
    1. Δx<0 → 反转为右流
    2. 垂直下笔（apex→exit, dy>8）→ 顶端优先，不参与 score 比较
    3. 垂直上笔（entry→apex, dy<-8）→ 底端优先（score 低的为底）
    4. 否则 left-bottom 优先
    """
    def score(p): return p[0] + 0.35 * (base_y - p[1])
    dx = pts_norm[-1][0] - pts_norm[0][0]
    dy = pts_norm[-1][1] - pts_norm[0][1]
    if dx < 0:                     # 左流 → 反转
        return -1
    if dy > 8:                     # 下降笔：顶端为起（apex→exit）
        return 0
    if dy < -8:                    # 上升笔：底端优先
        s0, s1 = score(pts_norm[0]), score(pts_norm[-1])
        return 0 if s0 <= s1 else -1
    s0, s1 = score(pts_norm[0]), score(pts_norm[-1])
    return 0 if s0 <= s1 else -1


def order_components(comps_norm):
    """多 base 笔画排序：主体在前，宽扁横杠（t 横）在后。"""
    def is_bar(c):
        xs = [p[0] for p in c]
        ys = [p[1] for p in c]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        cy = sum(ys) / len(ys)
        return w > 8 and h < 6 and cy < GUIDES["xHeight"] + 12 and w > 2.5 * max(h, 1)
    main = [c for c in comps_norm if not is_bar(c)]
    bars = [c for c in comps_norm if is_bar(c)]
    return main + bars


# ── 单字形提取 ────────────────────────────────────────────────

def extract_glyph(font, m, ch, base_strokes=None, accent_mode="auto"):
    """返回 norm 坐标的 {base, accents}。base_strokes 传入则复用，仅提取音符。

    accent_mode: "auto" = ≥2 掩码域时非最大域即音符/点（é î ç i j）；
                 "none" = 全部为 base（无音符的普通字母，t 横杠不拆）。

    结构：渲染（低阈值保细线）→ 形态学闭运算（桥接缺口）→ 按掩码连通域分类
    （点/音符按原始墨迹判断）→ 每域骨架化 + 剪毛刺 + 贪心追踪成笔。"""
    mask = render_mask(font, ch)
    # 闭运算：MaxFilter(膨胀) 桥接 ≤8px 缺口，MinFilter(腐蚀) 还原边界
    # （点/音符与主体的间距 ≥27px，不会被误桥接；e/o 字母内白 ≥30px，不会被填死）
    closed = (
        Image.fromarray(mask.astype(np.uint8) * 255)
        .filter(ImageFilter.MaxFilter(9))
        .filter(ImageFilter.MinFilter(9))
    )
    mask = np.asarray(closed) >= 128
    ys, xs = np.nonzero(mask)
    bbox = (xs.min(), xs.max(), ys.min(), ys.max())
    # 裁 bbox+边距 加速细化；骨架坐标统一加回偏移
    y0 = max(0, int(ys.min()) - 6)
    y1 = min(mask.shape[0], int(ys.max()) + 7)
    x0 = max(0, int(xs.min()) - 6)
    x1 = min(mask.shape[1], int(xs.max()) + 7)
    sub_mask = mask[y0:y1, x0:x1]
    mcomps, _ = components(sub_mask)
    mcomps = [c for c in mcomps if len(c) >= 60]         # 去尘（i 点 ~200px 保留）
    # ç 特例：Borel 的软音符与 c 连体 → 按基线预切掩码（颈部像素归下伸部）
    if accent_mode == "tail_below":
        cut = BASELINE_Y - y0 + 6
        parts = []
        for c in mcomps:
            above = c[c[:, 0] <= cut]
            below = c[c[:, 0] > cut]
            if len(above) >= 60:
                parts.append(above)
            if len(below) >= 30:
                parts.append(below)
        mcomps = parts

    norm = Norm(m, bbox)
    xh_n = norm.b - m["xh"] * norm.s
    total_mask = sum(len(c) for c in mcomps)
    glyph_w_px = bbox[1] - bbox[0]

    strokes_px = []
    accents_px = []
    # 音符判定（按掩码域）：
    #   音符/点 = 除最大域之外的所有域 —— 音符永远小于主体（é 的 acute 2013 < e 9877；
    #   î 的 circumflex < 竖杆；ç 的软音符 < c）。i/j 的点同理。
    #   普通字母（含 t）不拆音符 → t 横杠天然留在 base。
    if accent_mode == "auto" and len(mcomps) >= 2:
        largest = max(range(len(mcomps)), key=lambda i: len(mcomps[i]))
    else:
        largest = None
    for ci, c in enumerate(mcomps):
        is_accent = accent_mode != "none" and largest is not None and ci != largest

        msub = np.zeros_like(sub_mask)
        msub[c[:, 0], c[:, 1]] = True
        skel = thinning(msub)
        thickness = msub.sum() / max(skel.sum(), 1)      # 笔宽估计
        # 剪除阈值 = 笔宽：cursive 字母的真分支（t 横杠等）都是长支，
        # 与运笔同向的短毛刺（竖杆顶端凸起）必须整支剪掉，否则劫持贪心追踪
        skel = prune_spurs(skel, max(8, thickness * 1.0))
        scomps, _ = components(skel)
        # 基础域：先宽松追踪，再把断点 ≤8px 的碎段拼回一笔，最后按长度去噪；
        # 音符/点域全保留（点骨架可能仅 1px）
        if is_accent:
            paths = [
                [(py + y0, px + x0) for py, px in path]
                for path in trace_strokes(skel, min_len=1)
            ]
            if not paths:
                continue
            # 长音符常因笔锋细腰断成数段 → 拼接回一笔
            accents_px.append(stitch_paths(paths))
        else:
            paths = trace_strokes(skel, min_len=4)
            # 路径在裁剪坐标；组装后映射回全局
            assembled = assemble_strokes(paths, BASELINE_Y, norm, min_len=10)
            for p in assembled:
                strokes_px.append([(py + y0, px + x0) for py, px in p])

    # ç 特例：Borel 的软音符与 c 连体（勾尾垂到基线下）→ 按基线切分，
    # 尾部（全部低于基线）归 diacritic。切分点 = 路径中最后一个 ≤ 基线的位置。
    if accent_mode == "tail_below":
        cut_y = BASELINE_Y + 4
        nb, na = [], []
        for p in strokes_px:
            last_above = max(
                (i for i, q in enumerate(p) if q[0] <= cut_y), default=None
            )
            if last_above is None:
                na.append(p)
            elif last_above < len(p) - 1 and min(q[0] for q in p[last_above + 1:]) > cut_y:
                nb.append(p[: last_above + 1])
                na.append(p[last_above + 1 :])
            else:
                nb.append(p)
        strokes_px, accents_px = nb, accents_px + na

    def to_stroke(p, step):
        r = resample(p, step=step)
        r = simplify_to_range(r)
        pts = [norm.pt(q) for q in r]
        if len(pts) == 1:                                # 点：规格允许重合点，但需 ≥2
            pts = [pts[0], pts[0]]
        if len(pts) < 2:
            return None
        i = stroke_direction_start(pts, norm.b)
        return pts if i == 0 else pts[::-1]

    out_base = []
    if base_strokes is not None:
        out_base = [list(s) for s in base_strokes]
    else:
        comps_norm = [
            s for s in (to_stroke(p, max(2.5, RENDER * 0.005)) for p in strokes_px)
            if s
        ]
        out_base = order_components(comps_norm)

    out_acc = [
        s for s in (to_stroke(p, max(2.0, RENDER * 0.004)) for p in accents_px) if s
    ]

    return {"base": out_base, "accents": out_acc, "norm": norm}


def glyph_object(key, glyph, strokes, accents, slant=0.0):
    base_all = [p for s in strokes for p in ([s[0], s[-1]])]
    entry, exitp = strokes[0][0], strokes[-1][-1]
    return {
        "key": key,
        "glyph": glyph,
        "style": "cursive",
        "langs": ["fr"],
        "viewBox": {"w": 100, "h": 100},
        "guides": GUIDES,
        "strokes": [
            *[{"kind": "base", "points": s} for s in strokes],
            *[{"kind": "diacritic", "points": s} for s in accents],
        ],
        "connect": {"entry": list(entry), "exit": list(exitp)},
        "source": {
            "by": SOURCE_BY,
            "date": date.today().isoformat(),
            "note": (
                "骨架自动提取自 Borel 字体（Rosalie Wagner, SIL OFL 1.1）；"
                "Borel 直立字身，slant=0。草稿：待法语母语者/教师按 spec §10.11–13 校对。"
            ),
        },
    }


# ── 主流程 ────────────────────────────────────────────────────

def main():
    global GUIDES
    chars = BASE_LETTERS + ACCENTED
    check_cmap(chars)
    font = load_font()
    m = glyph_metrics(font)

    s = (DESC_N - ASC_N) / (m["asc"] + m["desc"])
    base_n = DESC_N - m["desc"] * s
    xh_n = base_n - m["xh"] * s
    GUIDES = {
        "ascender": int(round(ASC_N)),
        "capHeight": int(round(ASC_N)),
        "xHeight": int(round(xh_n)),
        "baseline": int(round(base_n)),
        "descender": int(round(DESC_N)),
        "slant": 0,
    }
    print(f"度量: xh={m['xh']}px asc={m['asc']}px desc={m['desc']}px → guides={GUIDES}")

    skeletons = {}
    for ch in BASE_LETTERS:
        mode = "auto" if ch in ("i", "j") else "none"
        g = extract_glyph(font, m, ch, accent_mode=mode)
        skeletons[ch] = g
        print(f"  {ch}: base={len(g['base'])} 笔, acc={len(g['accents'])}")

    data = {"_meta": {
        "spec": "docs/phase-6/trace-data-spec.md",
        "contract": "docs/phase-6/CONTEXT.md §2.7（契约 G）",
        "version": "v1.6-draft-borel",
        "font": "Borel-Regular.ttf (Rosalie Wagner, SIL OFL 1.1, tools/fonts/)",
        "method": "Zhang-Suen 骨架化 + 连通域拆笔（tools/borel-stroke-extract.py）",
        "glyphCount": 34,
        "note": "DRAFT：34 个 cursive 字形草稿，print 数据不在本文件；转正前须人工校对。",
    }}

    for ch in BASE_LETTERS:
        g = skeletons[ch]
        data[f"cursive:{ch}"] = glyph_object(f"cursive:{ch}", ch, g["base"], g["accents"])

    for ch in ACCENTED:
        base_ch = {"é": "e", "è": "e", "ê": "e", "à": "a", "ù": "u", "î": "i", "ô": "o", "ç": "c"}[ch]
        base_strokes = skeletons[base_ch]["base"]
        mode = "tail_below" if ch == "ç" else "auto"
        g = extract_glyph(font, m, ch, base_strokes=base_strokes, accent_mode=mode)
        data[f"cursive:{ch}"] = glyph_object(f"cursive:{ch}", ch, g["base"], g["accents"])
        print(f"  {ch}: base={len(g['base'])} 笔(复用 {base_ch}), acc={len(g['accents'])}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"✓ {OUT_JSON.relative_to(ROOT)} ({len(data)-1} 字形)")

    build_contact_sheet(data)
    build_preview(data)
    print(f"✓ {OUT_SHEET}")
    print(f"✓ {OUT_HTML}")
    validate_and_coverage(data, font, m)


def validate_and_coverage(data, font, m):
    """规格 §10 自动化规则全检 + 笔画重建掩码与原字形的 IoU 覆盖率。"""
    print("── 规格校验（§10 自动化项）──")
    glyph_keys = [k for k in data if k != "_meta"]
    problems = []
    assert len(glyph_keys) == 34, f"cursive 字形数应为 34，实际 {len(glyph_keys)}"
    for key in glyph_keys:
        g = data[key]
        tag = key
        if g["key"] != key:
            problems.append(f"{tag}: key 不一致")
        if g["style"] != "cursive" or g["langs"] != ["fr"]:
            problems.append(f"{tag}: style/langs 错误")
        gd = g["guides"]
        if not (0 <= gd["ascender"] <= gd["capHeight"] < gd["xHeight"]
                < gd["baseline"] < gd["descender"] <= 100):
            problems.append(f"{tag}: guides 不单调 {gd}")
        if not (0 <= gd.get("slant", 0) <= 45):
            problems.append(f"{tag}: slant 越界")
        kinds = [s["kind"] for s in g["strokes"]]
        if "diacritic" in kinds and "base" not in kinds[: kinds.index("diacritic")]:
            problems.append(f"{tag}: diacritic 不在 base 之后")
        if not g["source"].get("by") or not g["source"].get("date"):
            problems.append(f"{tag}: source 缺失")
        for si, s in enumerate(g["strokes"]):
            if len(s["points"]) < 2:
                problems.append(f"{tag} 第{si+1}笔: 点数 <2")
            for p in s["points"]:
                if not (0 <= p[0] <= 100 and 0 <= p[1] <= 100):
                    problems.append(f"{tag} 第{si+1}笔: 坐标越界 {p}")
                    break
        base_strokes = [s for s in g["strokes"] if s["kind"] == "base"]
        if g["style"] == "cursive":
            cn = g.get("connect")
            if not cn:
                problems.append(f"{tag}: 缺 connect")
            else:
                e0 = base_strokes[0]["points"][0]
                e1 = base_strokes[-1]["points"][-1]
                if math.hypot(cn["entry"][0] - e0[0], cn["entry"][1] - e0[1]) > 2:
                    problems.append(f"{tag}: connect.entry ≠ 首笔首点")
                if math.hypot(cn["exit"][0] - e1[0], cn["exit"][1] - e1[1]) > 2:
                    problems.append(f"{tag}: connect.exit ≠ 末笔末点")

    print("── IoU 覆盖率（笔画重建 vs 原字形，≥0.72 及格）──")
    ious = {}
    for key in glyph_keys:
        ch = data[key]["glyph"]
        mask = render_mask(font, ch)
        closed = (
            Image.fromarray(mask.astype(np.uint8) * 255)
            .filter(ImageFilter.MaxFilter(9))
            .filter(ImageFilter.MinFilter(9))
        )
        mask2 = np.asarray(closed) >= 128
        ys, xs = np.nonzero(mask2)
        y0 = max(0, int(ys.min()) - 6)
        y1 = min(mask2.shape[0], int(ys.max()) + 7)
        x0 = max(0, int(xs.min()) - 6)
        x1 = min(mask2.shape[1], int(xs.max()) + 7)
        sub = mask2[y0:y1, x0:x1]
        norm = Norm(m, (xs.min(), xs.max(), ys.min(), ys.max()))
        margin = max(2.0, (100.0 - norm.w_norm) / 2)
        recon = np.zeros_like(sub)
        t = 13                                      # 笔宽 ~26px 半宽
        for s in data[key]["strokes"]:
            pts = []
            for p in s["points"]:
                py_g = BASELINE_Y - (norm.b - p[1]) / norm.s
                px_g = xs.min() + (p[0] - margin) / norm.s
                pts.append((
                    int(round(py_g - y0)),
                    int(round(px_g - x0)),
                ))
            for (py, px), (qy, qx) in zip(pts, pts[1:]):
                draw_line(recon, py, px, qy, qx, t)
        inter = (recon & sub).sum()
        union = (recon | sub).sum()
        iou = inter / max(union, 1)
        ious[key] = iou
        flag = "✓" if iou >= 0.72 else "✗"
        print(f"  {flag} {key}: IoU={iou:.2f}")

    bad = [k for k, v in ious.items() if v < 0.72]
    if problems:
        print(f"\n❌ 规格问题 {len(problems)} 项:")
        for p in problems:
            print("  -", p)
    else:
        print("\n✅ 规格自动化校验全部通过")
    if bad:
        print(f"⚠ 覆盖率不足字形: {bad}（需人工核对形态）")
    return problems, bad


def thickness_est(data, key, sub_mask):
    g = data[key]
    n_pts = sum(len(s["points"]) for s in g["strokes"])
    return max(6.0, sub_mask.sum() / max(n_pts * 8, 1))


def draw_line(img, y0, x0, y1, x1, w):
    n = max(abs(y1 - y0), abs(x1 - x0), 1)
    for i in range(n + 1):
        y = round(y0 + (y1 - y0) * i / n)
        x = round(x0 + (x1 - x0) * i / n)
        img[max(0, y - w): y + w + 1, max(0, x - w): x + w + 1] = True


# ── 自检图（四线格 + 序号 + 箭头） ─────────────────────────────

def build_contact_sheet(data):
    import PIL.ImageDraw as ID
    cells = [k for k in data if k != "_meta"]
    cols, cell = 8, 190
    rows = (len(cells) + cols - 1) // cols
    s = (cell - 30) / 100.0
    img = Image.new("RGB", (cols * cell, rows * cell), "white")
    d = ID.Draw(img)
    for idx, key in enumerate(cells):
        ox, oy = (idx % cols) * cell, (idx // cols) * cell
        g = data[key]
        for name, col in [("ascender", "#f3d1d1"), ("xHeight", "#c9e4f9"),
                          ("baseline", "#333333"), ("descender", "#c9e4f9")]:
            yy = oy + 15 + g["guides"][name] * s
            d.line([(ox + 8, yy), (ox + cell - 8, yy)], fill=col, width=1)
        for si, st in enumerate(g["strokes"]):
            pts = [(ox + 15 + p[0] * s, oy + 15 + p[1] * s) for p in st["points"]]
            col = "#7c3aed" if st["kind"] == "base" else "#e11d48"
            d.line(pts, fill=col, width=2)
            for p in pts:
                d.ellipse([p[0] - 1.2, p[1] - 1.2, p[0] + 1.2, p[1] + 1.2], fill=col)
            # 起笔箭头
            if len(pts) >= 2:
                (x1, y1), (x2, y2) = pts[0], pts[1]
                ang = math.atan2(y2 - y1, x2 - x1)
                ax, ay = x1 - 6 * math.cos(ang), y1 - 6 * math.sin(ang)
                d.line([(x1, y1), (ax + 3 * math.cos(ang + 2.6), ay + 3 * math.sin(ang + 2.6))], fill="#16a34a", width=2)
                d.line([(x1, y1), (ax + 3 * math.cos(ang - 2.6), ay + 3 * math.sin(ang - 2.6))], fill="#16a34a", width=2)
            cx, cy = pts[0]
            d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill="white", outline="#111")
            d.text((cx - 3, cy - 6), str(si + 1), fill="#111")
        d.text((ox + 8, oy + 2), key, fill="#555")
    OUT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_SHEET)


# ── 预览 HTML ────────────────────────────────────────────────

def build_preview(data):
    payload = json.dumps(data, ensure_ascii=False)
    html = """<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>Borel cursive 笔顺草稿预览（34 字形 · 人工校对用）</title>
<style>
body{font-family:system-ui,sans-serif;margin:20px;background:#fafafa}
h1{font-size:18px} .tip{color:#666;font-size:13px;margin-bottom:14px}
.grid{display:flex;flex-wrap:wrap;gap:14px}
.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px;width:230px}
.card h3{font-size:13px;margin:2px 0 6px;color:#555}
.warn{color:#b45309;font-size:11px}
button{font-size:12px;padding:2px 10px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}
svg{display:block;background:#fcfcff}
</style></head><body>
<h1>Borel cursive 笔顺草稿预览</h1>
<div class="tip">绿色 entry / 蓝色 exit｜紫色 = base 笔画（序号为书写顺序，箭头 = 起笔方向）｜红色 = diacritic（点/音符）。
四线格按数据 guides 绘制。回放检查书写顺序是否符合法式 cursive ductus。</div>
<div class="grid" id="grid"></div>
<script>
const DATA = __PAYLOAD__;
const keys = Object.keys(DATA).filter(k=>k!=='_meta');
const grid = document.getElementById('grid');
for (const key of keys) {
  const g = DATA[key];
  const card = document.createElement('div'); card.className='card';
  const warns=[];
  if (!g.guides.slant) warns.push('slant=0（Borel 直立）');
  for (const s of g.strokes) if (s.points.length<6||s.points.length>24) warns.push('点数 '+s.points.length);
  card.innerHTML = '<h3>'+key+(warns.length?' <span class="warn">⚠ '+warns.join('、')+'</span>':'')+'</h3>';
  const W=214, svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width',W); svg.setAttribute('height',W); svg.setAttribute('viewBox','0 0 100 100');
  const line=(x1,y1,x2,y2,c,w,dash)=>{const l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',x1);l.setAttribute('y1',y1);l.setAttribute('x2',x2);l.setAttribute('y2',y2);
    l.setAttribute('stroke',c);l.setAttribute('stroke-width',w); if(dash)l.setAttribute('stroke-dasharray',dash); svg.appendChild(l);};
  const gd=g.guides;
  line(4,gd.ascender,96,gd.ascender,'#f3d1d1',0.8);
  line(4,gd.xHeight,96,gd.xHeight,'#c9e4f9',0.8);
  line(4,gd.baseline,96,gd.baseline,'#888',1.2);
  line(4,gd.descender,96,gd.descender,'#c9e4f9',0.8);
  const paths=[];
  g.strokes.forEach((s,si)=>{
    const col = s.kind==='base' ? '#7c3aed' : '#e11d48';
    const ptsAttr = s.points.map(p=>p.join(',')).join(' ');
    const pl=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    pl.setAttribute('points',ptsAttr); pl.setAttribute('fill','none');
    pl.setAttribute('stroke',col); pl.setAttribute('stroke-width','2.4');
    pl.setAttribute('stroke-linecap','round'); pl.setAttribute('stroke-linejoin','round');
    svg.appendChild(pl); paths.push({pl, n:s.points.length});
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx',s.points[0][0]); dot.setAttribute('cy',s.points[0][1]);
    dot.setAttribute('r','2.6'); dot.setAttribute('fill','#fff'); dot.setAttribute('stroke','#111');
    svg.appendChild(dot);
    const tx=document.createElementNS('http://www.w3.org/2000/svg','text');
    tx.setAttribute('x',+s.points[0][0]+3.2); tx.setAttribute('y',+s.points[0][0]*0+ +s.points[0][1]+1.6);
    tx.setAttribute('font-size','4.6'); tx.setAttribute('fill','#111'); tx.textContent=si+1;
    svg.appendChild(tx);
    const [p0,p1]=s.points;
    const ar=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    const ang=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
    const bx=p0[0]-3.4*Math.cos(ang), by=p0[1]-3.4*Math.sin(ang);
    const wing=(a)=>[bx-1.9*Math.cos(ang+a),by-1.9*Math.sin(ang+a)];
    const w1=wing(2.5), w2=wing(-2.5);
    ar.setAttribute('points',[p0[0],p0[1],w1[0],w1[1],w2[0],w2[1]].join(','));
    ar.setAttribute('fill','#16a34a'); svg.appendChild(ar);
  });
  if (g.connect) {
    line(g.connect.entry[0]-3,g.connect.entry[1],g.connect.entry[0]+3,g.connect.entry[1]+3,'#16a34a',1.6);
    line(g.connect.exit[0]-3,g.connect.exit[1],g.connect.exit[0]+3,g.connect.exit[1]+3,'#2563eb',1.6);
  }
  const btn=document.createElement('button'); btn.textContent='▶ 回放';
  btn.onclick=()=>{ paths.forEach(({pl,n})=>{pl.setAttribute('stroke-dasharray','300');pl.setAttribute('stroke-dashoffset',0);});
    let t0=null; const dur=1400;
    const step=(ts)=>{ if(!t0)t0=ts; const r=Math.min(1,(ts-t0)/dur);
      paths.forEach(({pl})=>{ pl.setAttribute('stroke-dashoffset', String(300*(1-r))); });
      if(r<1) requestAnimationFrame(step); };
    requestAnimationFrame(step); };
  card.appendChild(svg); card.appendChild(btn);
  grid.appendChild(card);
}
</script></body></html>"""
    OUT_HTML.write_text(html.replace("__PAYLOAD__", payload), encoding="utf-8")


if __name__ == "__main__":
    main()
