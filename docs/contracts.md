# White Knight — Cross-Team Contracts

Binding interface definitions between the client (`app/`), backend (`api/`) and asset pipelines (`tools/`).
`Product_Specification.md` is the product source of truth; this file fixes the *names and shapes* so parallel work fits together.
If you must change a contract, update this file in the same change.

---

## 1. Ports, URLs, cookies

| Thing | Value |
|---|---|
| API dev server | `http://localhost:3917`, global prefix `/api` (e.g. `POST /api/auth/login`) |
| Swagger | `/api/docs` |
| Client dev server | `http://localhost:5180`; Vite proxies `/api` → `http://localhost:3917` so cookies are first-party |
| Client API base | `import.meta.env.VITE_API_URL ?? '/api'` |
| Local Postgres | Docker, `api/docker-compose.yml`, host port **5433**, db `white_knight`, user `wk`, password `wk_local_pw` |
| Access cookie | `wk_access` — httpOnly, `SameSite=Lax`, `Secure` in production, path `/`, 15 min |
| Refresh cookie | `wk_refresh` — httpOnly, `SameSite=Lax`, `Secure` in production, path `/api/auth`, 30 days, rotated on every refresh (stored hashed server-side; reuse of a revoked token revokes the whole family) |
| CSRF | Every non-GET request must carry header `X-Requested-With: XMLHttpRequest`; the API rejects state-changing requests without it (403). |

All JSON uses **camelCase**. Errors use Nest's default shape `{ statusCode, message, error }`; `message` may be a string or string[] (validation).

---

## 2. REST API

### 2.1 Auth (`/api/auth`) — rate limited (see 2.6)

| Method & path | Body | Response |
|---|---|---|
| `POST /auth/register` | `{ email, username, password }` | `201 { user: MeResponse }` + sets both cookies (account is usable immediately; email verification is non-blocking, see 2.7) |
| `POST /auth/login` | `{ identifier, password }` (identifier = email **or** username) | `200 { user: MeResponse }` + cookies |
| `POST /auth/refresh` | – (uses `wk_refresh` cookie) | `200 { ok: true }` + rotated cookies; `401` if invalid |
| `POST /auth/logout` | – | `204`, clears cookies, revokes refresh family |
| `POST /auth/verify-email` | `{ token }` | `200 { ok: true }` |
| `POST /auth/resend-verification` | – (auth required) | `202 { ok: true }` |
| `POST /auth/forgot-password` | `{ email }` | `202 { ok: true }` (always, no account enumeration) |
| `POST /auth/reset-password` | `{ token, password }` | `200 { ok: true }`, revokes all refresh tokens |

Validation: `username` 3–20 chars `^[A-Za-z0-9_]+$`, unique case-insensitively, profanity-filtered (server-side word list incl. leetspeak normalisation). `password` 8–72 chars, at least one letter and one digit. `email` valid, unique case-insensitively.

### 2.2 Me (`/api/me`) — auth required

```ts
interface MeResponse {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: string;            // ISO
  profile: { level: number; xp: number; xpForNextLevel: number; xpIntoLevel: number; totalPoints: number; title: string };
  // xp = sum of all accepted run scores; totalPoints = sum of best score per mission.
  // xpForNextLevel = XP span of the current level, xpIntoLevel = XP earned within it (both 0 at max level 50).
  settings: GameSettings;
  unlockedCharacters: CharacterId[];
}

interface GameSettings {
  masterVolume: number;   // 0..1
  musicVolume: number;    // 0..1
  sfxVolume: number;      // 0..1
  reducedMotion: boolean;
  screenShake: boolean;
  showFps: boolean;
  difficulty: 'squire' | 'knight' | 'champion';
  keyBindings: Record<GameAction, string[]>; // values are KeyboardEvent.code or 'Mouse0' | 'Mouse1' | 'Mouse2'
}

type GameAction =
  | 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown'
  | 'dodge' | 'block' | 'shield' | 'interact' | 'lightAttack' | 'heavyAttack'
  | 'orderMove' | 'orderHold' | 'orderRetreat' | 'orderCharge' | 'cycleSelection';
```

Default bindings: moveUp `KeyW`, moveLeft `KeyA`, moveDown `KeyS`, moveRight `KeyD`, dodge `Space`, block `ShiftLeft`+`ShiftRight`, shield `KeyC` (hold), interact `KeyE`, lightAttack `Mouse0`, heavyAttack `Mouse2`, orderMove `KeyQ`, orderHold `KeyR`, orderRetreat `KeyF`, orderCharge `Mouse1`, cycleSelection `Tab`. (`Escape` = pause, not remappable.)

