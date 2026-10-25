import { describe, expect, it } from 'vitest';
import { CHARACTER_ARCHETYPES, ENEMY_ARCHETYPES } from '@/content/fighters';
import { SHIELD } from '@/core/combat/combat-config';
import { emptyIntent } from './types';
import { World } from './world';

const DT = 1 / 60;

function setup() {
  const w = new World(1, 'knight');
  const p = w.spawn(CHARACTER_ARCHETYPES['white-knight'], { team: 0, x: 0, isPlayer: true });
  const e = w.spawn(ENEMY_ARCHETYPES.infantry, { team: 1, x: 1.2, controller: 'none' });
  return { w, p, e };
}

function hold(w: World, p: ReturnType<typeof setup>['p'], held: boolean, steps: number) {
  for (let i = 0; i < steps; i++) {
    p.intent = { ...emptyIntent(), shield: held };
    w.step(DT);
    w.drainEvents();
  }
}

describe('energy shield', () => {
  it('knights have a shield, enemies and bosses of other kinds do not', () => {
    const { p, e } = setup();
    expect(p.shieldMax).toBe(SHIELD.max);
    expect(e.shieldMax).toBe(0);
  });

  it('is raised only while held and drains energy', () => {
    const { w, p } = setup();
    hold(w, p, true, 60);
    expect(p.shieldOn).toBe(true);
    expect(p.shield).toBeLessThan(SHIELD.max);
    hold(w, p, false, 1);
    expect(p.shieldOn).toBe(false);
  });

  it('soaks magic that Shift-block cannot stop, with no damage or stagger', () => {
    const { w, p } = setup();
    hold(w, p, true, 2);
    const hp = p.hp;
    const energy = p.shield;
    expect(w.hurt(p, 10, false, 5, -1)).toBe('blocked');
    expect(p.hp).toBe(hp);
    expect(p.shield).toBeLessThan(energy);
    expect(p.action).not.toBe('hit');
  });

  it('soaks melee strikes', () => {
    const { w, p, e } = setup();
    hold(w, p, true, 2);
    e.meleeKind = 'light';
    e.meleeDamage = 10;
    p.facing = 1;
    w.strike(e, p);
    expect(p.hp).toBe(p.maxHp);
    expect(p.shield).toBeLessThan(SHIELD.max);
  });

  it('breaks when overwhelmed, lets the overflow through and goes offline', () => {
    const { w, p } = setup();
    hold(w, p, true, 2);
    w.hurt(p, 100, false, 5, -1);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(p.shieldOn).toBe(false);
    expect(p.shieldBroken).toBeGreaterThan(0);
    hold(w, p, true, 30);
    expect(p.shieldOn).toBe(false);
  });

  it('reboots with partial energy after the broken time', () => {
    const { w, p } = setup();
    hold(w, p, true, 2);
    w.hurt(p, 100, false, 5, -1);
    hold(w, p, false, Math.ceil((SHIELD.brokenTime + 0.2) / DT));
    expect(p.shieldBroken).toBe(0);
    expect(p.shield).toBeGreaterThanOrEqual(SHIELD.max * SHIELD.rebootFraction);
    hold(w, p, true, 2);
    expect(p.shieldOn).toBe(true);
  });

  it('recovers energy after a delay while lowered', () => {
    const { w, p } = setup();
    hold(w, p, true, 120);
    const low = p.shield;
    hold(w, p, false, Math.ceil((SHIELD.rechargeDelay + 1) / DT));
    expect(p.shield).toBeGreaterThan(low);
  });
});
