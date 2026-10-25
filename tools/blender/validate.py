"""Validate exported GLBs against docs/contracts.md §4.1.

Checks the raw glTF JSON (node / material / animation names, durations, no skins or morphs,
animation only on non-mesh nodes, +Y up / +X facing / ground origin) and then re-imports each
file with Blender's glTF importer to make sure it loads with every node and clip.

Run:
    blender -b --factory-startup -P tools/blender/validate.py -- [file.glb ...]   (default: every model)
Exit code 1 on any failure.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from lib import gltf  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MAX_BYTES = 1.5 * 1024 * 1024

HUMANOID_NODES = (
    ["Base_Head", "Base_Torso", "Base_Pelvis", "Base_Abdomen"]
    + ["Base_%s_%s" % (p, s) for p in ("UpperArm", "Forearm", "Hand", "Thigh", "Shin", "Foot") for s in "LR"]
    + ["Helm_Great", "Helm_Nasal", "Helm_Horned", "Helm_Turban", "Helm_Spiked", "Helm_Crown", "Helm_Hood",
       "Helm_WizardHat", "Helm_WitchHat", "Helm_Viking", "Hair_Short", "Hair_Long", "Hair_Beard",
       "Crest_Plume", "Crest_Feather", "Crest_Antlers", "Back_Cape", "Tabard_Front",
       "Weapon_Sword", "Weapon_Scimitar", "Weapon_Spear", "Weapon_Axe", "Weapon_Club", "Weapon_Dagger", "Weapon_Staff",
       "Shield_Kite", "Shield_Round", "Shield_Heater", "Shield_Buckler", "Offhand_Bow",
       "Socket_Projectile", "Socket_Head"]
)
HUMANOID_PREFIXES = ["Armor_Plate_", "Armor_Mail_", "Armor_Leather_", "Armor_Robe_", "Armor_Rags_", "Armor_Fur_"]
HUMANOID_MATERIALS = ["Primary", "Secondary", "Metal", "DarkMetal", "Leather", "Skin", "Hair", "Wood", "Cloth", "Glow"]
HUMANOID_CLIPS = {
    "Idle": 2.0, "Walk": 1.0, "Run": 0.6, "Jump": 0.4, "Fall": 0.5, "Land": 0.25, "Dodge": 0.5, "BlockRaise": 0.15,
    "BlockHold": 1.0, "AttackLight": 1.0, "AttackHeavy": 1.0, "Cast": 1.0, "Shoot": 1.0, "Throw": 1.0, "Hit": 0.4,
    "Stagger": 0.8, "Stunned": 1.0, "Death": 1.2, "Victory": 2.0, "MountedIdle": 2.0, "MountedRide": 0.6,
    "MountedAttackLight": 1.0, "MountedAttackHeavy": 1.0, "MountedBlock": 1.0, "MountedHit": 0.4, "FlyRide": 0.8,
    "JumpAttack": 1.0, "Plunge": 1.0, "ShieldBash": 1.0, "Lunge": 1.0, "ComboFinisher": 1.0,
}
HORSE_NODES = ["Saddle"]
HORSE_MATERIALS = ["Coat", "Mane", "Primary", "Secondary", "Leather", "Metal"]
HORSE_CLIPS = {"Idle": 2.0, "Walk": 1.2, "Gallop": 0.6, "Rear": 1.0, "Hit": 0.4, "Death": 1.5}

failures = []


def check(cond, msg):
    print(("  ok    " if cond else "  FAIL  ") + msg)
    if not cond:
        failures.append(msg)


def world_bounds(doc, worlds, node_name):
    idx = next(i for i, n in enumerate(doc["nodes"]) if n.get("name") == node_name)
    lo, hi = gltf.mesh_local_bounds(doc, doc["nodes"][idx]["mesh"])
    m = worlds[node_name]
    pts = [gltf.transform_point(m, (x, y, z)) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def check_common(path, nodes, prefixes, mats, clips, max_bytes=MAX_BYTES, exact_mats=False):
    print("\n== %s" % path)
    check(os.path.exists(path), "file exists")
    if not os.path.exists(path):
        return None, None
    size = os.path.getsize(path)
    check(size < max_bytes, "size %.0f KB < %.0f KB" % (size / 1024, max_bytes / 1024))
    doc, binchunk = gltf.read_glb(path)
    names = [n.get("name") for n in doc["nodes"]]
    for n in nodes:
        check(n in names, "node %s" % n)
    for p in prefixes:
        check(any(x and x.startswith(p) for x in names), "node group %s*" % p)
    check(len(names) == len(set(names)), "node names unique")
    mnames = [m.get("name") for m in doc.get("materials", [])]
    for m in mats:
        check(m in mnames, "material %s" % m)
    if exact_mats:
        check(set(mnames) <= set(mats), "no materials outside %s (got %s)" % (sorted(mats), sorted(mnames)))
    durs = gltf.animation_durations(doc, binchunk)
    for c, d in clips.items():
        check(c in durs and abs(durs[c] - d) < 1e-3, "clip %s = %.3fs (got %s)" % (c, d, "%.4f" % durs[c] if c in durs else "missing"))
    check(set(durs) == set(clips), "no unexpected clips (extra: %s)" % sorted(set(durs) - set(clips)))
    check(not doc.get("skins"), "no skins")
    morph = any("targets" in p for m in doc.get("meshes", []) for p in m["primitives"])
    check(not morph, "no morph targets")
    targets = {}
    mesh_animated = []
    for a in doc.get("animations", []):
        tset = set()
        for ch in a["channels"]:
            node = doc["nodes"][ch["target"]["node"]]
            if "mesh" in node:
                mesh_animated.append((a["name"], node.get("name")))
            tset.add(ch["target"]["node"])
        targets[a["name"]] = tset
    check(not mesh_animated, "animation channels target joint empties only (meshes are rigid children) %s"
          % (mesh_animated[:3] if mesh_animated else ""))
    sets = list(targets.values())
    if sets:
        check(all(s == sets[0] for s in sets), "every clip drives the same joint set (%d nodes)" % len(sets[0]))
    check("KHR_draco_mesh_compression" in doc.get("extensionsUsed", []), "Draco compressed")
    tris, _ = gltf.count_triangles(doc)
    print("  info  %d triangles, %d nodes, %d meshes" % (tris, len(names), len(doc.get("meshes", []))))
    return doc, binchunk


def check_reimport(path, nodes, clips):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=path)
    objs = {o.name for o in bpy.data.objects}
    check(all(n in objs for n in nodes), "re-import: all contract nodes present as objects")
    acts = {a.name for a in bpy.data.actions}
    check(all(c in acts for c in clips), "re-import: all clips present as actions")


def validate_humanoid(hpath):
    doc, _ = check_common(hpath, HUMANOID_NODES, HUMANOID_PREFIXES, HUMANOID_MATERIALS, HUMANOID_CLIPS)
    if doc:
        worlds, parents = gltf.world_matrices(doc)
        sock = gltf.transform_point(worlds["Socket_Head"], (0, 0, 0))
        check(1.75 < sock[1] < 1.95, "+Y up: Socket_Head at y=%.2f" % sock[1])
        lo, hi = world_bounds(doc, worlds, "Base_Foot_L")
        ankle = gltf.transform_point(worlds["J_Foot_L"], (0, 0, 0))
        check(hi[0] - ankle[0] > 0.15 and ankle[0] - lo[0] < 0.1, "faces +X: toes at x=%.2f, ankle x=%.2f" % (hi[0], ankle[0]))
        check(abs(lo[1]) < 0.02, "origin on ground: sole y=%.3f" % lo[1])
        r = gltf.transform_point(worlds["J_Hand_R"], (0, 0, 0))
        check(r[2] > 0.2, "right hand on +Z (towards a camera looking along -Z): z=%.2f" % r[2])
        root = [n.get("name") for i, n in enumerate(doc["nodes"]) if i not in parents]
        print("  info  root nodes:", root)
        check_reimport(hpath, HUMANOID_NODES, HUMANOID_CLIPS)


def validate_horse(rpath):
    doc, _ = check_common(rpath, HORSE_NODES, [], HORSE_MATERIALS, HORSE_CLIPS)
    if doc:
        worlds, parents = gltf.world_matrices(doc)
        idx = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
        check(doc["nodes"][parents[idx["Saddle"]]].get("name") == "J_Body", "Saddle is a child of the animated body")
        head = gltf.transform_point(worlds["J_Head"], (0, 0, 0))
        tail = gltf.transform_point(worlds["J_Tail"], (0, 0, 0))
        check(head[0] > 0.5 > tail[0], "faces +X: head x=%.2f, tail x=%.2f" % (head[0], tail[0]))
        lo, _ = world_bounds(doc, worlds, "Horse_FrontHoof_L")
        check(abs(lo[1]) < 0.02, "hooves on ground: y=%.3f" % lo[1])
        _, hi = world_bounds(doc, worlds, "Horse_Body")
        check(1.5 < hi[1] < 1.7, "withers height %.2f m" % hi[1])
        sad = gltf.transform_point(worlds["Saddle"], (0, 0, 0))
        print("  info  Saddle rest position (glTF): (%.2f, %.2f, %.2f)" % tuple(sad))
        print("  info  root nodes:", [n.get("name") for i, n in enumerate(doc["nodes"]) if i not in parents])
        check_reimport(rpath, HORSE_NODES, HORSE_CLIPS)


# ---------------------------------------------------------------------------------------------
# P5-11 creatures / props / ship
# ---------------------------------------------------------------------------------------------
KB = 1024
CREATURE_MAX = 600 * KB
STATIC_MAX = 1024 * KB
WINGS = ["J_Wing%d_%s" % (i, s) for i in (1, 2, 3) for s in "LR"]
SPECS = {
    "hippogryph.glb": dict(nodes=["Hippogryph", "Saddle", "J_Body", "J_Head", "J_Tail"] + WINGS,
                           mats=["Feathers", "Coat", "Beak", "Eye", "Leather"],
                           clips={"Fly": 0.8, "Glide": 2.0, "Land": 1.0, "Hit": 0.4, "Idle": 2.0}, max=CREATURE_MAX),
    "troll.glb": dict(nodes=["Troll", "Weapon_Club", "J_Hips", "J_Head", "J_Hand_R", "Socket_Head", "Socket_Projectile"],
                      mats=["Skin", "Primary", "Cloth", "Wood", "Hair"],
                      clips={"Idle": 2.0, "Walk": 1.2, "AttackLight": 1.0, "AttackHeavy": 1.0, "BlockRaise": 0.15,
                             "BlockHold": 1.0, "Hit": 0.4, "Stagger": 0.8, "Death": 1.2, "Victory": 2.0, "Stunned": 1.0},
                      max=CREATURE_MAX),
    "wolf.glb": dict(nodes=["Wolf", "J_Body", "J_Head", "J_Jaw"], mats=["Coat", "Mane", "Eye"],
                     clips={"Idle": 2.0, "Run": 0.5, "Attack": 1.0, "Hit": 0.4, "Death": 1.0}, max=CREATURE_MAX),
    "boar.glb": dict(nodes=["Boar", "J_Body", "J_Head", "J_Jaw"], mats=["Coat", "Mane", "Eye", "Horn"],
                     clips={"Idle": 2.0, "Run": 0.5, "Attack": 1.0, "Hit": 0.4, "Death": 1.0}, max=CREATURE_MAX),
    "bird.glb": dict(nodes=["Bird", "J_Body", "J_Head"] + WINGS, mats=["Feathers", "Beak", "Eye"],
                     clips={"Flap": 0.4, "Dive": 0.6}, max=CREATURE_MAX),
    "haunted-tree.glb": dict(nodes=["HauntedTree", "J_Root", "J_Upper", "J_ArmR1", "J_ArmR2", "J_ArmL1", "J_ArmL2"],
                             mats=["Wood", "Glow"], clips={"Rise": 1.0, "Idle": 2.0, "Swipe": 1.0, "Death": 1.0},
                             max=CREATURE_MAX),
    "ship.glb": dict(nodes=["Ship", "Deck_Archer_Spot_1", "Deck_Archer_Spot_2", "Deck_Archer_Spot_3"],
                     mats=["Wood", "Primary", "Metal", "DarkMetal", "Cloth"], clips={}, max=STATIC_MAX),
    "props.glb": dict(nodes=["Arrow", "Spear", "Javelin", "Rock", "Boulder", "SpikeTrap_Base", "SpikeTrap_Spikes", "FallingBeam",
                             "Chandelier", "Crate", "Barrel", "Banner", "LandingFlag", "Torch", "ShieldBubble"],
                      mats=["Wood", "Metal", "DarkMetal", "Primary", "Glow", "Cloth", "Stone", "Bubble", "BubbleRib"], clips={}, max=STATIC_MAX),
}
# props: ((length along X, height along Y), origin rule)
PROP_DIMS = {
    "Arrow": ((0.85, None), "centre"), "Spear": ((2.0, None), "centre"), "Javelin": ((1.6, None), "centre"),
    "Rock": ((0.8, None), "centre"), "Boulder": ((1.8, None), "centre"), "SpikeTrap_Base": ((1.6, None), "base"),
    "SpikeTrap_Spikes": ((None, 0.7), "base"), "FallingBeam": ((2.2, None), "centre"), "Chandelier": ((1.2, None), "ring"),
    "Crate": ((None, 0.9), "base"), "Barrel": ((None, 1.0), "base"), "Banner": ((None, 2.6), "base"),
    "LandingFlag": ((None, 3.0), "base"), "Torch": ((None, 1.0), "base"),
    "ShieldBubble": ((2.4, 2.4), "centre"),
}


def pose(doc, binchunk, clip, t):
    nodes = gltf.posed_nodes(doc, binchunk, clip, t)
    worlds, _ = gltf.world_matrices(doc, nodes)
    return nodes, worlds


def jpos(worlds, name):
    return gltf.transform_point(worlds[name], (0, 0, 0))


def subtree_names(doc, root_name):
    idx = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
    out, stack = set(), [idx[root_name]]
    while stack:
        i = stack.pop()
        out.add(doc["nodes"][i].get("name"))
        stack.extend(doc["nodes"][i].get("children", []))
    return out


def model_checks(name, doc, binchunk):
    worlds, parents = gltf.world_matrices(doc)
    idx = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
    roots = [doc["nodes"][i].get("name") for i in range(len(doc["nodes"])) if i not in parents]
    print("  info  root nodes:", roots)
    lo, hi = gltf.mesh_world_bounds(doc, worlds)
    print("  info  rest bounds x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f" % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    if name == "hippogryph.glb":
        check(doc["nodes"][parents[idx["Saddle"]]].get("name") == "J_Body", "Saddle is a child of the animated body J_Body")
        check(jpos(worlds, "J_Head")[0] > 0.6 > jpos(worlds, "J_Tail")[0], "faces +X (head ahead of tail)")
        check(abs(lo[1]) < 0.03, "standing on the ground at rest: min y=%.3f" % lo[1])
        sad = jpos(worlds, "Saddle")
        check(1.5 < sad[1] < 1.8, "Saddle seat height %.2f m" % sad[1])
        print("  info  Saddle rest position (glTF): (%.2f, %.2f, %.2f)" % tuple(sad))
        check(hi[2] - lo[2] > 4.5, "large wings: rest wingspan %.2f m" % (hi[2] - lo[2]))
        wing_parts = {n.get("name") for n in doc["nodes"] if n.get("name", "").startswith("Hippogryph_Wing_")}
        _, w_up = pose(doc, binchunk, "Fly", 0.0)
        _, w_dn = pose(doc, binchunk, "Fly", 0.4)
        top = gltf.mesh_world_bounds(doc, w_up, names=wing_parts)[1][1]
        bot = gltf.mesh_world_bounds(doc, w_dn, names=wing_parts)[0][1]
        check(top - bot > 3.0, "Fly flaps strongly: wing top %.2f (t=0) vs bottom %.2f (t=0.4)" % (top, bot))
        nodes, w = pose(doc, binchunk, "Land", 1.0)
        check(abs(gltf.mesh_world_bounds(doc, w, nodes)[0][1]) < 0.05, "Land ends standing on the ground")
    elif name == "troll.glb":
        check(2.8 < hi[1] < 3.2, "height %.2f m (~3.0)" % hi[1])
        check(abs(lo[1]) < 0.03, "feet on the ground: min y=%.3f" % lo[1])
        check(doc["nodes"][parents[idx["Weapon_Club"]]].get("name") == "J_Hand_R", "Weapon_Club rides the right hand")
        check(jpos(worlds, "J_Hand_R")[2] > 0.3, "right (club) hand towards the camera (+Z)")
        _, w = pose(doc, binchunk, "Death", 1.2)
        check(jpos(w, "J_Head")[1] < 1.0, "Death ends lying: head y=%.2f" % jpos(w, "J_Head")[1])
        _, w = pose(doc, binchunk, "AttackHeavy", 0.5)
        clo, chi = gltf.mesh_world_bounds(doc, w, names={"Weapon_Club"})
        check(chi[0] > 2.6 and clo[1] < 0.4, "AttackHeavy impact slams the club down in front (reach %.2f m, low %.2f)" % (chi[0], clo[1]))
    elif name in ("wolf.glb", "boar.glb"):
        check(0.8 < hi[1] < 1.05, "height %.2f m (~0.9)" % hi[1])
        check(abs(lo[1]) < 0.03, "paws/hooves on the ground: min y=%.3f" % lo[1])
        check(jpos(worlds, "J_Head")[0] > 0.4 > jpos(worlds, "J_Body")[0], "faces +X")
        h0 = jpos(worlds, "J_Head")[0]
        _, w = pose(doc, binchunk, "Attack", 0.5)
        check(jpos(w, "J_Head")[0] - h0 > 0.4, "Attack lunges forward at impact (+%.2f m)" % (jpos(w, "J_Head")[0] - h0))
        nodes, w = pose(doc, binchunk, "Death", 1.0)
        dlo, dhi = gltf.mesh_world_bounds(doc, w, nodes)
        check(dhi[1] < 0.6 and dlo[1] > -0.1, "Death ends lying on its side (top y=%.2f, low %.2f)" % (dhi[1], dlo[1]))
    elif name == "bird.glb":
        check(1.3 < hi[2] - lo[2] < 1.5, "wingspan %.2f m (~1.4)" % (hi[2] - lo[2]))
        _, w = pose(doc, binchunk, "Dive", 0.0)
        check(jpos(w, "J_Head")[1] < jpos(w, "J_Tail")[1] - 0.1, "Dive is nose-down")
    elif name == "haunted-tree.glb":
        check(3.7 < hi[1] < 4.6, "height %.2f m (~4)" % hi[1])
        check(abs(lo[1]) < 0.3, "roots at ground level: min y=%.2f" % lo[1])
        nodes, w = pose(doc, binchunk, "Rise", 0.0)
        top = gltf.mesh_world_bounds(doc, w, nodes)[1][1]
        check(top < 0.05, "Rise starts below y=0 (top %.2f)" % top)
        nodes, w = pose(doc, binchunk, "Rise", 1.0)
        check(abs(gltf.mesh_world_bounds(doc, w, nodes)[0][1] - lo[1]) < 0.02, "Rise ends in the rest pose")
        nodes, w = pose(doc, binchunk, "Swipe", 0.5)
        reach = gltf.mesh_world_bounds(doc, w, nodes, names={"Tree_ArmR2"})[1][0]
        check(reach > 2.3, "Swipe impact reaches forward %.2f m" % reach)
        nodes, w = pose(doc, binchunk, "Death", 1.0)
        check(gltf.mesh_world_bounds(doc, w, nodes)[1][1] < 0.1, "Death sinks below ground")
    elif name == "ship.glb":
        L = hi[0] - lo[0]
        check(13.0 < L < 17.0, "length %.1f m (~14 m hull + bowsprit)" % L)
        check(hi[0] > -lo[0], "bow towards +X")
        check(not doc.get("animations"), "no animation")
        for i in (1, 2, 3):
            p = jpos(worlds, "Deck_Archer_Spot_%d" % i)
            print("  info  Deck_Archer_Spot_%d (glTF): (%.2f, %.2f, %.2f)" % (i, p[0], p[1], p[2]))
    elif name == "props.glb":
        check(not doc.get("animations"), "no animation")
        for prop, ((sx, sy), rule) in PROP_DIMS.items():
            check(idx[prop] not in parents, "%s is a root node" % prop)
            plo, phi = gltf.mesh_world_bounds(doc, worlds, names=subtree_names(doc, prop))
            o = jpos(worlds, prop)
            dx, dy = phi[0] - plo[0], phi[1] - plo[1]
            ok = True
            if sx:
                ok &= abs(dx - sx) / sx < 0.12
            if sy:
                ok &= abs(dy - sy) / sy < 0.12
            if rule == "centre":
                ok &= abs((plo[0] + phi[0]) / 2 - o[0]) < 0.1 * dx + 0.02 and abs((plo[1] + phi[1]) / 2 - o[1]) < 0.1 * max(dy, 0.2)
            elif rule == "base":
                ok &= abs(plo[1] - o[1]) < 0.01
            check(ok, "%s: %.2f x %.2f m, origin %s" % (prop, dx, dy, rule))


def validate_spec(path):
    name = os.path.basename(path)
    sp = SPECS[name]
    doc, binchunk = check_common(path, sp["nodes"], [], sp["mats"], sp["clips"], max_bytes=sp["max"], exact_mats=True)
    if doc:
        model_checks(name, doc, binchunk)
        check_reimport(path, sp["nodes"], sp["clips"])


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    paths = [a for a in args if a.endswith(".glb")]
    if not paths:
        models = os.path.join(REPO, "app/public/assets/models")
        paths = [os.path.join(models, n) for n in ["humanoid.glb", "horse.glb"] + list(SPECS)]
    for p in paths:
        base = os.path.basename(p)
        if base == "humanoid.glb":
            validate_humanoid(p)
        elif base == "horse.glb":
            validate_horse(p)
        elif base in SPECS:
            validate_spec(p)
        else:
            print("\n== %s: no spec, skipped" % p)
    print("\n%s (%d failures)" % ("PASS" if not failures else "FAIL", len(failures)))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
