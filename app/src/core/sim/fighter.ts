import { ATTACK_TIMING, COMBO_CANCEL_FRACTION, DAMAGE, HEALTH, INPUT_BUFFER, MOVEMENT, MOVES, REACH, REACTION, SHIELD } from '@/core/combat/combat-config';
import { attackPhaseAt, timingTotal, type MeleeKind } from '@/core/combat/combat-math';
import type { FighterArchetype } from '@/content/fighters';
import type { World } from './world';
import { ATTACK_ACTIONS, emptyIntent, type ActionKind, type AttackAction, type Fighter, type MountKind, type Team } from './types';

export interface SpawnOptions {
  team: Team;
  x: number;
  y?: number;
  facing?: 1 | -1;
  isPlayer?: boolean;
  isBoss?: boolean;
  isCommander?: boolean;
  isEscort?: boolean;
  mounted?: MountKind | null;
  helmet?: boolean;
  maxHp?: number;
  controller?: string;
  name?: string;
  squad?: number;
}

export function createFighter(id: number, arch: FighterArchetype, o: SpawnOptions): Fighter {
  const mountedHp = o.mounted === 'horse' ? (o.isPlayer ? HEALTH.playerMounted : arch.stats.maxHp + 50) : arch.stats.maxHp;
  const maxHp = o.maxHp ?? mountedHp;
  // Knight-class humanoids carry the energy shield (only the player's intent ever raises it).
  const shieldMax = arch.enemyType === null && arch.look.model === 'humanoid' ? SHIELD.max : 0;
  return {
    id,
    name: o.name ?? arch.name,
    team: o.team,
    look: { ...arch.look },
    stats: { ...arch.stats },
    enemyType: arch.enemyType,
    isPlayer: !!o.isPlayer,
    isBoss: !!o.isBoss,
    isCommander: !!o.isCommander,
    isEscort: !!o.isEscort,
    x: o.x,
    y: o.y ?? 0,
    vx: 0,
    vy: 0,
    pushX: 0,
    facing: o.facing ?? (o.team === 0 ? 1 : -1),
    grounded: !arch.stats.flying && (o.y ?? 0) <= 0,
    hp: maxHp,
    maxHp,
    mounted: o.mounted ?? null,
    helmet: o.helmet ?? true,
    action: 'idle',
    actionT: 0,
    actionDur: 0,
    struck: new Set(),
    released: false,
    comboStep: 0,
    blockAge: 0,
    dodgeCd: 0,
    dodgeDir: 0,
    invulnT: 0,
    stunT: 0,
    deathT: 0,
    hitFlash: 0,
    removed: false,
    stepPhase: 0,
    bufferedAction: null,
    intent: emptyIntent(),
    controller: o.controller ?? (o.isPlayer ? 'player' : arch.ai),
    ai: {},
    mana: 0,
    maxMana: 0,
    untargetable: false,
    lastHitBy: -1,
    tookDamageThisRound: false,
    meleeKind: 'light',
    meleeDamage: arch.stats.lightDamage,
    shield: shieldMax,
    shieldMax,
    shieldOn: false,
    shieldDelay: 0,
    shieldBroken: 0,
    riposteT: 0,
    lastDodgeEnd: -10,
    fade: 1,
    squad: o.squad ?? 0,
  };
}

export const isAlive = (f: Fighter) => f.action !== 'dead' && !f.removed;
export const isAttacking = (f: Fighter) => ATTACK_ACTIONS.has(f.action);
export const isBusy = (f: Fighter) => isAttacking(f) || f.action === 'dodge' || f.action === 'hit' || f.action === 'stagger' || f.action === 'stunned' || f.action === 'dead' || f.action === 'rise';

export function setAction(f: Fighter, action: ActionKind, dur = 0) {
  f.action = action;
  f.actionT = 0;
  f.actionDur = dur;
  if (ATTACK_ACTIONS.has(action)) {
    f.struck.clear();
    f.released = false;
  }
}

export function attackTiming(action: AttackAction) {
  return ATTACK_TIMING[action];
}

/** Attack timing for this fighter: base timing with its wind-up multiplier applied to anticipation. */
export function fighterTiming(f: Fighter, action: AttackAction) {
  const t = ATTACK_TIMING[action];
  const w = f.stats.windup ?? 1;
  return w === 1 ? t : { ...t, anticipation: t.anticipation * w };
}

export function attackDuration(f: Fighter, action: AttackAction) {
  return timingTotal(fighterTiming(f, action), f.stats.attackSpeed);
}

