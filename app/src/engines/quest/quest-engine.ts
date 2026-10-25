import { CHARACTER_ARCHETYPES, ENEMY_ARCHETYPES, archetypeFor, type EnemyLookId } from '@/content/fighters';
import { DAMAGE, LIVES, MOVEMENT, REACTION, segmentsFor } from '@/core/combat/combat-config';
import { runAi } from '@/core/ai/controllers';
import type { CameraHint, HudSnapshot, SceneState } from '@/core/engine/engine-types';
import { clamp } from '@/core/math/rng';
import { applyDamage, isAlive, setAction } from '@/core/sim/fighter';
import type { Fighter } from '@/core/sim/types';
import { DuelController } from '@/engines/duel/duel-controller';
import { DuelConfigSchema } from '@/engines/duel/duel-config';
import { EngineBase, type EngineInit } from '@/engines/shared/engine-base';
import { QuestConfigSchema, type FlightSlide, type GroundSlide, type HazardSpawn, type QuestConfig, type QuestConfigInput, type SlideConfig } from './quest-config';

type SlidePhase = 'enter' | 'explore' | 'wave' | 'cleared' | 'transition' | 'boss' | 'landed';

interface WaveRuntime {
  index: number;
  spawned: number;
  ids: number[];
  nextSpawn: number;
  lockMin: number;
  lockMax: number;
}

const FLIGHT_START_Y = 5;
const FLIGHT_CEILING = 11;

/**
 * Engine B — Quest / Journey. A sequence of Slides (ground travel with waves and hazards, Hippogryph
 * flight with a landing win condition) optionally ending in boss slides that run the Duel rules.
 */
export class QuestEngine extends EngineBase {
  readonly kind = 'quest' as const;
  readonly cfg: QuestConfig;
  slideIndex = 0;
  private phase: SlidePhase = 'enter';
  private phaseT = 0;
  private fade = 1;
  private wave: WaveRuntime | null = null;
  private waveCursor = 0;
  private hazardTimers: number[] = [];
  private duel: DuelController | null = null;
  private allies: Fighter[] = [];
  private escort: Fighter | null = null;
  private respawnT = -1;
  private endT = 0;
  private lockCam: { min: number; max: number } | null = null;
  private landed = false;

  constructor(config: QuestConfigInput, init: EngineInit) {
    super(init);
    this.cfg = QuestConfigSchema.parse(config);
    this.lives = LIVES.quest;
    this.maxLives = LIVES.quest;
    const arch = archetypeFor(this.cfg.playable);
    const flying = this.cfg.mount === 'hippogryph' && this.cfg.slides[0].kind === 'flight';
    const p = this.world.spawn(arch, { team: 0, x: 2, isPlayer: true, mounted: flying ? 'hippogryph' : null, maxHp: 100 });
    if (flying) p.y = FLIGHT_START_Y;
    for (const a of this.cfg.allies) this.allies.push(this.world.spawn(archetypeFor(a), { team: 0, x: 0, controller: 'ally' }));
    if (this.cfg.escort) {
      this.escort = this.world.spawn(archetypeFor(this.cfg.escort.character), { team: 0, x: 0, controller: 'escort', isEscort: true, name: this.cfg.escort.name, maxHp: 150 });
    }
    this.setupSlide();
    this.status = 'playing';
  }

  get slide(): SlideConfig {
    return this.cfg.slides[this.slideIndex];
  }

