import { DIFFICULTY, MOVES, REACTION } from '@/core/combat/combat-config';
import { isHitActive, resolveMeleeHit, resolveProjectileHit, type DefenderState } from '@/core/combat/combat-math';
import type { Difficulty, GroundMaterial } from '@/content/ids';
import type { FighterArchetype } from '@/content/fighters';
import { Rng } from '@/core/math/rng';
import { absorbWithShield, applyDamage, applyReaction, attackPhase, createFighter, hitbox, hurtbox, isAlive, setAction, updateFighter, type SpawnOptions } from './fighter';
import { updateHazards } from './hazards';
import { updateProjectiles } from './projectiles';
import { MELEE_ACTIONS, emptyStats, type AttackAction, type Fighter, type GameEvent, type Hazard, type Projectile, type ProjectileKind, type RunStats } from './types';

export interface Box { x0: number; x1: number; y0: number; y1: number }
export const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * The simulation world shared by all three engines. Pure TypeScript, stepped at a fixed rate,
 * never touched by React render. Engines own the rules; the world owns entities and physics.
 */
export class World {
  time = 0;
  fighters: Fighter[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  events: GameEvent[] = [];
  /** Real-time seconds of global hit-stop remaining. */
  hitStop = 0;
  rng: Rng;
  bounds = { minX: -12, maxX: 12 };
  ceiling = 50;
  surface: GroundMaterial = 'dirt';
  windForce = 0;
  /** 0..1 visual + gameplay terrain distortion (Wizard / Witch). */
  distortion = 0;
  difficulty: Difficulty;
  stats: RunStats = emptyStats();
  private nextId = 1;

  /** Hooks for engines / boss modules. */
  onAttackStart?: (f: Fighter, kind: AttackAction) => void;
  onRelease?: (f: Fighter, kind: AttackAction) => void;
  onDamaged?: (f: Fighter, amount: number, attackerId: number) => void;
  onDeath?: (f: Fighter) => void;
  /** Return true to cancel a death (e.g. round transitions, lives). */
  preventDeath?: (f: Fighter) => boolean;
  /** Return false to make a fighter immune to melee from a given attacker (e.g. the Wizard). */
  canBeHit?: (target: Fighter, attacker: Fighter | null) => boolean;
  floorAt: (f: Fighter) => number = () => 0;

  constructor(seed: number, difficulty: Difficulty) {
    this.rng = new Rng(seed);
    this.difficulty = difficulty;
  }

  newId() {
    return this.nextId++;
  }

  emit(e: GameEvent) {
    this.events.push(e);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  spawn(arch: FighterArchetype, o: SpawnOptions): Fighter {
    const f = createFighter(this.newId(), arch, o);
    this.fighters.push(f);
    return f;
  }

  get player(): Fighter | undefined {
    return this.fighters.find((f) => f.isPlayer && !f.removed);
  }

  alive(team?: 0 | 1): Fighter[] {
    return this.fighters.filter((f) => isAlive(f) && (team === undefined || f.team === team));
  }

  byId(id: number): Fighter | undefined {
    return this.fighters.find((f) => f.id === id);
  }

  addProjectile(p: Omit<Projectile, 'id' | 'dead' | 'stuck'>): Projectile {
    const proj: Projectile = { ...p, id: this.newId(), dead: false, stuck: 0 };
    this.projectiles.push(proj);
    return proj;
  }

  addHazard(h: Omit<Hazard, 'id' | 'dead' | 'hitIds' | 't'> & { t?: number }): Hazard {
    const hz: Hazard = { t: 0, ...h, id: this.newId(), dead: false, hitIds: new Set() };
    this.hazards.push(hz);
    return hz;
  }

  hitPause(seconds: number) {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  shake(strength: number, duration = 0.25) {
    this.emit({ type: 'shake', strength, duration });
  }

  /** Damage multiplier for a hit dealt by `attacker` (difficulty scaling). */
  damageScale(attacker: Fighter | null, target: Fighter): number {
    const d = DIFFICULTY[this.difficulty];
    // Difficulty protects the whole player side (hero, allies, escorts) from enemy damage.
    if (target.team === 0 && (!attacker || attacker.team !== target.team)) return d.enemyDamage;
    if (attacker?.isPlayer) return d.playerDamage;
    return 1;
  }

  defenderState(target: Fighter, fromX: number): DefenderState {
    const facingAttacker = (fromX - target.x) * target.facing >= -0.05;
    const dodgeInvuln = target.action === 'dodge' && target.actionT >= 0.03 && target.actionT <= 0.3;
    return {
      blocking: target.action === 'block',
      blockAge: target.blockAge,
      facingAttacker,
      invulnerable: dodgeInvuln || target.invulnT > 0 || target.untargetable,
      helmetless: !target.helmet && target.look.model === 'humanoid',
      poise: target.isBoss && (target.action === 'boss' || target.action === 'heavy' || target.action === 'cast') ? 'full' : target.stats.poise,
      canBlock: target.stats.canBlock,
    };
  }

  /** One fixed simulation step. Controllers must have written intents before calling. */
  step(dt: number) {
    this.time += dt;
    for (const f of this.fighters) if (!f.removed) updateFighter(this, f, dt);
    this.resolveMelee();
    this.resolveContact();
    updateProjectiles(this, dt);
    updateHazards(this, dt);
    // Cleanup.
    if (this.fighters.some((f) => f.removed && !f.isPlayer)) this.fighters = this.fighters.filter((f) => !f.removed || f.isPlayer);
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.hazards.some((h) => h.dead)) this.hazards = this.hazards.filter((h) => !h.dead);
  }

  private resolveMelee() {
    for (const a of this.fighters) {
      if (!MELEE_ACTIONS.has(a.action)) continue;
      // The plunge strikes through its landing slam (groundSlam), not its hitbox.
      if (a.action === 'plunge') continue;
      const ph = attackPhase(a);
      if (!ph || !isHitActive(ph.phase, ph.phaseT)) continue;
      const box = hitbox(a);
      for (const t of this.fighters) {
        if (t.team === a.team || !isAlive(t) || a.struck.has(t.id)) continue;
        if (this.canBeHit && !this.canBeHit(t, a)) continue;
        if (!overlaps(box, hurtbox(t))) continue;
        a.struck.add(t.id);
        this.strike(a, t);
      }
    }
  }

  /** Apply one melee strike from `a` to `t` with full combat feel (hit-stop, knockback, events). */
  strike(a: Fighter, t: Fighter) {
    const kind = a.meleeKind;
    // Riposte: the first blow after a perfect block hits twice as hard and always staggers.
    const riposte = a.riposteT > 0 && kind !== 'bash';
    const dmg = a.meleeDamage * this.damageScale(a, t) * (riposte ? MOVES.riposteMultiplier : 1);
    const def = this.defenderState(t, a.x);
    if (def.invulnerable) {
      if (t.isPlayer && t.action === 'dodge') {
        this.stats.dodges++;
        this.emit({ type: 'dodge-avoid', x: t.x, y: t.y + 1.2 });
      }
      return;
    }
    const r = resolveMeleeHit(kind, dmg, def);
    if (riposte && r.outcome === 'hit') {
      a.riposteT = 0;
      r.stun = Math.max(r.stun, REACTION.staggerParried);
      r.stagger = r.stun > 0 && def.poise !== 'full';
      this.emit({ type: 'special', x: t.x, y: t.y + 1.5, move: 'riposte', isPlayer: a.isPlayer });
    }
    if (t.shieldOn && r.damage > 0) {
      const through = absorbWithShield(this, t, r.damage);
      if (through <= 0) {
        // The energy bubble held: no damage, no stagger, just a shove.
        this.emit({ type: 'hit', x: (a.x + t.x) / 2, y: t.y + 1.3 * t.look.scale, outcome: 'blocked', damage: 0, heavy: kind !== 'light', targetId: t.id, attackerId: a.id, armored: true, isPlayer: t.isPlayer, creature: false });
        t.pushX += (t.x >= a.x ? 1 : -1) * 0.8;
        if (a.isPlayer || t.isPlayer) this.hitPause(REACTION.hitPauseLight * 0.7);
        return;
      }
      r.damage = through;
    }
    const heavy = kind !== 'light';
    const armored = t.look.model === 'humanoid' && t.enemyType !== 'zombie' && t.enemyType !== 'servant' && t.enemyType !== 'bandit';
    this.emit({ type: 'hit', x: (a.x + t.x) / 2 + (t.x - a.x) * 0.2, y: t.y + (t.mounted ? 2.2 : 1.3) * t.look.scale, outcome: r.outcome as 'hit', damage: r.damage, heavy, targetId: t.id, attackerId: a.id, armored, isPlayer: t.isPlayer, creature: t.look.model !== 'humanoid' });
    if (r.outcome === 'parried') {
      if (t.isPlayer) this.stats.perfectBlocks++;
      t.riposteT = MOVES.riposteWindow;
      setAction(a, 'stagger', r.attackerStagger);
      a.pushX += -a.facing * 2.5;
    }
    if (r.outcome === 'blocked') t.blockAge = Math.max(t.blockAge, 0.5);
    if (r.outcome === 'blockBreak') t.blockAge = 0;
    const killed = applyDamage(this, t, r.damage, a.id);
    applyReaction(t, killed ? 0 : r.stun, r.stagger, r.knockback * (killed ? 1.4 : 1), a.x);
    // Hit-stop and shake only for blows the player deals or receives — background melees
    // in big battles must never freeze the simulation.
    if (a.isPlayer || t.isPlayer || t.isBoss) {
      this.hitPause(killed ? REACTION.hitPauseKill : r.hitPause);
      if (heavy && (r.outcome === 'hit' || r.outcome === 'blockBreak')) this.shake(kind === 'boss' ? 0.35 : 0.22, 0.22);
      else if (killed) this.shake(0.18, 0.18);
    }
  }

  /** Plunging strike landing: shockwave that hits every nearby grounded foe (heavy blow). */
  groundSlam(f: Fighter) {
    this.emit({ type: 'special', x: f.x, y: f.y, move: 'slam', isPlayer: f.isPlayer });
    if (f.isPlayer) this.shake(0.38, 0.3);
    for (const t of this.fighters) {
      if (t.team === f.team || !isAlive(t) || f.struck.has(t.id)) continue;
      if (this.canBeHit && !this.canBeHit(t, f)) continue;
      if (Math.abs(t.x - f.x) > MOVES.plungeRadius * f.look.scale || t.y > f.y + 1.6) continue;
      f.struck.add(t.id);
      this.strike(f, t);
    }
  }

  /** Projectile / hazard damage helper. */
  hurt(t: Fighter, damage: number, blockable: boolean, fromX: number, attackerId = -1): 'ignored' | 'hit' | 'blocked' {
    if (!isAlive(t)) return 'ignored';
    const def = this.defenderState(t, fromX);
    if (def.invulnerable) {
      if (t.isPlayer && t.action === 'dodge') {
        this.stats.dodges++;
        this.emit({ type: 'dodge-avoid', x: t.x, y: t.y + 1.2 });
      }
      return 'ignored';
    }
    const attacker = attackerId >= 0 ? this.byId(attackerId) ?? null : null;
    const r = resolveProjectileHit(damage * this.damageScale(attacker, t), blockable, def);
    if (r.outcome === 'blocked') return 'blocked';
    if (t.shieldOn && r.damage > 0) {
      absorbWithShield(this, t, r.damage, true);
      return 'blocked';
    }
    const killed = applyDamage(this, t, r.damage, attackerId);
    applyReaction(t, killed ? 0 : r.stun, false, r.knockback, fromX);
    if (r.outcome === 'hit') {
      this.emit({ type: 'hit', x: t.x, y: t.y + 1.2, outcome: 'hit', damage: r.damage, heavy: false, targetId: t.id, attackerId, armored: t.look.model === 'humanoid', isPlayer: t.isPlayer, creature: t.look.model !== 'humanoid' });
      if (t.isPlayer || attacker?.isPlayer) this.hitPause(killed ? REACTION.hitPauseKill : r.hitPause);
    }
    return 'hit';
  }

  private resolveContact() {
    for (const a of this.fighters) {
      if (a.stats.contactDamage <= 0 || !isAlive(a)) continue;
      const box = hurtbox(a);
      for (const t of this.fighters) {
        if (t.team === a.team || !isAlive(t)) continue;
        if ((a.ai.contactCd ?? 0) > this.time) continue;
        if (!overlaps(box, hurtbox(t))) continue;
        a.ai.contactCd = this.time + 1.0;
        this.hurt(t, a.stats.contactDamage, false, a.x, a.id);
      }
    }
  }

  /** Spawn a projectile from a fighter's hand towards a target point. */
  fireProjectile(owner: Fighter, kind: ProjectileKind, tx: number, ty: number, opts: { speed?: number; damage?: number; blockable?: boolean; homing?: number } = {}) {
    const spec = PROJECTILE_SPECS[kind];
    const ox = owner.x + owner.facing * 0.6 * owner.look.scale;
    const oy = owner.y + (owner.mounted === 'horse' ? 2.5 : owner.mounted === 'hippogryph' ? 1.4 : 1.45 * owner.look.scale);
    const speed = opts.speed ?? spec.speed;
    const g = spec.gravity;
    const dx = tx - ox;
    const dy = ty - oy;
    let vx: number;
    let vy: number;
    if (g > 0) {
      // Ballistic aim: pick flight time from distance, solve vy.
      const T = Math.max(0.35, Math.abs(dx) / speed);
      vx = dx / T;
      vy = (dy + 0.5 * g * T * T) / T;
    } else {
      const len = Math.hypot(dx, dy) || 1;
      vx = (dx / len) * speed;
      vy = (dy / len) * speed;
    }
    this.addProjectile({ kind, team: owner.team, ownerId: owner.id, x: ox, y: oy, vx, vy, gravity: g, damage: opts.damage ?? spec.damage, blockable: opts.blockable ?? spec.blockable, radius: spec.radius, ttl: 6, homing: opts.homing ?? 0 });
    this.emit({ type: 'release', x: ox, y: oy, kind });
  }
}

export const PROJECTILE_SPECS: Record<ProjectileKind, { speed: number; gravity: number; damage: number; blockable: boolean; radius: number }> = {
  arrow: { speed: 17, gravity: 9, damage: 5, blockable: true, radius: 0.18 },
  spear: { speed: 14, gravity: 11, damage: 15, blockable: true, radius: 0.22 },
  javelin: { speed: 15, gravity: 10, damage: 15, blockable: true, radius: 0.22 },
  fireball: { speed: 9, gravity: 0, damage: 25, blockable: false, radius: 0.45 },
  magic: { speed: 8, gravity: 0, damage: 25, blockable: false, radius: 0.35 },
  rock: { speed: 12, gravity: 14, damage: 15, blockable: false, radius: 0.4 },
  'fortress-shot': { speed: 13, gravity: 6, damage: 15, blockable: true, radius: 0.4 },
  'city-shot': { speed: 13, gravity: 6, damage: 15, blockable: true, radius: 0.35 },
};
