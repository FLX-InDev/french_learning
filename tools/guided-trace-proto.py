# -*- coding: utf-8 -*-
"""引导式骨架追踪原型：从规范起点方位出发，沿 Borel 骨架生成规范笔序的一笔。

用法：python -u tools/guided-trace-proto.py a o
"""
import sys
import importlib.util
import numpy as np
from PIL import Image, ImageFilter

ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bse", ROOT / "tools" / "borel-stroke-extract.py")
bse = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bse)

RENDER = bse.RENDER


def skeleton_of(ch):
    font = bse.load_font()
    m = bse.glyph_metrics(font)
    mask = bse.render_mask(font, ch)
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
    skel = bse.thinning(sub)
    thick = sub.sum() / max(skel.sum(), 1)
    skel = bse.prune_spurs(skel, max(8, thick * 1.0))
    return skel, (y0, x0), m


def nbrs(skel, y, x):
    H, W = skel.shape
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and skel[yy, xx]:
                out.append((yy, xx))
    return out


def trace_ring(skel, start, ccw=True, max_steps=6000):
    """从 start 沿骨架走，优先延续当前方向；ccw=逆时针(规范 a/o 用)。
    返回像素路径列表[(y,x)]。"""
    H, W = skel.shape
    visited = {start}
    path = [start]
    cy, cx = start
    # 初始方向：ccw 时优先走上/左邻（从右上2点钟向左上）
    cands = nbrs(skel, cy, cx)
    if not cands:
        return path
    # 选方向：ccw -> 与"向左上"最接近的邻居
    def score(nb):
        dy, dx = nb[0] - cy, nb[1] - cx
        if ccw:
            # 目标方向：-x 优先（向左），其次 -y（向上）
            return -dx * 3 - dy
        else:
            return dx * 3 + dy
    nxt = min(cands, key=score)
    path.append(nxt)
    visited.add(nxt)
    prev, cur = start, nxt
    for _ in range(max_steps):
        ns = [n for n in nbrs(skel, cur[0], cur[1]) if n not in visited]
        if not ns:
            # 允许回到已访问（闭环最后闭合）
            ns = [n for n in nbrs(skel, cur[0], cur[1])]
            if not ns:
                break
        # 方向延续：最近 6 步方向
        k = min(6, len(path) - 1)
        py, px = path[-1 - k]
        vy, vx = cur[0] - py, cur[1] - px
        nxt = min(ns, key=lambda n: -(vx * (n[1] - cur[1]) + vy * (n[0] - cur[0])))
        path.append(nxt)
        visited.add(nxt)
        prev, cur = cur, nxt
        if nxt == start:
            break
    return path


def norm_path(path, m, y0, x0):
    bbox = (x0, x0 + 1, y0, y0 + 1)  # 占位，用全局像素范围
    # 全局像素 → norm
    ys = [p[0] + y0 for p in path]
    xs = [p[1] + x0 for p in path]
    bbox = (min(xs), max(xs), min(ys), max(ys))
    norm = bse.Norm(m, (bbox[0], bbox[1], bbox[2], bbox[3]))
    out = []
    for (py, px) in path[::3]:
        out.append([round(norm.x(px + x0), 1), round(norm.y(py + y0), 1)])
    return out


def main():
    chars = sys.argv[1:] or ["a", "o"]
    for ch in chars:
        skel, (y0, x0), m = skeleton_of(ch)
        H, W = skel.shape
        ys, xs = np.nonzero(skel)
        # 起点：规范 = 右上 2 点钟 → 环上 x 最大且 y 最小（右上）
        # 用 bbox 右上角：max(x)+min(y) 组合分
        cy = int(ys.min() + (ys.max() - ys.min()) * 0.25)
        cx = int(xs.max() - (xs.max() - xs.min()) * 0.2)
        # 找最近骨架点
        pts = np.stack([ys, xs], 1)
        d = (pts[:, 0] - cy) ** 2 + (pts[:, 1] - cx) ** 2
        start = tuple(pts[int(d.argmin())])
        path = trace_ring(skel, start, ccw=True)
        print(f"== {ch}: 起点={start}（全局{y0+start[0]},{x0+start[1]}）路径长={len(path)}")
        # ASCII 显示路径走向
        vis = np.full((H, W), 32, dtype="<U1")
        vis[skel] = "."
        for i, (y, x) in enumerate(path):
            if i % 5 == 0:
                vis[y, x] = "#"
        for yy in range(0, H, 4):
            print("".join(vis[yy, :][::2]))
        print()


if __name__ == "__main__":
    main()
