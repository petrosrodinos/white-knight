import { LIVES, segmentsFor } from '@/core/combat/combat-config';
import type { CameraHint, ControlHint, EngineStatus, GameEngine, HudBar, HudSnapshot, RunOutcome, SceneState } from '@/core/engine/engine-types';
import { readPlayerIntent } from '@/core/engine/player-controller';
import { isAlive } from '@/core/sim/fighter';
import { emptyIntent, type AttackAction, type Fighter, type GameEvent } from '@/core/sim/types';
import { World } from '@/core/sim/world';
import type { Difficulty, EngineKind } from '@/content/ids';
import { nearestEnemy } from '@/core/ai/controllers';

export interface EngineInit {
  difficulty: Difficulty;
  seed: number;
  missionLabel: string;
  playerName: string;
}

/** Shared plumbing for the three engines: world, banners, default ranged release, HUD helpers. */
export abstract class EngineBase implements GameEngine {
  abstract readonly kind: EngineKind;
  readonly world: World;
  status: EngineStatus = 'intro';
  protected bannerState: HudSnapshot['banner'] = null;
  private bannerSeq = 0;
  private bannerT = 0;
  protected elapsed = 0;
  protected lives: number = LIVES.duel;
  protected maxLives: number = LIVES.duel;
  protected failReason: string | undefined;
  protected readonly init: EngineInit;
  /** Events produced during the last step (engines inspect them for rules). */
  protected stepEvents: GameEvent[] = [];
  private pendingEvents: GameEvent[] = [];

  constructor(init: EngineInit) {
    this.init = init;
    this.world = new World(init.seed, init.difficulty);
    this.world.onRelease = (f, kind) => this.defaultRelease(f, kind);
  }

  banner(title: string, subtitle?: string) {
    this.bannerState = { title, subtitle, id: ++this.bannerSeq };
    this.bannerT = 2.4;
  }

  /** Ranged release for archers / spear throwers / generic casters. */
  protected defaultRelease(f: Fighter, kind: AttackAction) {
    const target = nearestEnemy(this.world, f, 30);
    if (!target) return;
    const tx = target.x + target.vx * 0.35;
    const ty = target.y + (target.mounted === 'horse' ? 2.0 : 1.1);
    if (kind === 'shoot') this.world.fireProjectile(f, f.stats.ranged ?? 'arrow', tx, ty);
    else if (kind === 'throw') this.world.fireProjectile(f, f.stats.ranged === 'javelin' ? 'javelin' : 'spear', tx, ty);
    else if (kind === 'cast') this.world.fireProjectile(f, 'magic', tx, ty, { homing: 0.3 });
  }

  /** Read player input into the active player fighter's intent. */
  protected drivePlayer(): { interact: boolean } {
    const p = this.world.player;
    if (!p || !isAlive(p)) return { interact: false };
    if (this.status !== 'playing') {
      p.intent = emptyIntent();
      return { interact: false };
    }
    p.intent = readPlayerIntent(this.world, p);
    return { interact: p.intent.interact };
  }

  /** Engines implement their rules around this. */
  abstract step(dt: number): void;
  abstract hud(): HudSnapshot;
  abstract scene(): SceneState;
  abstract camera(): CameraHint;
  abstract soundtrack(): { music: string; ambience: string | null };

  /** Run the world step and collect this step's events for both rules and presentation. */
  protected stepWorld(dt: number) {
    this.elapsed += dt;
    this.bannerT -= dt;
    if (this.bannerT <= 0) this.bannerState = null;
    this.world.step(dt);
    this.stepEvents = this.world.drainEvents();
    this.pendingEvents.push(...this.stepEvents);
  }

  /** Presentation layer drains everything emitted since last frame. */
  drainPresentationEvents(): GameEvent[] {
    const e = this.pendingEvents;
    this.pendingEvents = [];
    return e;
  }

  protected countKills() {
    for (const e of this.stepEvents) {
      if (e.type !== 'death' || e.isPlayer) continue;
      const f = this.world.byId(e.id);
      if (!f || f.team === 0 || !e.enemyType) continue;
      if (f.look.model === 'bird' || f.ai.noKillCredit) continue;
      this.world.stats.kills[e.enemyType] = (this.world.stats.kills[e.enemyType] ?? 0) + 1;
    }
  }

  protected bar(f: Fighter | undefined | null): HudBar {
    if (!f) return { name: '', hp: 0, maxHp: 1, segments: 4 };
    return { name: f.name, hp: Math.max(0, Math.round(f.hp)), maxHp: f.maxHp, segments: segmentsFor(f.maxHp) };
  }

  /** Only the controls the player can actually use in their current state. */
  protected controlHints(p: Fighter | undefined | null): ControlHint[] {
    if (!p || !isAlive(p)) return [];
    const flying = p.mounted === 'hippogryph';
    const rows: ControlHint[] = flying
      ? [{ label: 'Climb / dive', actions: ['moveUp', 'moveDown'] }, { label: 'Slow / fly on', actions: ['moveLeft', 'moveRight'] }]
      : [{ label: 'Move', actions: ['moveLeft', 'moveRight'] }];
    if (!flying && !p.mounted && p.stats.canJump) rows.push({ label: 'Jump', actions: ['moveUp'] });
    if (p.stats.canDodge) rows.push({ label: flying ? 'Evade' : 'Dodge', actions: ['dodge'] });
    if (p.stats.canBlock) rows.push({ label: 'Block', actions: ['block'] });
    if (p.shieldMax > 0) rows.push({ label: 'Energy shield (hold)', actions: ['shield'] });
    rows.push({ label: 'Light attack', actions: ['lightAttack'] }, { label: 'Heavy attack', actions: ['heavyAttack'] });
    return rows;
  }

  protected baseHud(): HudSnapshot {
    const p = this.world.player;
    const kills = Object.values(this.world.stats.kills).reduce((s, n) => s + (n ?? 0), 0);
    return {
      playerName: this.init.playerName,
      lives: this.lives,
      maxLives: this.maxLives,
      player: this.bar(p),
      mounted: !!p?.mounted,
      enemiesRemaining: null,
      kills,
      missionLabel: this.init.missionLabel,
      stageLabel: '',
      objective: '',
      boss: null,
      opponent: null,
      allies: [],
      banner: this.bannerState,
      prompt: null,
      stunned: p?.action === 'stunned',
      lowHealth: !!p && p.hp > 0 && p.hp / p.maxHp <= 0.25,
      squads: null,
      commanders: null,
      progress: null,
      controls: this.controlHints(p),
      shield: p && p.shieldMax > 0 ? { energy: Math.round(p.shield), max: p.shieldMax, active: p.shieldOn, broken: p.shieldBroken > 0 } : null,
    };
  }

  outcome(): RunOutcome | null {
    if (this.status !== 'victory' && this.status !== 'defeat') return null;
    const p = this.world.player;
    return {
      outcome: this.status,
      stats: this.world.stats,
      healthRemainingPct: p ? Math.max(0, p.hp) / p.maxHp : 0,
      livesRemaining: this.lives,
      durationMs: Math.round(this.elapsed * 1000),
      failReason: this.failReason,
    };
  }
}