  private setupSlide() {
    const w = this.world;
    const s = this.slide;
    const p = w.player!;
    for (const f of w.fighters) if (f.team === 1) f.removed = true;
    w.projectiles = [];
    w.hazards = [];
    w.windForce = 0;
    w.distortion = 0;
    this.wave = null;
    this.waveCursor = 0;
    this.lockCam = null;
    this.phase = 'enter';
    this.phaseT = 0;
    this.fade = 1;
    w.emit({ type: 'slide-advance', index: this.slideIndex });

    if (s.kind === 'boss') {
      this.setupBoss();
      return;
    }
    w.bounds = { minX: 0, maxX: s.length };
    p.x = 2.5;
    p.vx = 0;
    p.pushX = 0;
    p.facing = 1;
    if (s.kind === 'flight') {
      p.mounted = 'hippogryph';
      p.y = FLIGHT_START_Y;
      p.vy = 0;
      w.ceiling = FLIGHT_CEILING;
      w.surface = 'wood';
      if (s.landing) {
        w.addHazard({ kind: 'landing-zone', x: s.length - s.landing.width / 2 - 2, y: s.landing.height, width: s.landing.width, warn: 0, active: 0, rest: 0, dir: 0, power: 0, damage: 0, team: -1, variant: s.env });
      }
      w.floorAt = (f) => {
        const lz = w.hazards.find((h) => h.kind === 'landing-zone');
        if (f.isPlayer && lz && Math.abs(f.x - lz.x) <= lz.width / 2) return lz.y;
        return 0;
      };
    } else {
      p.mounted = null;
      p.y = 0;
      w.ceiling = 50;
      w.surface = s.ground;
      w.floorAt = () => 0;
      this.allies.forEach((a, i) => this.placeCompanion(a, 1 + i * 0.8));
      if (this.escort) this.placeCompanion(this.escort, 0.6);
      this.placeStaticHazards(s);
    }
    this.hazardTimers = s.hazards.map((h) => ('every' in h ? h.every * w.rng.range(0.6, 1.1) : 0));
    if (s.kind === 'flight') this.placeShips(s.hazards, s.length);
    this.banner(s.title, `Stage ${this.slideIndex + 1} of ${this.cfg.slides.length}`);
  }

  private placeCompanion(f: Fighter, x: number) {
    if (!isAlive(f)) return;
    f.x = x;
    f.y = 0;
    f.vx = 0;
    f.removed = false;
    f.untargetable = false;
    setAction(f, 'idle');
  }

  private placeStaticHazards(s: GroundSlide) {
    const w = this.world;
    for (const h of s.hazards) {
      if (h.kind === 'spike-traps') {
        for (let i = 0; i < h.count; i++) {
          const x = 10 + ((s.length - 16) * (i + 0.5)) / h.count + w.rng.range(-2, 2);
          w.addHazard({ kind: 'spike-trap', x, y: 0, width: 1.6, warn: 0.7, active: 0.9, rest: 1.6 + w.rng.range(0, 1.2), dir: 0, power: 0, damage: DAMAGE.trap, team: -1, t: w.rng.range(0, 2) });
        }
      }
    }
    this.placeShips(s.hazards, s.length);
  }

  private placeShips(hazards: HazardSpawn[], length: number) {
    const w = this.world;
    for (const h of hazards) {
      if (h.kind !== 'ships') continue;
      for (let i = 0; i < h.count; i++) {
        const x = 18 + ((length - 20) * (i + 0.5)) / h.count;
        w.addHazard({ kind: 'ship', x, y: 0, width: 14, warn: 0, active: 600, rest: 0, dir: i % 2 === 0 ? 1 : -1, power: 0, damage: 0, team: 1, rate: 3.0 + w.rng.range(0, 1.2), t: w.rng.range(0, 2) });
      }
    }
  }

  private setupBoss() {
    const s = this.slide;
    if (s.kind !== 'boss') return;
    const w = this.world;
    const p = w.player!;
    if (!isAlive(p)) {
      p.removed = false;
      p.fade = 1;
      p.deathT = 0;
      setAction(p, 'idle');
    }
    p.mounted = null;
    w.ceiling = 50;
    w.surface = s.arena.ground;
    w.floorAt = () => 0;
    // Companions wait at the edge of the arena during the boss fight.
    for (const c of [...this.allies, this.escort].filter((f): f is Fighter => !!f)) {
      c.removed = true;
    }
    const cfg = DuelConfigSchema.parse({ ...s.duel, arena: s.arena, player: { character: this.cfg.playable } });
    const center = cfg.arena.width / 2;
    this.duel = new DuelController(w, cfg, { centerX: center, player: p, banner: (t, sub) => this.banner(t, sub) });
    this.duel.start();
    p.y = 0;
    p.vy = 0;
    this.phase = 'boss';
  }

