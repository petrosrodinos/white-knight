import type { EnemyType, FighterSkinId, GroundMaterial } from '@/content/ids';
import type { MeleeKind } from '@/core/combat/combat-math';

export type Team = 0 | 1;
export type ModelId = 'humanoid' | 'troll' | 'wolf' | 'boar' | 'bird' | 'haunted-tree';
export type MountKind = 'horse' | 'hippogryph';

export type ActionKind =
  | 'idle' | 'move' | 'air' | 'land' | 'dodge' | 'block'
  | 'light' | 'heavy' | 'boss' | 'cast' | 'shoot' | 'throw'
  | 'jumpAttack' | 'plunge' | 'bash' | 'lunge' | 'finisher'
  | 'hit' | 'stagger' | 'stunned' | 'dead' | 'victory' | 'rise';

export type AttackAction = 'light' | 'heavy' | 'boss' | 'cast' | 'shoot' | 'throw' | 'jumpAttack' | 'plunge' | 'bash' | 'lunge' | 'finisher';
export const ATTACK_ACTIONS: ReadonlySet<ActionKind> = new Set<ActionKind>(['light', 'heavy', 'boss', 'cast', 'shoot', 'throw', 'jumpAttack', 'plunge', 'bash', 'lunge', 'finisher']);
/** Actions that strike in melee (resolved by World.resolveMelee). */
export const MELEE_ACTIONS: ReadonlySet<ActionKind> = new Set<ActionKind>(['light', 'heavy', 'boss', 'jumpAttack', 'plunge', 'bash', 'lunge', 'finisher']);

/** What a controller (player input or AI) wants this step. Edge-triggered flags are true for one step. */
export interface Intent {
  moveX: number;
  moveY: number;
  jump: boolean;
  dodge: boolean;
  block: boolean;
  /** Held: energy-shield bubble. */
  shield: boolean;
  light: boolean;
  heavy: boolean;
  interact: boolean;
  /** AI-only special actions: ranged shot / thrown weapon / spell cast. */
  special: 'shoot' | 'throw' | 'cast' | null;
}

export const emptyIntent = (): Intent => ({ moveX: 0, moveY: 0, jump: false, dodge: false, block: false, shield: false, light: false, heavy: false, interact: false, special: null });

export type ProjectileKind = 'arrow' | 'spear' | 'javelin' | 'fireball' | 'magic' | 'rock' | 'fortress-shot' | 'city-shot';

export interface FighterStats {
  maxHp: number;
  speed: number;
  /** Knockback divisor. */
  weight: number;
  reach: number;
  lightDamage: number;
  heavyDamage: number;
  /** Uses the 35-damage boss attack instead of a normal heavy. */
  bossHeavy: boolean;
  attackSpeed: number;
  canBlock: boolean;
  canDodge: boolean;
  canJump: boolean;
  poise: 'none' | 'light' | 'full';
  /** Width/height of the hurtbox (on foot). */
  width: number;
  height: number;
  /** Ranged weapon used by `special`. */
  ranged: ProjectileKind | null;
  /** Damage dealt by touching (birds, ghosts). */
  contactDamage: number;
  flying: boolean;
  /** Multiplies the anticipation (wind-up) of attacks; rank-and-file enemies telegraph longer. */
  windup: number;
}

/** Visual identity resolved by the renderer (content/loadouts.ts). */
export interface FighterLook {
  model: ModelId;
  /** Loadout/palette key: a character/story skin id, or an enemy look id. */
  skin: FighterSkinId | string;
  scale: number;
  spectral?: boolean;
}

export interface Fighter {
  id: number;
  name: string;
  team: Team;
  look: FighterLook;
  stats: FighterStats;
  enemyType: EnemyType | null;
  isPlayer: boolean;
  isBoss: boolean;
  isCommander: boolean;
  isEscort: boolean;

  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Extra velocity from knockback/wind, decays with friction. */
  pushX: number;
  facing: 1 | -1;
  grounded: boolean;

  hp: number;
  maxHp: number;
  mounted: MountKind | null;
  helmet: boolean;

  action: ActionKind;
  actionT: number;
  actionDur: number;
  /** For attack actions: ids already struck by this swing. */
  struck: Set<number>;
  released: boolean;
  comboStep: number;
  blockAge: number;
  dodgeCd: number;
  dodgeDir: number;
  invulnT: number;
  stunT: number;
  deathT: number;
  hitFlash: number;
  /** Seconds the body has been dead (for despawn). */
  removed: boolean;
  /** Steps since last footstep event. */
  stepPhase: number;
  bufferedAction: { kind: 'light' | 'heavy' | 'dodge' | 'jump'; t: number } | null;
  intent: Intent;
  /** Controller id: 'player' | ai archetype name | 'none'. */
  controller: string;
  /** Free-form AI memory. */
  ai: Record<string, number>;
  /** Boss behaviour module state (bosses/). */
  mana: number;
  maxMana: number;
  untargetable: boolean;
  /** Last attacker id (kill credit). */
  lastHitBy: number;
  tookDamageThisRound: boolean;
  /** Optional attack override for the current swing (e.g. boss module stomp). */
  meleeKind: MeleeKind;
  /** Damage of the current melee swing (set when the attack starts). */
  meleeDamage: number;
  /** Energy-shield state (player-side humanoid knights; shieldMax 0 = no shield). */
  shield: number;
  shieldMax: number;
  shieldOn: boolean;
  /** Seconds until the energy starts recovering. */
  shieldDelay: number;
  /** Seconds the shield stays offline after breaking (> 0 = broken). */
  shieldBroken: number;
  /** Seconds left in which the next blow is a riposte (after a perfect block). */
  riposteT: number;
  /** World time the last dodge ended (dodge → lunge). */
  lastDodgeEnd: number;
  /** Fades body after death; 1 → 0. */
  fade: number;
  /** For units in open field: the squad they belong to. */
  squad: number;
}

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  team: Team;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  damage: number;
  blockable: boolean;
  radius: number;
  ttl: number;
  /** Stuck in ground/shield: rendered for a while, no longer harmful. */
  stuck: number;
  dead: boolean;
  homing: number;
}

