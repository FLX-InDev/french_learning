# -*- coding: utf-8 -*-
"""从 cursive.jpeg 提取 26 字母的笔序量化数据（红点位置 + 红/灰箭头角度）。

输出：tools/.out/stroke-map.json
  每个字母：{ x, y(红点质心像素), red_arrows:[{ang, len}], gray_arrows:[{ang, len}],
              letter_box:{x0,x1,y0,y1}, dot_norm:{u,v}(相对字母bbox 0-1) }

用法：python tools/extract-stroke-map.py
依赖：numpy pillow（复用 tools/borel-stroke-extract.py 的 components）
"""
import json
import sys
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "data" / "trace" / "cursive.jpeg"
OUT = ROOT / "tools" / ".out" / "stroke-map.json"

spec = importlib.util.spec_from_file_location(
    "bse", ROOT / "tools" / "borel-stroke-extract.py"
)
bse = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bse)

# 三行布局（用户确认）：a-i / j-r / s-z
ROWS = [("abcdefghi", 112, 185), ("jklmnopqr", 200, 275), ("stuvwxyz", 305, 375)]


def load():
    a = np.asarray(Image.open(IMG).convert("RGB"))
    red = (a[:, :, 0] > 140) & (a[:, :, 1] < 90) & (a[:, :, 2] < 90)
    gray = (
        (abs(a[:, :, 0].astype(int) - a[:, :, 1].astype(int)) < 25)
        & (abs(a[:, :, 1].astype(int) - a[:, :, 2].astype(int)) < 25)
        & (a[:, :, 0] > 90)
        & (a[:, :, 0] < 190)
    )
    dark = a[:, :, 0] < 80
    return red, gray, dark


def comps(mask, minpx=4):
    c, _ = bse.components(mask)
    out = []
    for cix in c:
        ys, xs = cix[:, 0], cix[:, 1]
        if len(ys) < minpx:
            continue
        out.append((len(ys), int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())))
    return out


def main_angle(pixels):
    """PCA 主轴方向（度，0-180 无向）。pixels: Nx2 (y,x)"""
    ys = pixels[:, 0].astype(float)
    xs = pixels[:, 1].astype(float)
    xm, ym = xs.mean(), ys.mean()
    xc, yc = xs - xm, ys - ym
    xx = (xc * xc).sum()
    xy = (xc * yc).sum()
    yy = (yc * yc).sum()
    if (xx + yy) < 10:
        return None
    ang = np.degrees(0.5 * np.arctan2(2 * xy, xx - yy))
    if ang < 0:
        ang += 180
    return round(ang, 1)


def is_dot(c):
    """红点：面积<=60 且宽高<=14（紧凑圆形）；红箭头：细长条"""
    _, x0, x1, y0, y1 = c
    return (x1 - x0) <= 14 and (y1 - y0) <= 14 and (c[0] <= 60)


