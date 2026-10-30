"""Recover the data of the paper's Figure 4 (img/frontiers.pdf) from its vector drawing.

The figure is a matplotlib PDF (lmcircuit.plot.frontiers_grid): seven tasks, each a pair of panels. The left panel is
accuracy (%) against expected cost per item (log x); the right panel is the circuit's calls per item to each pool
judge, stacked cheapest first. Everything here is read from page.get_drawings() and page.get_text("dict"):

  * axes: each panel's white background rectangle; x mapped from the tick labels 0.003 ... 3 (log), y from the tick
    labels matched to their grid lines (linear), per panel;
  * colours to names: the figure legend on top (curves) and each calls panel's legend (pool judges);
  * pool judges: the large diamonds (centre = mean of the four vertices); judges outside the pool: small grey diamonds;
  * majority voting: the gold star (centre = mean of its ten vertices) and its brown bar;
  * LMCircuit and baselines: the vertices of each solid / dashed polyline, with the vertical 95% bars of the same
    colour attached to the vertex at their cost (or, where path simplification dropped that vertex, to a point
    interpolated on the line there);
  * calls: each filled band split into its lower and upper boundary, resampled on the union of the bands' costs.

Usage:  python3 -I scripts/extract_frontier.py [--pdf img/frontiers.pdf] [--out data/frontier.json] [--check DIR]
With --check, each task's extracted data is re-plotted beside a high-dpi render of the same region of the PDF.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import fitz  # PyMuPDF

HERE = Path(__file__).resolve().parent.parent
KEYS = {"BeaverTails": "beavertails", "PolitiCAUSE": "politicause", "Arena": "arena", "HealthBench": "healthbench",
        "Decision Index": "decision_index", "AgentJudgeBench": "agentjudgebench", "BIG-Bench Hard": "bbh"}
ORDER = list(KEYS.values())
GRID = {"#e6e6e6", "#d0d0d0"}            # grid lines and spines
BLUE, GOLD, BAR_MV, GREY = "#4a6fc4", "#e8a33d", "#8a5a00", "#c9c9c9"


# ----------------------------------------------------------------------------------------------------------- helpers
def hexcol(c):
    return None if c is None else "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in c[:3])


def sig(v, n=4):
    return None if v is None else float(f"{v:.{n}g}")


def r2(v):
    return None if v is None else round(v, 2) + 0.0      # + 0.0: no -0.0


def r3(v):
    return None if v is None else round(v, 3) + 0.0


def vertices(d):
    """The polyline of a drawing made of consecutive line items."""
    its = [it for it in d["items"] if it[0] == "l"]
    if not its:
        return []
    out = [(its[0][1].x, its[0][1].y)]
    for it in its:
        if abs(it[1].x - out[-1][0]) > 1e-3 or abs(it[1].y - out[-1][1]) > 1e-3:
            out.append((it[1].x, it[1].y))           # a gap: keep going (none in this figure)
        out.append((it[2].x, it[2].y))
    return out


def single_segment(d):
    its = d["items"]
    if d["type"] != "s" or len(its) != 1 or its[0][0] != "l":
        return None
    return its[0][1], its[0][2]


def fit_line(us, vs):
    """Least squares v = a + b u; returns a, b and the largest residual."""
    n = len(us)
    mu, mv = sum(us) / n, sum(vs) / n
    b = sum((u - mu) * (v - mv) for u, v in zip(us, vs)) / sum((u - mu) ** 2 for u in us)
    a = mv - b * mu
    return a, b, max(abs(a + b * u - v) for u, v in zip(us, vs))


def interp(xs, ys, x):
    """Linear interpolation on increasing xs (clamped)."""
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= x:
            lo = mid
        else:
            hi = mid
    if xs[hi] == xs[lo]:
        return ys[hi]
    t = (x - xs[lo]) / (xs[hi] - xs[lo])
    return ys[lo] + t * (ys[hi] - ys[lo])


class Axis:
    """Page coordinates to data for one panel: x log10, y linear."""

    def __init__(self, rect, xticks, yticks, issues, where):
        self.rect = rect
        ax, bx, ex = fit_line([math.log10(v) for v, _ in xticks], [p for _, p in xticks])
        ay, by, ey = fit_line([v for v, _ in yticks], [p for _, p in yticks])
        self.ax, self.bx, self.ay, self.by = ax, bx, ay, by
        self.err = (ex, ey)
        if ex > 0.15 or ey > 0.15:
            issues.append(f"{where}: tick fit residual x {ex:.3f} pt, y {ey:.3f} pt")
        self.xticks, self.yticks = [v for v, _ in xticks], [v for v, _ in yticks]

    def cost(self, px):
        return 10 ** ((px - self.ax) / self.bx)

    def val(self, py):
        return (py - self.ay) / self.by

    def xlim(self):
        return self.cost(self.rect.x0), self.cost(self.rect.x1)

    def ylim(self):
        return self.val(self.rect.y1), self.val(self.rect.y0)


# ------------------------------------------------------------------------------------------------------------ reading
def spans_of(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for line in b.get("lines", []):
            for s in line["spans"]:
                if s["text"].strip():
                    out.append({"text": s["text"].strip(), "bbox": fitz.Rect(s["bbox"]), "size": s["size"],
                                "dir": tuple(round(v, 3) for v in line["dir"])})
    return out


def number(t):
    try:
        return float(t)
    except ValueError:
        return None


def nearest_right(spans, x1, yc, max_gap=8.0, max_dy=2.5):
    """The text span starting just right of x1 on the row at yc."""
    best = None
    for s in spans:
        b = s["bbox"]
        if s["dir"] != (1.0, 0.0) or b.x0 < x1 - 0.5 or b.x0 - x1 > max_gap:
            continue
        if abs((b.y0 + b.y1) / 2 - yc) > max_dy:
            continue
        if best is None or b.x0 < best["bbox"].x0:
            best = s
    return best


def ticks(panel, spans, hgrid, vgrid, issues, where):
    r = panel
    xt, yt = [], []
    for s in spans:
        v, b = number(s["text"]), s["bbox"]
        if v is None or s["dir"] != (1.0, 0.0):
            continue
        cx, cy = (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2
        if r.y1 - 0.5 <= b.y0 <= r.y1 + 5 and r.x0 - 8 <= cx <= r.x1 + 8 and v > 0:
            g = min(vgrid, key=lambda p: abs(p - cx), default=None)
            xt.append((v, g if g is not None and abs(g - cx) < 0.6 else cx))
        elif r.x0 - 7 <= b.x1 <= r.x0 + 0.5 and r.y0 - 3 <= cy <= r.y1 + 2:
            g = min(hgrid, key=lambda p: abs(p - cy), default=None)
            if g is None or abs(g - cy) > 1.6:
                issues.append(f"{where}: y tick {s['text']} has no grid line; using its label centre")
                g = cy - 0.6
            yt.append((v, g))
    return sorted(xt), sorted(yt)


def legend_map(drawings, spans, region_bottom):
    """Figure legend (top of the page): colour -> series name, for strokes; plus the marker colours."""
    out = {}
    for d in drawings:
        if d["rect"].y1 > region_bottom:
            continue
        seg = single_segment(d)
        if seg and abs(seg[0].y - seg[1].y) < 1e-3 and seg[1].x - seg[0].x > 5:
            s = nearest_right(spans, max(seg[0].x, seg[1].x), seg[0].y)
            if s:
                out[hexcol(d["color"])] = s["text"]
    return out


def errorbars(group):
    """Vertical bars (1 segment, width 0.35-0.5) followed by their caps; returns [(colour, x, top_y, bottom_y)]."""
    out, skip = [], set()
    for k, d in enumerate(group):
        if k in skip:
            continue
        seg = single_segment(d)
        col = hexcol(d.get("color"))
        if not seg or col in GRID or not (0.35 <= (d.get("width") or 0) <= 0.5):
            continue
        a, b = seg
        if abs(a.x - b.x) > 1e-3:
            continue
        caps = 0
        for q in (k + 1, k + 2):                     # its caps (one may be missing when outside the axes)
            if q < len(group):
                s2 = single_segment(group[q])
                if s2 and hexcol(group[q].get("color")) == col and abs(s2[0].y - s2[1].y) < 1e-3 \
                        and 1.5 < abs(s2[1].x - s2[0].x) < 2.5 and abs((s2[0].x + s2[1].x) / 2 - a.x) < 0.05:
                    skip.add(q)
                    caps += 1
        if caps:
            out.append((col, a.x, min(a.y, b.y), max(a.y, b.y)))
    return out


def attach(poly, bars, axis, judges_px):
    """Curve points from a polyline (page coords) and its bars: [{cost, acc, lo, hi}] in drawing order."""
    pts = [{"px": x, "py": y, "lo": None, "hi": None} for x, y in poly]
    seen = set()
    for _, bx, top, bot in bars:
        key = (round(bx, 2), round(top, 2), round(bot, 2))
        if key in seen:
            continue                                  # the same bar drawn again (a curve of one point)
        seen.add(key)
        mid = (top + bot) / 2
        on = [p for p in pts if abs(p["px"] - bx) < 0.02]
        if on:
            p = min(on, key=lambda p: abs(p["py"] - mid))
        elif len(pts) >= 2 and pts[0]["px"] - 0.02 <= bx <= pts[-1]["px"] + 0.02:
            k = next(i for i in range(1, len(pts)) if pts[i]["px"] >= bx - 0.02)
            a, b = pts[k - 1], pts[k]
            t = 0.0 if b["px"] == a["px"] else (bx - a["px"]) / (b["px"] - a["px"])
            p = {"px": bx, "py": a["py"] + t * (b["py"] - a["py"]), "lo": None, "hi": None}
            pts.insert(k, p)
        elif not pts:                                 # no line drawn: every point of the curve coincides
            j = [q for q in judges_px if abs(q[0] - bx) < 0.05 and top - 0.1 <= q[1] <= bot + 0.1]
            p = {"px": bx, "py": j[0][1] if j else mid, "lo": None, "hi": None}
            if not j:
                p["approx"] = True                    # accuracy: the bar's midpoint
            pts.append(p)
        else:
            p = min(pts, key=lambda p: abs(p["px"] - bx))
        p["lo"], p["hi"] = axis.val(bot), axis.val(top)
    out = []
    for p in pts:
        row = {"cost": sig(axis.cost(p["px"])), "acc": r2(axis.val(p["py"])), "lo": r2(p["lo"]), "hi": r2(p["hi"])}
        if p.get("approx"):
            row["approx"] = True
        out.append(row)
    return out


def split_band(poly):
    """A fill_between polygon -> (lower, upper) polylines, each increasing in x.

    The polygon runs (x0, top0), (x0, bottom0), along the bottom to (xN, bottomN), (xN, topN), back along the top. Where
    the band has zero height at an end, the vertical edge there is gone (a repeated vertex), and that end's vertex is
    shared by both boundaries."""
    xmax = max(x for x, _ in poly)
    m = next(i for i, (x, _) in enumerate(poly) if abs(x - xmax) < 1e-4)
    start = 1 if abs(poly[1][0] - poly[0][0]) < 1e-4 else 0
    lower = poly[start:m + 1]
    end = m + 1 if m + 1 < len(poly) and abs(poly[m + 1][0] - xmax) < 1e-4 else m
    upper = list(reversed(poly[end:]))
    if abs(poly[0][0] - upper[0][0]) > 1e-4:
        upper = [poly[0]] + upper
    return lower, upper


def extract(pdf):
    doc = fitz.open(pdf)
    page = doc[0]
    drawings = page.get_drawings()
    spans = spans_of(page)
    issues = []

    panels = [k for k, d in enumerate(drawings) if k > 0 and d["type"] == "f" and hexcol(d.get("fill")) == "#ffffff"
              and len(d["items"]) == 1 and d["items"][0][0] == "re"]
    top = min(drawings[k]["rect"].y0 for k in panels)
    legend = legend_map(drawings, spans, top - 20)
    names = {c: n for c, n in legend.items() if c != BLUE}
    if len(names) != 8:
        issues.append(f"figure legend: {len(names)} baselines found: {sorted(names.values())}")

    groups = []
    for i, k in enumerate(panels):
        end = panels[i + 1] if i + 1 < len(panels) else len(drawings)
        groups.append((drawings[k]["rect"], [d for d in drawings[k + 1:end] if d["rect"].y0 > top - 20]))

    def ylabel(r):
        c = [s for s in spans if s["dir"] != (1.0, 0.0) and s["bbox"].x1 < r.x0 and r.y0 < (s["bbox"].y0 + s["bbox"].y1) / 2 < r.y1]
        return max(c, key=lambda s: s["bbox"].x1)["text"] if c else None

    # pair panels: same row, accuracy on the left, calls on the right
    pairs = []
    for i in range(0, len(groups) - 1):
        (ra, ga), (rb, gb) = groups[i], groups[i + 1]
        if abs(ra.y0 - rb.y0) < 0.5 and ylabel(ra) == "Accuracy (%)" and ylabel(rb) == "Calls per model":
            pairs.append(((ra, ga), (rb, gb)))
    tasks = {}
    for (ra, ga), (rb, gb) in pairs:
        cx = (ra.x0 + rb.x1) / 2
        title = min((s for s in spans if s["bbox"].y1 <= ra.y0 + 0.5 and ra.y0 - s["bbox"].y1 < 14 and s["size"] > 6.5),
                    key=lambda s: abs((s["bbox"].x0 + s["bbox"].x1) / 2 - cx))["text"]
        key = KEYS[title]
        xl = min((s for s in spans if s["bbox"].y0 > ra.y1 + 6 and s["bbox"].y0 - ra.y1 < 20 and "cost" in s["text"]),
                 key=lambda s: abs((s["bbox"].x0 + s["bbox"].x1) / 2 - cx))["text"]

        # ---- calls panel: legend patches -> names; bands
        patches = [d for d in gb if d["type"] == "f" and d["items"][0][0] == "re" and d["rect"].width < 8]
        judge = {}
        for d in patches:
            s = nearest_right(spans, d["rect"].x1, (d["rect"].y0 + d["rect"].y1) / 2)
            judge[hexcol(d["fill"])] = s["text"] if s else None
        if len(judge) != len(patches):
            issues.append(f"{key}: two judges share a colour in the calls legend")
        hgb = [single_segment(d)[0].y for d in gb if single_segment(d) and hexcol(d["color"]) == "#e6e6e6"
               and abs(single_segment(d)[0].y - single_segment(d)[1].y) < 1e-3]
        vgb = [single_segment(d)[0].x for d in gb if single_segment(d) and hexcol(d["color"]) == "#e6e6e6"
               and abs(single_segment(d)[0].x - single_segment(d)[1].x) < 1e-3]
        xt, yt = ticks(rb, spans, hgb, vgb, issues, f"{key} calls")
        axc = Axis(rb, xt, yt, issues, f"{key} calls")
        fills = [d for d in gb if d["type"] == "f" and len(d["items"]) > 4]
        bands = []
        for d in fills:
            lower, upper = split_band(vertices(d))
            bands.append((judge.get(hexcol(d["fill"])), hexcol(d["fill"]), lower, upper))
        xs = sorted({round(x, 2) for _, _, lo, hi in bands for x, _ in lo + hi})
        grid = []
        for x in xs:                                  # merge costs closer than 0.03 pt
            if not grid or x - grid[-1] > 0.03:
                grid.append(x)
        calls = {"models": [], "x": [sig(axc.cost(x)) for x in grid], "bands": {}}
        worst = 0.0
        prev_hi = None
        for name, col, lower, upper in bands:
            lo = [axc.val(interp([p[0] for p in lower], [p[1] for p in lower], x)) for x in grid]
            hi = [axc.val(interp([p[0] for p in upper], [p[1] for p in upper], x)) for x in grid]
            if prev_hi is not None:
                worst = max(worst, max(abs(a - b) for a, b in zip(lo, prev_hi)))
            prev_hi = hi
            calls["models"].append(name)
            calls["bands"][name] = {"color": col, "lo": [r3(v) for v in lo], "hi": [r3(v) for v in hi]}
        if worst > 0.005:
            issues.append(f"{key}: a band's lower edge departs from the band beneath by {worst:.3f} calls")
        calls["stacking"] = "bottom to top (cheapest first); lo/hi are cumulative calls per item"
        calls["y_label"] = ylabel(rb)
        calls["y_ticks"] = axc.yticks
        calls["y_range"] = [r3(v) for v in axc.ylim()]

        # ---- accuracy panel
        hga = [single_segment(d)[0].y for d in ga if single_segment(d) and hexcol(d["color"]) == "#e6e6e6"
               and abs(single_segment(d)[0].y - single_segment(d)[1].y) < 1e-3]
        vga = [single_segment(d)[0].x for d in ga if single_segment(d) and hexcol(d["color"]) == "#e6e6e6"
               and abs(single_segment(d)[0].x - single_segment(d)[1].x) < 1e-3]
        xt, yt = ticks(ra, spans, hga, vga, issues, f"{key} accuracy")
        axa = Axis(ra, xt, yt, issues, f"{key} accuracy")

        def centre(d):
            v = vertices(d)[:-1]
            return sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)

        marks = [d for d in ga if d["type"] == "fs"]
        models, others, judges_px = [], [], []
        for d in marks:
            col = hexcol(d["fill"])
            if len(d["items"]) == 4 and col != GOLD:
                x, y = centre(d)
                if d["rect"].width > 5:
                    if col not in judge:
                        issues.append(f"{key}: diamond colour {col} not in the calls legend")
                    models.append({"name": judge.get(col), "color": col, "cost": sig(axa.cost(x)),
                                   "acc": r2(axa.val(y))})
                    judges_px.append((x, y))
                else:
                    others.append({"cost": sig(axa.cost(x)), "acc": r2(axa.val(y))})
        if len(models) != len(judge):
            issues.append(f"{key}: {len(models)} diamonds for {len(judge)} legend judges")
        bars = errorbars(ga)
        star = [d for d in marks if hexcol(d["fill"]) == GOLD and len(d["items"]) == 10]
        majority = None
        if star:
            x, y = centre(star[0])
            mb = [b for b in bars if b[0] == BAR_MV]
            majority = {"cost": sig(axa.cost(x)), "acc": r2(axa.val(y)),
                        "lo": r2(axa.val(mb[0][3])) if mb else None, "hi": r2(axa.val(mb[0][2])) if mb else None}
            if mb and abs(mb[0][1] - x) > 0.05:
                issues.append(f"{key}: majority bar {mb[0][1] - x:.2f} pt off the star")
        lines = {}
        for d in ga:
            if d["type"] != "s" or (d.get("width") or 0) < 0.6:
                continue
            col = hexcol(d["color"])
            lines.setdefault(col, []).extend(vertices(d))
        lm = attach(lines.get(BLUE, []), [b for b in bars if b[0] == BLUE], axa, judges_px)
        base = {}
        for col, name in names.items():
            bb = [b for b in bars if b[0] == col]
            if col in lines or bb:
                base[name] = attach(lines.get(col, []), bb, axa, judges_px)
                if any(p.get("approx") for p in base[name]):
                    issues.append(f"{key}: {name} has no line drawn (all its points coincide); its accuracy is the "
                                  f"midpoint of its interval bar")
        stray = {hexcol(d["color"]) for d in ga if d["type"] == "s" and (d.get("width") or 0) >= 0.6} - set(names) - {BLUE}
        stray -= {"#222222"}
        if stray:
            issues.append(f"{key}: unassigned strokes {sorted(stray)}")
        used = {b[0] for b in bars} - set(names) - {BLUE, BAR_MV}
        if used:
            issues.append(f"{key}: unassigned interval bars {sorted(used)}")
        lo_y, hi_y = axa.ylim()
        for name, pts in [("LMCircuit", lm)] + list(base.items()):
            for p in pts:
                if not (lo_y - 0.01 <= p["acc"] <= hi_y + 0.01):
                    issues.append(f"{key}: {name} point {p} outside the y axis")
        tasks[key] = {
            "title": title, "x_label": xl, "y_label": ylabel(ra),
            "x_range": [sig(v) for v in axa.xlim()], "x_ticks": axa.xticks,
            "y_range": [r2(v) for v in axa.ylim()], "y_ticks": axa.yticks,
            "models": sorted(models, key=lambda m: m["cost"]),
            "other_judges": sorted(others, key=lambda m: m["cost"]),
            "majority": majority, "lmcircuit": lm, "baselines": base, "calls": calls,
            "_fit": {"accuracy": [round(e, 4) for e in axa.err], "calls": [round(e, 4) for e in axc.err],
                     "band_gap": round(worst, 4)},
            "_px": {"acc": list(ra), "calls": list(rb)},
        }
    missing = [k for k in ORDER if k not in tasks]
    if missing:
        issues.append(f"tasks not found: {missing}")
    return tasks, issues


# ---------------------------------------------------------------------------------------------------------- checking
def check(pdf, tasks, out_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.image import imread
    styles = {"RouteLLM": (0, (8, 3)), "HybridLLM": (0, (1.2, 1.8, 4, 1.8)), "FrugalGPT": (0, (4, 2)),
              "Cascaded Selective": (0, (6, 2, 1.5, 2)), "Cascade Routing": (0, (1.2, 1.8)), "CARROT": (0, (2.5, 2)),
              "Consistency Cascade": (0, (6, 1.5, 1.5, 1.5, 1.5, 1.5)), "Adaptive-Consistency": (0, (1.5, 2))}
    colours = {"RouteLLM": "#1B998B", "HybridLLM": "#D81B60", "FrugalGPT": "#E07B00", "Cascaded Selective": "#7CB518",
               "Cascade Routing": "#1A1A1A", "CARROT": "#7B1FA2", "Consistency Cascade": "#00A6D6",
               "Adaptive-Consistency": "#8D6E63"}
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    page = doc[0]
    paths = []
    for key, t in tasks.items():
        a, c = fitz.Rect(t["_px"]["acc"]), fitz.Rect(t["_px"]["calls"])
        clip = fitz.Rect(a.x0 - 20, a.y0 - 16, c.x1 + 4, a.y1 + 20)
        png = out_dir / f"_{key}_render.png"
        page.get_pixmap(dpi=400, clip=clip).save(png)
        fig = plt.figure(figsize=(13, 9.5))
        top = fig.add_axes([0.02, 0.5, 0.96, 0.48])
        top.imshow(imread(png))
        top.axis("off")
        top.set_title(f"{t['title']}: PDF render (top) and the extracted data re-plotted (bottom)", fontsize=11)
        ax = fig.add_axes([0.07, 0.07, 0.4, 0.38])
        qx = fig.add_axes([0.56, 0.07, 0.4, 0.38])
        for name, pts in t["baselines"].items():
            ax.plot([p["cost"] for p in pts], [p["acc"] for p in pts], color=colours[name], ls=styles[name], lw=1.4,
                    label=name)
            for p in pts:
                if p["lo"] is not None:
                    ax.plot([p["cost"]] * 2, [p["lo"], p["hi"]], color=colours[name], lw=0.9)
                if p.get("approx"):
                    ax.plot(p["cost"], p["acc"], "x", color=colours[name], ms=6)
        lm = t["lmcircuit"]
        ax.plot([p["cost"] for p in lm], [p["acc"] for p in lm], color="#4A6FC4", lw=2, label="LMCircuit")
        for p in lm:
            if p["lo"] is not None:
                ax.plot([p["cost"]] * 2, [p["lo"], p["hi"]], color="#4A6FC4", lw=1)
                ax.plot([p["cost"]] * 2, [p["lo"], p["hi"]], "_", color="#4A6FC4", ms=5)
        for m in t["other_judges"]:
            ax.scatter(m["cost"], m["acc"], marker="D", s=12, color="#C9C9C9", zorder=2)
        for m in t["models"]:
            ax.scatter(m["cost"], m["acc"], marker="D", s=60, color=m["color"], edgecolor="white", zorder=5)
            ax.annotate(m["name"], (m["cost"], m["acc"]), fontsize=6, xytext=(3, -6), textcoords="offset points")
        mv = t["majority"]
        if mv:
            if mv["lo"] is not None:
                ax.plot([mv["cost"]] * 2, [mv["lo"], mv["hi"]], color="#8A5A00", lw=1)
            ax.scatter(mv["cost"], mv["acc"], marker="*", s=160, color="#E8A33D", edgecolor="#8A5A00", zorder=6)
        for a_ in (ax, qx):
            a_.set_xscale("log")
            a_.set_xlim(*t["x_range"])
            a_.set_xticks(t["x_ticks"], labels=[f"{v:g}" for v in t["x_ticks"]])
            a_.minorticks_off()
            a_.grid(color="#E6E6E6", lw=0.6)
            a_.set_xlabel(t["x_label"], fontsize=9)
        ax.set_ylim(*t["y_range"])
        ax.set_yticks(t["y_ticks"])
        ax.set_ylabel(t["y_label"])
        ax.legend(fontsize=6, loc="lower right")
        cl = t["calls"]
        for name in cl["models"]:
            b = cl["bands"][name]
            qx.fill_between(cl["x"], b["lo"], b["hi"], color=b["color"], lw=0, label=name)
        qx.set_ylim(*cl["y_range"])
        qx.set_yticks(cl["y_ticks"])
        qx.set_ylabel(cl["y_label"])
        h, lab = qx.get_legend_handles_labels()
        qx.legend(h[::-1], lab[::-1], fontsize=6, loc="upper left")
        path = out_dir / f"{key}.png"
        fig.savefig(path, dpi=130)
        plt.close(fig)
        png.unlink()
        paths.append(str(path))
    return paths


def dumps(v, ind=0):
    """JSON with objects indented, and lists of numbers or of points kept one line / one point per line."""
    pad, inner = " " * ind, " " * (ind + 1)
    flat = lambda x: json.dumps(x, ensure_ascii=False, separators=(", ", ": "))
    if isinstance(v, dict):
        if not v:
            return "{}"
        if all(not isinstance(x, (dict, list)) for x in v.values()):
            return flat(v)
        return "{\n" + ",\n".join(f"{inner}{json.dumps(k)}: {dumps(x, ind + 1)}" for k, x in v.items()) + "\n" + pad + "}"
    if isinstance(v, list):
        if all(not isinstance(x, (dict, list)) for x in v):
            return flat(v)
        return "[\n" + ",\n".join(inner + dumps(x, ind + 1) for x in v) + "\n" + pad + "]"
    return flat(v)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pdf", default=str(HERE / "img" / "frontiers.pdf"))
    ap.add_argument("--out", default=str(HERE / "data" / "frontier.json"))
    ap.add_argument("--check", default=None, help="directory for the side-by-side check images")
    args = ap.parse_args()
    tasks, issues = extract(args.pdf)
    data = {
        "source": "Figure 4 of 'Circuits of LLM Classifiers' (arXiv 2610.30076), recovered from the vector drawing "
                  "of img/frontiers.pdf by scripts/extract_frontier.py",
        "note": "Values are read off the figure, not taken from the evaluation reports. cost: expected cost per item, "
                "rescaled by the priciest judge's mean call (4 significant figures); acc, lo, hi: accuracy in % and "
                "its 95% interval (0.01). Curves list the vertices matplotlib drew, so collinear points dropped by "
                "path simplification are missing; points at the axis' left edge (cost 0.003) stand for budgets "
                "costing at most that. lo/hi are given only where the figure draws a bar (five per LMCircuit curve, "
                "three per baseline), null elsewhere; a bar's lower end is clipped at the point (as drawn). A point "
                "marked approx has no line drawn (all of that curve's points coincide) and takes its accuracy from "
                "the midpoint of its bar. models: the pool judges (large diamonds), named by the calls legend; "
                "other_judges: judges outside the pool (small grey diamonds, unnamed in the figure; one may sit just "
                "past an axis, drawn clipped). calls: the "
                "circuit's calls per item to each pool judge, stacked cheapest first, bands resampled on a shared "
                "cost grid (0.001 calls). x_range / y_range are the axes' limits.",
        "tasks": {k: {kk: vv for kk, vv in tasks[k].items() if not kk.startswith("_")} for k in ORDER if k in tasks},
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(dumps(data) + "\n")
    for k in ORDER:
        if k in tasks:
            t = tasks[k]
            print(f"{k:16s} models {len(t['models'])} others {len(t['other_judges'])} lmcircuit {len(t['lmcircuit'])} "
                  f"baselines {len(t['baselines'])} calls {len(t['calls']['models'])}x{len(t['calls']['x'])} "
                  f"fit {t['_fit']}")
    for s in issues:
        print("ISSUE:", s)
    if args.check:
        for p in check(args.pdf, tasks, args.check):
            print("check:", p)
    print("wrote", out)


if __name__ == "__main__":
    main()