export type HazardKind =
  | 'spike-trap' | 'falling-object' | 'wind-gust' | 'lightning' | 'beam' | 'terrain-wave'
  | 'emitter' | 'ship' | 'landing-zone' | 'quake';

export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  width: number;
  t: number;
  /** Generic phase durations / parameters. */
  warn: number;
  active: number;
  rest: number;
  dir: number;
  power: number;
  damage: number;
  team: Team | -1;
  /** Ids already damaged during the current active phase. */
  hitIds: Set<number>;
  dead: boolean;
  /** For emitters: projectile kind and rate. */
  projectile?: ProjectileKind;
  rate?: number;
  variant?: string;
  /** Hazard visuals hint, e.g. 'rock' | 'chandelier' | 'beam'. */
  model?: string;
}

export type GameEvent =
  | { type: 'swing'; x: number; kind: AttackAction; heavy: boolean; mounted: boolean; weapon: string; model: ModelId; spectral: boolean; isPlayer: boolean }
  | { type: 'hit'; x: number; y: number; outcome: 'hit' | 'blocked' | 'blockBreak' | 'parried'; damage: number; heavy: boolean; targetId: number; attackerId: number; armored: boolean; isPlayer: boolean; creature: boolean }
  | { type: 'dodge'; x: number; mounted: boolean; isPlayer: boolean }
  | { type: 'dodge-avoid'; x: number; y: number }
  | { type: 'jump'; x: number }
  | { type: 'land'; x: number; heavy: boolean; surface: GroundMaterial }
  | { type: 'footstep'; x: number; surface: GroundMaterial; mounted: boolean; isPlayer: boolean; creature: boolean }
  | { type: 'block-raise'; x: number }
  | { type: 'shield-up'; x: number; isPlayer: boolean }
  | { type: 'shield-hit'; x: number; y: number; isPlayer: boolean }
  | { type: 'shield-break'; x: number; y: number; isPlayer: boolean }
  | { type: 'death'; x: number; y: number; id: number; enemyType: EnemyType | null; isPlayer: boolean; model: ModelId; spectral: boolean; mounted: boolean }
  | { type: 'release'; x: number; y: number; kind: ProjectileKind | 'cast' }
  | { type: 'impact'; x: number; y: number; kind: ProjectileKind; blocked: boolean; hitFighter: boolean }
  | { type: 'hazard-warn'; x: number; kind: HazardKind; variant?: string }
  | { type: 'hazard-strike'; x: number; kind: HazardKind; variant?: string }
  | { type: 'spawn'; x: number; y: number; enemyType: EnemyType | null; spectral: boolean }
  | { type: 'round-start'; index: number; label: string; mounted: boolean; helmets: boolean }
  | { type: 'round-end'; index: number }
  | { type: 'helmet-off'; x: number }
  | { type: 'dismount'; x: number }
  | { type: 'mount'; x: number }
  | { type: 'stun'; x: number; y: number }
  | { type: 'summon'; x: number; y: number; what: string }
  | { type: 'mana-drain'; amount: number }
  | { type: 'quake'; strength: number }
  | { type: 'tag-in'; x: number }
  | { type: 'order'; order: 'move' | 'hold' | 'retreat' | 'charge' }
  | { type: 'select'; squad: number }
  | { type: 'slide-advance'; index: number }
  | { type: 'wave-start'; index: number; count: number }
  | { type: 'enemy-alert'; x: number }
  | { type: 'roar'; x: number }
  | { type: 'laugh'; x: number; who: 'witch' | 'wizard' }
  | { type: 'heal'; x: number; amount: number }
  | { type: 'landing'; x: number; safe: boolean }
  | { type: 'wing-flap'; x: number }
  | { type: 'commander-down'; x: number; routed: boolean }
  | { type: 'outcome'; result: 'victory' | 'defeat' }
  | { type: 'shake'; strength: number; duration: number }
  | { type: 'special'; x: number; y: number; move: 'bash' | 'plunge' | 'slam' | 'lunge' | 'finisher' | 'riposte' | 'jumpAttack'; isPlayer: boolean };

export interface RunStats {
  kills: Partial<Record<EnemyType, number>>;
  bossesDefeated: number;
  damageTaken: number;
  perfectBlocks: number;
  dodges: number;
  noHitRounds: number;
  livesLost: number;
}

export const emptyStats = (): RunStats => ({ kills: {}, bossesDefeated: 0, damageTaken: 0, perfectBlocks: 0, dodges: 0, noHitRounds: 0, livesLost: 0 });
