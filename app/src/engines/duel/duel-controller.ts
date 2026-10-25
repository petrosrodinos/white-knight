import { createBossModule } from '@/bosses/modules';
import type { BossContext, BossModule } from '@/bosses/boss-module';
import { BOSS_ARCHETYPES, ENEMY_ARCHETYPES, archetypeFor, type FighterArchetype } from '@/content/fighters';
import { DUEL, HEALTH, REACTION } from '@/core/combat/combat-config';
import { runAi } from '@/core/ai/controllers';
import { isAlive, setAction } from '@/core/sim/fighter';
import { emptyIntent, type Fighter } from '@/core/sim/types';
import type { World } from '@/core/sim/world';
import { segmentsFor } from '@/core/combat/combat-config';
import type { HudBar } from '@/core/engine/engine-types';
import type { BossRef, DuelConfig, FighterRef, RoundConfig } from './duel-config';

type Phase = 'intro' | 'fight' | 'round-end' | 'done';

const KNIGHT_REFS = new Set(['black-knight', 'mysterious-knight']);

export function resolveArchetype(ref: FighterRef | BossRef, asBoss: boolean): FighterArchetype {
  if (asBoss && ref in BOSS_ARCHETYPES) return BOSS_ARCHETYPES[ref as keyof typeof BOSS_ARCHETYPES];
  if (ref in BOSS_ARCHETYPES && !KNIGHT_REFS.has(ref)) return BOSS_ARCHETYPES[ref as keyof typeof BOSS_ARCHETYPES];
  return archetypeFor(ref as Parameters<typeof archetypeFor>[0]);
}

export interface DuelControllerOptions {
  /** Arena centre (quest boss slides place the arena where the player stands). */
  centerX: number;
  /** Existing player fighter (quest) — otherwise one is spawned. */
  player?: Fighter;
  banner: (title: string, subtitle?: string) => void;
}

/**
 * Runs a duel inside a World: rounds with their own rules (mounted / on foot / no helmets),
 * dismount on health thresholds, pluggable boss modules, tag-team partners and win conditions.
 * Used standalone by the Duel engine and as the final slide of Quest missions (Core Design Rule 4).
 */
export class DuelController {
  phase: Phase = 'intro';
  roundIndex = 0;
  result: 'victory' | 'defeat' | null = null;
  player!: Fighter;
  partner: Fighter | null = null;
  opponent!: Fighter;
  module: BossModule | null = null;
  private phaseT = 0;
  private minionIds: number[] = [];
  private bossCtx!: BossContext;
  private tagCooldown = 0;
  private readonly world: World;
  private readonly cfg: DuelConfig;
  private readonly opts: DuelControllerOptions;
  readonly arena: { minX: number; maxX: number };

  constructor(world: World, cfg: DuelConfig, opts: DuelControllerOptions) {
    this.world = world;
    this.cfg = cfg;
    this.opts = opts;
    const half = cfg.arena.width / 2;
    this.arena = { minX: opts.centerX - half, maxX: opts.centerX + half };
  }

  get round(): RoundConfig {
    return this.cfg.rounds[this.roundIndex];
  }

  get isFinalRound() {
    return this.roundIndex === this.cfg.rounds.length - 1;
  }

  private knightMax(f: Fighter, mounted: boolean, base: number): number {
    if (f.look.model !== 'humanoid' || f.maxMana > 0 || f.stats.maxHp !== HEALTH.playerFoot) return base;
    return mounted ? HEALTH.playerMounted : HEALTH.playerFoot;
  }

  start() {
    const w = this.world;
    w.bounds = { ...this.arena };
    const r0 = this.cfg.rounds[0];
    const mounted = r0.mount === 'horse' ? 'horse' : null;
    const cx = this.opts.centerX;

    if (this.opts.player) {
      this.player = this.opts.player;
    } else {
      this.player = w.spawn(archetypeFor(this.cfg.player.character), { team: 0, x: cx - 4, isPlayer: true, mounted });
    }
    this.player.x = cx - (mounted ? 6 : 4);
    this.player.facing = 1;

    const oppArch = resolveArchetype(this.cfg.opponent.ref, this.cfg.opponent.isBoss);
    this.opponent = w.spawn(oppArch, {
      team: 1,
      x: cx + (mounted ? 6 : 4),
      facing: -1,
      isBoss: this.cfg.opponent.isBoss,
      mounted,
      name: this.cfg.opponent.name ?? oppArch.name,
    });
    this.opponent.enemyType = this.cfg.opponent.isBoss ? 'boss' : 'commander';
    // Duel opponents are reported through bossesDefeated, not as kills.
    this.opponent.ai.noKillCredit = 1;
    if (oppArch.stats.flying) this.opponent.y = 1;

    if (this.cfg.tagTeam) {
      const pArch = archetypeFor(this.cfg.tagTeam.partner);
      this.partner = w.spawn(pArch, { team: 0, x: this.arena.minX + 0.6, controller: 'none' });
      this.benchPartner(this.partner);
    }

    this.applyRound(true);
    this.setupBoss();
    this.installHooks();
    this.phase = 'intro';
    this.phaseT = 0;
  }

