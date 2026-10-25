import { ENEMY_ARCHETYPES, archetypeFor, type FighterArchetype } from '@/content/fighters';
import { HEALTH, LIVES } from '@/core/combat/combat-config';
import { nearestEnemy, runAi } from '@/core/ai/controllers';
import type { CameraHint, HudSnapshot, HudSquad, SceneState } from '@/core/engine/engine-types';
import { input } from '@/core/input/input-manager';
import { clamp } from '@/core/math/rng';
import { isAlive, setAction } from '@/core/sim/fighter';
import type { Fighter } from '@/core/sim/types';
import { EngineBase, type EngineInit } from '@/engines/shared/engine-base';
import { OpenFieldConfigSchema, type OpenFieldConfig, type OpenFieldConfigInput } from './open-field-config';

type Order = HudSquad['order'];

interface Squad {
  id: number;
  name: string;
  team: 0 | 1;
  order: Order;
  /** Target x for move/hold orders. */
  anchorX: number;
  unitIds: number[];
  total: number;
  commanderId: number | null;
}

interface Commander {
  fighterId: number;
  name: string;
  squadIds: number[];
  routAt: number;
  routing: boolean;
  routed: boolean;
}

const ENGAGE_RADIUS: Record<Order, number> = { move: 3.5, hold: 4, retreat: 0, charge: Infinity, advance: 10 };

/**
 * Engine A — Open Field Battle. The player commands squads (move / hold / retreat / charge,
 * Tab cycles selection) and fights as the commander. Units auto-attack the nearest enemy.
 */
export class OpenFieldEngine extends EngineBase {
  readonly kind = 'open-field' as const;
  readonly cfg: OpenFieldConfig;
  squads: Squad[] = [];
  commanders: Commander[] = [];
  selected = 0;
  /** World x under the mouse cursor (written by the renderer each frame). */
  cursorX = 0;
  private endT = 0;
  private enemyAdvanceT = 6;

  constructor(config: OpenFieldConfigInput, init: EngineInit) {
    super(init);
    this.cfg = OpenFieldConfigSchema.parse(config);
    this.lives = LIVES.openField;
    this.maxLives = LIVES.openField;
    const w = this.world;
    w.bounds = { minX: 0, maxX: this.cfg.width };
    w.surface = this.cfg.ground;

    const player = w.spawn(archetypeFor(this.cfg.player.character), { team: 0, x: 12, isPlayer: true, mounted: 'horse', name: this.cfg.player.title });
    player.maxHp = HEALTH.playerMounted;
    player.hp = player.maxHp;

    // Player army deploys around the commander.
    this.cfg.playerSquads.forEach((sq, i) => {
      const squad = this.addSquad(sq.name, 0, 14 + i * 2.5, null);
      const arch = this.unitArch(sq.look, 0);
      for (let k = 0; k < sq.count; k++) {
        const x = 4 + i * 3 + (k % 4) * 1.4 + w.rng.range(-0.4, 0.4);
        const u = w.spawn(arch, { team: 0, x, mounted: sq.look === 'cavalry' ? 'horse' : null, squad: squad.id, controller: sq.look === 'archer' ? 'archer' : 'melee' });
        squad.unitIds.push(u.id);
      }
      squad.total = sq.count;
    });

    // Enemy commanders with their squads.
    this.cfg.enemyCommanders.forEach((c) => {
      const cx = this.cfg.width * c.position;
      const cf = w.spawn(archetypeFor(c.character), { team: 1, x: cx, isCommander: true, mounted: c.mounted ? 'horse' : null, name: c.name, controller: 'duelist' });
      cf.enemyType = 'commander';
      cf.maxHp = c.mounted ? HEALTH.playerMounted : HEALTH.playerFoot;
      cf.hp = cf.maxHp;
      const cmd: Commander = { fighterId: cf.id, name: c.name, squadIds: [], routAt: c.routAt, routing: false, routed: false };
      c.squads.forEach((sq, i) => {
        const squad = this.addSquad(sq.name, 1, cx - 6 - i * 3, cf.id);
        const arch = this.unitArch(sq.look, 1);
        for (let k = 0; k < sq.count; k++) {
          const x = cx - 3 - i * 3 - (k % 4) * 1.4 + w.rng.range(-0.4, 0.4);
          const u = w.spawn(arch, { team: 1, x, mounted: sq.look === 'cavalry' ? 'horse' : null, squad: squad.id, controller: sq.look === 'archer' ? 'archer' : 'melee', facing: -1 });
          squad.unitIds.push(u.id);
        }
        squad.total = sq.count;
        squad.order = 'hold';
        cmd.squadIds.push(squad.id);
      });
      this.commanders.push(cmd);
    });
    this.selected = 0;
    this.status = 'playing';
    this.banner('To battle!', 'Tab: select · Q: move · R: hold · F: retreat · Middle mouse: charge');
  }