| Method & path | Body | Response |
|---|---|---|
| `GET /me` | – | `MeResponse` |
| `PATCH /me/settings` | `Partial<GameSettings>` (validated; unknown actions/codes rejected) | `GameSettings` |

### 2.3 Progress (`/api/progress`) — auth required

```ts
type MissionId = 'm01' | 'm02' | ... | 'm15';
type MissionStatus = 'locked' | 'unlocked' | 'in_progress' | 'completed';

interface ProgressResponse {
  saveVersion: number;                // currently 1
  currentMissionId: MissionId;        // last mission reached (Continue target)
  highestUnlockedMissionId: MissionId;
  trainingGroundsUnlocked: boolean;   // true once m07 is unlocked
  missions: Array<{ missionId: MissionId; status: MissionStatus; bestScore: number; bestTimeMs: number | null; completions: number; bestRank: 'S'|'A'|'B'|'C'|'D'|null }>;
  unlockedCharacters: CharacterId[];
}
```

| Method & path | Body | Response |
|---|---|---|
| `GET /progress` | – | `ProgressResponse` |
| `POST /progress/mission-start` | `{ missionId }` | `201 { runId, runToken, startedAt }` — 403 if mission locked. Auto-saves: `currentMissionId = missionId`, status `in_progress` if not completed. |
| `POST /progress/mission-complete` | `MissionResultDto` | `MissionCompleteResponse` |

```ts
interface MissionResultDto {
  runToken: string;
  outcome: 'victory' | 'defeat';
  durationMs: number;
  kills: Partial<Record<EnemyType, number>>;
  bossesDefeated: number;
  damageTaken: number;
  perfectBlocks: number;
  dodges: number;
  noHitRounds: number;
  healthRemainingPct: number;   // 0..1
  livesRemaining: number;
  difficulty: 'squire' | 'knight' | 'champion';
  trainingCharacterId?: CharacterId; // m07 only
}

interface MissionCompleteResponse {
  accepted: boolean;
  score: number;
  rank: 'S'|'A'|'B'|'C'|'D';
  breakdown: Array<{ key: string; label: string; points: number }>;
  xpGained: number;
  profile: MeResponse['profile'];
  levelUp: boolean;
  newlyUnlockedMissionId: MissionId | null;
  newlyUnlockedCharacters: CharacterId[];
  personalBest: boolean;
  progress: ProgressResponse;
}
```

Defeats are recorded (run closed, no score, no unlock) and return `accepted: true, score: 0`.
Rejected (implausible) submissions return `422` and are logged.
Run tokens expire after 3 h and can be submitted exactly once (a rejected submission also closes the run — start a new one).
After a victory the save's `currentMissionId` becomes `highestUnlockedMissionId` (the campaign frontier).
`breakdown` points always sum to `score`.

### 2.4 Leaderboard (`/api/leaderboard`)

`GET /leaderboard?scope=global|mission&missionId=m03&window=all|monthly|weekly&sort=points|time&page=1&limit=20` (public, cached 30 s)

```ts
interface LeaderboardResponse {
  data: Array<{ rank: number; username: string; level: number; points: number; bestTimeMs: number | null; isCurrentUser: boolean }>;
  pagination: { total: number; page: number; limit: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
  me: { rank: number; username: string; level: number; points: number; bestTimeMs: number | null } | null; // when authenticated, even if outside the page
}
```

- `scope=global`: sum of best score per mission within the window (all-time = profile totalPoints). `sort=time` only valid for `scope=mission`.
- `GET /leaderboard/me?…same params…` → `{ rank, username, level, points, bestTimeMs } | null` (auth required).

### 2.5 Telemetry

`POST /api/telemetry/client-error` `{ message, stack?, url, userAgent, context? }` → `204`. Public, rate limited 20/min/IP, payload capped at 16 KB (`413` above), logged with Nest `Logger`.

### 2.6 Rate limits (per IP, `@nestjs/throttler`)

register 5/h, login 10/min, forgot-password 5/h, reset 10/h, refresh 60/min, mission-complete 20/min, default 120/min.

### 2.7 Email

Verification and reset emails via the existing Resend integration. Links: `${APP_URL}/verify-email?token=…` and `${APP_URL}/reset-password?token=…`. When `RESEND_API_KEY` is missing (local), the API logs the link with `Logger.warn` instead of failing.

---

## 3. Game catalog IDs (shared vocabulary)