  /** Allocate the next enemy look for a wave. */
  private pickLook(waveIdx: number): EnemyLookId {
    const s = this.slide as GroundSlide;
    const wave = s.waves[waveIdx];
    return this.world.rng.weighted(wave.enemies.map((e) => ({ item: e.look as EnemyLookId, weight: e.weight })));
  }

  private triggerX(s: GroundSlide, i: number) {
    const n = s.waves.length;
    const frac = s.waves[i].triggerAt ?? (n === 1 ? 0.35 : 0.2 + (0.65 * i) / Math.max(1, n - 1));
    return clamp(frac * s.length, 9, s.length - 9);
  }

  private startWave(i: number) {
    const w = this.world;
    const p = w.player!;
    const s = this.slide as GroundSlide;
    const half = 9.5;
    const center = clamp(p.x + 3, half, s.length - half);
    this.wave = { index: i, spawned: 0, ids: [], nextSpawn: 0, lockMin: center - half, lockMax: center + half };
    this.lockCam = { min: center - half, max: center + half };
    // Keep fighters well inside the locked view so nobody is clipped by the screen edge.
    w.bounds = { minX: center - half + 1.4, maxX: center + half - 1.4 };
    this.phase = 'wave';
    w.emit({ type: 'wave-start', index: i, count: s.waves[i].count });
    this.banner(`Wave ${i + 1}`, `${s.waves[i].count} enemies`);
  }

  private updateWave(dt: number) {
    const w = this.world;
    const s = this.slide as GroundSlide;
    const wv = this.wave!;
    const cfg = s.waves[wv.index];
    const alive = wv.ids.map((id) => w.byId(id)).filter((f) => f && isAlive(f)).length;
    wv.nextSpawn -= dt;
    if (wv.spawned < cfg.count && alive < cfg.maxAlive && wv.nextSpawn <= 0) {
      const look = this.pickLook(wv.index);
      const side = cfg.from === 'both' ? (w.rng.chance(0.65) ? 1 : -1) : cfg.from === 'right' ? 1 : -1;
      const x = side > 0 ? wv.lockMax + 1.5 : wv.lockMin - 1.5;
      const arch = ENEMY_ARCHETYPES[look];
      const e = w.spawn(arch, { team: 1, x, facing: side > 0 ? -1 : 1, y: arch.stats.flying ? 0.5 : 0 });
      wv.ids.push(e.id);
      wv.spawned++;
      wv.nextSpawn = w.rng.range(0.5, 1.3);
      w.emit({ type: 'spawn', x, y: 0, enemyType: e.enemyType, spectral: !!e.look.spectral });
      if (wv.spawned === 1) w.emit({ type: 'enemy-alert', x });
    }
    if (wv.spawned >= cfg.count && alive === 0) {
      this.wave = null;
      this.waveCursor = wv.index + 1;
      this.lockCam = null;
      w.bounds = { minX: 0, maxX: s.length };
      const more = this.waveCursor < s.waves.length;
      this.phase = more ? 'explore' : 'cleared';
      this.banner(more ? 'Wave cleared' : 'Stage cleared', more ? 'Press on →' : 'Advance →');
      // A breather between waves: restore a block of health.
      const p = w.player!;
      if (isAlive(p)) {
        const heal = Math.min(p.maxHp - p.hp, 25);
        if (heal > 0) {
          p.hp += heal;
          w.emit({ type: 'heal', x: p.x, amount: heal });
        }
      }
    }
  }