  private setupBoss() {
    const w = this.world;
    this.bossCtx = {
      world: w,
      boss: this.opponent,
      player: () => (isAlive(this.player) ? this.player : undefined),
      spawnMinion: (look, x, y) => {
        const m = w.spawn(ENEMY_ARCHETYPES[look], { team: 1, x, y: y ?? 0 });
        this.minionIds.push(m.id);
        w.emit({ type: 'spawn', x, y: y ?? 0, enemyType: m.enemyType, spectral: !!m.look.spectral });
        return m;
      },
      minions: () => this.minionIds.map((id) => w.byId(id)).filter((f): f is Fighter => !!f),
      arena: this.arena,
      banner: this.opts.banner,
    };
    if (this.cfg.boss) {
      this.module = createBossModule(this.cfg.boss.module);
      this.module.setup(this.bossCtx);
    }
  }

  private installHooks() {
    const w = this.world;
    const prevOnRelease = w.onRelease;
    w.onRelease = (f, kind) => {
      if (f.id === this.opponent.id && kind === 'cast' && this.module?.onCast) {
        this.module.onCast(this.bossCtx);
        w.emit({ type: 'release', x: f.x, y: f.y + 1.5, kind: 'cast' });
        return;
      }
      prevOnRelease?.(f, kind);
    };
    w.canBeHit = (target, attacker) => {
      if (target.id === this.opponent.id && this.module?.canBeHit) return this.module.canBeHit(this.bossCtx, attacker);
      if (this.partner && target.id === this.partner.id && !target.isPlayer) return false;
      return true;
    };
    const prevDamaged = w.onDamaged;
    w.onDamaged = (f, amount, attackerId) => {
      if (f.id === this.opponent.id) this.module?.onBossDamaged?.(this.bossCtx, amount);
      prevDamaged?.(f, amount, attackerId);
    };
    const prevDeath = w.onDeath;
    w.onDeath = (f) => {
      if (this.minionIds.includes(f.id)) this.module?.onMinionKilled?.(this.bossCtx, f);
      prevDeath?.(f);
    };
    w.preventDeath = (f) => {
      const duelist = f.id === this.opponent.id || f.id === this.player.id;
      if (!duelist || this.phase !== 'fight') return false;
      if (!this.isFinalRound) {
        f.hp = 1;
        this.endRound();
        return true;
      }
      return false;
    };
  }

  private benchPartner(p: Fighter) {
    p.isPlayer = false;
    p.controller = 'none';
    p.x = this.arena.minX + 0.6;
    p.untargetable = true;
    p.intent = emptyIntent();
    setAction(p, 'idle');
  }

  /** Swap the active fighter with the tag-team partner (spec §14 Evil Witch). */
  tagIn(forced: boolean) {
    const out = this.player;
    const inn = this.partner;
    if (!inn || !isAlive(inn) || this.tagCooldown > 0) return false;
    this.tagCooldown = forced ? 0.5 : 3;
    inn.isPlayer = true;
    inn.untargetable = false;
    inn.controller = 'player';
    inn.x = out.x;
    inn.facing = out.facing;
    inn.invulnT = 1.0;
    setAction(inn, 'idle');
    this.partner = out;
    this.player = inn;
    if (isAlive(out)) this.benchPartner(out);
    this.world.emit({ type: 'tag-in', x: inn.x });
    this.opts.banner(`${inn.name} tags in!`, forced ? 'Stunned partner swapped out' : undefined);
    return true;
  }

  private applyRound(first: boolean) {
    const w = this.world;
    const r = this.round;
    const mounted = r.mount === 'horse';
    for (const f of [this.player, this.opponent, this.partner].filter((x): x is Fighter => !!x)) {
      const wasMounted = !!f.mounted;
      const base = f.id === this.opponent.id ? resolveArchetype(this.cfg.opponent.ref, this.cfg.opponent.isBoss).stats.maxHp * this.cfg.opponent.hpScale : f.stats.maxHp;
      const newMax = this.knightMax(f, mounted, base);
      if (!first && wasMounted && !mounted) w.emit({ type: 'dismount', x: f.x });
      if (!first && !wasMounted && mounted) w.emit({ type: 'mount', x: f.x });
      f.mounted = mounted && f.look.model === 'humanoid' ? 'horse' : null;
      // Health carries over between rounds, clamped to the new pool (spec §7 Engine C).
      f.hp = first ? newMax : Math.min(f.hp, newMax);
      f.maxHp = newMax;
      if (f.helmet && !r.helmets && !first) w.emit({ type: 'helmet-off', x: f.x });
      f.helmet = r.helmets;
      f.tookDamageThisRound = false;
      if (f.action !== 'dead') setAction(f, 'idle');
      f.vx = 0;
      f.pushX = 0;
      f.invulnT = first ? 0 : 0.8;
    }
    const cx = this.opts.centerX;
    const gap = mounted ? 6 : 4;
    this.player.x = cx - gap;
    this.player.facing = 1;
    this.opponent.x = cx + gap;
    this.opponent.facing = -1;
    const label = r.label ?? `${mounted ? 'Mounted' : 'On foot'}${r.helmets ? '' : ' — helmets off'}`;
    w.emit({ type: 'round-start', index: this.roundIndex, label, mounted, helmets: r.helmets });
    const total = this.cfg.rounds.length;
    this.opts.banner(total > 1 ? `Round ${this.roundIndex + 1}` : this.opponent.name, label);
  }