  private unitArch(look: 'infantry' | 'spearman' | 'archer' | 'cavalry', team: 0 | 1): FighterArchetype {
    const base = ENEMY_ARCHETYPES[look];
    const stats = { ...base.stats, maxHp: look === 'cavalry' ? HEALTH.unitMounted : look === 'archer' ? 60 : HEALTH.unitFoot };
    if (team === 0) return { ...base, name: `Kingdom ${base.name}`, look: { ...base.look, skin: `ally-${look}` }, stats, enemyType: null };
    return { ...base, stats };
  }

  private addSquad(name: string, team: 0 | 1, anchorX: number, commanderId: number | null): Squad {
    const s: Squad = { id: this.squads.length + 1, name, team, order: 'advance', anchorX, unitIds: [], total: 0, commanderId };
    this.squads.push(s);
    return s;
  }

  private playerSquads() {
    return this.squads.filter((s) => s.team === 0);
  }

  private aliveUnits(s: Squad): Fighter[] {
    return s.unitIds.map((id) => this.world.byId(id)).filter((f): f is Fighter => !!f && isAlive(f));
  }

  private squadOf(f: Fighter): Squad | undefined {
    return f.squad ? this.squads[f.squad - 1] : undefined;
  }

  private issue(order: Order) {
    const own = this.playerSquads();
    const s = own[this.selected];
    if (!s || this.aliveUnits(s).length === 0) return;
    s.order = order;
    const p = this.world.player;
    if (order === 'move') s.anchorX = clamp(this.cursorX, 1, this.cfg.width - 1);
    if (order === 'hold') {
      const units = this.aliveUnits(s);
      s.anchorX = units.reduce((a, u) => a + u.x, 0) / Math.max(1, units.length);
    }
    if (order === 'retreat') s.anchorX = 3;
    this.world.emit({ type: 'order', order: order === 'advance' ? 'move' : order });
    this.banner(`${s.name}: ${order === 'move' ? 'Move' : order === 'hold' ? 'Hold position' : order === 'retreat' ? 'Retreat' : 'Charge!'}`);
    void p;
  }

  private cycleSelection() {
    const own = this.playerSquads();
    for (let i = 1; i <= own.length; i++) {
      const next = (this.selected + i) % own.length;
      if (this.aliveUnits(own[next]).length > 0) {
        this.selected = next;
        this.world.emit({ type: 'select', squad: own[next].id });
        return;
      }
    }
  }

  private readOrders() {
    if (this.status !== 'playing') return;
    if (input.wasPressed('cycleSelection')) this.cycleSelection();
    if (input.wasPressed('orderMove')) this.issue('move');
    if (input.wasPressed('orderHold')) this.issue('hold');
    if (input.wasPressed('orderRetreat')) this.issue('retreat');
    if (input.wasPressed('orderCharge')) this.issue('charge');
  }

  private target(f: Fighter): Fighter | null | undefined {
    if (f.isCommander) {
      const cmd = this.commanders.find((c) => c.fighterId === f.id);
      if (cmd?.routing) return null;
      return undefined;
    }
    const s = this.squadOf(f);
    if (!s) return undefined;
    const radius = ENGAGE_RADIUS[s.order];
    if (radius === 0) return null;
    const near = nearestEnemy(this.world, f, radius === Infinity ? 1e9 : radius);
    return near;
  }

  /** Post-process unit intents for orders with no engaged target: walk to the anchor / follow. */
  private steerUnits() {
    const w = this.world;
    const p = w.player;
    for (const f of w.fighters) {
      if (f.isPlayer || !isAlive(f) || f.controller === 'player') continue;
      if (f.isCommander) {
        const cmd = this.commanders.find((c) => c.fighterId === f.id);
        if (cmd?.routing) {
          f.intent.moveX = 1;
          f.intent.light = f.intent.heavy = false;
          f.intent.block = false;
          f.facing = 1;
        } else if (!nearestEnemy(w, f, 12)) {
          // Commanders hang behind their lines until the enemy is close.
          const sq = cmd ? this.squads.find((s) => cmd.squadIds.includes(s.id)) : undefined;
          const want = (sq?.anchorX ?? f.x) + 5;
          f.intent.moveX = Math.abs(want - f.x) > 1 ? Math.sign(want - f.x) : 0;
        }
        continue;
      }
      const s = this.squadOf(f);
      if (!s) continue;
      const engaged = this.target(f);
      if (engaged) continue;
      let want: number;
      switch (s.order) {
        case 'advance':
          want = s.team === 0 && p ? p.x - 3 - (f.id % 7) * 1.6 - (s.id % 4) * 1.5 : s.anchorX;
          break;
        case 'charge':
          want = s.team === 0 ? this.cfg.width : 0;
          break;
        default:
          want = s.anchorX + ((f.id % 7) - 3) * 1.5;
      }
      const d = want - f.x;
      f.intent.moveX = Math.abs(d) > 0.8 ? Math.sign(d) : 0;
      if (s.order === 'retreat') {
        f.intent.light = f.intent.heavy = false;
        f.intent.special = null;
      }
    }
  }

  private enemyGeneral(dt: number) {
    // Enemy squads hold, then advance in waves and finally charge.
    this.enemyAdvanceT -= dt;
    if (this.enemyAdvanceT > 0) return;
    this.enemyAdvanceT = 8 + this.world.rng.range(0, 4);
    for (const s of this.squads) {
      if (s.team !== 1) continue;
      if (s.order === 'hold') {
        s.order = 'move';
        s.anchorX = Math.max(10, s.anchorX - 25);
      } else if (s.order === 'move') {
        s.order = 'charge';
      }
    }
  }