  private spawnTimedHazards(dt: number) {
    const w = this.world;
    const s = this.slide;
    if (s.kind === 'boss') return;
    const p = w.player!;
    if (!isAlive(p)) return;
    s.hazards.forEach((h, i) => {
      if (!('every' in h)) return;
      this.hazardTimers[i] -= dt;
      if (this.hazardTimers[i] > 0) return;
      this.hazardTimers[i] = h.every * w.rng.range(0.75, 1.25);
      const ahead = p.x + p.facing * w.rng.range(0, 3) + p.vx * 0.6;
      switch (h.kind) {
        case 'falling-objects':
          w.addHazard({ kind: 'falling-object', x: clamp(ahead + w.rng.range(-1.5, 1.5), w.bounds.minX + 1, w.bounds.maxX - 1), y: 12, width: h.model === 'boulder' ? 2 : 1.4, warn: 0.9, active: 0, rest: 0, dir: 0, power: 0, damage: DAMAGE.fallingObject, team: -1, model: h.model });
          break;
        case 'wind-gusts': {
          const dir = w.rng.chance(0.5) ? 1 : -1;
          w.addHazard({ kind: 'wind-gust', x: p.x, y: 0, width: 0, warn: 0.8, active: w.rng.range(1.3, 2.2), rest: 0, dir, power: h.power, damage: 0, team: -1, variant: h.variant });
          break;
        }
        case 'storms':
          w.addHazard({ kind: 'lightning', x: clamp(ahead + w.rng.range(-2, 2), w.bounds.minX, w.bounds.maxX), y: 0, width: 1.8, warn: 1.0, active: 0, rest: 0, dir: 0, power: 0, damage: DAMAGE.storm, team: -1 });
          break;
        case 'projectiles':
          w.addHazard({ kind: 'emitter', x: p.x, y: 0, width: 0, warn: 0, active: 0, rest: 0, dir: h.origin === 'left' ? -1 : 1, power: 0, damage: 0, team: 1, projectile: h.projectile, rate: 1, t: 0.99, variant: h.origin === 'below' ? 'below' : h.origin === 'above' ? 'above' : 'side' });
          // One-shot emitter: removed next step after firing.
          break;
        case 'birds': {
          const fromRight = w.rng.chance(0.75);
          const x = fromRight ? p.x + 16 : p.x - 16;
          const y = s.kind === 'flight' ? clamp(p.y + w.rng.range(-2.5, 2.5), 1.5, FLIGHT_CEILING - 1) : w.rng.range(2.5, 4.5);
          const b = w.spawn(ENEMY_ARCHETYPES.bird, { team: 1, x, y });
          b.ai.dir = fromRight ? -1 : 1;
          b.ai.mode = 0;
          w.emit({ type: 'spawn', x, y, enemyType: null, spectral: false });
          break;
        }
        default:
          break;
      }
    });
    // Retire one-shot emitters after they fired.
    // One-shot emitters start just before their first tick (t 0.99, rate 1): exactly one shot, then retire.
    for (const h of w.hazards) if (h.kind === 'emitter' && h.t > 1.01) h.dead = true;
  }

  private updateFlight(dt: number) {
    const w = this.world;
    const p = w.player!;
    const s = this.slide as FlightSlide;
    if (!isAlive(p)) return;
    // Crashing into the sea / ground below.
    const lz = w.hazards.find((h) => h.kind === 'landing-zone');
    const overPad = lz && Math.abs(p.x - lz.x) <= lz.width / 2;
    if (!overPad && p.y <= 0.35 && (p.ai.crashCd ?? 0) < w.time) {
      p.ai.crashCd = w.time + 1;
      p.vy = 9;
      applyDamage(w, p, DAMAGE.storm, -1);
      w.emit({ type: 'hit', x: p.x, y: 0.4, outcome: 'hit', damage: DAMAGE.storm, heavy: false, targetId: p.id, attackerId: -1, armored: false, isPlayer: true, creature: true });
    }
    if (overPad && lz && p.y <= lz.y + 0.05 && !this.landed) {
      // Gentle descent = safe landing. Too fast = bounce and damage.
      const impact = -p.ai.lastVy;
      if (impact > 7.5) {
        p.vy = 6;
        applyDamage(w, p, 10, -1);
        w.emit({ type: 'landing', x: p.x, safe: false });
        this.banner('Too fast!', 'Descend gently onto the landing zone');
      } else {
        this.landed = true;
        p.vx = 0;
        p.vy = 0;
        w.emit({ type: 'landing', x: p.x, safe: true });
        this.banner('Safe landing!', s.landing?.label);
        this.phase = 'landed';
        this.phaseT = 0;
      }
    }
    p.ai.lastVy = p.vy;
    void dt;
  }

