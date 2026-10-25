# White Knight — Game Design & Technical Specification

---

## 0. AGENT WORKFLOW — READ THIS FIRST

This file is the **single source of truth** and the **shared task board** for every agent working on White Knight. Several agents may work on it over many sessions, so follow these rules exactly.

### 0.1 Progress

> **Overall completion: 100% (96 / 96 tasks done)** — last updated: 2026-10-15

| Phase | Done / Total | % |
|---|---|---|
| P0 Setup & Pipeline | 10 / 10 | 100% |
| P1 Foundation & Design System | 12 / 12 | 100% |
| P2 Accounts & Backend | 10 / 10 | 100% |
| P3 Duel Engine | 12 / 12 | 100% |
| P4 Progress, Points & Leaderboards | 8 / 8 | 100% |
| P5 Quest Engine | 14 / 14 | 100% |
| P6 Open Field Engine | 6 / 6 | 100% |
| P7 Missions & Bosses | 15 / 15 | 100% |
| P8 Hardening & Release | 9 / 9 | 100% |

Percentages are computed as `done / total × 100`, rounded to a whole number. **Every task has equal weight.**

### 0.2 How to use this file

1. **Read** the whole spec (sections 1–21) before starting. The todo list below says *what* is left; the spec says *how it must behave*.
2. **Pick a task:** choose the first `[ ]` task whose dependencies (the `← needs` IDs) are all `[x]` and that nobody has claimed. Tasks in different phases with satisfied dependencies can be done in parallel by different agents.
3. **Claim it before you start:** change `[ ]` to `[~]` and append `@<agent-name> <YYYY-MM-DD>`, e.g. `- [~] **P3-02** … @agent-b 2026-10-16`. Save the file immediately. Never work on a task marked `[~]` by someone else unless the claim is older than 24 hours with no related changes.
4. **Do the work** following the spec and the repo rules (`AGENTS.md`, `.cursor/rules/*`). Code for the game goes in `app/`, backend in `api/`, asset tools in `tools/`.
5. **Verify** before marking done: it type-checks, lints, relevant tests pass, and — for anything visible — you ran it in a browser and it looks and plays correctly. A task is not done if it only compiles.
6. **Complete it:** change `[~]` to `[x]`, keep the ID, and append a short note with the key file paths, e.g. `— app/src/engines/duel/`. Then **recompute the progress tables in 0.1** (counts, percentages, last-updated date).
7. **Edit only the status marker, the claim/notes on your own task, and the 0.1 tables.** Do not reword, reorder, renumber or delete other tasks. If you find a missing task, add it at the end of the right phase with the next free ID and update the totals. If the spec itself is wrong or ambiguous, add a dated line to section 21 instead of silently deviating.
8. **Keep the file merge-friendly:** make small, targeted edits (one task line per edit); re-read the file right before editing since other agents may have changed it.
9. **Blocked?** Mark the task `[!]` with a one-line reason (`— blocked: needs Blender installed`) and move to another task.
10. **Never** commit or print secrets (`OPENAI_API_KEY` in `.env.temp` is for build-time scripts only), and never add mission-specific gameplay code (see Core Design Rule 2).

### 0.3 Status markers

| Marker | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress (claimed — name and date appended) |
| `[x]` | Done and verified (notes appended) |
| `[!]` | Blocked (reason appended) |

### 0.4 Todo list