export function attackPhase(f: Fighter) {
  if (!isAttacking(f)) return null;
  return attackPhaseAt(fighterTiming(f, f.action as AttackAction), f.actionT, f.stats.attackSpeed);
}

/** Effective melee reach for the current state. */
export function reachOf(f: Fighter): number {
  if (f.mounted === 'horse') return Math.max(REACH.mounted, f.stats.reach);
  if (f.action === 'heavy' || f.action === 'boss') return f.stats.reach + (REACH.footHeavy - REACH.foot);
  if (f.action === 'lunge') return f.stats.reach + 0.5;
  if (f.action === 'finisher') return f.stats.reach + 0.3;
  if (f.action === 'bash') return Math.min(f.stats.reach, 1.3);
  return f.stats.reach;
}

/** Hurtbox in world space. */
export function hurtbox(f: Fighter): { x0: number; x1: number; y0: number; y1: number } {
  const s = f.look.scale;
  if (f.mounted === 'horse') return { x0: f.x - 1.3, x1: f.x + 1.3, y0: f.y, y1: f.y + 3.0 };
  if (f.mounted === 'hippogryph') return { x0: f.x - 1.3, x1: f.x + 1.3, y0: f.y - 0.2, y1: f.y + 2.0 };
  const lying = f.action === 'dead';
  return { x0: f.x - (f.stats.width / 2) * s, x1: f.x + (f.stats.width / 2) * s, y0: f.y, y1: f.y + (lying ? 0.5 : f.stats.height * s) };
}

/** Attack hitbox in front of the fighter. */
export function hitbox(f: Fighter): { x0: number; x1: number; y0: number; y1: number } {
  const reach = reachOf(f) * f.look.scale;
  const near = f.x + f.facing * 0.1;
  const far = f.x + f.facing * reach;
  const mounted = f.mounted === 'horse';
  // Aerial attacks also reach down toward grounded foes.
  const aerial = f.action === 'jumpAttack' || f.action === 'plunge';
  const y0 = f.y + (mounted ? 0.8 : aerial ? -1.0 : 0.2);
  const y1 = f.y + (mounted ? 3.2 : Math.max(2.1, f.stats.height * f.look.scale));
  return { x0: Math.min(near, far), x1: Math.max(near, far), y0, y1 };
}

function moveSpeed(f: Fighter): number {
  if (f.mounted === 'horse') return MOVEMENT.mountedSpeed * Math.min(1.15, f.stats.speed);
  return MOVEMENT.footSpeed * f.stats.speed;
}

function buffer(f: Fighter, world: World, kind: 'light' | 'heavy' | 'dodge' | 'jump') {
  f.bufferedAction = { kind, t: world.time };
}

function takeBuffered(f: Fighter, world: World): 'light' | 'heavy' | 'dodge' | 'jump' | null {
  const b = f.bufferedAction;
  if (!b) return null;
  if (world.time - b.t > INPUT_BUFFER) {
    f.bufferedAction = null;
    return null;
  }
  return b.kind;
}

/** Damage scale of special moves relative to the fighter's own light/heavy damage. */
const lightScale = (f: Fighter) => f.stats.lightDamage / DAMAGE.light;
const heavyScale = (f: Fighter) => f.stats.heavyDamage / DAMAGE.heavy;

function startAttack(world: World, f: Fighter, kind: AttackAction) {
  setAction(f, kind, attackDuration(f, kind));
  f.bufferedAction = null;
  f.ai.slammed = 0;
  switch (kind) {
    case 'heavy':
      f.meleeKind = f.stats.bossHeavy ? 'boss' : 'heavy';
      f.meleeDamage = f.stats.bossHeavy ? Math.max(DAMAGE.boss, f.stats.heavyDamage) : f.stats.heavyDamage;
      break;
    case 'boss':
      f.meleeKind = 'boss';
      f.meleeDamage = Math.max(DAMAGE.boss, f.stats.heavyDamage);
      break;
    case 'jumpAttack':
      f.meleeKind = 'light';
      f.meleeDamage = DAMAGE.jumpAttack * lightScale(f);
      break;
    case 'plunge':
      f.meleeKind = 'heavy';
      f.meleeDamage = DAMAGE.plunge * heavyScale(f);
      break;
    case 'bash':
      f.meleeKind = 'bash';
      f.meleeDamage = DAMAGE.bash;
      break;
    case 'lunge':
      f.meleeKind = 'light';
      f.meleeDamage = DAMAGE.lunge * lightScale(f);
      break;
    case 'finisher':
      f.meleeKind = 'heavy';
      f.meleeDamage = DAMAGE.finisher * lightScale(f);
      break;
    default:
      f.meleeKind = 'light';
      f.meleeDamage = f.stats.lightDamage;
  }
  if (kind === 'jumpAttack' || kind === 'plunge' || kind === 'bash' || kind === 'lunge' || kind === 'finisher') {
    world.emit({ type: 'special', x: f.x, y: f.y + 1.2, move: kind, isPlayer: f.isPlayer });
  }
  world.onAttackStart?.(f, kind);
}