  private handlePlayerDeath(dt: number) {
    const w = this.world;
    const p = w.player!;
    if (isAlive(p)) return;
    if (this.respawnT < 0) {
      this.lives--;
      w.stats.livesLost++;
      this.respawnT = 1.8;
    }
    this.respawnT -= dt;
    if (this.respawnT <= 0 && this.lives > 0) {
      this.respawnT = -1;
      const flying = this.slide.kind === 'flight';
      p.hp = p.maxHp;
      p.removed = false;
      p.fade = 1;
      p.deathT = 0;
      p.invulnT = REACTION.spawnInvulnerability + 0.5;
      p.y = flying ? FLIGHT_START_Y : 0;
      p.vy = 0;
      setAction(p, flying ? 'idle' : 'rise', flying ? 0 : 0.6);
      this.banner('You rise again', `${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`);
      w.emit({ type: 'heal', x: p.x, amount: p.maxHp });
    }
  }

  step(dt: number) {
    const w = this.world;
    const { interact } = this.drivePlayer();
    this.phaseT += dt;
    this.fade = this.phase === 'transition' ? Math.min(1, this.phaseT / 0.6) : Math.max(0, this.fade - dt * 1.8);

    if (this.status !== 'playing') {
      this.stepWorld(dt);
      return;
    }

    if (this.phase === 'boss' && this.duel) {
      this.duel.preStep(dt, interact);
      this.stepWorld(dt);
      this.countKills();
      this.duel.postStep(this.stepEvents);
      if (this.duel.result) {
        this.endT += dt;
        if (this.endT > 1.6) {
          if (this.duel.result === 'defeat') {
            this.lives--;
            this.world.stats.livesLost++;
            if (this.lives <= 0) return this.finish('defeat', 'You were defeated');
            // Spend a life and retry the boss from the start of the duel.
            this.duel = null;
            this.endT = 0;
            this.setupSlide();
            return;
          }
          this.endT = 0;
          if (this.slideIndex < this.cfg.slides.length - 1) this.advance();
          else this.finish('victory');
        }
      }
      return;
    }

    // Journey rules.
    runAi({ world: w, dt, maxAttackers: 2 });
    this.stepWorld(dt);
    this.countKills();
    this.spawnTimedHazards(dt);
    this.handlePlayerDeath(dt);
    if (this.lives <= 0 && this.respawnT <= 0) return this.finish('defeat', 'You have no lives left');
    if (this.escort && !isAlive(this.escort)) return this.finish('defeat', `${this.escort.name} has fallen`);

    const p = w.player!;
    const s = this.slide;
    if (s.kind === 'flight') {
      this.updateFlight(dt);
      if (this.phase === 'enter' && this.phaseT > 0.5) this.phase = 'explore';
      if (this.phase === 'landed' && this.phaseT > 1.5) {
        if (this.slideIndex < this.cfg.slides.length - 1) this.advance();
        else this.finish('victory');
        return;
      }
      if (!s.landing && p.x >= s.length - 2 && this.phase !== 'transition') this.beginTransition();
    } else if (s.kind === 'ground') {
      if (this.phase === 'enter' && this.phaseT > 0.4) this.phase = s.waves.length ? 'explore' : 'cleared';
      if (this.phase === 'explore' && this.waveCursor < s.waves.length && p.x >= this.triggerX(s, this.waveCursor)) this.startWave(this.waveCursor);
      if (this.phase === 'wave') this.updateWave(dt);
      if (this.phase === 'explore' && this.waveCursor >= s.waves.length) this.phase = 'cleared';
      if (this.phase === 'cleared' && p.x >= s.length - 1.5) this.beginTransition();
    }
    if (this.phase === 'transition' && this.phaseT >= 0.6) this.advance();
  }

  private beginTransition() {
    this.phase = 'transition';
    this.phaseT = 0;
  }

  private advance() {
    if (this.slideIndex >= this.cfg.slides.length - 1) {
      this.finish('victory');
      return;
    }
    this.slideIndex++;
    this.duel = null;
    this.endT = 0;
    this.landed = false;
    this.setupSlide();
  }

  private finish(result: 'victory' | 'defeat', reason?: string) {
    if (this.status !== 'playing') return;
    this.status = result;
    this.failReason = reason;
    this.world.emit({ type: 'outcome', result });
    if (result === 'defeat') this.lives = Math.max(0, this.lives);
  }