  private endRound() {
    if (this.phase !== 'fight') return;
    if (!this.player.tookDamageThisRound) this.world.stats.noHitRounds++;
    this.world.emit({ type: 'round-end', index: this.roundIndex });
    this.phase = 'round-end';
    this.phaseT = 0;
  }

  private finish(result: 'victory' | 'defeat') {
    if (this.phase === 'done') return;
    if (result === 'victory' && !this.player.tookDamageThisRound) this.world.stats.noHitRounds++;
    this.phase = 'done';
    this.result = result;
    const w = this.world;
    // Clear spells and minions so the ending reads cleanly.
    for (const h of w.hazards) if (h.kind !== 'landing-zone' && h.kind !== 'ship') h.dead = true;
    for (const p of w.projectiles) p.dead = true;
    if (result === 'victory') {
      w.stats.bossesDefeated++;
      for (const m of this.bossCtx.minions()) {
        if (!isAlive(m)) continue;
        m.hp = 0;
        m.ai.noKillCredit = 1;
        setAction(m, 'dead');
        m.deathT = 0;
      }
      if (isAlive(this.opponent)) {
        // Mana victories: the caster quits the field.
        setAction(this.opponent, 'stagger', 99);
        this.opponent.untargetable = true;
      }
      if (isAlive(this.player)) setAction(this.player, 'victory');
      w.distortion = 0;
    }
  }

  /** Before world.step: AI intents, boss module overrides, tag-ins, intro freeze. */
  preStep(dt: number, interact: boolean) {
    const w = this.world;
    this.phaseT += dt;
    this.tagCooldown = Math.max(0, this.tagCooldown - dt);
    if (this.phase === 'intro' || this.phase === 'round-end') {
      for (const f of w.fighters) f.intent = emptyIntent();
      if (this.phase === 'intro' && this.phaseT > 1.6) {
        this.phase = 'fight';
        this.phaseT = 0;
      }
      if (this.phase === 'round-end' && this.phaseT > 1.4) {
        this.roundIndex++;
        this.applyRound(false);
        this.phase = 'intro';
        this.phaseT = 0;
      }
      return;
    }
    if (this.phase === 'done') {
      for (const f of w.fighters) if (!f.isPlayer) f.intent = emptyIntent();
      return;
    }
    runAi({ world: w, dt, maxAttackers: 3 });
    if (this.module && isAlive(this.opponent)) this.module.update(this.bossCtx, dt);
    if (this.partner && interact) this.tagIn(false);
  }

  /** After world.step: round thresholds, forced tag-ins, victory/defeat. */
  postStep(events: readonly { type: string }[]) {
    if (this.phase !== 'fight') return;
    const w = this.world;
    if (this.partner && events.some((e) => e.type === 'stun') && this.player.action === 'stunned') this.tagIn(true);

    // Defeat: active fighter down → partner takes over, else lose.
    if (!isAlive(this.player)) {
      if (this.partner && isAlive(this.partner)) {
        this.tagCooldown = 0;
        this.tagIn(true);
      } else {
        this.finish('defeat');
        return;
      }
    }
    if (this.module?.defeated?.(this.bossCtx)) {
      this.finish('victory');
      return;
    }
    if (!isAlive(this.opponent)) {
      this.finish('victory');
      return;
    }
    const end = this.round.endsWhen;
    // A round never flips within seconds: the threshold only counts after a minimum fighting time
    // (a fighter who is actually killed still ends the round at once, see preventDeath).
    if (end.type === 'hpAtOrBelow' && this.phaseT >= DUEL.minRoundSeconds && (this.player.hp <= end.hp || this.opponent.hp <= end.hp)) this.endRound();
    void REACTION;
    void w;
  }

  bossBar(): HudBar | null {
    const o = this.opponent;
    if (!o) return null;
    return {
      name: o.name,
      hp: Math.max(0, o.hp),
      maxHp: o.maxHp,
      segments: segmentsFor(o.maxHp),
      mana: o.maxMana > 0 ? o.mana : undefined,
      maxMana: o.maxMana > 0 ? o.maxMana : undefined,
      caption: this.module?.caption?.(this.bossCtx),
    };
  }

  roundLabel(): string {
    const total = this.cfg.rounds.length;
    return total > 1 ? `Round ${this.roundIndex + 1}/${total}` : 'Duel';
  }
}