function startDodge(world: World, f: Fighter) {
  const dir = f.intent.moveX !== 0 ? Math.sign(f.intent.moveX) : -f.facing;
  f.dodgeDir = dir;
  setAction(f, 'dodge', MOVEMENT.dodgeDuration);
  f.dodgeCd = MOVEMENT.dodgeCooldown;
  f.bufferedAction = null;
  f.ai.lungeQueued = 0;
  world.emit({ type: 'dodge', x: f.x, mounted: !!f.mounted, isPlayer: f.isPlayer });
}

/** Energy shield: raised while held, drains over time, recovers when down, reboots after breaking. */
function updateShield(world: World, f: Fighter, dt: number) {
  if (f.shieldMax <= 0) return;
  const was = f.shieldOn;
  if (f.shieldBroken > 0) {
    f.shieldBroken = Math.max(0, f.shieldBroken - dt);
    if (f.shieldBroken === 0) f.shield = f.shieldMax * SHIELD.rebootFraction;
    f.shieldOn = false;
  } else {
    const usable = f.action !== 'dead' && f.action !== 'stunned' && f.shield >= (was ? 0.01 : SHIELD.minToRaise);
    f.shieldOn = f.intent.shield && usable;
  }
  if (f.shieldOn) {
    f.shield = Math.max(0, f.shield - SHIELD.drain * dt);
    f.shieldDelay = SHIELD.rechargeDelay;
    if (f.shield <= 0) breakShield(world, f);
  } else if (f.shieldBroken <= 0) {
    f.shieldDelay = Math.max(0, f.shieldDelay - dt);
    if (f.shieldDelay === 0) f.shield = Math.min(f.shieldMax, f.shield + SHIELD.recharge * dt);
  }
  if (f.shieldOn && !was) world.emit({ type: 'shield-up', x: f.x, isPlayer: f.isPlayer });
}

function breakShield(world: World, f: Fighter) {
  f.shield = 0;
  f.shieldOn = false;
  f.shieldBroken = SHIELD.brokenTime;
  world.emit({ type: 'shield-break', x: f.x, y: f.y + 1.2 * f.look.scale, isPlayer: f.isPlayer });
}

/**
 * The bubble soaks incoming damage 1:1 from its energy. Returns the damage that gets through
 * (0 while the bubble holds; the overflow if this hit breaks it).
 */
export function absorbWithShield(world: World, f: Fighter, amount: number): number {
  if (!f.shieldOn || amount <= 0) return amount;
  const soaked = Math.min(amount, f.shield);
  f.shield -= soaked;
  f.shieldDelay = SHIELD.rechargeDelay;
  world.emit({ type: 'shield-hit', x: f.x, y: f.y + 1.2 * f.look.scale, isPlayer: f.isPlayer });
  if (f.shield <= 0.01) breakShield(world, f);
  return amount - soaked;
}

