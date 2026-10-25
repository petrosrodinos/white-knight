import { DAMAGE } from '@/core/combat/combat-config';
import { hurtbox, isAlive } from './fighter';
import type { Fighter, Hazard } from './types';
import type { World } from './world';

const victims = (world: World, h: Hazard) => world.fighters.filter((f) => isAlive(f) && (h.team === -1 || f.team !== h.team) && !h.hitIds.has(f.id));

function hitIn(world: World, h: Hazard, x0: number, x1: number, y0: number, y1: number, damage: number, blockable: boolean, onHit?: (f: Fighter) => void) {
  for (const f of victims(world, h)) {
    const b = hurtbox(f);
    if (b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1) continue;
    const res = world.hurt(f, damage, blockable, h.x, -1);
    if (res !== 'ignored') h.hitIds.add(f.id);
    if (res === 'hit') onHit?.(f);
  }
}

/** Steps all environmental hazards (spec §12). */
export function updateHazards(world: World, dt: number) {
  let wind = 0;
  for (const h of world.hazards) {
    if (h.dead) continue;
    const prevT = h.t;
    h.t += dt;
    const crossed = (mark: number) => prevT < mark && h.t >= mark;
    switch (h.kind) {
      case 'spike-trap': {
        const cycle = h.warn + h.active + h.rest;
        const local = h.t % cycle;
        const prevLocal = prevT % cycle;
        if (local < prevLocal) h.hitIds.clear();
        if (prevLocal < 0.0001 || (prevLocal > local)) world.emit({ type: 'hazard-warn', x: h.x, kind: h.kind });
        if (prevLocal < h.warn && local >= h.warn) world.emit({ type: 'hazard-strike', x: h.x, kind: h.kind });
        if (local >= h.warn && local < h.warn + h.active) {
          hitIn(world, h, h.x - h.width / 2, h.x + h.width / 2, -1, 0.8, h.damage || DAMAGE.trap, false);
        }
        break;
      }
      case 'falling-object': {
        if (crossed(0.0001) || prevT === 0) world.emit({ type: 'hazard-warn', x: h.x, kind: h.kind, variant: h.model });
        if (h.t >= h.warn && h.active === 0) {
          // Falling.
          h.power += 30 * dt; // velocity
          h.y -= h.power * dt;
          if (h.y <= 2.2) hitIn(world, h, h.x - h.width / 2, h.x + h.width / 2, h.y - 0.5, h.y + 0.6, h.damage || DAMAGE.fallingObject, false);
          if (h.y <= 0) {
            h.y = 0;
            h.active = h.t; // landed timestamp
            world.emit({ type: 'hazard-strike', x: h.x, kind: h.kind, variant: h.model });
            world.shake(0.15, 0.18);
          }
        } else if (h.active > 0 && h.t - h.active > 1.2) {
          h.dead = true;
        }
        break;
      }
      case 'wind-gust': {
        if (prevT === 0) world.emit({ type: 'hazard-warn', x: h.x, kind: h.kind, variant: h.variant });
        if (h.t >= h.warn && h.t < h.warn + h.active) {
          const ramp = Math.min(1, (h.t - h.warn) / 0.3, (h.warn + h.active - h.t) / 0.3);
          wind += h.dir * h.power * ramp;
          if (crossed(h.warn)) world.emit({ type: 'hazard-strike', x: h.x, kind: h.kind, variant: h.variant });
          if (h.damage > 0) hitIn(world, h, -1e6, 1e6, -10, 100, h.damage, false);
        }
        if (h.t >= h.warn + h.active) h.dead = true;
        break;
      }
      case 'lightning': {
        if (prevT === 0) world.emit({ type: 'hazard-warn', x: h.x, kind: h.kind, variant: h.variant });
        if (crossed(h.warn)) {
          world.emit({ type: 'hazard-strike', x: h.x, kind: h.kind, variant: h.variant });
          // The 'stun' variant is only a visual marker; the boss module resolves its effect.
          if (h.variant !== 'stun') {
            world.shake(0.2, 0.2);
            hitIn(world, h, h.x - h.width / 2, h.x + h.width / 2, -10, 100, h.damage || DAMAGE.storm, false);
          }
        }
        if (h.t > h.warn + 0.4) h.dead = true;
        break;
      }
      case 'beam': {
        if (prevT === 0) world.emit({ type: 'hazard-warn', x: h.x, kind: h.kind });
        if (crossed(h.warn)) world.emit({ type: 'hazard-strike', x: h.x, kind: h.kind });
        if (h.t >= h.warn && h.t < h.warn + h.active) {
          const x0 = h.dir > 0 ? h.x : h.x - h.width;
          const x1 = h.dir > 0 ? h.x + h.width : h.x;
          hitIn(world, h, x0, x1, h.y - 0.45, h.y + 0.45, h.damage || DAMAGE.beam, false);
        }
        if (h.t >= h.warn + h.active + 0.2) h.dead = true;
        break;
      }
      case 'terrain-wave': {
        if (prevT === 0) world.emit({ type: 'hazard-warn', x: h.x, kind: h.kind });
        if (h.t >= h.warn) {
          h.x += h.dir * h.power * dt;
          hitIn(world, h, h.x - 0.5, h.x + 0.5, -1, 0.7, h.damage || DAMAGE.terrainWave, false);
          if (h.x < world.bounds.minX - 4 || h.x > world.bounds.maxX + 4) h.dead = true;
        }
        break;
      }
      case 'emitter': {
        const rate = h.rate ?? 2;
        const target = world.player;
        if (!target || !isAlive(target)) break;
        if (Math.floor(prevT / rate) !== Math.floor(h.t / rate)) {
          const kind = h.projectile ?? 'arrow';
          // Origin relative to the target: ahead/right, from below (fortress) or above.
          const ox = h.variant === 'below' ? target.x + world.rng.range(6, 14) : target.x + world.rng.range(11, 15) * (h.dir || 1);
          const oy = h.variant === 'below' ? -4 : h.variant === 'above' ? target.y + 9 : world.rng.range(1, 4);
          const fake = { id: -1, team: h.team === -1 ? 1 : h.team, x: ox, y: oy, facing: (target.x > ox ? 1 : -1) as 1 | -1, mounted: null, look: { scale: 1 } } as unknown as Fighter;
          // Aimed at where the target is now (no lead), so moving out of the way works.
          world.fireProjectile(fake, kind, target.x, target.y + 1.0);
        }
        break;
      }
      case 'ship': {
        // Enemy ship sailing alongside: archers on deck fire volleys at the player.
        h.x += h.dir * 0.6 * dt;
        const target = world.player;
        const rate = h.rate ?? 3.2;
        if (target && isAlive(target) && Math.abs(target.x - h.x) < 22 && Math.floor(prevT / rate) !== Math.floor(h.t / rate)) {
          const n = 2 + world.rng.int(0, 1);
          for (let i = 0; i < n; i++) {
            const fake = { id: -1, team: 1, x: h.x + (i - 1) * 2.5, y: 2.5, facing: (target.x > h.x ? 1 : -1) as 1 | -1, mounted: null, look: { scale: 1 } } as unknown as Fighter;
            world.fireProjectile(fake, 'arrow', target.x + world.rng.range(-1.5, 1.5), target.y + 1);
          }
        }
        if (h.t > (h.active || 60)) h.dead = true;
        break;
      }
      case 'quake': {
        if (Math.floor(prevT / 2.4) !== Math.floor(h.t / 2.4)) {
          world.emit({ type: 'quake', strength: h.power });
          world.shake(0.3 * h.power, 0.6);
          const dir = world.rng.chance(0.5) ? 1 : -1;
          const x = dir > 0 ? world.bounds.minX : world.bounds.maxX;
          world.addHazard({ kind: 'terrain-wave', x, y: 0, width: 1, warn: 0.5, active: 0, rest: 0, dir, power: 7, damage: DAMAGE.terrainWave, team: 1 });
        }
        if (h.active > 0 && h.t > h.active) h.dead = true;
        break;
      }
      case 'landing-zone':
        break;
      default:
        break;
    }
  }
  world.windForce = wind;
}
