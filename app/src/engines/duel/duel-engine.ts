import type { CameraHint, HudSnapshot, SceneState } from '@/core/engine/engine-types';
import { isAlive } from '@/core/sim/fighter';
import { EngineBase, type EngineInit } from '@/engines/shared/engine-base';
import { DuelController } from './duel-controller';
import { DuelConfigSchema, type DuelConfig, type DuelConfigInput } from './duel-config';

/** Engine C — Duel (1v1, rounds, boss modules). Accepts any valid DuelConfig. */
export class DuelEngine extends EngineBase {
  readonly kind = 'duel' as const;
  readonly cfg: DuelConfig;
  readonly duel: DuelController;
  private endT = 0;

  constructor(config: DuelConfigInput, init: EngineInit) {
    super(init);
    this.cfg = DuelConfigSchema.parse(config);
    this.world.surface = this.cfg.arena.ground;
    this.duel = new DuelController(this.world, this.cfg, { centerX: 0, banner: (t, s) => this.banner(t, s) });
    this.duel.start();
    this.status = 'playing';
  }

  step(dt: number) {
    const { interact } = this.drivePlayer();
    this.duel.preStep(dt, interact);
    this.stepWorld(dt);
    this.countKills();
    this.duel.postStep(this.stepEvents);
    if (this.duel.result && this.status === 'playing') {
      this.endT += dt;
      // Let the final blow / victory pose breathe before the summary screen.
      if (this.endT > 1.6) {
        this.status = this.duel.result;
        this.world.emit({ type: 'outcome', result: this.duel.result });
        if (this.duel.result === 'defeat') this.lives = 0;
      }
    }
  }

  hud(): HudSnapshot {
    const h = this.baseHud();
    const d = this.duel;
    h.player = this.bar(d.player);
    h.playerName = d.player?.name ?? h.playerName;
    h.mounted = !!d.player?.mounted;
    h.stageLabel = d.roundLabel();
    h.objective = this.cfg.victory === 'mana' ? 'Drain the mana bar to zero' : 'Defeat your opponent';
    if (this.cfg.opponent.isBoss) h.boss = d.bossBar();
    else h.opponent = d.bossBar();
    if (d.partner) {
      h.allies = [d.player, d.partner].map((f) => ({ ...this.bar(f), active: f.isPlayer }));
      h.prompt = isAlive(d.partner) ? 'E — Tag partner' : null;
      if (isAlive(d.partner)) h.controls.push({ label: 'Tag partner', actions: ['interact'] });
    }
    return h;
  }

  scene(): SceneState {
    return { env: this.cfg.arena.env, ground: this.cfg.arena.ground, fog: this.cfg.arena.fog, flight: false, fade: 0, distortion: this.world.distortion };
  }

  camera(): CameraHint {
    const p = this.duel.player;
    const o = this.duel.opponent;
    const x = p && o ? (p.x + o.x) / 2 : 0;
    const spread = p && o ? Math.abs(p.x - o.x) : 0;
    const mounted = !!p?.mounted;
    return { x, y: 0, minX: this.duel.arena.minX, maxX: this.duel.arena.maxX, viewHeight: Math.max(mounted ? 11 : 10, Math.min(13, spread * 0.55 + 4)), frame: true };
  }

  soundtrack() {
    return { music: this.cfg.opponent.isBoss ? 'boss' : this.cfg.arena.music, ambience: this.cfg.arena.ambience };
  }
}
