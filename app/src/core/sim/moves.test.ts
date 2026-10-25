import { describe, expect, it } from 'vitest';
import { CHARACTER_ARCHETYPES, ENEMY_ARCHETYPES } from '@/content/fighters';
import { resolveMeleeHit } from '@/core/combat/combat-math';
import { DAMAGE, MOVES } from '@/core/combat/combat-config';
import { emptyIntent, type Fighter, type Intent } from './types';
import { World } from './world';

const DT = 1 / 60;

function setup() {
  const w = new World(1, 'champion');
  const p = w.spawn(CHARACTER_ARCHETYPES['white-knight'], { team: 0, x: 0, isPlayer: true });
  const e = w.spawn(ENEMY_ARCHETYPES.infantry, { team: 1, x: 1.2, controller: 'none' });
  return { w, p, e };
}

function run(w: World, steps: number, intents: Array<[Fighter, Partial<Intent>]> = []) {
  const seen: string[] = [];
  for (let i = 0; i < steps; i++) {
    for (const [f, it] of intents) f.intent = { ...emptyIntent(), ...(i === 0 ? it : { block: it.block ?? false, moveX: it.moveX ?? 0 }) };
    w.step(DT);
    for (const ev of w.drainEvents()) if (ev.type === 'special') seen.push(ev.move);
    w.hitStop = 0;
  }
  return seen;
}

describe('extended moveset', () => {
  it('shield bash breaks a raised guard and staggers', () => {
    const r = resolveMeleeHit('bash', DAMAGE.bash, { blocking: true, blockAge: 1, facingAttacker: true, invulnerable: false, helmetless: false, poise: 'none', canBlock: true });
    expect(r.outcome).toBe('blockBreak');
    expect(r.stagger).toBe(true);
    expect(r.damage).toBe(DAMAGE.bash);
  });

  it('block + light attack performs a shield bash', () => {
    const { w, p, e } = setup();
    run(w, 3, [[p, { block: true }]]);
    const moves = run(w, 30, [[p, { block: true, light: true }]]);
    expect(moves).toContain('bash');
    expect(e.hp).toBe(e.maxHp - DAMAGE.bash);
    expect(e.action).toBe('stagger');
  });

  it('light attack in the air is a jump slash; heavy in the air plunges into a ground slam', () => {
    const { w, p, e } = setup();
    run(w, 1, [[p, { jump: true }]]);
    run(w, 8);
    expect(p.grounded).toBe(false);
    const moves = run(w, 90, [[p, { heavy: true }]]);
    expect(moves).toEqual(expect.arrayContaining(['plunge', 'slam']));
    expect(e.hp).toBeLessThanOrEqual(e.maxHp - DAMAGE.plunge);
    expect(p.grounded).toBe(true);

    const s2 = setup();
    run(s2.w, 1, [[s2.p, { jump: true }]]);
    run(s2.w, 6);
    expect(run(s2.w, 2, [[s2.p, { light: true }]])).toContain('jumpAttack');
  });

  it('the third light attack in a chain becomes a finisher', () => {
    const { w, p, e } = setup();
    e.x = 20; // out of reach so the chain is not interrupted
    const moves: string[] = [];
    for (let i = 0; i < 90; i++) {
      p.intent = { ...emptyIntent(), light: i % 6 === 0 };
      w.step(DT);
      for (const ev of w.drainEvents()) if (ev.type === 'special') moves.push(ev.move);
    }
    expect(moves).toContain('finisher');
  });

  it('a light attack right after a dodge is a lunge', () => {
    const { w, p } = setup();
    run(w, 1, [[p, { dodge: true, moveX: -1 }]]);
    run(w, 12);
    const moves = run(w, 40, [[p, { light: true }]]);
    expect(moves).toContain('lunge');
  });

  it('a perfect block grants a riposte that doubles the next blow', () => {
    const { w, p, e } = setup();
    p.riposteT = MOVES.riposteWindow;
    p.facing = 1;
    const moves = run(w, 30, [[p, { light: true }]]);
    expect(moves).toContain('riposte');
    expect(e.maxHp - e.hp).toBe(DAMAGE.light * MOVES.riposteMultiplier);
  });
});