```ts
type CharacterId =
  | 'white-knight' | 'bronze-knight' | 'mysterious-knight' | 'green-chestnut' | 'black-knight'
  | 'saracen-leader-1' | 'saracen-leader-2' | 'pink-paladin' | 'red-paladin' | 'blue-paladin'
  | 'deer-paladin' | 'orange-paladin' | 'yellow-paladin' | 'emperor-knight';

type EnemyType =
  | 'infantry' | 'spearman' | 'archer' | 'cavalry' | 'bandit' | 'viking' | 'balkan-soldier'
  | 'wolf' | 'boar' | 'ghost' | 'zombie' | 'servant' | 'commander' | 'boss';
```

Mission engines: m01 open-field, m02 duel, m03 quest+boss, m04 quest+boss, m05 quest+boss, m06 quest+duel, m07 duel (training), m08 quest+boss, m09 quest (flight), m10 quest+2 bosses, m11 quest (flight)+boss, m12 open-field, m13 duel, m14 quest, m15 duel.

Character unlocks on first completion: m03 → black-knight, m04 → mysterious-knight & bronze-knight, m06 → blue-paladin, deer-paladin, pink-paladin, red-paladin, orange-paladin, yellow-paladin, m11 → green-chestnut, m12 → saracen-leader-1, saracen-leader-2. `white-knight` unlocked at registration. `emperor-knight` unlocks when `totalPoints >= 60000` (config `EMPEROR_KNIGHT_POINTS_THRESHOLD`).

---

## 4. Asset contract

All exported files live under `app/public/assets/`. Units are metres. **glTF axes: +Y up, characters face +X, origin on the ground between the feet.**

### 4.1 Models (`app/public/assets/models/*.glb`)

**Rig style:** rigid segmented parts — every mesh object is parented to a bone of an armature (`parent_type = 'BONE'`) or to an animated empty. **No skinning / no vertex weights / no shape keys.** The client bakes the node hierarchy per clip and renders parts with instancing, so every visible mesh must move only via its ancestors' transforms. Keep each mesh object a single material where possible; multi-material meshes are allowed (they export as multiple primitives).

**Materials (named exactly; the client re-tints by name):** `Primary`, `Secondary`, `Metal`, `DarkMetal`, `Leather`, `Skin`, `Hair`, `Wood`, `Cloth`, `Glow` (emissive magic accents). Animal/creature models may also use `Coat`, `Mane`, `Feathers`, `Beak`, `Horn`, `Eye`. Base colours should be neutral/light so tinting works (Primary/Secondary near-white; Metal light grey).

**Animation:** every clip is a separate glTF animation (Blender Action/NLA strip) named exactly as listed, 30 fps baked keys. Attack-type clips (marked †) are **1.0 s long** and follow fixed phase fractions: anticipation `0.00–0.35`, swing `0.35–0.50`, impact `0.50–0.60`, recovery `0.60–1.00`. Exaggerated, readable poses.

#### `humanoid.glb`
Height ≈ 1.8 m to top of head (without helmet crest). Stylised: big hands, broad shoulders, **oversized weapons and large shields**.

Mesh-object naming (the client toggles groups by prefix):

| Group | Objects (exact names; a group may contain several meshes, suffix `_N` allowed e.g. `Armor_Plate_1`) |
|---|---|
| Base (always visible) | `Base_*` — pelvis, torso, head, upper arms, forearms, hands, thighs, shins, feet (`Base_Head`, `Base_Torso`, …) |
| Armor | `Armor_Plate_*`, `Armor_Mail_*`, `Armor_Leather_*`, `Armor_Robe_*`, `Armor_Rags_*`, `Armor_Fur_*` |
| Helm | `Helm_Great`, `Helm_Nasal`, `Helm_Horned`, `Helm_Turban`, `Helm_Spiked`, `Helm_Crown`, `Helm_Hood`, `Helm_WizardHat`, `Helm_WitchHat`, `Helm_Viking` |
| Hair (shown when helm hidden) | `Hair_Short`, `Hair_Long`, `Hair_Beard` |
| Crest | `Crest_Plume`, `Crest_Feather`, `Crest_Antlers` |
| Back | `Back_Cape` |
| Tabard | `Tabard_Front` |
| Weapon (right hand) | `Weapon_Sword`, `Weapon_Scimitar`, `Weapon_Spear`, `Weapon_Axe`, `Weapon_Club`, `Weapon_Dagger`, `Weapon_Staff` |
| Off-hand (left hand / forearm) | `Shield_Kite`, `Shield_Round`, `Shield_Heater`, `Shield_Buckler`, `Offhand_Bow` |

Required empties: `Socket_Projectile` (right hand, spawn point for thrown spears/spells/arrows), `Socket_Head`.