  hud(): HudSnapshot {
    const h = this.baseHud();
    const w = this.world;
    const s = this.slide;
    h.stageLabel = `Stage ${this.slideIndex + 1}/${this.cfg.slides.length} · ${s.title}`;
    if (this.duel && this.phase === 'boss') {
      h.boss = this.duel.bossBar();
      h.objective = this.duel.roundLabel();
      if (this.duel.partner) {
        h.allies = [this.duel.player, this.duel.partner].map((f) => ({ ...this.bar(f), active: f.isPlayer }));
        h.prompt = isAlive(this.duel.partner) ? 'E — Tag partner' : null;
        if (isAlive(this.duel.partner)) h.controls.push({ label: 'Tag partner', actions: ['interact'] });
      }
      h.enemiesRemaining = w.alive(1).filter((f) => !f.untargetable).length;
      return h;
    }
    if (s.kind === 'ground') {
      let remaining = 0;
      for (let i = this.waveCursor; i < s.waves.length; i++) remaining += s.waves[i].count;
      if (this.wave) remaining -= this.wave.ids.filter((id) => !isAlive(w.byId(id) ?? ({ action: 'dead', removed: true } as Fighter))).length;
      h.enemiesRemaining = Math.max(0, remaining);
      h.objective = this.phase === 'wave' ? 'Defeat the wave' : this.phase === 'cleared' ? 'Advance to the next stage →' : 'Press on →';
      if (this.phase === 'cleared') h.prompt = 'Advance →';
    } else if (s.kind === 'flight') {
      const p = w.player;
      h.progress = p ? clamp(p.x / s.length, 0, 1) : 0;
      h.objective = s.landing ? 'Fly on and land safely' : 'Fly on to the next stage →';
      if (s.landing && p && p.x > s.length - 25) h.prompt = 'Descend gently onto the landing zone (S)';
    }
    h.allies = [...this.allies, ...(this.escort ? [this.escort] : [])]
      .filter((f) => !f.removed)
      .map((f) => ({ name: f.name, hp: Math.max(0, Math.round(f.hp)), maxHp: f.maxHp, segments: segmentsFor(f.maxHp), active: false, escort: f.isEscort }));
    return h;
  }

  scene(): SceneState {
    const s = this.slide;
    if (s.kind === 'boss') return { env: s.arena.env, ground: s.arena.ground, fog: s.arena.fog, flight: false, fade: this.fade, distortion: this.world.distortion };
    if (s.kind === 'flight') return { env: s.env, ground: s.surface === 'land' ? 'grass' : 'wood', fog: s.fog, flight: true, fade: this.fade, distortion: 0, tint: s.surface };
    return { env: s.env, ground: s.ground, fog: s.fog, flight: false, fade: this.fade, distortion: this.world.distortion };
  }

  camera(): CameraHint {
    const w = this.world;
    const p = w.player;
    const s = this.slide;
    if (this.duel && this.phase === 'boss') {
      const a = this.duel.player;
      const o = this.duel.opponent;
      const x = a && o ? (a.x + o.x) / 2 : 0;
      return { x, y: 0, minX: this.duel.arena.minX, maxX: this.duel.arena.maxX, viewHeight: Math.max(10, Math.min(12.5, Math.abs((a?.x ?? 0) - (o?.x ?? 0)) * 0.55 + 4)), frame: true };
    }
    const len = s.kind === 'boss' ? 30 : s.length;
    const lock = this.lockCam;
    return {
      x: p?.x ?? 0,
      y: s.kind === 'flight' ? clamp((p?.y ?? 0) - 3.5, 0, 4.5) : 0,
      minX: lock ? lock.min : 0,
      maxX: lock ? lock.max : len,
      viewHeight: s.kind === 'flight' ? 12 : 10,
    };
  }

  soundtrack() {
    const s = this.slide;
    if (s.kind === 'boss') return { music: 'boss', ambience: s.arena.ambience };
    return { music: s.music ?? this.cfg.music, ambience: s.ambience ?? null };
  }
}

// Keep tree-shaking honest for archetype tables referenced only by configs.
void CHARACTER_ARCHETYPES;
void MOVEMENT;