def extract_letter(red, gray, dark, cx0, cx1, cy0, cy1, glyph):
    """在 (cx0,cx1)x(cy0,cy1) 区域提取一个字母的标注"""
    # 深色字母 bbox
    sub_d = dark[cy0:cy1, cx0:cx1]
    if not sub_d.any():
        return None
    ys, xs = np.nonzero(sub_d)
    box = (cx0 + xs.min(), cx0 + xs.max(), cy0 + ys.min(), cy0 + ys.max())
    bw = box[1] - box[0] + 1
    bh = box[3] - box[2] + 1
    if bw < 5 or bh < 5:
        return None

    # 红点：区域内红色紧凑簇，取最靠左下的为起点（教学：起点在左下/右上）
    sub_r = red[cy0:cy1, cx0:cx1]
    rcs = comps(sub_r, 4)
    rdots = [c for c in rcs if is_dot(c)]
    red_arrows = [c for c in rcs if not is_dot(c)]

    # 灰箭头
    sub_g = gray[cy0:cy1, cx0:cx1]
    gcs = [c for c in comps(sub_g, 8) if (c[2] - c[1]) + (c[4] - c[3]) >= 8]

    dot = None
    if rdots:
        # 起点红点：面积最大者优先（干扰碎片通常更小）
        dot = max(rdots, key=lambda c: c[0])
        d_cy, d_cx = (dot[3] + dot[4]) // 2, (dot[1] + dot[2]) // 2
        u = (d_cx - box[0]) / bw
        v = (d_cy - box[2]) / bh
    else:
        u = v = None

    def arrow_of(c):
        y0_, x0_, y1_, x1_ = c[3], c[1], c[4], c[2]
        sub = red[cy0 + y0_ - 2 : cy0 + y1_ + 3, cx0 + x0_ - 2 : cx0 + x1_ + 3]
        yy, xx = np.nonzero(sub)
        if len(yy) < 6:
            return None
        return {"ang": main_angle(np.stack([yy + cy0 + y0_ - 2, xx + cx0 + x0_ - 2], 1)), "len": len(yy)}

    red_ang = []
    for c in red_arrows:
        a = arrow_of(c)
        if a:
            red_ang.append(a)
    gray_ang = []
    for c in gcs:
        sub = gray[cy0 + c[3] - 2 : cy0 + c[4] + 3, cx0 + c[1] - 2 : cx0 + c[2] + 3]
        yy, xx = np.nonzero(sub)
        if len(yy) < 8:
            continue
        gray_ang.append(
            {"ang": main_angle(np.stack([yy + cy0 + c[3] - 2, xx + cx0 + c[1] - 2], 1)), "len": len(yy)}
        )

    return {
        "glyph": glyph,
        "box": {"x0": int(box[0]), "x1": int(box[1]), "y0": int(box[2]), "y1": int(box[3])},
        "dot_px": [None if dot is None else int((dot[1] + dot[2]) / 2), None if dot is None else int((dot[3] + dot[4]) / 2)],
        "dot_norm": [round(u, 3) if u is not None else None, round(v, 3) if v is not None else None],
        "red_arrows": red_ang,
        "gray_arrows": gray_ang,
    }


def main():
    red, gray, dark = load()
    result = {}
    for glyphs, y0, y1 in ROWS:
        # 该行红点质心（锚点），按 x 排序
        rcs = comps(red, 5)
        row_pts = [
            ((c[1] + c[2]) // 2, (c[3] + c[4]) // 2)
            for c in rcs
            if y0 <= (c[3] + c[4]) // 2 <= y1 and (c[2] - c[1]) <= 14 and (c[4] - c[3]) <= 14
        ]
        row_pts.sort(key=lambda p: p[0])
        if len(row_pts) < len(glyphs):
            print(f"警告: {glyphs[0]}-{glyphs[-1]} 行红点 {len(row_pts)} < 字母 {len(glyphs)}")
        # 每个字母槽：红点分桶（每字母约1个起点+碎片）
        # 简化：按红点 x 均分给字母数
        n = len(glyphs)
        buckets = [[] for _ in range(n)]
        for px, py in row_pts:
            # 分到最近的槽（按字母数均分 x 范围）
            idx = min(n - 1, int((px - row_pts[0][0]) / max((row_pts[-1][0] - row_pts[0][0]) / n, 1)))
            buckets[idx].append((px, py))
        # 每个字母区域 = 红点槽 ± 40px
        for i, g in enumerate(glyphs):
            if not buckets[i]:
                print(f"  跳过 {g}: 无红点槽")
                continue
            xs = [p[0] for p in buckets[i]]
            cxc = int(np.mean(xs))
            res = extract_letter(red, gray, dark, cxc - 45, cxc + 45, y0 - 8, y1 + 8, g)
            if res:
                result[g] = res
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")
    print(f"✅ 已写入 {OUT}（{len(result)} 字母）")
    for g in "abcdefghijklmnopqrstuvwxyz":
        if g in result:
            r = result[g]
            print(
                f"  {g}: dot_norm={r['dot_norm']} 红箭头={[a['ang'] for a in r['red_arrows']]} "
                f"灰箭头={[a['ang'] for a in r['gray_arrows']]}"
            )
        else:
            print(f"  {g}: 缺失")


if __name__ == "__main__":
    main()