Clips: `Idle` (loop 2.0 s), `Walk` (loop 1.0 s), `Run` (loop 0.6 s), `Jump` (0.4 s, ends in airborne pose), `Fall` (loop 0.5 s), `Land` (0.25 s), `Dodge` (0.5 s quick roll/backstep), `BlockRaise` (0.15 s), `BlockHold` (loop 1.0 s), `AttackLight`†, `AttackHeavy`† (big overhead wind-up), `Cast`†, `Shoot`† (bow), `Throw`†, `Hit` (0.4 s), `Stagger` (0.8 s), `Stunned` (loop 1.0 s), `Death` (1.2 s, ends lying on the ground), `Victory` (loop 2.0 s), `MountedIdle` (loop 2.0 s), `MountedRide` (loop 0.6 s), `MountedAttackLight`†, `MountedAttackHeavy`†, `MountedBlock` (loop 1.0 s), `MountedHit` (0.4 s), `FlyRide` (loop 0.8 s), `JumpAttack`† (airborne horizontal slash, legs tucked; ends in the airborne pose), `Plunge`† (sword overhead in the air → blade-down dive → crouched two-handed ground slam at impact → rise), `ShieldBash`† (shield-arm shove, sword held back), `Lunge`† (deep front-leg lunge with a long forward thrust), `ComboFinisher`† (360° spinning horizontal slash — the pelvis spins about the vertical axis and the clip ends at +360°, i.e. the same orientation — into a held power pose). Mounted clips assume the pelvis sits at the mount's `Saddle` node (legs straddling).

#### `horse.glb`
Withers ≈ 1.6 m. Materials `Coat`, `Mane`, `Primary` (caparison/barding cloth, tinted), `Secondary` (trim), `Leather`, `Metal`. Node `Saddle` (empty at the seat, child of the animated body so it bobs). Clips: `Idle` (loop 2.0), `Walk` (loop 1.2), `Gallop` (loop 0.6), `Rear` (1.0), `Hit` (0.4), `Death` (1.5).

#### `hippogryph.glb`
Eagle front, horse hind, large wings. Materials `Feathers`, `Coat`, `Beak`, `Eye`, `Leather`. Node `Saddle`. Clips: `Fly` (loop 0.8), `Glide` (loop 2.0), `Land` (1.0), `Hit` (0.4), `Idle` (loop 2.0, standing).

#### `troll.glb`
Swamp Troll, ≈ 3.0 m, hunched, mossy, huge club (`Weapon_Club`). Same clip names as humanoid subset: `Idle`, `Walk`, `AttackLight`†, `AttackHeavy`†, `BlockRaise`, `BlockHold`, `Hit`, `Stagger`, `Death`, `Victory`.

#### `wolf.glb`, `boar.glb`
Quadrupeds ≈ 0.9 m tall. Clips: `Idle` (loop), `Run` (loop 0.5), `Attack`† (lunge), `Hit` (0.4), `Death` (1.0).

#### `bird.glb`
Large dark bird of prey, wingspan ≈ 1.4 m. Clips `Flap` (loop 0.4), `Dive` (loop 0.6).

#### `haunted-tree.glb`
≈ 4 m gnarled dead tree with a face and branch arms. Clips `Rise` (1.0), `Idle` (loop 2.0), `Swipe`†, `Death` (1.0).

#### `ship.glb`
Enemy medieval cog ≈ 14 m long, side view, `Primary` sail (tinted), `Wood`. No animation. Also include a node `Deck_Archer_Spot_1..3` (empties) where archers stand.

#### `props.glb`
Separate root nodes, each origin at its natural pivot, pointing +X where directional: `Arrow`, `Spear`, `Javelin`, `Rock`, `Boulder`, `SpikeTrap_Base`, `SpikeTrap_Spikes` (separate root, client raises it), `FallingBeam`, `Chandelier`, `Crate`, `Barrel`, `Banner` (tinted `Primary`), `LandingFlag`, `Torch`, `ShieldBubble` (2.4 m ribbed energy dome, centred; materials `Bubble`, `BubbleRib`; the client scales, tints and renders it translucent).

Compression: Draco or Meshopt. Each humanoid-class file should be < 1.5 MB.

### 4.2 Images (`app/public/assets/images/`, WebP)

**Environment parallax** — `env/<envId>/<layer>.webp`, all layers 2048×1024, **seamlessly tiling horizontally**:

