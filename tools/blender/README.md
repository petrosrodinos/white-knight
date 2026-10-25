# Blender asset pipeline

Procedural, script-only models and animations for White Knight. Everything here is rebuilt from
Python; never hand-edit the exported `.glb` files. Output contract: `docs/contracts.md` §4.1.

Blender 5.2 LTS (4.4+ works — slotted-action API). On this machine it is not on `PATH`:

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"   # Git Bash
```

## Commands

| What | Command |
|---|---|
| Build all + validate | `"$B" -b --factory-startup -P tools/blender/build.py` |
| Build all + validate + previews | `"$B" -b --factory-startup -P tools/blender/build.py -- --preview` |
| Only one asset | `"$B" -b --factory-startup -P tools/blender/build.py -- --only horse` |
| Humanoid | `"$B" -b --factory-startup -P tools/blender/build_humanoid.py -- app/public/assets/models/humanoid.glb` |
| Horse | `"$B" -b --factory-startup -P tools/blender/build_horse.py -- app/public/assets/models/horse.glb` |
| Hippogryph / troll / bird / tree / ship / props | `build_hippogryph.py`, `build_troll.py`, `build_bird.py`, `build_tree.py` (→ `haunted-tree.glb`), `build_ship.py`, `build_props.py` — same pattern: `-- <out.glb>` |
| Wolf / boar | `"$B" -b --factory-startup -P tools/blender/build_beast.py -- app/public/assets/models/wolf.glb --kind wolf` (`--kind boar`) |
| Validate | `"$B" -b --factory-startup -P tools/blender/validate.py [-- a.glb b.glb …]` (default: every model; exit 1 on failure) |
| Previews | `"$B" -b --factory-startup -P tools/blender/render_preview.py -- --set all [--views side\|game\|both]` |

Previews are written to `tools/blender/previews/` (git-ignored): `knight_*.png` (every clip at key
frames / attack phase boundaries; `knight_special` = JumpAttack/Plunge/ShieldBash/Lunge/ComboFinisher),
`loadouts.png` (archer, wizard, witch, viking, zombie, saracen, …), `horse.png`, `mounted.png` (knight
parented to the horse `Saddle`), and per creature `hippogryph`, `hippogryph_mounted` (knight on the
hippogryph `Saddle` in Fly/Glide/Idle/Hit), `troll`, `wolf`, `boar`, `bird`, `haunted-tree`, `props`,
`ship`. Sets: `knight` (or a single `knight_<group>`), `loadouts`, `horse`, `mounted` + the creature names.
`--views game` adds `*_game.png` turned 0.32 rad towards the camera like the client (actor-layer `YAW`).
They render the **exported** files with an orthographic camera looking along glTF −Z, like the game.
(EEVEE in background mode occasionally crashes with EXCEPTION_ACCESS_VIOLATION — just re-run.)

## Layout

| File | Purpose |
|---|---|
| `lib/scene.py` | scene reset (30 fps, metric), CLI args, empties |
| `lib/materials.py` | named material factory (neutral tint-ready base colours, soft roughness/low metalness) |
| `lib/geom.py` | `Geo` vertex/face builder: `sweep`/`loft`/`lathe` (superellipse sections, asymmetric radii), `superquad`/`rounded_box`, `extrude_outline` (bevelled 2D outlines), `torus`, deform/bend helpers, `to_object` (smooth + sharp-by-angle shading) |
| `lib/rig.py` | `Rig` (animated-empty joint hierarchy, FK, rigid `attach` in any reference pose), 2-bone planar IK, plus `build_armature`/`attach_to_bone` (bone-parent alternative with correct parent-inverse) |
| `lib/anim.py` | `bake_clip`: one Action per clip (one slot per joint) + an NLA track named after the clip on every joint, per-key interpolation presets, cyclic padding |
| `lib/export.py` | `export_glb`: Draco, +Y up, all objects (hidden too), `export_animation_mode='NLA_TRACKS'`, force-sampled 30 fps, rest pose written as node TRS, optional retime |
| `lib/gltf.py` | pure-Python GLB reader/writer, durations, triangle counts, rest-pose world matrices, clip retiming |
| `humanoid_rig.py` | joint layout + pose builder (absolute sagittal limb angles, leg IK) |
| `humanoid_parts.py` | every humanoid mesh (base body + all equipment variants) |
| `humanoid_clips.py` | all 26 humanoid clips |
| `build_horse.py` | horse geometry, procedural gait cycles, clips |
| `lib/creature.py` | `LegRig` (planar leg IK on top of full Rig FK, so spine joints such as `J_Chest` count), `gait_leg`/`gait_cycle`, `feather`, `WingSpec` (N-segment layered wings: leading edge, covert rows, secondaries, fanned primaries; L built, R mirrored), `claw`, `eye` |
| `build_hippogryph.py` | eagle front / horse hind, 3-segment wings (`J_Wing1..3_L/R`), `Saddle` on `J_Body` |
| `build_troll.py` | 3 m swamp troll, humanoid-style joint names + `Weapon_Club` on `J_Hand_R` |
| `build_beast.py` | wolf + boar (per-kind geometry tables, shared gallop/lunge/death clips, global `scale`) |
| `build_bird.py`, `build_tree.py` | bird of prey (reuses `WingSpec`), haunted tree (`J_Root` location drives Rise/Death) |
| `build_ship.py`, `build_props.py` | static cog (clinker hull, castles, sail, rigging, shields) and 15 prop root nodes (incl. the `ShieldBubble` energy dome); natural colours because the client renders them raw |

## Conventions

- Blender: +X forward, +Z up, +Y = character's left. glTF: +X forward, +Y up, +Z = character's right
  (towards a camera at +Z looking −Z, so the game sees the weapon side).
- Rig = hierarchy of **empties** (`J_*`), identity rest rotation, object-level animation. Meshes are
  rigid children; no skins, weights, shape keys or modifiers. Rotation about Y swings in the side
  plane (positive = clockwise as the game camera sees it).
- Every clip keys every joint (rotation; plus location on `J_Hips` / `J_Body`) so cross-fades never
  inherit stale transforms.
- Attack clips (†) are 30 frames with keys at 0 / 10.5 / 15 / 18 / 30 (anticipation, swing, impact,
  recovery). Clips whose contract length is not a whole number of frames (`BlockRaise` 0.15 s,
  `Land` 0.25 s) are baked over the next whole frame and uniformly retimed in the GLB.
- Materials are named exactly per contract; colours are neutral so the client can tint by name.
  Previews tint with the art-bible palette to mimic the client.

## P5-11 asset notes (client-facing)

| File | Notes |
|---|---|
| `hippogryph.glb` | Root `Hippogryph`; `Saddle` (child of animated `J_Body`) at glTF (−0.22, 1.64, 0) — same convention as horse (rider root on it, humanoid mounted clips put the pelvis 0.10 m above). Body stays at ground-relative height in Fly/Glide (no baked altitude); Land starts 0.55 m up and ends in the Idle pose. Wingspan ≈ 5.8 m at rest. |
| `troll.glb` | ≈ 3.0 m at scale 1 (use `look.scale` 1). Joint names mirror the humanoid (`J_Hips`, `J_Hand_R` …), plus `Socket_Head`, `Socket_Projectile`. Extra clip `Stunned` (loop 1.0) because the shared humanoid pose mapper can request it. Club reach at AttackHeavy impact ≈ 3 m. |
| `wolf.glb` / `boar.glb` | ≈ 0.95 m incl. ears / bristles; Attack lunges the body ≈ 0.55 m forward inside the clip (root stays put). |
| `bird.glb` | Origin under the body (body centre 0.30 m up); wingspan 1.44 m. |
| `haunted-tree.glb` | Face points forward and 40° towards the camera; Rise starts ~5.8 m below y=0, Death ends fully below ground. |
| `ship.glb` | Root `Ship`, bow +X, origin on the **waterline** mid-ship (keel −1.1, castles 4.0–4.3, mast top 13.2, bowsprit to x=8.6; hull 14.6 m). `Deck_Archer_Spot_1..3` = aft castle (−5.3, 4.02), forecastle (6.1, 4.32), main deck (2.3, 1.77). Static; only `Primary` (sail, pennant, half the rail shields) is meant to be tinted. |
| `props.glb` | 15 root empties named per contract with `<Name>_Mesh` children; roots are spread along glTF +Z in the file — read each node's own transform (`propGeometry` already does). Rocks use an extra `Stone` material. |

## Adding an asset

1. `build_<asset>.py`: `scene.reset()`, `materials.library([...])`, build a `Rig`, create parts with
   `geom.*` + `geom.to_object`, `rig.attach(obj, joint)`, `anim.bake_clip(...)` per clip,
   `export.export_glb(path)`.
2. Register it in `build.py` `ASSETS`, add checks to `validate.py`, and a sheet in `render_preview.py`.
