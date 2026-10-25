"""Build app/public/assets/models/props.glb — projectiles, hazards and set dressing.

Run:
    blender -b --factory-startup -P tools/blender/build_props.py -- app/public/assets/models/props.glb

Every prop is a separate ROOT node (an empty named exactly as below) with its mesh children, origin
at the natural pivot, pointing +X where directional (Blender +Z up → glTF +Y up):

    Arrow (0.85 m), Spear (2.0 m), Javelin (1.6 m)   — centred on the shaft midpoint, tip at +X
    Rock (0.8 m), Boulder (1.8 m), FallingBeam (2.2 m), Chandelier (1.2 m ring) — centred
    SpikeTrap_Base (1.6 × 0.8 m plate)                — origin at the plate's bottom centre
    SpikeTrap_Spikes (5 spikes, 0.7 m)                — origin at the spikes' base
    Crate, Barrel, Banner, LandingFlag (3 m), Torch   — origin on the ground / handle bottom
    ShieldBubble (2.4 m sphere, ribbed energy dome)    — centred; the client scales/tints it per fighter

Static; materials carry natural colours (`Primary` stays near-white so the client can tint it).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mathutils import Vector  # noqa: E402

from lib import export, geom, materials, scene  # noqa: E402
from lib.geom import Geo, cylinder, extrude_outline, lathe, rounded_box, section as S, superquad, sweep, torus  # noqa: E402
from lib.materials import hex_to_linear  # noqa: E402

COLORS = {"Wood": ("#7a5a3a", 0.85, 0.0), "Metal": ("#b8bcc2", 0.4, 0.4), "DarkMetal": ("#45454b", 0.55, 0.35),
          "Cloth": ("#d8cfb8", 0.9, 0.0), "Stone": ("#857d72", 0.95, 0.0), "Glow": ("#ffb347", 0.4, 0.0),
          "Bubble": ("#8fdcff", 0.15, 0.0), "BubbleRib": ("#e8f7ff", 0.3, 0.2)}


def hashf(*a):
    x = math.sin(sum(v * k for v, k in zip(a, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return x - math.floor(x)


# =============================================================================================
# projectiles
# =============================================================================================

def shafted(length, shaft_r, head_len, head_w, head="leaf", fletch=0.0, butt=True):
    """Centred on the shaft midpoint, tip at +length/2."""
    half = length / 2
    g = Geo()
    sx0, sx1 = -half, half - head_len * 0.75
    g.add(sweep([(sx0, 0, 0), (sx1, 0, 0)], [S(shaft_r), S(shaft_r)], seg=8, normal_hint=(0, 0, 1), mat="Wood"))
    hx = half - head_len
    if head == "leaf":
        out = [(hx, 0.0), (hx + head_len * 0.25, head_w * 0.9), (hx + head_len * 0.55, head_w), (half, 0.0),
               (hx + head_len * 0.55, -head_w), (hx + head_len * 0.25, -head_w * 0.9)]
        g.add(extrude_outline(out, head_w * 0.25, bevel=head_w * 0.08, mat="Metal"))
        g.add(sweep([(hx - head_len * 0.25, 0, 0), (hx + head_len * 0.15, 0, 0)], [S(shaft_r * 1.35), S(shaft_r * 1.05)],
                    seg=8, normal_hint=(0, 0, 1), mat="Metal"))
    elif head == "bodkin":
        g.add(sweep([(hx - head_len * 0.1, 0, 0), (hx + head_len * 0.3, 0, 0), (half, 0, 0)],
                    [S(shaft_r * 1.4, n=2.5), S(head_w, n=1.4), S(0.0, 0.0)], seg=4, normal_hint=(0, 0, 1), mat="Metal"))
    elif head == "pilum":
        g.add(sweep([(hx - head_len * 0.15, 0, 0), (hx + head_len * 0.75, 0, 0), (half - head_len * 0.12, 0, 0), (half, 0, 0)],
                    [S(shaft_r * 1.3), S(shaft_r * 0.45), S(head_w, n=1.4), S(0.0, 0.0)], seg=4, normal_hint=(0, 0, 1), mat="Metal"))
    if fletch > 0:
        for a in (0, 120, 240):
            vane = extrude_outline([(0, 0), (fletch, 0), (fletch * 0.85, shaft_r * 4.5), (fletch * 0.15, shaft_r * 5.5)],
                                   0.004, mat="Cloth")
            vane.move(-half + length * 0.03, 0, shaft_r * 0.6).rotate(a, "X")
            g.add(vane)
        g.add(sweep([(-half - 0.01, 0, 0), (-half + 0.02, 0, 0)], [S(shaft_r * 1.3), S(shaft_r * 1.3)], seg=8,
                    normal_hint=(0, 0, 1), mat="DarkMetal"))
    if butt:
        g.add(sweep([(-half - 0.02, 0, 0), (-half + 0.06, 0, 0)], [S(shaft_r * 0.9), S(shaft_r * 1.25)], seg=8,
                    normal_hint=(0, 0, 1), mat="DarkMetal"))
    return g


def arrow():
    return shafted(0.85, 0.011, 0.09, 0.03, head="bodkin", fletch=0.16, butt=False)


def spear():
    g = shafted(2.0, 0.026, 0.36, 0.065, head="leaf")
    for x in (-0.15, -0.05):     # leather grip wraps
        g.add(torus(0.028, 0.008, 10, 4, mat="Cloth").rotate(90, "Y").move(x, 0, 0))
    return g


def javelin():
    g = shafted(1.6, 0.02, 0.42, 0.03, head="pilum")
    g.add(sweep([(-0.12, 0, 0), (0.02, 0, 0)], [S(0.026), S(0.026)], seg=8, normal_hint=(0, 0, 1), mat="Cloth"))
    return g


# =============================================================================================
# rocks
# =============================================================================================

def rock(size, seed, seg=10, rings=7, squash=0.8):
    r = size / 2
    g = superquad(r, r * 0.9, r * squash, 2.0, 2.0, seg=seg, rings=rings, mat="Stone")

    def bump(v):
        n = v.normalized() if v.length > 1e-6 else v
        k = 1.0 + 0.16 * (hashf(round(n.x, 2), round(n.y, 2), round(n.z, 2), seed) - 0.5) * 2 \
            + 0.08 * math.sin(n.x * 5 + seed) * math.cos(n.z * 4 - seed)
        return v * k
    g.deform(bump)
    # flatten a few facets (chiselled look)
    for ax, cut in ((Vector((0.6, -0.5, 0.6)).normalized(), 0.82), (Vector((-0.7, -0.3, -0.4)).normalized(), 0.85),
                    (Vector((0.1, 0.9, 0.3)).normalized(), 0.85)):
        def flat(v, ax=ax, cut=cut):
            d = v.dot(ax)
            lim = cut * r
            return v - ax * (d - lim) if d > lim else v
        g.deform(flat)
    return g


# =============================================================================================
# hazards
# =============================================================================================

def spike_base():
    g = rounded_box(1.6, 0.8, 0.06, 6.0, mat="DarkMetal").move(0, 0, 0.03)
    g.add(rounded_box(1.5, 0.12, 0.012, 4.0, mat="DarkMetal").move(0, 0, 0.066))
    for i in range(5):
        x = -0.6 + 0.3 * i
        g.add(torus(0.075, 0.014, 12, 4, mat="Metal").move(x, 0, 0.062))
    for x in (-0.74, 0.74):
        for y in (-0.33, 0.33):
            g.add(superquad(0.025, 0.025, 0.015, 2.0, 2.0, seg=8, rings=3, mat="Metal").move(x, y, 0.064))
    return g


def spikes():
    g = rounded_box(1.4, 0.10, 0.06, 5.0, mat="DarkMetal").move(0, 0, 0.03)
    for i in range(5):
        x = -0.6 + 0.3 * i
        g.add(sweep([(x, 0, 0.0), (x, 0, 0.12), (x, 0, 0.70)], [S(0.06, 0.06, 3.5), S(0.05, 0.05, 1.6), S(0.0, 0.0)],
                    seg=4, normal_hint=(1, 0, 0), mat="Metal"))
    return g


def falling_beam():
    g = rounded_box(2.0, 0.30, 0.30, 7.0, mat="Wood")
    for s in (1, -1):        # splintered ends
        for k in range(5):
            y = -0.1 + 0.05 * k
            z = 0.1 * math.sin(k * 2.1)
            L = 0.06 + 0.08 * hashf(k, s)
            g.add(sweep([(s * 0.98, y, z), (s * (1.0 + L), y + 0.01, z)], [S(0.04, 0.03), S(0.0, 0.0)], seg=4,
                        normal_hint=(0, 0, 1), mat="Wood"))
    for x in (-0.6, 0.6):
        g.add(rounded_box(0.08, 0.32, 0.32, 8.0, mat="DarkMetal").move(x, 0, 0))
        for y, z in ((-0.165, 0.08), (-0.165, -0.08)):
            g.add(superquad(0.02, 0.012, 0.02, 2.0, 2.0, seg=6, rings=3, mat="Metal").move(x, y, z))
    return g


def chandelier():
    g = torus(0.6, 0.04, 28, 6, mat="DarkMetal")
    g.add(torus(0.6, 0.02, 28, 4, mat="DarkMetal").move(0, 0, -0.07))
    for i in range(8):
        a = 2 * math.pi * i / 8
        x, y = 0.6 * math.cos(a), 0.6 * math.sin(a)
        g.add(cylinder(0.045, 0.03, seg=8, r2=0.06, mat="Metal").move(x, y, 0.03))           # drip cup
        g.add(cylinder(0.03, 0.17, seg=8, mat="Cloth").move(x, y, 0.06))                    # candle
        g.add(lathe([(0.0, 0.0), (0.018, 0.02), (0.016, 0.05), (0.0, 0.09)], seg=6, mat="Glow").move(x, y, 0.24))
        g.add(sweep([(x * 0.98, y * 0.98, -0.02), (x * 1.08, y * 1.08, -0.10), (x * 1.04, y * 1.04, -0.16)],
                    [S(0.012), S(0.01), S(0.0, 0.0)], seg=4, normal_hint=(0, 0, 1), mat="DarkMetal"))   # curl
    for i in range(3):       # chains to the hanging ring
        a = 2 * math.pi * i / 3 + 0.3
        p0 = Vector((0.6 * math.cos(a), 0.6 * math.sin(a), 0.02))
        p1 = Vector((0, 0, 0.75))
        for k in range(13):
            t = (k + 0.5) / 13
            c = p0.lerp(p1, t)
            link = torus(0.032, 0.008, 8, 4, mat="DarkMetal").rotate(90, "X").rotate(90 if k % 2 else 0, "Z")
            g.add(link.move(c.x, c.y, c.z))
    g.add(torus(0.06, 0.014, 12, 4, mat="DarkMetal").rotate(90, "X").move(0, 0, 0.82))
    g.add(superquad(0.08, 0.08, 0.05, 2.0, 2.0, seg=10, rings=4, mat="DarkMetal").move(0, 0, 0.74))
    return g


# =============================================================================================
# set dressing
# =============================================================================================

def crate():
    s = 0.9
    g = rounded_box(s - 0.04, s - 0.04, s - 0.04, 10.0, mat="Wood").move(0, 0, s / 2)
    # plank grooves + frame
    for ax in ("X", "Y"):
        for sgn in (1, -1):
            for e in (-1, 1):
                if ax == "X":
                    g.add(rounded_box(0.09, 0.03, s, 6.0, mat="Wood").move(e * (s / 2 - 0.045), sgn * s / 2, s / 2))
                    g.add(rounded_box(s, 0.03, 0.09, 6.0, mat="Wood").move(0, sgn * s / 2, s / 2 + e * (s / 2 - 0.045)))
                else:
                    g.add(rounded_box(0.03, 0.09, s, 6.0, mat="Wood").move(sgn * s / 2, e * (s / 2 - 0.045), s / 2))
                    g.add(rounded_box(0.03, s, 0.09, 6.0, mat="Wood").move(sgn * s / 2, 0, s / 2 + e * (s / 2 - 0.045)))
        # diagonal brace on each side face
    for sgn in (1, -1):
        g.add(rounded_box(1.05, 0.03, 0.08, 6.0, mat="Wood").rotate(45, "Y").move(0, sgn * s / 2, s / 2))
        g.add(rounded_box(0.03, 1.05, 0.08, 6.0, mat="Wood").rotate(45, "X").move(sgn * s / 2, 0, s / 2))
    for x in (-1, 1):
        for y in (-1, 1):
            for z in (0.05, s - 0.05):
                g.add(rounded_box(0.11, 0.11, 0.11, 6.0, mat="DarkMetal").move(x * (s / 2 - 0.02), y * (s / 2 - 0.02), z))
    return g


def barrel():
    prof = [(0.0, 0.0), (0.30, 0.0), (0.34, 0.12), (0.38, 0.5), (0.34, 0.88), (0.30, 1.0), (0.0, 1.0)]
    g = lathe(prof, seg=20, mat="Wood")
    for z, r in ((0.08, 0.325), (0.26, 0.362), (0.74, 0.362), (0.92, 0.325)):
        g.add(torus(r, 0.016, 20, 4, mat="DarkMetal", n_v=4.0).scale(1, 1, 1.6).move(0, 0, z))
    g.add(cylinder(0.27, 0.012, seg=20, mat="Wood").move(0, 0, 0.995))
    for k in range(14):     # stave lines
        a = 2 * math.pi * k / 14
        g.add(sweep([(0.345 * math.cos(a), 0.345 * math.sin(a), 0.12), (0.385 * math.cos(a), 0.385 * math.sin(a), 0.5),
                     (0.345 * math.cos(a), 0.345 * math.sin(a), 0.88)], [S(0.006)] * 3, seg=4, normal_hint=(0, 0, 1), mat="DarkMetal"))
    return g


def banner():
    g = cylinder(0.035, 2.6, seg=8, r2=0.03, mat="Wood")
    g.add(sweep([(-0.05, 0, 2.42), (0.95, 0, 2.42)], [S(0.025), S(0.025)], seg=8, normal_hint=(0, 0, 1), mat="Wood"))
    g.add(lathe([(0.0, 0.0), (0.05, 0.03), (0.03, 0.10), (0.0, 0.18)], seg=8, mat="Metal").move(0, 0, 2.6))
    cloth = extrude_outline([(0.04, 2.40), (0.90, 2.40), (0.90, 1.05), (0.47, 1.30), (0.04, 1.05)], 0.02, mat="Primary")
    cloth.deform(lambda v: Vector((v.x, v.y + 0.04 * math.sin(v.x * 6.0) * (2.4 - v.z), v.z)))
    g.add(cloth)
    trim = extrude_outline([(0.04, 2.40), (0.90, 2.40), (0.90, 2.30), (0.04, 2.30)], 0.03, mat="Cloth")
    g.add(trim)
    # emblem: simple cross
    g.add(extrude_outline([(0.42, 2.15), (0.52, 2.15), (0.52, 1.45), (0.42, 1.45)], 0.03, mat="Cloth"))
    g.add(extrude_outline([(0.25, 1.88), (0.69, 1.88), (0.69, 1.78), (0.25, 1.78)], 0.03, mat="Cloth"))
    return g


def landing_flag():
    g = cylinder(0.05, 3.0, seg=10, r2=0.035, mat="Wood")
    g.add(lathe([(0.0, 0.0), (0.06, 0.03), (0.035, 0.11), (0.0, 0.2)], seg=8, mat="Metal").move(0, 0, 3.0))
    g.add(cylinder(0.12, 0.12, seg=10, r2=0.08, mat="DarkMetal"))
    flag = extrude_outline([(0.04, 2.95), (1.10, 2.80), (0.80, 2.55), (1.05, 2.30), (0.04, 2.30)], 0.02, mat="Primary")
    flag.deform(lambda v: Vector((v.x, v.y + 0.06 * math.sin(v.x * 5.5), v.z - 0.03 * v.x)))
    g.add(flag)
    return g


def torch():
    g = cylinder(0.03, 0.55, seg=8, r2=0.038, mat="Wood")
    g.add(lathe([(0.04, 0.50), (0.08, 0.56), (0.085, 0.66), (0.06, 0.70)], seg=10, mat="DarkMetal"))
    g.add(superquad(0.07, 0.07, 0.06, 2.0, 2.0, seg=10, rings=5, mat="Cloth").move(0, 0, 0.68))
    flame = lathe([(0.0, 0.66), (0.07, 0.70), (0.08, 0.78), (0.05, 0.88), (0.02, 0.97), (0.0, 1.02)], seg=10, mat="Glow")
    flame.deform(lambda v: Vector((v.x + 0.09 * max(0.0, v.z - 0.7) ** 1.5, v.y, v.z)))
    g.add(flame)
    return g


def shield_bubble():
    """Energy shield dome: a translucent shell (tinted/alpha'd by the client) with latitude + meridian ribs,
    a boss ring and stud on the front (+X). Centred on the origin, diameter 2.4 m."""
    R = 1.2
    g = superquad(R, R, R, 2.0, 2.0, seg=28, rings=16, mat="Bubble")
    for z in (-0.66, 0.0, 0.66):                      # latitude rings
        r = math.sqrt(R * R - z * z) + 0.004
        g.add(torus(r, 0.017, 36, 4, mat="BubbleRib").move(0, 0, z))
    for a in (0, 45, 90, 135):                        # meridian ribs
        g.add(torus(R + 0.004, 0.017, 36, 4, mat="BubbleRib").rotate(90, "X").rotate(a, "Z"))
    # boss ring + stud on the front face
    g.add(torus(0.34, 0.02, 6, 4, mat="BubbleRib").rotate(90, "Y").move(R * 0.97, 0, 0))
    g.add(superquad(0.07, 0.07, 0.07, 2.0, 2.0, seg=10, rings=5, mat="BubbleRib").move(R * 1.0, 0, 0))
    return g


PROPS = [
    ("Arrow", arrow), ("Spear", spear), ("Javelin", javelin),
    ("Rock", lambda: rock(0.8, 1.7)), ("Boulder", lambda: rock(1.8, 4.2, seg=14, rings=9, squash=0.85)),
    ("SpikeTrap_Base", spike_base), ("SpikeTrap_Spikes", spikes), ("FallingBeam", falling_beam),
    ("Chandelier", chandelier), ("Crate", crate), ("Barrel", barrel), ("Banner", banner),
    ("LandingFlag", landing_flag), ("Torch", torch), ("ShieldBubble", shield_bubble),
]


def build():
    scene.reset()
    mats = {}
    for name, (hexv, rough, metal) in COLORS.items():
        mats[name] = materials.make(name, rgb=hex_to_linear(hexv), roughness=rough, metallic=metal,
                                    emission=2.0 if name == "Glow" else 0.6 if name == "Bubble" else None)
    mats["Primary"] = materials.make("Primary")
    # spread the roots out along -Y so they do not overlap in the file (pivots stay at each root's origin)
    tris = 0
    for i, (name, fn) in enumerate(PROPS):
        root = scene.empty(name, (0.0, 2.5 * i, 0.0), size=0.3, display="ARROWS")
        g = fn()
        flat = name in ("Rock", "Boulder")
        obj = geom.to_object(name + "_Mesh", g, mats, smooth=not flat, sharp_angle=40.0)
        obj.parent = root
        tris += g.tri_count()
    print("[props] ~%d triangles" % tris)


def main():
    args = scene.script_args()
    out = args[0] if args else os.path.join(os.path.dirname(__file__), "..", "..", "app", "public", "assets", "models", "props.glb")
    build()
    export.export_glb(os.path.abspath(out), animation_mode="ACTIONS")


if __name__ == "__main__":
    main()