/** Called once per fixed step for every fighter. */
export function updateFighter(world: World, f: Fighter, dt: number) {
  const it = f.intent;
  f.actionT += dt;
  f.dodgeCd = Math.max(0, f.dodgeCd - dt);
  f.invulnT = Math.max(0, f.invulnT - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt * 6);
  f.riposteT = Math.max(0, f.riposteT - dt);
  updateShield(world, f, dt);

  if (f.action === 'dead') {
    f.deathT += dt;
    const linger = f.isPlayer || f.isBoss ? Infinity : REACTION.corpseLinger;
    if (f.deathT > linger) {
      f.fade = Math.max(0, 1 - (f.deathT - linger) / REACTION.corpseFade);
      if (f.fade <= 0) f.removed = true;
    }
    applyPhysics(world, f, dt, 0);
    return;
  }

  // Buffer edge inputs so presses slightly before an action ends still register.
  // Later buffers win: movement first, attacks last so an attack pressed with a jump is not lost.
  if (it.jump) buffer(f, world, 'jump');
  if (it.dodge) buffer(f, world, 'dodge');
  if (it.heavy) buffer(f, world, 'heavy');
  if (it.light) buffer(f, world, 'light');

  let wantX = 0;
  switch (f.action) {
    case 'hit':
    case 'stagger':
    case 'stunned':
    case 'rise':
      if (f.actionT >= f.actionDur) setAction(f, f.grounded || f.stats.flying ? 'idle' : 'air');
      break;
    case 'land':
    case 'idle':
    case 'move':
    case 'air':
    case 'block':
    case 'victory': {
      if (f.action === 'victory') break;
      if (f.action === 'land' && f.actionT < 0.12) break;
      const blocking = it.block && f.stats.canBlock && (f.grounded || f.stats.flying || !!f.mounted);
      const queued = takeBuffered(f, world);
      if (queued === 'dodge' && f.stats.canDodge && !blocking && f.dodgeCd <= 0) {
        startDodge(world, f);
        break;
      }
      if (blocking) {
        if (f.action !== 'block') {
          setAction(f, 'block');
          f.blockAge = 0;
          world.emit({ type: 'block-raise', x: f.x });
        }
        f.blockAge += dt;
        wantX = it.moveX * 0.4;
        // Shield bash: attack while the shield is raised.
        if (queued === 'light' && f.grounded && !f.mounted && f.look.model === 'humanoid') startAttack(world, f, 'bash');
        break;
      }
      const airborne = !f.grounded && !f.stats.flying && !f.mounted && f.look.model === 'humanoid';
      if (queued === 'light') {
        if (airborne) startAttack(world, f, 'jumpAttack');
        else if (world.time - f.lastDodgeEnd <= MOVES.lungeWindow && f.look.model === 'humanoid' && !f.mounted) startAttack(world, f, 'lunge');
        else {
          startAttack(world, f, 'light');
          f.comboStep = 0;
        }
        break;
      }
      if (queued === 'heavy') {
        if (airborne) startAttack(world, f, 'plunge');
        else startAttack(world, f, f.stats.bossHeavy ? 'boss' : 'heavy');
        break;
      }
      if (it.special && f.stats.ranged !== null && it.special !== 'cast') {
        startAttack(world, f, it.special);
        break;
      }
      if (it.special === 'cast') {
        startAttack(world, f, 'cast');
        break;
      }
      if (queued === 'jump' && f.grounded && f.stats.canJump && !f.mounted && !f.stats.flying) {
        f.vy = MOVEMENT.jumpVelocity;
        f.grounded = false;
        f.bufferedAction = null;
        setAction(f, 'air');
        world.emit({ type: 'jump', x: f.x });
        break;
      }
      wantX = it.moveX;
      if (it.moveX !== 0) f.facing = it.moveX > 0 ? 1 : -1;
      const next: ActionKind = !f.grounded && !f.stats.flying && !f.mounted ? 'air' : Math.abs(f.vx) > 0.3 || it.moveX !== 0 ? 'move' : 'idle';
      if (f.action !== next) setAction(f, next);
      break;
    }
    case 'dodge': {
      if (it.light && f.actionT > f.actionDur * 0.25) f.ai.lungeQueued = 1;
      if (f.actionT >= f.actionDur) {
        f.lastDodgeEnd = world.time;
        const queuedLunge = f.ai.lungeQueued === 1 || takeBuffered(f, world) === 'light';
        f.ai.lungeQueued = 0;
        // Dodge → lunge: a light attack during the roll strikes straight out of it.
        if (queuedLunge && f.look.model === 'humanoid' && !f.mounted && f.grounded) {
          startAttack(world, f, 'lunge');
          break;
        }
        setAction(f, f.grounded || f.stats.flying || f.mounted ? 'idle' : 'air');
      }
      break;
    }
    case 'light':
    case 'heavy':
    case 'boss':
    case 'cast':
    case 'shoot':
    case 'throw':
    case 'jumpAttack':
    case 'plunge':
    case 'bash':
    case 'lunge':
    case 'finisher': {
      let ph = attackPhase(f)!;
      if (f.action === 'plunge') {
        const t = fighterTiming(f, 'plunge');
        const swingEnd = (t.anticipation + t.swing) / f.stats.attackSpeed;
        if (ph.phase === 'anticipation') f.vy = Math.max(f.vy * 0.6, 0.4); // hang at the apex
        else if (!f.ai.slammed) {
          f.vy = -MOVES.plungeFallSpeed;
          if (f.grounded) {
            f.ai.slammed = 1;
            f.actionT = swingEnd;
            world.groundSlam(f);
          } else if (f.actionT > swingEnd - 0.01) f.actionT = swingEnd - 0.01; // keep diving until we land
          ph = attackPhase(f)!;
        }
      }
      if (!f.released && (ph.phase === 'swing' || ph.phase === 'impact' || ph.phase === 'recovery')) {
        f.released = true;
        if (f.action === 'shoot' || f.action === 'throw' || f.action === 'cast') {
          world.onRelease?.(f, f.action);
        } else {
          const heavy = f.action === 'heavy' || f.action === 'boss' || f.action === 'plunge' || f.action === 'finisher';
          world.emit({ type: 'swing', x: f.x, kind: f.action, heavy, mounted: !!f.mounted, weapon: f.look.skin, model: f.look.model, spectral: !!f.look.spectral, isPlayer: f.isPlayer });
        }
      }
      // Light-attack combo chaining and dodge-cancel during recovery.
      if (ph.phase === 'recovery') {
        const queued = takeBuffered(f, world);
        if (queued === 'dodge' && f.stats.canDodge && f.dodgeCd <= 0) {
          startDodge(world, f);
          break;
        }
        if (queued === 'light' && f.action === 'light' && ph.phaseT >= COMBO_CANCEL_FRACTION && f.comboStep < 2) {
          f.comboStep++;
          // Third strike of a chain is a spinning finisher (humanoids on foot).
          const finisher = f.comboStep === 2 && f.look.model === 'humanoid' && !f.mounted && f.grounded;
          startAttack(world, f, finisher ? 'finisher' : 'light');
          break;
        }
      }
      if (ph.phase === 'done') {
        setAction(f, f.grounded || f.stats.flying || f.mounted ? 'idle' : 'air');
      }
      // Forward momentum during the swing makes attacks feel weighty.
      if (ph.phase === 'swing') {
        if (f.action === 'lunge') wantX = (f.facing * MOVES.lungeSpeed) / moveSpeed(f);
        else if (f.action === 'light' || f.action === 'bash') wantX = f.facing * 0.6;
        else if (f.action === 'heavy' || f.action === 'boss' || f.action === 'finisher') wantX = f.facing * 1.0;
      }
      // Aerial attacks keep their momentum.
      if (f.action === 'jumpAttack' || f.action === 'plunge') wantX = f.vx / Math.max(0.1, moveSpeed(f));
      break;
    }
    default:
      break;
  }

  applyPhysics(world, f, dt, wantX);
}

