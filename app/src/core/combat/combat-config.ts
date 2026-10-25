import type { Difficulty } from '@/content/ids';

/**
 * Every combat tunable lives here (spec §9 + assumption 7). Values are in seconds, metres, HP.
 */
export const HEALTH = {
  playerFoot: 100,
  playerMounted: 150,
  unitFoot: 75,
  unitMounted: 125,
  /** HP represented by one bar segment. Player: 100/4, 150/6. Units: 75/3, 125/5. */
  segmentHp: 25,
} as const;

export const DAMAGE = {
  light: 10,
  heavy: 25,
  arrow: 5,
  spear: 15,
  javelin: 15,
  boss: 35,
  trap: 20,
  fallingObject: 15,
  storm: 10,
  magic: 25,
  bird: 10,
  fortressShot: 15,
  cityShot: 15,
  beam: 25,
  terrainWave: 15,
  treeSwipe: 25,
  stomp: 20,
  jumpAttack: 12,
  plunge: 25,
  bash: 5,
  lunge: 15,
  finisher: 18,
} as const;

/** Duel round pacing. */
export const DUEL = {
  /** A round cannot end on an HP threshold before this many seconds of actual fighting. */
  minRoundSeconds: 12,
  /** Mounted rounds end when a rider is down to this much HP (of 150): one blow from a KO. */
  mountedEndHp: 50,
  /** Foot rounds that are followed by another round end at this HP (of 100): the last health block. */
  footEndHp: 25,
} as const;

/** Moveset tunables. */
export const MOVES = {
  plungeFallSpeed: 26,
  plungeRadius: 2.4,
  bashStagger: 0.55,
  lungeSpeed: 9,
  /** A light attack within this window after a dodge becomes a lunge. */
  lungeWindow: 0.3,
  riposteWindow: 0.9,
  riposteMultiplier: 2,
} as const;

/** Energy shield (hold the shield key): a bubble that soaks every damage source, magic included. */
export const SHIELD = {
  max: 60,
  /** Energy drained per second while the bubble is up. */
  drain: 6,
  /** Seconds after lowering before the energy starts to recover. */
  rechargeDelay: 1.0,
  /** Energy recovered per second. */
  recharge: 14,
  /** Seconds the shield is offline after it breaks. */
  brokenTime: 3.0,
  /** Fraction of max energy it comes back with when it reboots. */
  rebootFraction: 0.35,
  /** Minimum energy needed to raise the bubble. */
  minToRaise: 8,
  /** Fraction of a projectile/hazard hit's damage drained from the bubble; it never leaks through. */
  rangedCost: 0.3,
} as const;

/** Fraction of damage that leaks through a block. */
export const BLOCK = {
  chipLight: 0,
  /** Heavy attacks break the block and stagger, dealing this fraction. */
  chipHeavy: 0.2,
  chipBoss: 0.3,
  /** Raising the shield within this window before impact is a perfect block (parry). */
  perfectWindow: 0.18,
  moveSpeedFactor: 0.4,
} as const;

export interface AttackTiming {
  anticipation: number;
  swing: number;
  impact: number;
  recovery: number;
}

export const ATTACK_TIMING: Record<'light' | 'heavy' | 'boss' | 'cast' | 'shoot' | 'throw' | 'jumpAttack' | 'plunge' | 'bash' | 'lunge' | 'finisher', AttackTiming> = {
  light: { anticipation: 0.12, swing: 0.07, impact: 0.06, recovery: 0.18 },
  heavy: { anticipation: 0.36, swing: 0.1, impact: 0.07, recovery: 0.34 },
  boss: { anticipation: 0.5, swing: 0.12, impact: 0.08, recovery: 0.42 },
  cast: { anticipation: 0.45, swing: 0.1, impact: 0.08, recovery: 0.35 },
  shoot: { anticipation: 0.55, swing: 0.06, impact: 0.06, recovery: 0.3 },
  throw: { anticipation: 0.4, swing: 0.1, impact: 0.06, recovery: 0.35 },
  // Extended, contextual moveset (no extra keys needed).
  jumpAttack: { anticipation: 0.08, swing: 0.07, impact: 0.07, recovery: 0.14 },
  /** The swing phase covers the dive; the slam resolves on landing. */
  plunge: { anticipation: 0.14, swing: 0.45, impact: 0.08, recovery: 0.36 },
  bash: { anticipation: 0.08, swing: 0.06, impact: 0.07, recovery: 0.26 },
  lunge: { anticipation: 0.06, swing: 0.12, impact: 0.07, recovery: 0.24 },
  finisher: { anticipation: 0.16, swing: 0.12, impact: 0.08, recovery: 0.32 },
};

export const MOVEMENT = {
  gravity: 32,
  jumpVelocity: 11.5,
  footSpeed: 4.4,
  footAccel: 45,
  footDecel: 55,
  airControl: 0.65,
  mountedSpeed: 8.5,
  mountedAccel: 14,
  mountedDecel: 12,
  flightSpeedX: 7,
  flightSpeedY: 5.5,
  flightAccel: 12,
  dodgeSpeed: 10,
  dodgeDuration: 0.38,
  dodgeIframesStart: 0.03,
  dodgeIframesEnd: 0.3,
  dodgeCooldown: 0.75,
  mountedDodgeSpeed: 13,
  groundFriction: 18,
} as const;

export const REACTION = {
  hitstunLight: 0.28,
  hitstunHeavy: 0.42,
  staggerBlockBreak: 0.55,
  staggerParried: 0.7,
  knockbackLight: 3.6,
  knockbackHeavy: 7.5,
  knockbackBoss: 9,
  hitPauseLight: 0.055,
  hitPauseHeavy: 0.1,
  hitPauseKill: 0.16,
  hitPauseParry: 0.14,
  /** After respawn / round start. */
  spawnInvulnerability: 1.5,
  /** Bodies stay this long before vanishing (spec §9 Unit Death). */
  corpseLinger: 3.5,
  corpseFade: 1.0,
  /** No-helmet rounds: head is exposed, damage taken is multiplied. */
  helmetlessDamageMultiplier: 1.25,
} as const;

export const REACH = {
  foot: 1.75,
  footHeavy: 1.95,
  spear: 2.5,
  mounted: 2.6,
  troll: 3.0,
  animal: 1.3,
} as const;

/** Combo: light attacks can chain into the next light after this fraction of recovery. */
export const COMBO_CANCEL_FRACTION = 0.35;
export const INPUT_BUFFER = 0.18;

export const LIVES = {
  quest: 3,
  openField: 1,
  duel: 1,
} as const;

/** Difficulty scales enemy damage dealt to the player and AI skill. */
export const DIFFICULTY: Record<Difficulty, { enemyDamage: number; playerDamage: number; aiSkill: number; label: string }> = {
  squire: { enemyDamage: 0.35, playerDamage: 1.4, aiSkill: 0.4, label: 'Squire' },
  knight: { enemyDamage: 0.75, playerDamage: 1.1, aiSkill: 0.65, label: 'Knight' },
  champion: { enemyDamage: 1.15, playerDamage: 1, aiSkill: 0.9, label: 'Champion' },
};

export const segmentsFor = (maxHp: number) => Math.max(1, Math.round(maxHp / HEALTH.segmentHp));