| Layer | Content | Alpha |
|---|---|---|
| `sky.webp` | sky gradient + clouds/sun/moon | opaque |
| `far.webp` | distant mountains / skyline silhouettes in the lower half | transparent above |
| `mid.webp` | hills, tree lines, buildings in the lower 60% | transparent above |
| `fore.webp` | foreground terrain edge (grass tufts, rocks, rubble) occupying the lower ~35% | transparent above |

Shared fog layers: `env/_fog/light.webp`, `env/_fog/dark.webp`, `env/_fog/storm.webp` (soft horizontal bands, transparent, tileable).

`envId` list (29):
`forest`, `forest-clearing`, `mountains`, `city-gate`, `coastline`, `dark-tower`, `dark-hallway`, `mirror-hall`, `grand-hall`, `tower-coast`, `open-sea`, `european-coast`, `tournament`, `lake`, `stone-circle`, `sky-continental`, `storm-zone`, `fortress-airspace`, `fortress-walls`, `fortress-halls`, `fortress-dungeon`, `ocean-sky`, `swamp-coast`, `mercenary-field`, `imperial-arena`, `balkan-forest`, `valachia-mountains`, `german-fields`, `wedding-courtyard`.

**Ground textures** — `ground/<material>.webp`, 1024×1024 seamless (both axes): `dirt`, `grass`, `sand`, `stone`, `snow`, `wood`, `marble`.

**Menu / story art** — `ui/title.webp` (1920×1080 key art: White Knight on horseback), `ui/menu.webp` (1920×1080 calmer backdrop), `ui/parchment.webp` (1024 seamless parchment texture), `missions/m01.webp` … `missions/m15.webp` (1536×1024 painted story illustrations), `portraits/<CharacterId>.webp` (768×768 bust portraits, transparent or dark vignette background), `icons/<name>.webp` (256×256 transparent): `lives`, `kills`, `enemies`, `level`, `points`, `trophy`, `lock`, `sword`, `shield`, `horse`, `scroll`, `crown`, `skull`, `clock`.

### 4.3 Audio (`app/public/assets/audio/`)

`sfx/<name>.ogg` **and** `sfx/<name>.mp3` (client picks by `canPlayType`), mono, normalised to about -3 dBFS peak, trimmed:
`swing-light`, `swing-heavy`, `hit-flesh`, `hit-armor`, `block`, `block-break`, `parry`, `dodge`, `jump`, `land`, `footstep`, `death`, `grunt`, `horse-gallop`, `horse-neigh`, `bow-shoot`, `arrow-impact`, `spear-throw`, `magic-cast`, `fireball`, `beam`, `explosion`, `ghost`, `zombie`, `growl`, `bird`, `wind`, `thunder`, `trap`, `rock-fall`, `wing-flap`, `ui-click`, `ui-hover`, `ui-confirm`, `ui-back`, `victory`, `defeat`, `level-up`, `points`, `horn`, `crowd`,
plus (full action coverage): `footstep-grass`, `footstep-stone`, `footstep-wood`, `footstep-snow`, `armor-clank`, `sword-draw`, `shield-raise`, `whoosh-dodge`, `stun`, `heal`, `round-bell`, `crowd-cheer`, `crowd-gasp`, `horse-snort`, `horse-hit`, `horse-death`, `mount`, `dismount`, `helmet-off`, `order-move`, `order-hold`, `order-retreat`, `order-charge`, `select-unit`, `ghost-summon`, `ghost-death`, `zombie-death`, `animal-death`, `troll-roar`, `troll-stomp`, `witch-laugh`, `wizard-laugh`, `mana-drain`, `terrain-quake`, `tree-rise`, `tree-swipe`, `ship-creak`, `wave-splash`, `water-splash`, `catapult`, `landing`, `tag-in`, `slide-advance`, `wave-start`, `enemy-alert`, `ui-error`, `ui-toggle`, `ui-type`, `page-turn`, `unlock`, `low-health` (heartbeat loop).
Ambience loops in `music/` (loop true): `amb-forest`, `amb-wind`, `amb-sea`, `amb-cave`, `amb-storm`, `amb-crowd`, `amb-battle`.

`music/<name>.ogg` + `.mp3`, stereo, loopable: `menu`, `battle`, `duel`, `boss`, `dark`, `flight`, `sea`, `victory`, `story`.

`app/public/assets/audio/manifest.json`: `{ "sfx": { "<name>": { "variants": ["sfx/<name>.ogg", …] } }, "music": { "<name>": { "src": "music/<name>.ogg", "loop": true } } }` — multiple variants per SFX are encouraged (`hit-flesh-1`, `hit-flesh-2` listed under one name).

Every third-party asset (source URL, author, licence) is logged in `ASSETS.md` at the repo root.