function applyPhysics(world: World, f: Fighter, dt: number, wantX: number) {
  const flying = f.stats.flying || f.mounted === 'hippogryph';
  const speed = f.mounted === 'hippogryph' ? MOVEMENT.flightSpeedX : moveSpeed(f);

  if (f.action === 'dodge') {
    const k = f.mounted ? MOVEMENT.mountedDodgeSpeed : MOVEMENT.dodgeSpeed;
    const ease = 1 - f.actionT / Math.max(0.01, f.actionDur);
    f.vx = f.dodgeDir * k * (0.35 + 0.65 * ease);
  } else if (f.action !== 'dead') {
    const target = wantX * speed;
    const accel = f.mounted === 'horse' ? MOVEMENT.mountedAccel : flying ? MOVEMENT.flightAccel : f.grounded ? MOVEMENT.footAccel : MOVEMENT.footAccel * MOVEMENT.airControl;
    const decel = f.mounted === 'horse' ? MOVEMENT.mountedDecel : flying ? MOVEMENT.flightAccel : MOVEMENT.footDecel;
    const rate = Math.abs(target) > Math.abs(f.vx) || Math.sign(target) !== Math.sign(f.vx) ? accel * speed * 0.25 : decel * speed * 0.25;
    const dv = target - f.vx;
    f.vx += Math.sign(dv) * Math.min(Math.abs(dv), rate * dt * 4);
  } else {
    f.vx *= Math.max(0, 1 - dt * 6);
  }

  // Knockback / wind push decays with friction.
  f.pushX += world.windForce * dt * (f.mounted === 'horse' ? 0.35 : 1) * (f.isPlayer ? 1 : 0.6);
  const fr = MOVEMENT.groundFriction * dt;
  f.pushX = Math.abs(f.pushX) <= fr ? 0 : f.pushX - Math.sign(f.pushX) * fr;

  if (flying) {
    if (f.mounted === 'hippogryph' && f.action !== 'dead') {
      const targetVy = f.intent.moveY * MOVEMENT.flightSpeedY;
      f.vy += (targetVy - f.vy) * Math.min(1, dt * 6);
    } else if (f.action === 'dead') {
      f.vy -= MOVEMENT.gravity * dt;
    }
  } else if (!f.grounded) {
    f.vy -= MOVEMENT.gravity * dt;
  }

  const oldX = f.x;
  f.x += (f.vx + f.pushX) * dt;
  f.y += f.vy * dt;

  // Ground collision.
  const floor = world.floorAt(f);
  if (f.y <= floor && !(flying && f.action !== 'dead' && f.mounted !== 'hippogryph')) {
    if (!f.grounded && f.vy < -1) {
      if (f.action === 'air') setAction(f, 'land');
      world.emit({ type: 'land', x: f.x, heavy: f.vy < -14, surface: world.surface });
    }
    f.y = floor;
    f.vy = 0;
    f.grounded = true;
  } else if (f.y > floor + 0.01) {
    f.grounded = false;
  }
  if (flying && f.y < floor) {
    f.y = floor;
    f.vy = Math.max(0, f.vy);
  }
  if (f.y > world.ceiling) {
    f.y = world.ceiling;
    f.vy = Math.min(0, f.vy);
  }

  // Arena bounds.
  // Enemies may walk in from off-screen, but once inside the arena they stay reachable
  // (otherwise kiting archers could retreat beyond the locked wave arena).
  if (f.team === 1 && !f.ai.inArena && f.x >= world.bounds.minX && f.x <= world.bounds.maxX) f.ai.inArena = 1;
  const slack = f.look.model === 'bird' ? 1e6 : f.isPlayer || f.team === 0 || f.ai.inArena || f.isCommander ? 0 : 6;
  const minX = world.bounds.minX - slack;
  const maxX = world.bounds.maxX + slack;
  if (f.x < minX) {
    f.x = minX;
    f.vx = Math.max(0, f.vx);
    f.pushX = Math.max(0, f.pushX);
  } else if (f.x > maxX) {
    f.x = maxX;
    f.vx = Math.min(0, f.vx);
    f.pushX = Math.min(0, f.pushX);
  }

  // Footsteps.
  if (f.grounded && f.action === 'move' && !f.stats.flying) {
    f.stepPhase += Math.abs(f.x - oldX);
    const stride = f.mounted === 'horse' ? 2.4 : f.look.model === 'humanoid' ? 1.1 : 0.9;
    if (f.stepPhase >= stride) {
      f.stepPhase = 0;
      world.emit({ type: 'footstep', x: f.x, surface: world.surface, mounted: f.mounted === 'horse', isPlayer: f.isPlayer, creature: f.look.model !== 'humanoid' });
    }
  }
}