  private updateCommanders() {
    const w = this.world;
    for (const c of this.commanders) {
      if (c.routed) continue;
      const f = w.byId(c.fighterId);
      if (!f || !isAlive(f)) {
        if (!c.routed) {
          c.routed = true;
          w.emit({ type: 'commander-down', x: f?.x ?? 0, routed: false });
          this.banner(`${c.name} has fallen!`);
          // Leaderless squads lose heart and charge recklessly.
          for (const id of c.squadIds) this.squads[id - 1].order = 'charge';
        }
        continue;
      }
      const alive = c.squadIds.reduce((a, id) => a + this.aliveUnits(this.squads[id - 1]).length, 0);
      const total = c.squadIds.reduce((a, id) => a + this.squads[id - 1].total, 0);
      if (!c.routing && alive / Math.max(1, total) <= c.routAt && f.hp / f.maxHp <= 0.6) {
        c.routing = true;
        f.untargetable = false;
        this.banner(`${c.name} is routing!`, 'Catch him before he escapes');
        for (const id of c.squadIds) this.squads[id - 1].order = 'retreat';
        for (const id of c.squadIds) this.squads[id - 1].anchorX = this.cfg.width;
      }
      if (c.routing && f.x >= this.cfg.width - 1) {
        c.routed = true;
        f.removed = true;
        w.emit({ type: 'commander-down', x: f.x, routed: true });
        this.banner(`${c.name} fled the field`);
        for (const id of c.squadIds) for (const u of this.aliveUnits(this.squads[id - 1])) setAction(u, 'stagger', 0.5);
      }
    }
  }

  step(dt: number) {
    const w = this.world;
    this.drivePlayer();
    this.readOrders();
    if (this.status !== 'playing') {
      this.stepWorld(dt);
      return;
    }
    runAi({ world: w, dt, maxAttackers: 4, targetOverride: (f) => this.target(f) });
    this.steerUnits();
    this.enemyGeneral(dt);
    this.stepWorld(dt);
    this.countKills();
    this.updateCommanders();

    const p = w.player;
    const ownAlive = this.playerSquads().reduce((a, s) => a + this.aliveUnits(s).length, 0);
    let result: 'victory' | 'defeat' | null = null;
    if (!p || !isAlive(p)) {
      result = 'defeat';
      this.failReason = 'Your commander has fallen';
    } else if (ownAlive === 0) {
      result = 'defeat';
      this.failReason = 'Your army has been destroyed';
    } else if (this.commanders.every((c) => c.routed)) {
      result = 'victory';
    }
    if (result) {
      this.endT += dt;
      if (this.endT > (result === 'victory' ? 2.0 : 1.4)) {
        this.status = result;
        if (result === 'defeat') this.lives = 0;
        w.emit({ type: 'outcome', result });
        if (result === 'victory' && p) setAction(p, 'victory');
      }
    }
  }

  hud(): HudSnapshot {
    const h = this.baseHud();
    const own = this.playerSquads();
    h.squads = own.map((s, i) => ({ id: s.id, name: s.name, alive: this.aliveUnits(s).length, total: s.total, order: s.order, selected: i === this.selected }));
    const remaining = this.commanders.filter((c) => !c.routed).length;
    h.commanders = { remaining, total: this.commanders.length };
    h.enemiesRemaining = this.world.alive(1).length;
    h.stageLabel = 'Open Field';
    h.controls.push(
      { label: 'Select company', actions: ['cycleSelection'] },
      { label: 'Move to cursor', actions: ['orderMove'] },
      { label: 'Hold position', actions: ['orderHold'] },
      { label: 'Retreat', actions: ['orderRetreat'] },
      { label: 'Charge', actions: ['orderCharge'] },
    );
    h.objective = 'Defeat or rout every enemy commander';
    return h;
  }

  scene(): SceneState {
    return { env: this.cfg.env, ground: this.cfg.ground, fog: this.cfg.fog, flight: false, fade: 0, distortion: 0 };
  }

  camera(): CameraHint {
    const p = this.world.player;
    return { x: p?.x ?? 0, y: 0, minX: 0, maxX: this.cfg.width, viewHeight: 12 };
  }

  soundtrack() {
    return { music: this.cfg.music, ambience: this.cfg.ambience };
  }

  /** For the minimap: unit positions without React state. */
  minimap(): { width: number; units: Array<{ x: number; team: 0 | 1; kind: 'unit' | 'player' | 'commander'; selected: boolean }> } {
    const sel = this.playerSquads()[this.selected];
    return {
      width: this.cfg.width,
      units: this.world.fighters
        .filter((f) => isAlive(f))
        .map((f) => ({ x: f.x, team: f.team, kind: f.isPlayer ? 'player' : f.isCommander ? 'commander' : 'unit', selected: !!sel && f.squad === sel.id && f.team === 0 })),
    };
  }
}
