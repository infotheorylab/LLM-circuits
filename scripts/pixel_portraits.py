"""Author portraits for the Authors section: a square photo and a 16-bit version of each.

    python3 -I scripts/pixel_portraits.py --src <dir of downloaded headshots> --out img/authors [--debug <dir>]

The raw headshots stay outside the site folder; only the processed files are published.
For each author this writes
    <slug>.jpg        480x480 crop around the face, JPEG quality 85
    <slug>-16bit.png  the same crop as 64x64 pixel art, upscaled 6x (nearest neighbour) to 384x384

Pixel art, per author:
  1. a person / background mask: a hand-traced rough silhouette gives sure-person and
     sure-background zones, and two colour models (one per zone) decide the band between them;
  2. skin tones corrected where a photo has a colour cast, texture flattened, features sharpened,
     then the crop downscaled with area averaging to 64x64;
  3. slightly more contrast and saturation on the person;
  4. every pixel mapped to one palette shared by all six portraits: three page colours plus 19
     learned from all six people together, face pixels weighted up so skin, eyes and lips get
     colours of their own;
  5. the background replaced by one flat page colour, with a one-pixel outline around the person.
Needs numpy, scipy, scikit-learn and Pillow.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture

PHOTO_PX = 480
ART_PX = 64          # pixel-art resolution: 64 kept faces recognisable, 48 did not; 384 / 64 = 6
OUT_PX = 384
SEG_PX = 192         # the mask is found at 4x the art resolution, then averaged down
N_LEARNED = 19       # palette colours learned from the six people
BG = (0xE3, 0xE7, 0xEE)       # --line: the flat background behind every portrait
OUTLINE = (0x17, 0x28, 0x4D)  # --ink
# page colours that join the palette as they are, so dark clothing and highlights stay neutral and
# match the page: --ink-2, --muted, white. 19 learned + 3 + background + outline = 24 colours.
ANCHORS = [(0x46, 0x50, 0x6A), (0x68, 0x70, 0x89), (0xFF, 0xFF, 0xFF)]

# Crop boxes (left, top, side) in source pixels, chosen so that every face has about the same
# eye-to-chin height (0.38 of the side) with the eyes a little above the middle. Flavio's
# source is too narrow for that, so his face is a little larger and his head a little left.
# `body` is a rough outline of the person in crop coordinates (0..1), traced by hand on a grid;
# `face` is (cx, cy, rx, ry) of the face, used to weight the palette.
PEOPLE = {
    'hadi-khalaf': dict(src='hadi-khalaf.jpeg', box=(195, 105, 576), face=(0.48, 0.5, 0.17, 0.25), band=0.035, body=[
        (0, 1), (.02, .98), (.09, .92), (.15, .88), (.2, .84), (.24, .8), (.27, .76), (.29, .72), (.3, .65),
        (.24, .55), (.23, .45), (.24, .35), (.25, .25), (.3, .17), (.38, .11), (.48, .09), (.58, .1),
        (.66, .15), (.7, .25), (.71, .36), (.71, .45), (.69, .55), (.66, .62), (.64, .7), (.65, .76),
        (.67, .81), (.71, .86), (.8, .9), (.87, .94), (.93, .98), (.95, 1)]),
    'sajani-vithana': dict(src='sajani-vithana-site.jpg', box=(240, 428, 1108), face=(0.5, 0.52, 0.2, 0.27), body=[
        (0, 1), (0, .82), (.08, .78), (.18, .72), (.22, .6), (.22, .45), (.21, .3), (.22, .15), (.27, .05),
        (.32, 0), (.82, 0), (.87, .08), (.9, .2), (.91, .35), (.9, .5), (.92, .6), (1, .65), (1, 1)]),
    'kunal-talreja': dict(src='kunal-talreja-cadambe-group.jpg', box=(99, 73, 316), face=(0.5, 0.52, 0.2, 0.25),
                          skin=dict(lift=7, cast=0.5), hair=0.55, contrast=1.2, body=[
        (0, 1), (0, .94), (.12, .89), (.28, .83), (.3, .74), (.24, .62), (.2, .55), (.19, .45), (.19, .32),
        (.21, .18), (.28, .07), (.4, .02), (.55, .02), (.7, .06), (.8, .15), (.83, .28), (.82, .4), (.81, .55),
        (.75, .65), (.7, .74), (.72, .83), (.88, .88), (1, .93), (1, 1)]),
    'haewon-jeong': dict(src='haewon-jeong-site.png', box=(355, 274, 1210), face=(0.49, 0.52, 0.2, 0.27), body=[
        (.1, 1), (.13, .93), (.15, .8), (.15, .6), (.17, .42), (.2, .25), (.27, .12), (.38, .06), (.5, .04),
        (.62, .06), (.71, .13), (.77, .27), (.8, .45), (.82, .65), (.84, .82), (.9, .92), (.98, .97), (1, 1)]),
    'viveck-cadambe': dict(src='viveck-cadambe-gt.jpg', box=(48, 1, 771), face=(0.53, 0.47, 0.17, 0.24), body=[
        (.1, 1), (.12, .93), (.18, .86), (.3, .8), (.42, .72), (.37, .65), (.34, .55), (.32, .45), (.3, .33),
        (.31, .22), (.38, .13), (.5, .1), (.62, .12), (.72, .2), (.76, .32), (.76, .45), (.74, .55), (.72, .65),
        (.8, .7), (.92, .76), (1, .8), (1, 1)]),
    'flavio-calmon': dict(src='flavio-calmon-lab.jpg', box=(0, 38, 717), face=(0.4, 0.45, 0.2, 0.27), body=[
        (.22, 1), (.25, .92), (.3, .85), (.27, .78), (.23, .68), (.17, .62), (.12, .55), (.12, .48), (.14, .42),
        (.14, .32), (.17, .2), (.25, .1), (.35, .06), (.48, .07), (.57, .12), (.62, .22), (.63, .32), (.68, .33),
        (.72, .4), (.7, .5), (.65, .55), (.66, .68), (.7, .72), (.8, .8), (.9, .83), (1, .85), (1, 1)]),
}


# ------------------------------------------------------------------ colour space (sRGB <-> CIELAB, D65)

def _lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gam(c):
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
    return np.clip(c * 255.0, 0, 255)


_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def to_lab(rgb):
    xyz = _lin(np.asarray(rgb, float)) @ _M.T / _WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def to_rgb(lab):
    lab = np.asarray(lab, float)
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * _WHITE
    return _gam(xyz @ np.linalg.inv(_M).T)


# ------------------------------------------------------------------ steps

def crop(path, box):
    im = Image.open(path).convert('RGB')
    l, t, s = box
    if l < 0 or t < 0 or l + s > im.width or t + s > im.height:
        raise ValueError('%s: crop %s leaves the %dx%d image' % (path, box, im.width, im.height))
    return im.crop((l, t, l + s, t + s))


def ellipse(face, n, scale=1.0):
    cx, cy, rx, ry = face
    yy, xx = (np.mgrid[0:n, 0:n] + 0.5) / n
    return ((xx - cx) / (rx * scale)) ** 2 + ((yy - cy) / (ry * scale)) ** 2 <= 1


def person_mask(lab, body, band=0.06):
    """Person / background mask at SEG_PX, from the traced outline and two colour models."""
    n = lab.shape[0]
    # the outline is drawn on a padded canvas so the frame edge is not mistaken for a boundary
    pad = n // 4
    canvas = Image.new('L', (n + 2 * pad, n + 2 * pad), 0)
    pts = [(pad + x * n - (pad if x <= 0 else -pad if x >= 1 else 0),
            pad + y * n + (pad if y >= 1 else 0)) for x, y in body]
    ImageDraw.Draw(canvas).polygon(pts, fill=1)
    P = np.asarray(canvas, bool)
    d_in = ndimage.distance_transform_edt(P)[pad:-pad, pad:-pad]
    d_out = ndimage.distance_transform_edt(~P)[pad:-pad, pad:-pad]
    band = band * n
    sure_fg, sure_bg = d_in > band, d_out > band
    feats = ndimage.gaussian_filter(lab, (0.8, 0.8, 0)).reshape(-1, 3)
    g_fg = GaussianMixture(6, covariance_type='full', random_state=0, reg_covar=1.0).fit(feats[sure_fg.ravel()])
    g_bg = GaussianMixture(6, covariance_type='full', random_state=0, reg_covar=1.0).fit(feats[sure_bg.ravel()])
    llr = np.clip((g_fg.score_samples(feats) - g_bg.score_samples(feats)).reshape(n, n), -12, 12)
    signed = np.where(P[pad:-pad, pad:-pad], d_in, -d_out)
    score = ndimage.gaussian_filter(llr, 1.2) + 0.25 * signed   # trust the outline more far from it
    m = sure_fg | (~sure_bg & (score > 0))
    lab_, k = ndimage.label(m)
    if k > 1:   # keep the person, drop stray islands
        sizes = ndimage.sum(m, lab_, range(1, k + 1))
        m = lab_ == (1 + int(np.argmax(sizes)))
    m = ndimage.binary_fill_holes(m)
    return ndimage.binary_opening(m, iterations=1)


def fix_skin(lab, face, hue=(42, 56), min_chroma=20, lift=0.0, cast=0.0):
    """Selective colour correction: move colours near the face colour to a natural skin hue.
    Two of the photos have a cool cast (sky light, office light) that would otherwise turn the
    skin grey or violet once the palette is applied. Colours far from the skin (a blue shirt,
    dark hair) barely move. `cast` applies that share of the shift to every colour, for a photo
    whose whole colour balance is off; `lift` brightens a face that the photo left in shadow."""
    n = lab.shape[0]
    f = np.median(lab[ellipse(face, n, 0.6)], 0)
    h = np.degrees(np.arctan2(f[2], f[1]))
    c = np.hypot(f[1], f[2])
    th = np.radians(np.clip(h, *hue))
    tc = max(c, min_chroma)
    delta = np.array([tc * np.cos(th) - f[1], tc * np.sin(th) - f[2]])
    w = np.exp(-((lab[..., 1:] - f[1:]) ** 2).sum(-1) / (2 * 14.0 ** 2) - (lab[..., 0] - f[0]) ** 2 / (2 * 22.0 ** 2))
    out = lab.copy()
    out[..., 1:] += (cast + (1 - cast) * w)[..., None] * delta
    near = np.exp(-((lab[..., 1:] - f[1:]) ** 2).sum(-1) / (2 * 14.0 ** 2) - (lab[..., 0] - f[0]) ** 2 / (2 * 10.0 ** 2))
    out[..., 0] = np.clip(out[..., 0] + lift * near, 0, 100)
    return out


def darken_hair(lab, mask, face, k):
    """Bright sky behind one photo greys out dark hair; bring it back to near black.
    Only dark pixels of the person outside the face and above the jaw are touched."""
    n = lab.shape[0]
    yy = (np.mgrid[0:n, 0:n][0] + 0.5) / n
    hair = mask & ~ellipse(face, n) & (yy < face[1] + 0.1) & (lab[..., 0] < 45)
    hair = ndimage.gaussian_filter(hair.astype(float), 1.0)
    out = lab.copy()
    out[..., 0] *= 1 - (1 - k) * hair
    out[..., 1:] *= (1 - 0.5 * hair)[..., None]
    return out


def bilateral(lab, radius=3, sigma_s=2.0, sigma_r=7.0):
    """Edge-preserving smoothing: flattens skin and fabric texture, keeps eyes and outlines."""
    n = lab.shape[0]
    padded = np.pad(lab, ((radius, radius), (radius, radius), (0, 0)), mode='edge')
    acc = np.zeros_like(lab)
    wsum = np.zeros(lab.shape[:2])
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            sh = padded[radius + dy:radius + dy + n, radius + dx:radius + dx + n]
            w = np.exp(-(dx * dx + dy * dy) / (2 * sigma_s ** 2) - ((sh - lab) ** 2).sum(-1) / (2 * sigma_r ** 2))
            acc += w[..., None] * sh
            wsum += w
    return acc / wsum[..., None]


def sharpen(lab, sigma=2.0, amount=0.9):
    """Unsharp mask on lightness at about half an art pixel, so brows, eyes and mouth stay dark."""
    out = lab.copy()
    L = lab[..., 0]
    out[..., 0] = np.clip(L + amount * (L - ndimage.gaussian_filter(L, sigma)), 0, 100)
    return out


def area_down(a, n):
    k = a.shape[0] // n
    return a.reshape(n, k, n, k, -1).mean(axis=(1, 3)).squeeze()


def punch(lab, mask, contrast=1.12, sat=1.12):
    """A little more contrast and saturation on the person."""
    out = lab.copy()
    L = lab[..., 0]
    mu = L[mask].mean()
    out[..., 0] = np.where(mask, np.clip(mu + contrast * (L - mu), 0, 100), L)
    out[..., 1:] = np.where(mask[..., None], lab[..., 1:] * sat, lab[..., 1:])
    return out


def learn_palette(items, k):
    """One palette for all six: k-means in Lab over every person's pixels, equal weight per person,
    face pixels weighted up so that skin, eyes and lips get colours of their own."""
    X, W = [], []
    for it in items:
        m = it['mask']
        w = np.where(ellipse(it['face'], m.shape[0]), 5.0, 1.0)[m]
        X.append(it['lab'][m])
        W.append(w / w.sum())
    X, W = np.concatenate(X), np.concatenate(W)
    km = KMeans(k, n_init=8, random_state=0).fit(X, sample_weight=W)
    return km.cluster_centers_


def quantize(lab, pal):
    d = ((lab[..., None, :] - pal[None, None]) ** 2).sum(-1)
    return d.argmin(-1)


def despeckle(idx, mask):
    """Replace lone pixels whose 8 neighbours mostly agree on another colour (pixel-art cleanup)."""
    out = idx.copy()
    H, W = idx.shape
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not mask[y, x]:
                continue
            nb = np.delete(idx[y - 1:y + 2, x - 1:x + 2].ravel(), 4)
            if (nb == idx[y, x]).sum() == 0:
                vals, cnt = np.unique(nb, return_counts=True)
                if cnt.max() >= 5:
                    out[y, x] = vals[cnt.argmax()]
    return out


def smooth_mask(mask):
    """Silhouette cleanup: drop one-pixel spurs and fill one-pixel notches, which read as noise
    in the outline (wind-blown hair, for one)."""
    m = mask.copy()
    for _ in range(2):
        nb = ndimage.convolve(m.astype(int), np.ones((3, 3), int), mode='nearest') - m
        m = (m & (nb >= 3)) | (~m & (nb >= 6))
    return m


def merge_blotches(idx, mask, pal, max_de=10.0, passes=1):
    """Majority filter that only merges similar colours: a pixel joins the colour most of its
    eight neighbours share when the two are close (skin blotches), never when they differ a lot
    (an eye, a lip line, a beard edge)."""
    out = idx.copy()
    H, W = idx.shape
    for _ in range(passes):
        cur = out.copy()
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if not mask[y, x]:
                    continue
                nb = np.delete(cur[y - 1:y + 2, x - 1:x + 2].ravel(), 4)
                nm = np.delete(mask[y - 1:y + 2, x - 1:x + 2].ravel(), 4)
                vals, cnt = np.unique(nb[nm], return_counts=True)
                if not len(vals):
                    continue
                c = vals[cnt.argmax()]
                if c != cur[y, x] and cnt.max() >= 5 and np.linalg.norm(pal[c] - pal[cur[y, x]]) < max_de:
                    out[y, x] = c
    return out


def render(idx, mask, pal_rgb):
    rgb = pal_rgb[idx].astype(np.uint8)
    rgb[~mask] = BG
    # outline: background pixels that touch the person (4-neighbourhood)
    ring = ndimage.binary_dilation(mask, structure=ndimage.generate_binary_structure(2, 1)) & ~mask
    rgb[ring] = OUTLINE
    return Image.fromarray(rgb)


def build(src, art_px, k):
    items = []
    for slug, p in PEOPLE.items():
        sq = crop(os.path.join(src, p['src']), p['box'])
        lab = to_lab(np.asarray(sq.resize((SEG_PX, SEG_PX), Image.BOX), float))
        big = person_mask(lab, p['body'], p.get('band', 0.06))
        lab = fix_skin(lab, p['face'], **p.get('skin', {}))
        if 'hair' in p:
            lab = darken_hair(lab, big, p['face'], p['hair'])
        lab = sharpen(bilateral(lab))
        mask = smooth_mask(area_down(big.astype(float)[..., None], art_px) > 0.5)
        small = punch(area_down(lab, art_px), mask, p.get('contrast', 1.12))
        items.append(dict(slug=slug, sq=sq, big=big, mask=mask, lab=small, face=p['face']))
    pal = np.concatenate([learn_palette(items, k), to_lab(np.array(ANCHORS, float))])
    pal_rgb = np.round(to_rgb(pal)).astype(np.uint8)
    for it in items:
        idx = merge_blotches(despeckle(quantize(it['lab'], pal), it['mask']), it['mask'], pal)
        it['art'] = render(idx, it['mask'], pal_rgb)
    return items, pal_rgb


def debug_sheets(items, pal_rgb, out, tag):
    t = 240
    sheet = Image.new('RGB', (t * 3, t * len(items)), 'white')
    for i, it in enumerate(items):
        ph = it['sq'].resize((t, t), Image.LANCZOS)
        ov = np.asarray(ph.resize((SEG_PX, SEG_PX)), float)
        ov[~it['big']] = ov[~it['big']] * 0.3 + np.array([255, 0, 255]) * 0.7
        sheet.paste(ph, (0, i * t))
        sheet.paste(Image.fromarray(ov.astype(np.uint8)).resize((t, t), Image.NEAREST), (t, i * t))
        sheet.paste(it['art'].resize((t, t), Image.NEAREST), (2 * t, i * t))
    sheet.save(os.path.join(out, 'pixel-debug-%s.png' % tag))
    grid = Image.new('RGB', (OUT_PX * 3 + 40, OUT_PX * 2 + 30), (246, 247, 250))
    for i, it in enumerate(items):
        grid.paste(it['art'].resize((OUT_PX, OUT_PX), Image.NEAREST),
                   (10 + (i % 3) * (OUT_PX + 10), 10 + (i // 3) * (OUT_PX + 10)))
    grid.save(os.path.join(out, 'pixel-set-%s.png' % tag))
    sw = Image.new('RGB', (len(pal_rgb) * 24, 24))
    for i, c in enumerate(pal_rgb):
        sw.paste(tuple(int(v) for v in c), (i * 24, 0, i * 24 + 24, 24))
    sw.save(os.path.join(out, 'palette-%s.png' % tag))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--art', type=int, default=ART_PX, help='pixel-art resolution (48 or 64)')
    ap.add_argument('--debug', help='also write comparison sheets here')
    a = ap.parse_args()
    if SEG_PX % a.art or OUT_PX % a.art:
        raise SystemExit('--art must divide %d and %d' % (SEG_PX, OUT_PX))
    os.makedirs(a.out, exist_ok=True)
    items, pal_rgb = build(a.src, a.art, N_LEARNED)
    for it in items:
        it['sq'].resize((PHOTO_PX, PHOTO_PX), Image.LANCZOS).save(
            os.path.join(a.out, it['slug'] + '.jpg'), quality=85, optimize=True, progressive=True)
        it['art'].resize((OUT_PX, OUT_PX), Image.NEAREST).save(
            os.path.join(a.out, it['slug'] + '-16bit.png'), optimize=True)
    used = {tuple(c) for it in items for c in np.asarray(it['art']).reshape(-1, 3)}
    print('%d colours in the set: %s' % (len(used), ' '.join('#%02X%02X%02X' % c for c in sorted(used))))
    if a.debug:
        os.makedirs(a.debug, exist_ok=True)
        debug_sheets(items, pal_rgb, a.debug, str(a.art))


if __name__ == '__main__':
    main()