/** Applies damage; returns true if it killed. */
export function applyDamage(world: World, f: Fighter, amount: number, attackerId: number): boolean {
  if (amount <= 0 || !isAlive(f)) return false;
  f.hp = Math.max(0, f.hp - amount);
  f.hitFlash = 1;
  f.lastHitBy = attackerId;
  f.tookDamageThisRound = true;
  if (f.isPlayer) world.stats.damageTaken += amount;
  world.onDamaged?.(f, amount, attackerId);
  if (f.hp <= 0 && !world.preventDeath?.(f)) {
    kill(world, f);
    return true;
  }
  return false;
}

export function kill(world: World, f: Fighter) {
  setAction(f, 'dead');
  f.deathT = 0;
  f.vy = Math.max(f.vy, 3);
  world.emit({ type: 'death', x: f.x, y: f.y, id: f.id, enemyType: f.enemyType, isPlayer: f.isPlayer, model: f.look.model, spectral: !!f.look.spectral, mounted: !!f.mounted });
  world.onDeath?.(f);
}

export function applyReaction(f: Fighter, stun: number, stagger: boolean, knockback: number, fromX: number) {
  const dir = f.x >= fromX ? 1 : -1;
  f.pushX += (dir * knockback) / Math.max(0.5, f.stats.weight * (f.mounted === 'horse' ? 1.8 : 1));
  if (stun > 0 && f.action !== 'dead') {
    setAction(f, stagger ? 'stagger' : 'hit', stun);
    f.bufferedAction = null;
  }
}

export type { MeleeKind };