#### P0 — Setup & Pipeline
- [x] **P0-01** Create `tools/` workspace and `ASSETS.md` licence log — `tools/blender/`, `tools/audio/` (+ `tools/generate-images/`); `ASSETS.md` at repo root with per-team sections (Audio filled, all CC0) @claude @audio-agent 2026-10-15
- [x] **P0-02** Install/verify Blender CLI — Blender 5.2.2 LTS at `C:\Program Files\Blender Foundation\Blender 5.2/blender.exe` (not on PATH); headless run + Draco `.glb` export verified via `tools/blender/smoke_test.py`; README docs still to write under P8-09
- [x] **P0-03** Blender script framework: shared helpers for materials, palette, rig, export to optimised `.glb` ← needs P0-02 @blender-agent 2026-10-15 — `tools/blender/lib/` (geom/materials/rig/anim/export/gltf), runner `tools/blender/build.py`, `validate.py`, `render_preview.py`, README
- [x] **P0-04** Image generation script (`tools/generate-images`) reading `OPENAI_API_KEY` from `.env.temp`, prompt files, shared style prompt, post-processing (tiling, WebP) — tools/generate-images/ (generate/postprocess/previews/build-prompts, prompts/*.json, README); gpt-image-2 opaque + gpt-image-1.5 transparent; sharp offset-blend tiling, WebP
- [x] **P0-05** Confirm `.env.temp` is git-ignored and the key can never reach the client bundle — .env.temp git-ignored; Vite only loads app/.env* VITE_ vars; `npm run check-secrets` in tools/generate-images scans app/src, app/public, app/dist, app/.env*. 2026-10-16: key purged from all git history (filter-branch + force-push, verified absent); the owner must still revoke the old key at OpenAI
- [x] **P0-06** Asset loading pipeline in client (`useGLTF`, Draco/Meshopt, per-mission lazy bundles) @lead 2026-10-15 — app/src/render/models/model-library.ts (GLTFLoader + self-hosted Draco/Meshopt, clip baking to instanced parts), per-mission preload behind the loading screen in pages/play (models, env textures, audio)
- [x] **P0-07** Audio manager and sourced SFX/music packs with licences ← needs P0-01 @lead 2026-10-15 — packs by @audio-agent; client manager app/src/core/audio/audio-manager.ts (music/ambience/sfx buses, variants, panning, loops, synth fallback) + render/vfx/director.ts maps every sim event to sound
- [x] **P0-08** Generate parallax layers for all environments in section 13 ← needs P0-04 — app/public/assets/images/env/<envId>/{sky,far,mid,fore}.webp for all 29 envs + env/_fog/{light,dark,storm}.webp (2048x1024, tile horizontally)
- [x] **P0-09** Generate ground textures (dirt, grass, sand, stone, snow) ← needs P0-04 — app/public/assets/images/ground/{dirt,grass,sand,stone,snow,wood,marble}.webp (1024², tile both axes)
- [x] **P0-10** Generate menu art, mission illustrations and icons ← needs P0-04 — app/public/assets/images/ui/{title,menu,parchment}.webp, missions/m01-m15.webp, portraits/<CharacterId>.webp (14), icons/*.webp (14)

#### P1 — Foundation & Design System
- [x] **P1-01** Remove shadcn components/usage from `app/`; set up Tailwind 4 `@theme` tokens (colors, type, spacing, motion) — shadcn removed; Tailwind 4 `@theme` tokens in app/src/index.css
- [x] **P1-02** Medieval font selection and loading — Cinzel Decorative / Cinzel / EB Garamond via @fontsource in index.css
- [x] **P1-03** Core components: buttons, panels/frames, modals, tabs, tooltips ← needs P1-01 — app/src/ui/ (button, panel, modal, tabs, tooltip); showcase /dev/ui
- [x] **P1-04** Form components: inputs, checkbox, select, key-binding display ← needs P1-01 — app/src/ui/field.tsx, toggles.tsx, slider.tsx, select.tsx, key-binding.tsx
- [x] **P1-05** Segmented health bar, boss health bar, mana bar ← needs P1-01 — app/src/ui/bars.tsx (SegmentedHealthBar, BossHealthBar, ManaBar, XpBar, LevelBadge)
- [x] **P1-06** HUD layout (top-left/center/right per section 5) ← needs P1-05 @lead 2026-10-15 — pages/play/components/game-hud.tsx (top-left name/health/lives/enemies, top-centre kills + boss bar, top-right mission/stage/level, banners, callouts)
- [x] **P1-07** App shell, routing, title screen, main menu, settings (volume, key remap) — app/src/App.tsx, routes/app-routes.tsx, pages/{title,menu,settings}; ui/settings-panel.tsx (game canvas is the lead's)
- [x] **P1-08** Fixed-timestep game loop and simulation store outside React render @lead 2026-10-15 — render/game-canvas.tsx GameDriver (60 Hz fixed step, hit-stop), core/sim/world.ts; React only re-renders on HUD changes (core/hud/hud-store.ts)
- [x] **P1-09** Orthographic side camera with dead zone and smoothing @lead 2026-10-15 — render/game-canvas.tsx (orthographic, dead zone, damped follow, duel framing, shake with reduced-motion opt-out)
- [x] **P1-10** Parallax background system (5 layers) and ground renderer ← needs P0-08 @lead 2026-10-15 — render/scene/environment.tsx (sky/far/mid/fog/fore parallax, tilted textured ground with depth shading, sea/cloud surface for flight)
- [x] **P1-11** Input system with remappable bindings (WASD, Space, Shift, E, mouse) @lead 2026-10-15 — core/input/input-manager.ts (bindings from settings store, edge buffering, mouse buttons, virtual touch input) + core/engine/player-controller.ts
- [x] **P1-12** Loading screens, error boundaries, WebGL context-loss handling — ui/loading-screen.tsx, ui/error-boundary.tsx, pages/error; WebGL context loss is the lead's

#### P2 — Accounts & Backend
- [x] **P2-01** Prisma schema: User, Profile, MissionProgress, ScoreEntry, UnlockedCharacter, Settings — api/prisma/schema.prisma, migration init_white_knight
- [x] **P2-02** Register endpoint with validation, bcrypt, unique username, email verification ← needs P2-01 — api/src/modules/auth/ (auth.service, email-verification.service), api/src/shared/utils/profanity/
- [x] **P2-03** Login/refresh/logout with JWT (httpOnly cookies) ← needs P2-01 — api/src/modules/auth/services/auth-tokens.service.ts (rotation + reuse detection), api/src/shared/config/cookies/
- [x] **P2-04** Password reset flow by email ← needs P2-02 — api/src/modules/auth/services/password.service.ts, templates/password-reset.hbs
- [x] **P2-05** Rate limiting and security hardening on auth endpoints — throttler limits (api/src/shared/config/throttle/), CSRF guard, helmet, ValidationPipe in api/src/app.setup.ts
- [x] **P2-06** `GET /me`, `PATCH /me/settings` ← needs P2-03 — api/src/modules/profile/ (profile.controller.ts, config/settings.config.ts)
- [x] **P2-07** Register and login screens wired to API ← needs P1-04, P2-03 — pages/{login,register,forgot-password,reset-password,verify-email}; features/auth
- [x] **P2-08** Auth guard / session handling in client; redirect rules — stores/session-store.ts, routes/guards.tsx, api/client.ts (single-flight refresh), bootstrap/settings-sync.ts
- [x] **P2-09** API unit and e2e tests for auth — api/src/**/*.spec.ts (70 unit), api/test/*.e2e-spec.ts (27 e2e on white_knight_test)
- [x] **P2-10** Profile screen (username, level, points, unlocked characters) ← needs P2-06 — pages/profile

#### P3 — Duel Engine
- [x] **P3-01** Typed Duel config schema (rounds, mounted/on-foot/no-helmet, opponent, boss module) with validation @lead 2026-10-15 — engines/duel/duel-config.ts (zod, refinements)
- [x] **P3-02** Character controller: move, jump, dodge (i-frames + cooldown), block ← needs P1-08, P1-11 @lead 2026-10-15 — core/sim/fighter.ts (move/jump/dodge i-frames+cooldown/block, input buffer)
- [x] **P3-03** Attack system: light/heavy with anticipation, swing, impact, recovery @lead 2026-10-15 — core/combat/combat-config.ts ATTACK_TIMING + combat-math.ts attackPhaseAt (4 phases mapped onto clip time); extended moveset: shield bash, jump slash, plunging strike, dodge-lunge, combo finisher, riposte
- [x] **P3-04** Hit feedback: hit pause, knockback, particles, SFX ← needs P0-07 @lead 2026-10-15 — world.strike (hit-stop, knockback), render/vfx/{particles,director}.ts (sparks, dust, flashes, SFX), hit flash in instanced shader
- [x] **P3-05** Damage model, block-break and stagger, health blocks (4/6, 3/5) @lead 2026-10-15 — combat-math.ts resolveMeleeHit (block, block-break stagger, parry, helmetless multiplier), segments 4/6 & 3/5
- [x] **P3-06** Duel AI opponent (spacing, attack patterns, blocking, dodging, difficulty) @lead 2026-10-15 — core/ai/controllers.ts duelist (spacing, reactive block/dodge, punish, combos, guard-break bash, difficulty skill)
- [x] **P3-07** Round manager: round transitions, rules per round @lead 2026-10-15 — engines/duel/duel-controller.ts (rounds, intro/round-end phases, hpAtOrBelow thresholds)
- [x] **P3-08** Mounted phase: horse movement and dismount on health threshold @lead 2026-10-15 — DuelController.applyRound (mounted pools 150/6 → on foot 100/4, dismount events), horse rendering via Saddle anchor
- [x] **P3-09** Helmet removal visuals and rule at designated round @lead 2026-10-15 — round helmets flag → helmet-off event, loadout mask shows hair (render/actors/pose.ts), ×1.25 damage when helmetless
- [x] **P3-10** Blender: White Knight, Black Knight and horse models with full animation set ← needs P0-03 @blender-agent 2026-10-15 — shared `app/public/assets/models/humanoid.glb` (all §4.1 variants, 26 clips) + `horse.glb` (6 clips); built by `tools/blender/build_humanoid.py` / `build_horse.py`, validated + previewed
- [x] **P3-11** Duel HUD and victory/defeat screens ← needs P1-06 @lead 2026-10-15 — game-hud.tsx (player/opponent bars, boss bar + mana), pages/play/components/results-screen.tsx (victory/defeat, score breakdown, XP, unlocks, outro story)
- [x] **P3-12** Unit tests for combat math and round manager @lead 2026-10-15 — core/combat/combat-math.test.ts, core/sim/moves.test.ts, missions/missions.test.ts

#### P4 — Progress, Points & Leaderboards
- [x] **P4-01** Mission start/complete endpoints with signed run tokens ← needs P2-03 — api/src/modules/progress/ (signed run tokens, auto-save, linear unlocks)
- [x] **P4-02** Auto-save on mission start and completion; Continue from last mission — client side: features/progress/utils/progress.utils.ts (Continue), core/save/local-save.ts, api/outbox.ts
- [x] **P4-03** Strict linear unlock logic; Training Grounds always accessible once unlocked — client side: missionStatus() in progress.utils.ts, pages/campaign
- [x] **P4-04** Scoring config and server-side score validation/plausibility checks — api/src/modules/score/config/scoring.config.ts, api/src/modules/progress/config/missions.catalog.ts, score/utils/score.utils.ts
- [x] **P4-05** XP and level curve; level display in HUD and profile @lead 2026-10-15 — server curve by @backend-agent; level shown in HUD top-right (game-hud.tsx) and results XP bar
- [x] **P4-06** Leaderboard endpoints (global, per-mission, weekly/monthly/all-time) with caching ← needs P4-04 — api/src/modules/leaderboard/ (30 s cache via api/src/shared/services/cache/)
- [x] **P4-07** Leaderboard screen UI with current-user highlight ← needs P1-03, P4-06 — pages/leaderboard, ui/leaderboard-table.tsx
- [x] **P4-08** Emperor Knight high-score unlock tracked separately — progress.service.ts recordVictory + Profile.emperor_knight_unlocked_at, EMPEROR_KNIGHT_POINTS_THRESHOLD

#### P5 — Quest Engine
- [x] **P5-01** Typed Quest config schema (slides, waves, hazards, mount, boss, playable character) with validation @lead 2026-10-15 — engines/quest/quest-config.ts (ground/flight/boss slides, waves, hazards, escort, allies; cross-field validation)
- [x] **P5-02** Ground traversal on long horizontal levels with scrolling camera @lead 2026-10-15 — engines/quest/quest-engine.ts + camera hints
- [x] **P5-03** Slide system: transitions, per-slide background/enemies/hazards @lead 2026-10-15 — QuestEngine.setupSlide/advance (fade transitions, per-slide env/ground/hazards)
- [x] **P5-04** Wave spawner (5 / 10 / 15 scaling, configurable) and gating before advance @lead 2026-10-15 — QuestEngine.startWave/updateWave (triggers along slide, arena lock, maxAlive, 5/10/15 per slide in configs)
- [x] **P5-05** Enemy AI: infantry, spearmen, archers @lead 2026-10-15 — core/ai/controllers.ts melee, spearman (throws), archer (kites + shoots)
- [x] **P5-06** Enemy AI: bandits, wild animals, Vikings, Balkan soldiers @lead 2026-10-15 — skirmisher (bandits/servants), beast (wolves/boars lunge), brute (vikings), spearman (Balkan javelins)
- [x] **P5-07** Enemy AI: ghosts, zombies, servants @lead 2026-10-15 — ghost (hovering, spectral rendering), brute (zombies), skirmisher (servants)
- [x] **P5-08** Projectile system: arrows, spears, javelins, fortress/foreign-city projectiles (blockable flag) @lead 2026-10-15 — core/sim/projectiles.ts + World.fireProjectile (ballistic aim, blockable flag, shield deflection, stuck arrows)
- [x] **P5-09** Environmental hazards: traps, falling objects, birds @lead 2026-10-15 — core/sim/hazards.ts (spike traps, falling objects, birds as flying enemies)
- [x] **P5-10** Wind gusts and storms (push / damage) @lead 2026-10-15 — hazards.ts wind-gust (push, wave variant) + lightning storms; wind streak and rain VFX
- [x] **P5-11** Hippogryph flight mode: vertical movement, landing win condition @lead 2026-10-15 — QuestEngine flight slides (W/S climb/dive, crash bounce, landing-zone win with gentle-descent check) + hippogryph.glb by @blender-agent; verified in browser (Mission 9 landing)
- [x] **P5-12** Boss-as-final-slide transition into Duel engine @lead 2026-10-15 — QuestEngine.setupBoss runs DuelController on the final slide(s); lives retry the boss
- [x] **P5-13** Escort target and failure condition support @lead 2026-10-15 — escort controller + failure condition (used by Mission 14)
- [x] **P5-14** Quest HUD (remaining enemies, kill counter, stage indicator) @lead 2026-10-15 — game-hud.tsx (enemies remaining, kills, stage label, objective/prompt, flight progress)

#### P6 — Open Field Engine
- [x] **P6-01** Typed Open Field config schema with validation @lead 2026-10-15 — engines/open-field/open-field-config.ts
- [x] **P6-02** Army spawning, instanced rendering for infantry and cavalry @lead 2026-10-15 — OpenFieldEngine constructor (squads, cavalry on horses), instanced rendering for all actors (render/models/instanced-model.ts)
- [x] **P6-03** Unit AI: nearest-target auto attack, dead-body despawn @lead 2026-10-15 — nearest-target AI with order-based engage radius; corpses linger then dither-fade
- [x] **P6-04** Orders: move, hold, retreat, charge, cycle selection (Q/R/F/MMB/Tab) @lead 2026-10-15 — OpenFieldEngine.readOrders/issue (Q/R/F/MMB/Tab), squads panel + minimap
- [x] **P6-05** Enemy commanders and rout logic; victory/failure conditions @lead 2026-10-15 — OpenFieldEngine.updateCommanders (rout at strength threshold, flee off-field), victory/defeat conditions
- [x] **P6-06** Performance pass for large armies (pooling, culling) @lead 2026-10-15 — per-part instancing with baked animation (no per-unit scene graph), pooled particles/projectile meshes, hit-stop limited to player-involved blows

#### P7 — Missions & Bosses
- [x] **P7-01** Mission 1 config (Open Field, forest) ← needs P6-05 @lead 2026-10-15 — missions/configs.ts m01
- [x] **P7-02** Mission 2 config (Duel, 2 rounds) ← needs P3-07 @lead 2026-10-15 — m02
- [x] **P7-03** Mission 3 config + Black Knight 3-round boss ← needs P5-12 @lead 2026-10-15 — m03 + Black Knight boss slide (3 rounds)
- [x] **P7-04** Mission 4 config + Mysterious Knight boss (beams, fireballs, ghost summon) @lead 2026-10-15 — m04 + bosses/modules.ts MysteriousKnightModule
- [x] **P7-05** Mission 5 config + Wizard boss module (mana, no direct attack, terrain distortion, haunted trees) @lead 2026-10-15 — m05 + WizardModule (untargetable, mana tiers, ghosts, quake, haunted trees)
- [x] **P7-06** Mission 6 config (sea voyage, playable Mysterious Knight, final Paladin duel) @lead 2026-10-15 — m06 (Mysterious Knight playable, ships, storms, Blue Paladin duel)
- [x] **P7-07** Mission 7 Training Grounds: character/opponent select, mounted/foot @lead 2026-10-15 — selection UI pages/training + missions/configs.ts trainingConfig
- [x] **P7-08** Mission 8 config + Witch Spirit boss module (stun, zombie reinforcements) @lead 2026-10-15 — m08 + WitchSpiritModule
- [x] **P7-09** Mission 9 config (Hippogryph, hazards only, safe landing) @lead 2026-10-15 — m09 (flight slides, landing zone)
- [x] **P7-10** Mission 10 config + Bewitched Ally + Evil Witch tag-team module @lead 2026-10-15 — m10 + Bewitched Ally + EvilWitchModule tag-team (DuelController.tagIn)
- [x] **P7-11** Mission 11 config (Green Chestnut, Hippogryph) + Swamp Troll boss @lead 2026-10-15 — m11 (Green Chestnut, flight, Swamp Troll)
- [x] **P7-12** Mission 12 config (Open Field, mercenary battle) @lead 2026-10-15 — m12
- [x] **P7-13** Mission 13 config (Emperor's Champion, 2 rounds) @lead 2026-10-15 — m13
- [x] **P7-14** Mission 14 config (Balkan journey, no boss) @lead 2026-10-15 — m14 (escort)
- [x] **P7-15** Mission 15 config (final duel, 3 rounds) and campaign ending @lead 2026-10-15 — m15 + campaign-complete outro in missions/catalog.ts

#### P8 — Hardening & Release
- [x] **P8-01** Story/dialogue screens and mission briefings for all 15 missions @lead 2026-10-15 — missions/catalog.ts briefing/outro lines for all 15, DialogueBox on briefing and victory
- [x] **P8-02** Balance pass: damage, health, wave sizes, difficulty, scoring @lead 2026-10-15 — AI cadence, difficulty table, open-field host sizes, server plausibility floors aligned with configs (iterative)
- [x] **P8-03** Performance pass: 60 FPS target, asset compression, bundle size @lead 2026-10-15 — instanced actors + pooled VFX, Draco models, WebP art, lazy play-route chunk (three/r3f ~330 KB gz loaded only in-game), initial bundle ~82 KB gz; unused drei removed
- [x] **P8-04** Accessibility pass: remapping, reduced motion, contrast, keyboard navigation — menus: keyboard nav, focus rings, reduced motion (data-reduced-motion), AA contrast, key remap, responsive to 360px with 44px tap targets
- [x] **P8-05** Playwright e2e: register → play mission → score → leaderboard @lead 2026-10-15 — app/playwright.config.ts + app/e2e/: register → Mission 1 battle (real input, server-verified victory) → score → leaderboard, locked-mission redirect, tablet layout — 3/3 pass
- [x] **P8-06** Client error reporting and API logging @lead 2026-10-15 — server by @backend-agent; client reporter app/src/bootstrap/error-reporting.ts + ErrorBoundary
- [x] **P8-07** Save schema versioning and migrations @lead 2026-10-15 — server by @backend-agent; client app/src/core/save/local-save.ts (versioned + migrations)
- [x] **P8-08** Production deployment (Vercel client, API pipeline, Prisma migrations, env config) @lead 2026-10-15 — api/Dockerfile (migrate deploy on start, healthcheck; image builds), app/vercel.json (API rewrite, caching), docs/deployment.md
- [x] **P8-09** README, asset-generation docs, final `ASSETS.md` licence review @lead 2026-10-15 — README.md, docs/deployment.md, tools/*/README.md, ASSETS.md (images + audio sections)

---

| | |
|---|---|
| **Platform** | Web browser (desktop, keyboard + mouse) |
| **Genre** | Single-player medieval action campaign with online accounts, levels, points and leaderboards |
| **Client** | `app/` — React 19, TypeScript, Vite, Tailwind CSS 4, react-three-fiber (three.js) |
| **Backend** | `api/` — NestJS, Prisma, JWT auth (existing stack) |
| **Quality bar** | Production ready |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Art & Asset Pipeline](#3-art--asset-pipeline)
4. [Design System](#4-design-system)
5. [Visual Style & Presentation](#5-visual-style--presentation)
6. [Camera](#6-camera)
7. [The Three Gameplay Engines](#7-the-three-gameplay-engines)
8. [Controls](#8-controls)
9. [Combat & Health](#9-combat--health)
10. [Characters](#10-characters)
11. [Enemy Types](#11-enemy-types)
12. [Hazards & Projectiles](#12-hazards--projectiles)
13. [Mission Campaign — All 15 Missions](#13-mission-campaign--all-15-missions)
14. [Boss Fights](#14-boss-fights)
15. [Victory & Failure Conditions](#15-victory--failure-conditions)
16. [Accounts, Progression & Saving](#16-accounts-progression--saving)
17. [Levels, Points & Leaderboards](#17-levels-points--leaderboards)
18. [Core Design Rules](#18-core-design-rules)
19. [Production Requirements](#19-production-requirements)
20. [Delivery Plan](#20-delivery-plan)
21. [Open Questions & Assumptions](#21-open-questions--assumptions)

---

## 1. Project Overview

White Knight is a medieval action game with a story campaign of **15 missions**. It is built entirely around three reusable gameplay engines:

- **Open Field Battle** engine
- **Quest / Journey** engine
- **Duel** engine

Every mission is a *configured* version of one of these engines, using different environments, enemies, characters and story content. No mission may require its own unique gameplay system — all variety comes from configuration.

The feel is that of classic Flash-era 2D action games, comparable to *Achilles* by Armor Games. The emphasis is on satisfying melee combat, responsive controls, readable combat and strong visual clarity rather than cutting-edge graphics or cinematic presentation.

The game is **multi-user**: players register and log in, their campaign progress is stored on the server, they earn points and levels, and they compete on leaderboards.

---

## 2. Technical Architecture

### 2.1 Client (`app/`)

- **Rendering:** react-three-fiber with three.js. 3D models are rendered through an **orthographic, fixed side-view camera** to produce the 2D-looking presentation described in this document.
- **UI:** React + Tailwind CSS 4 using the custom design system in [section 4](#4-design-system). The HUD and menus are React DOM overlays on top of the canvas.
- **Language:** TypeScript in strict mode.
- **State:** Game simulation state lives outside React's render cycle (a fixed-timestep game loop with an ECS-style or store-based simulation, e.g. Zustand or a custom store). React only renders UI and the scene graph from that state. No per-frame React re-renders for simulation.
- **Structure:**
  - `engines/open-field`, `engines/quest`, `engines/duel` — the three engines, each accepting a typed mission configuration.
  - `core/` — shared input, camera, combat, health, hit-pause, particles, audio, save client.
  - `missions/` — 15 mission configs (data only; see [section 18](#18-core-design-rules)).
  - `bosses/` — pluggable boss behaviour modules (Wizard, Witch, etc.) consumed by the Duel engine.
  - `ui/` — design system components, menus, HUD.
  - `api/` — typed client for the backend.

### 2.2 Backend (`api/`)

Extend the existing NestJS + Prisma + JWT stack with game modules: auth, profile, progress, score, leaderboard. See [sections 16 and 17](#16-accounts-progression--saving). Follow the structure rules in `.cursor/rules/api-code-structure-and-best-practices.mdc`.

### 2.3 Rendering Choice

react-three-fiber is the chosen renderer (the original spec names three.js). PixiJS is **not** used.

---

## 3. Art & Asset Pipeline

All art must be real, finished assets — not placeholder shapes. Assets are produced by repeatable, committed scripts, never by hand-editing opaque binaries.

### 3.1 3D Models and Animation — Blender

- Characters (knights, paladins, enemies, bosses), horses, the Hippogryph, weapons, shields, props and hazards are modelled, rigged and animated in **Blender 4.x**.
- Blender is driven programmatically, in one of two ways:
  1. **Headless CLI:** `blender -b -P tools/blender/<asset>.py` using Python (`bpy`) scripts stored in the repo, or
  2. **Blender MCP** (community `blender-mcp` add-on/server) connected to Claude Code for a live session.
- Output format: **glTF binary (`.glb`)**, optimised (Draco/Meshopt compression, texture atlasing, KTX2/WebP textures) and loaded in the client with `useGLTF`.
- Style: stylised, slightly exaggerated proportions, large shields, oversized weapons, clear armor silhouettes, readable helmets, warm muted palette (see [section 5](#5-visual-style--presentation)).
- Every attack animation has four stages: anticipation, swing, impact, recovery. Required clips per character include idle, walk/run, jump, dodge, block, light attack, heavy attack, hit reaction, stagger, death, plus mounted variants where applicable.
- Source `.blend` files and generator scripts live in `tools/blender/`. Exported `.glb` files live in `app/public/assets/models/`.

### 3.2 2D Images — OpenAI Image Generation

All 2D images — parallax backgrounds (sky, mountains, hills, fog, foreground terrain), ground textures, menu art, mission illustrations, icons and story screens — are generated with the **OpenAI Images API** using the `OPENAI_API_KEY`.

Rules:

- The key is read from the `.env.temp` file at the repo root (variable name `OPENAI_API_KEY`).
- **The key is used only by build-time/offline generation scripts** in `tools/generate-images/`. It must **never** be imported by, bundled into, or sent to the browser client, and must never be committed to git. `.env.temp` must be git-ignored.
- Each image is generated from a committed prompt file (prompt, size, style suffix) so assets are reproducible and reviewable. A shared style prompt enforces the warm, earthy, hand-painted, low-saturation look.
- Parallax layers must be generated as **separately usable layers** (transparent PNG/WebP where needed, seamlessly tiling horizontally) and post-processed with a script (tiling fix, resize, WebP/AVIF compression).
- Generated images are committed to `app/public/assets/images/` after review. No generation happens at runtime.

### 3.3 Audio

- Sound effects and music are real audio files (CC0/licensed packs, or generated offline), loaded and mixed through a central audio manager. Synthesised WebAudio is acceptable only as a fallback for effects not yet sourced.
- Every hit is reinforced with a sound effect (see [Combat Feel](#combat-feel)).
- Licences for all third-party assets are recorded in `ASSETS.md`.

### 3.4 Asset Performance Budget

- Initial load shows a styled loading screen; assets are lazy-loaded per mission.
- Models and textures are compressed; per-mission asset bundles are preloaded behind the mission-briefing screen.

---

## 4. Design System

The UI uses a **proper custom design system built with Tailwind CSS 4**, designed specifically for a medieval action game. **shadcn/ui components are not used** — the existing shadcn starters' components are discarded entirely where they would conflict, and no shadcn/Radix-styled defaults leak into the game UI. (Headless accessibility primitives may be used underneath custom components where needed.)

### 4.1 Foundations (Tailwind theme tokens)

- **Colors:** warm, earthy, muted — parchment, aged iron, bronze, oxblood, forest green, deep night. Low saturation everywhere except magic accents (arcane violet, ember orange, spectral green), which are the only highly saturated colors in the UI. Tokens defined in `@theme`, with semantic aliases (`surface`, `ink`, `accent`, `danger`, `mana`, `health`).
- **Typography:** a medieval engraved/handwritten display face for headings and HUD numerals, paired with a highly readable serif/sans for body text. Fully readable during gameplay.
- **Spacing, radii, borders:** chunky, framed look — iron/bronze frame borders, parchment panels, riveted corners, subtle noise/texture backgrounds.
- **Motion:** short, weighty transitions; respect `prefers-reduced-motion`.

### 4.2 Components

Built in-house, documented, and themed from the tokens:

- Buttons (primary, secondary, danger, icon), panels/frames, modals, tabs, tooltips
- Form inputs, checkboxes, selects, key-binding display
- **Segmented health bar** (4/6-block player, 3/5-block units), boss health bar, mana bar
- HUD elements: lives, enemies remaining, kill counter, mission/stage/level indicator
- Mission cards, level/XP bar, leaderboard table, toasts, loading screens, dialogue/story boxes

### 4.3 Screens

Landing/title, register, login, main menu (Continue, Campaign, Training Grounds, Leaderboard, Profile, Settings), mission select, mission briefing, in-game HUD, pause, victory/defeat summary, profile, leaderboard, settings (volume, key bindings), error and 404 pages.

### 4.4 Requirements

- Keyboard-navigable menus, visible focus states, WCAG AA contrast for text, readable at 1280×720 and up.
- Responsive menus; the game itself targets desktop with a minimum supported viewport and a clear "unsupported device" message below it.

---

## 5. Visual Style & Presentation

### Overall Style

White Knight is presented as a **2D side-view action game**. The art direction is semi-realistic medieval with stylised character proportions rather than pixel art. Gameplay clarity always outranks realism.

- Hand-painted backgrounds with layered parallax scenery
- Stylised character proportions with large shields and oversized weapons
- Fast, arcade-style combat
- Minimal HUD
- Clear character silhouettes
- High gameplay readability at all times

Avoid highly saturated fantasy colors, except for magical effects. The overall tone is warm, earthy and muted.

### Screen Layout

| Zone | Share | Contents |
|---|---|---|
| **HUD** | Top 20% | All interface elements. The gameplay area below stays uncluttered. |
| **Environment** | Middle 55% | Sky, distant mountains, landscape and all parallax layers. Expansive and atmospheric. |
| **Gameplay Ground** | Bottom 25% | All action: characters, weapons, projectiles. Visually simple so it never distracts from combat. |

### Background Design

Layered parallax scrolling, each layer at a different speed. From back to front:

1. Sky gradient
2. Distant mountains
3. Hills
4. Atmospheric fog
5. Foreground terrain

The environment feels wide and open despite strictly 2D gameplay. Backgrounds are generated per [section 3.2](#32-2d-images--openai-image-generation).

### Ground

The player always stands on a continuous ground surface. Material changes per mission — dirt, grass, sand, stone or snow — with subtle texture variation but visual simplicity.

### Character Scale & Style

Characters occupy roughly **15–20% of the screen height**, large enough that weapons, shields and attack animations read at a glance. The player character is always the primary visual focus. Characters have stylised proportions, large shields, oversized weapons, clear armor silhouettes, readable helmets and strong attack poses.

### Combat Feel

Every attack must communicate force and impact, reinforced by all of:

- Anticipation (wind-up)
- Weapon swing animation
- A brief hit pause on impact
- Knockback on the enemy
- Sound effect
- Particle / impact effect

Floaty or weightless combat must be avoided.

### Animation

Animations are exaggerated rather than realistic. Every attack has four stages: **anticipation, swing, impact, recovery**. Movement is responsive and arcade-like, not cinematic or motion-captured.

### Lighting & Effects

Soft directional lighting. No heavy bloom or modern post-processing. Magic and spells are the brightest elements on screen. Characters remain clearly visible against the background at all times.

### HUD

| Position | Elements |
|---|---|
| Top left | Player name, lives, remaining enemies |
| Top center | Kill counter |
| Top right | Mission, stage and level indicator |
| Boss fights | Large boss health bar displayed prominently |

---

## 6. Camera

- **Type:** orthographic, fixed side view. Always perpendicular to the gameplay plane; never rotates.
- **Behavior:** follows the player smoothly along the horizontal axis. Vertical movement is limited. No dramatic zoom.
- **Dead zone:** a small dead zone so the camera doesn't snap to every player movement, giving a stable, cinematic feel.
- Keeps the player and nearby enemies visible whenever possible. Movement is stable, never erratic.
- **Gameplay plane:** all movement is on a single horizontal plane — left, right and jump. No movement into or out of the screen. This is not a multi-lane beat-em-up.

---

## 7. The Three Gameplay Engines

### Engine A — Open Field Battle

The player controls a commander on a large battlefield, leading cavalry and infantry. The enemy has commanders leading their own cavalry and infantry.

- **Goal:** defeat the enemy commanders while keeping the player's commander alive.
- **Orders:** move to a position, charge, hold position, retreat. Units attack the nearest enemy automatically.
- Dead units remain briefly, then disappear.
- **Used in:** Missions 1, 12.

### Engine B — Quest / Journey

The player travels through a sequence of **Slides** — self-contained stages with their own background, enemies and hazards. Difficulty increases as they progress. The typical structure is three slides followed by a boss fight; some missions have no boss.

- Movement uses the keyboard (WASD) on long horizontal levels; the camera scrolls as the player advances. Maze-like layouts are not used.
- Each slide contains enemy waves that must be defeated before advancing. Typical scaling: **Wave 1: 5, Wave 2: 10, Wave 3: 15 enemies**.
- **Hippogryph missions:** the player flies a Hippogryph through aerial environments; vertical movement is available; the mission ends by **landing safely** at the destination rather than defeating a boss.
- **Used in:** Missions 3, 4, 5, 6, 8, 9, 10, 11, 14 (journey portion of each).

### Engine C — Duel (1v1)

Two characters fight in an arena with visible health bars. The player attacks, blocks and dodges until one fighter's health reaches zero.

- Duels are divided into **rounds**, each with its own rules — mounted, on foot, or on foot without helmets. Rounds and conditions are defined per mission.
- **Mounted phase:** both fighters start on horseback. When a character's health drops sufficiently, horses are removed and the fight continues on foot. Helmet removal happens at the start of a designated round.
- Some duels use special rules, implemented as pluggable boss behaviour modules (see [section 14](#14-boss-fights)).
- **Used in:** Missions 2, 3 (boss), 4 (boss), 5 (boss), 6 (final duel), 7, 8 (boss), 10 (bosses), 11 (boss), 13, 15.

---

## 8. Controls

Applies across all engines unless noted. Key bindings are remappable in Settings.

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` |
| Dodge | `Space` |
| Block / Shield | `Shift` |
| Energy shield (hold) | `C` |
| Interact | `E` |
| Light Attack | Left Mouse Button |
| Heavy Attack | Right Mouse Button |

- **Dodge** grants a brief invincibility window, with a short cooldown. Cannot dodge while blocking.
- **Block** raises the shield, stopping most physical projectiles (arrows, spears, javelins). It does **not** stop magic projectiles or fireballs. Cannot block while dodging. A heavy enemy attack can break a block and briefly stagger the player.
- **Energy shield** (hold `C`, owner request 2026-10-25) raises a translucent bubble that soaks any damage — magic, fireballs and rocks included — from energy that drains while it is up and recovers while it is down. If a hit overwhelms it, the shield breaks, the overflow goes through and it stays offline for 3 s.

**Engine A additional controls**

| Action | Input |
|---|---|
| Issue Move order to selected unit | `Q` |
| Issue Hold Position order | `R` |
| Issue Retreat order | `F` |
| Issue Charge order | Middle Mouse Button |
| Cycle unit selection | `Tab` |

---

## 9. Combat & Health

### Health Values

| Character | On Foot | Mounted |
|---|---|---|
| Player (main character) | 100 HP — 4 blocks | ~150 HP — 6 blocks |
| Typical unit | 75 HP — 3 blocks | ~125 HP — 5 blocks |

Health is a segmented horizontal bar, with more segments when mounted. Boss health bars are separate and prominent.

### Damage Values

| Attack | Damage |
|---|---|
| Light Attack | 10 |
| Heavy Attack | 25 |
| Arrow | 5 |
| Spear | 15 |
| Boss Attack | 35 |

### Unit Death

Bodies stay on the ground briefly, then disappear.

---

## 10. Characters

| Name | Alias / Notes |
|---|---|
| White Knight | Main character; protagonist throughout the campaign |
| Bronze Knight | "Brown Feather." Joins the player as an ally after Mission 4 |
| Mysterious Knight | The Mission 4 boss who becomes an ally; playable in Mission 6 |
| Saracen Lieutenant | "Green Chestnut." Playable in Mission 11 |
| Cordova Boss | The Black Knight. Main antagonist of Missions 3 and 15 |
| Saracen Leader 1 | Playable |
| Saracen Leader 2 | Playable |
| Pink Paladin | Tournament fighter |
| Red Paladin | Tournament fighter |
| Blue Paladin (Oliver) | Tournament fighter |
| Deer Paladin (Renault) | Tournament fighter |
| Orange Paladin | Tournament fighter |
| Yellow Paladin | Tournament fighter |
| Emperor Knight | Unlocked by achieving a high score |

---

## 11. Enemy Types

| Enemy | Appears In |
|---|---|
| Infantry | Missions 1, 3, 4, 12, 14 |
| Archers | Missions 3, 4, 6 (enemy ships), 11 (foreign cities), 14 |
| Cavalry | Missions 1, 12 |
| Spearmen | Missions 3, 4, 14 |
| Bandits | Missions 8, 14 |
| Ghosts | Mission 5 |
| Zombies | Missions 5, 10 |
| Servants | Missions 5, 10 |
| Wizards | Missions 4 (boss), 5 (boss) |
| Witches | Missions 8 (boss), 10 (extra boss) |
| Vikings / Northmen | Mission 8 |
| Wild Animals | Missions 8, 14 |
| Balkan Soldiers | Mission 14 |
| Swamp Troll | Mission 11 (boss) |

---

## 12. Hazards & Projectiles

| Hazard | Damage | Blockable | Missions |
|---|---|---|---|
| Arrows | 5 | Yes | 3, 4, 6 |
| Spears | 15 | Yes | 3, 4 |
| Javelins | 15 | Yes | 3, 4 |
| Traps | 20 | No | 5, 9, 10 |
| Falling Objects | 15 | No | 5, 9, 10 |
| Wind Gusts | None — pushes player | No | 6, 9, 11 |
| Storms | 10 | No | 6, 9, 11 |
| Magic Projectiles | 25 | No | 5, 8, 10 |
| Birds (aerial) | 10 | No | 9, 11 |
| Fortress Projectiles | 15 | Yes | 9 |
| Foreign City Projectiles | 15 | Yes | 11 |

All hazards can be avoided by dodging. The shield only blocks those marked blockable.

---

## 13. Mission Campaign — All 15 Missions

The campaign is strictly linear. Missions unlock one at a time; the player cannot skip ahead.

### Mission 1 — Open Field Battle
- **Engine:** Open Field Battle
- The kingdom's army engages an enemy force in a forest region.
- **Objective:** defeat all enemy commanders. **Environment:** Forest. **Enemies:** Infantry, Cavalry, Archers.
- **Outcome:** leads into Mission 2.

### Mission 2 — Commander Duel
- **Engine:** Duel
- The defeated enemy commander challenges the player to single combat.
- **Objective:** defeat the commander in a two-round duel — **R1:** mounted; **R2:** on foot, no helmets.
- **Outcome:** leads into Mission 3.

### Mission 3 — Quest to Cordova
- **Engine:** Quest/Journey → Boss Duel
- **Environments:** Forest → Mountains → City Gate / Bridge. **Hazards:** Arrows, Spears, Javelins. **Enemies:** Archers, Spearmen, Infantry. **Waves:** 5 → 10 → 15.
- **Boss:** Black Knight, three rounds — **R1:** mounted; **R2:** on foot; **R3:** on foot, no helmets. The boss dismounts after losing at least two health blocks (implemented as: a mounted round ends when a rider is down to 50 of 150 HP, a foot round that precedes another ends at 25 of 100, and no round ends on HP before 12 s of fighting; a killing blow always ends it).
- **Reward:** information needed for the next mission.

### Mission 4 — Quest to the Wizard Tower
- **Engine:** Quest/Journey → Boss Duel
- **Environments:** Mountains → Coastline → Dark Tower Exterior. **Hazards:** Arrows, Spears, Javelins. **Enemies:** Archers, Spearmen, Infantry.
- **Boss:** the Mysterious Knight, mounted for the whole fight, one round. Uses magic beams, fireballs and ghost summoning.
- **Outcome:** the Mysterious Knight joins the player as an ally.

### Mission 5 — Overcoming the Shadows
- **Engine:** Quest/Journey → Boss Duel
- **Environments:** Dark Hallway → Shadow Mirror Hall → Grand Hall. **Hazards:** Traps, Falling Objects, Magic Projectiles. **Enemies:** Ghosts, Zombies, Servants.
- **Boss:** the Wizard — special rules (see [section 14](#14-boss-fights)). The player does not attack him directly.
- **Outcome:** the imprisoned ally is rescued.

### Mission 6 — Voyage Home
- **Engine:** Quest/Journey → Duel. **Playable character:** the Mysterious Knight.
- **Environments:** Dark Tower Coast → Open Sea → European Coast. **Hazards:** enemy ships, weather, waves, arrows, wind gusts, storms. **Enemies:** Archers on enemy ships.
- **Final duel:** the Mysterious Knight vs a Paladin, two rounds — **R1:** on foot; **R2:** on foot, no helmets.

### Mission 7 — Training Grounds
- **Engine:** Duel
- A tournament with no story. The player freely picks their character and opponent from the roster, and chooses mounted or on foot. Each bout is one round.
- Always accessible from the main menu once unlocked.

### Mission 8 — Search for the Sacred Herb
- **Engine:** Quest/Journey → Boss Duel
- **Environments:** Forest → Lake → Ancient Stone Grounds. **Hazards:** Traps. **Enemies:** Bandits, Wild Animals, Vikings.
- **Boss:** the Witch Spirit, one round — magic projectiles and stun spells; zombie reinforcements at lower health.
- **Reward:** the Sacred Herb.

### Mission 9 — Flight to the Fortress
- **Engine:** Quest/Journey — no boss. **Mount:** Hippogryph for the whole mission, with vertical movement.
- **Environments:** Continental Sky → Storm Zone → Enemy Fortress Airspace. **Hazards:** Birds, Wind Gusts, Storms, Fortress Projectiles. **Enemies:** none (hazard-only).
- **Win:** land safely on the fortress walls while dodging projectiles.

### Mission 10 — Breaking the Curse
- **Engine:** Quest/Journey → two boss fights.
- **Environments:** Fortress Walls → Fortress Hallways → Fortress Dungeon. **Hazards:** Traps, Falling Objects, Magic Projectiles. **Enemies:** Servants, Zombies.
- **Boss 1:** a Bewitched Ally — one standard duel round; defeating them breaks the curse.
- **Boss 2 (extra):** the Evil Witch — tag-team 2v1 (see [section 14](#14-boss-fights)).

### Mission 11 — Return Home
- **Engine:** Quest/Journey → Boss Duel. **Playable character:** Green Chestnut. **Mount:** Hippogryph.
- **Environments:** Flight above the Ocean → Continental Sky → Landing to the Correct Coast. **Hazards:** Birds, Winds, Storms, Foreign City Projectiles. **Enemies:** Archers from foreign cities.
- **Boss:** the Swamp Troll, one round, on foot, very large health bar. Green Chestnut fights to save a young lady.

### Mission 12 — Mercenary Battle
- **Engine:** Open Field Battle
- The White Knight, fighting as a Rogue Paladin, joins a battle for a neighboring kingdom.
- **Objective:** win the battle. **Outcome:** the enemy leader approaches the player with an offer.

### Mission 13 — Emperor's Champion
- **Engine:** Duel
- The player fights disguised as the Emperor against the White Knight (now on the opposing side).
- **Rounds:** two — **R1:** mounted; **R2:** on foot.

### Mission 14 — The White Knight
- **Engine:** Quest/Journey — no boss.
- **Environments:** Balkan Forest → Valachia Mountains → German Fields. **Hazards:** Bandits, Wild Animals, Enemy Soldiers. **Enemies:** Bandits, Wild Animals, Balkan Soldiers, Archers, Spearmen, Infantry.
- **Outcome:** Green Chestnut Paladin is accepted into the Duke's Court and the planned marriage proceeds.

### Mission 15 — Final Battle
- **Engine:** Duel
- The Black Knight attacks during the wedding; the White Knight fights him.
- **Rounds:** three — **R1:** mounted; **R2:** on foot; **R3:** on foot, no helmets.
- **Outcome:** the villain is defeated permanently. The campaign is complete.

---

## 14. Boss Fights

Boss fights at the end of a Quest mission are the **final slide** of that quest, transitioning into a duel. Special-rule bosses are implemented as pluggable behaviour modules inside the Duel engine, configured per mission.

| Mission | Boss | Structure & special rules |
|---|---|---|
| 2 | Enemy Commander | Two rounds: mounted → on foot, no helmets. No special mechanics. |
| 3 | Black Knight | Three rounds: mounted → on foot → no helmets. Dismounts after losing ≥ 2 blocks. |
| 4 | Mysterious Knight | One mounted round. Magic beams, fireballs, ghost summoning. |
| 5 | The Wizard | **Player cannot attack him.** Health bar plus **Mana Bar**; every spell drains his mana; at zero he quits. High mana: fireballs and magic beams. Medium: summons ghosts. Low: distorts terrain (arena shakes/deforms) and uses haunted trees. |
| 8 | Witch Spirit | One round. Magic projectiles and stun spells (stun briefly locks movement). Zombie reinforcements at lower health; terrain distortion at very low health. |
| 10 | Bewitched Ally | One round, standard duel. Defeating them breaks the curse. |
| 10 (extra) | Evil Witch | **Tag-team 2v1.** Two allies, one fights at a time. A stun on the active ally forces an immediate tag-in of the other. She has a Mana Bar; fight ends when it reaches zero. |
| 11 | Swamp Troll | One round, on foot, very large health bar. Standard mechanics. |
| 13 | White Knight | Two rounds: mounted → on foot. No special mechanics. |
| 15 | Black Knight (final) | Three rounds: mounted → on foot → no helmets. Same opponent as Mission 3. |

---

## 15. Victory & Failure Conditions

**Open Field Battle**

| Result | Condition |
|---|---|
| Victory | All enemy commanders defeated or routed |
| Failure | The player's commander dies |
| Failure | The player's army is entirely destroyed |

**Quest / Journey**

| Result | Condition |
|---|---|
| Victory | Reach the end of the final slide and defeat the boss (if any) |
| Victory (Missions 9 & 11) | Land safely at the destination |
| Failure | Player health reaches zero |
| Failure | An escort target dies (where applicable) |

**Duel**

| Result | Condition |
|---|---|
| Victory | Opponent's health reaches zero |
| Victory (Wizard / Witch bosses) | Opponent's Mana Bar reaches zero |
| Failure | Player health reaches zero |

---

## 16. Accounts, Progression & Saving

The game is **multi-user**. All progress is stored server-side per account.

### 16.1 Authentication

- **Register:** email, username (unique, public, profanity-filtered) and password. Email verification via the existing email flow.
- **Login / logout** with JWT access + refresh tokens (httpOnly cookies preferred), using the existing NestJS auth stack.
- Password reset by email. Passwords hashed (bcrypt). Rate limiting on auth endpoints. Input validation with DTOs.
- Gameplay requires login; the title screen offers Login / Register.

### 16.2 Campaign Progression

- The campaign is strictly linear: Missions unlock one at a time and cannot be skipped.
- **Saving:** the game saves automatically when a mission **begins** and when it is **completed**. **Continue** resumes from the last mission reached.
- **Mission 7 (Training Grounds)** is always accessible from the main menu once unlocked, regardless of campaign progress.
- **Emperor Knight** is unlocked by achieving a high score (threshold defined in config); tracked separately from story progress.
- Each user stores: unlocked missions, current mission, per-mission best score/time/rank, unlocked characters, settings.

### 16.3 Data Model (Prisma, indicative)

`User`, `Profile` (username, level, xp, total points), `MissionProgress` (userId, missionId, status, bestScore, bestTimeMs, completions), `ScoreEntry` (userId, missionId, score, durationMs, createdAt), `UnlockedCharacter`, `Settings`.

### 16.4 API (indicative)

`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `PATCH /me/settings`, `GET /progress`, `POST /progress/mission-start`, `POST /progress/mission-complete`, `GET /leaderboard`, `GET /leaderboard/me`.

---

## 17. Levels, Points & Leaderboards

### 17.1 Points

Points are awarded per mission result and combine:

- Kills (weighted by enemy type; bosses worth more)
- Damage avoided (perfect blocks, dodges, no-hit rounds)
- Completion time versus a par time
- Remaining health and lives
- Difficulty/first-clear bonuses

Exact weights live in a single scoring config so they can be tuned without code changes.

### 17.2 Player Level & XP

Points convert to **XP**; XP drives a **player level** shown in the HUD (top-right) and on the profile. Level thresholds follow a defined curve in config. Levels grant cosmetic/unlock rewards (e.g. titles, banners, character unlocks such as the Emperor Knight at a score threshold).

### 17.3 Leaderboards

- **Global leaderboard:** ranked by total points; also filterable by level/XP.
- **Per-mission leaderboards:** best score and fastest time.
- **Time windows:** all-time, monthly, weekly.
- Shows rank, username, level, points; highlights the current user and shows their rank even if outside the top N.
- Paginated, cached on the server.

### 17.4 Integrity

- **Server-authoritative scoring.** The client submits a mission result (with a run summary: mission id, duration, kill counts, damage taken, a signed run token issued at mission start). The server validates plausibility (min time, max score per mission, token validity, rate limits) before accepting.
- Fully client-authoritative scores are not accepted. Suspicious submissions are rejected and logged.
- Public leaderboard data exposes only username, level and points.

---

## 18. Core Design Rules

1. **Only three gameplay engines exist:** Open Field Battle, Quest/Journey, Duel. Every mission is a version of one.
2. **No mission has unique gameplay code.** Environments, enemies, hazards, bosses, story text, characters and round rules are configuration applied to the engines. Special-rule bosses (Wizard, Witches) are reusable behaviour modules selected by config.
3. **Character switching is configuration** (e.g. Mysterious Knight in Mission 6, Green Chestnut in Mission 11), not a separate system.
4. **A boss after a Journey mission is the last slide of the quest**, not a separate mode.
5. **Engines are reusable** and accept any valid configuration. The Quest engine handles ground travel and Hippogryph flight, every hazard combination, and quests with or without a boss, with no mission-specific code.
6. **Visual clarity is a design constraint.** Character scale, camera, screen layout and backgrounds must keep combat readable at all times.
7. **Mission configs are validated** against a schema (e.g. Zod) at build/load time.

---

## 19. Production Requirements

- **Code quality:** strict TypeScript, ESLint clean, consistent structure per the repo's rules files.
- **Testing:** unit tests for combat math, health/damage, hazards, scoring, level curve and mission config validation; integration tests for engine flows and API endpoints; end-to-end tests (Playwright) for register → play → score → leaderboard.
- **Performance:** target a stable 60 FPS on mid-range hardware; fixed-timestep simulation; object pooling for projectiles/particles; instanced rendering for armies; per-mission lazy loading; compressed assets.
- **Reliability:** error boundaries, graceful handling of WebGL context loss, offline/retry handling for save and score submission, versioned save schema with migrations.
- **Security:** validated DTOs, rate limiting, secure cookies, CORS, no secrets in the client bundle, `OPENAI_API_KEY` and all keys server/build-side only and git-ignored.
- **Accessibility:** remappable controls, volume controls, reduced-motion option, keyboard-navigable menus, captioned story text.
- **Observability:** client error reporting and API logging.
- **Deployment:** client builds with Vite and deploys via the existing Vercel config; API deploys with the existing pipeline; environment-specific config; database migrations applied through Prisma.
- **Documentation:** README with setup, asset generation instructions (`tools/blender`, `tools/generate-images`), and `ASSETS.md` for licences.

---

## 20. Delivery Plan

Built in playable, verified vertical slices:

1. **Foundation:** design system and Tailwind theme, auth (register/login), profile, app shell and menus, game loop, orthographic camera, parallax, HUD, input, audio manager, asset pipeline (Blender scripts + image generation).
2. **Duel engine slice:** Missions 2, 7, 15 — combat feel, rounds, mounted/foot/no-helmet rules, Black Knight, Training Grounds.
3. **Progress & scoring:** save/continue, points, XP/levels, server-validated score submission, leaderboards.
4. **Quest engine:** ground quests (Missions 3, 4, 8, 14), then special bosses (Mission 5 Wizard, Mission 8 Witch, Mission 10 tag-team), then Hippogryph missions (9, 11) and the sea voyage (6), plus Missions 10 and 13.
5. **Open Field Battle engine:** Missions 1 and 12, unit orders and army AI.
6. **Polish & hardening:** balancing, performance pass, accessibility, full test suite, production deploy.

---

## 21. Open Questions & Assumptions

Assumptions made until confirmed:

| # | Topic | Assumption |
|---|---|---|
| 1 | Engine B movement | Side-scrolling; `W` is jump on the ground; free vertical flight only on the Hippogryph |
| 2 | Mission 6 playable character | The **Mysterious Knight** (the Mission 6 text; the characters table previously said Bronze Knight) |
| 3 | Roster size | Mission 7 roster is all selectable fighters in [section 10](#10-characters); the original "8 champions" count is superseded |
| 4 | Mission 13 "Emperor" disguise | A separate story skin, distinct from the high-score Emperor Knight unlock |
| 5 | Engine A scale | Tens of units on screen, real-time nearest-target AI; orders issued to the selected unit group via keys and a click for position |
| 6 | Mounted combat | The horse moves with `A`/`D`; attacks and block/dodge work as on foot with the mounted HP pool |
| 7 | Lives, dodge cooldown, scoring weights | Defined in tunable config files; initial values set during the Duel slice |
| 8 | Wizard / Witch bosses | Implemented as behaviour modules selected by mission config, in line with Core Design Rule 2 |
| 9 | Email verification (2026-10-15) | Non-blocking: accounts can play immediately; a banner/resend lets players verify later |
| 10 | Duel round thresholds (2026-10-15) | Health carries across rounds, clamped to the new pool. Mounted rounds end when anyone has lost 2 blocks (≤100 HP); a middle on-foot round ends at ≤50 HP; the last round is to KO. Helmetless fighters take ×1.25 damage |
| 11 | Wizard interaction (2026-10-15) | The Wizard cannot be hit; destroying his summons drains extra mana so the player can shorten the fight |
| 12 | Evil Witch (2026-10-15) | Her body cannot fall: blows drain her mana (×0.7 of damage) and spells cost mana; partner = Bronze Knight; E tags manually |
| 13 | Mission 14 escort (2026-10-15) | Green Chestnut travels as an escort target; if he falls the mission fails (exercises spec §15 escort failure) |
| 14 | Lives (2026-10-15) | Quests: 3 lives (respawn in place; a lost boss duel costs a life and restarts the duel). Duels and battles: 1 life |
| 15 | Devices (2026-10-15, owner request) | Phones/tablets supported with on-screen controls; landscape required on small screens; menus responsive to 360 px |
| 16 | Extended moveset (2026-10-15, owner request) | Contextual moves on existing bindings: shield bash, jump slash, plunging strike, dodge-lunge, combo finisher, riposte (spec §8 keys unchanged) |
| 17 | Plausibility floors (2026-10-16, from live playtest) | Minimum victory durations: 2-round duels 10 s, 3-round duel 15 s, training 8 s, quests 60 s, open-field battles 30 s |
| 18 | Local ports (2026-10-15) | API 3917, client 5180, Postgres 5433 (3000/3100/5173 were taken on the dev machine) |

Still needed from the owner: Blender installed (or the Blender MCP connected), confirmation of the roster, and approval of the scoring and level curve once drafted.
