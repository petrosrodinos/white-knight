import { describe, expect, it } from 'vitest';
import { DUEL } from '@/core/combat/combat-config';
import { MISSION_CONFIGS } from '@/missions/configs';
import { DuelEngine } from './duel-engine';
import type { DuelConfigInput } from './duel-config';

const DT = 1 / 60;
const init = { difficulty: 'knight' as const, seed: 3, missionLabel: 'test', playerName: 'P' };

function m02(): DuelEngine {
  const cfg = MISSION_CONFIGS.m02;
  if (cfg.engine !== 'duel') throw new Error('m02 is a duel');
  return new DuelEngine(cfg.config as DuelConfigInput, init);
}

describe('duel round pacing', () => {
  it('a mounted round does not flip to the next round within seconds of a big hit', () => {
    const e = m02();
    for (let i = 0; i < 120; i++) e.step(DT); // intro
    expect(e.duel.phase).toBe('fight');
    e.duel.opponent.hp = DUEL.mountedEndHp - 1; // beaten below the threshold at once
    for (let i = 0; i < 60; i++) e.step(DT);
    expect(e.duel.roundIndex).toBe(0);
    expect(e.duel.phase).toBe('fight');
  });

  it('ends once the minimum fighting time has passed and the threshold is crossed', () => {
    const e = m02();
    for (let i = 0; i < 120; i++) e.step(DT);
    e.duel.opponent.hp = DUEL.mountedEndHp - 1;
    for (let i = 0; i < Math.ceil((DUEL.minRoundSeconds + 1) / DT); i++) e.step(DT);
    expect(e.duel.roundIndex === 1 || e.duel.phase === 'round-end').toBe(true);
  });

  it('a killing blow still ends a non-final round immediately', () => {
    const e = m02();
    for (let i = 0; i < 120; i++) e.step(DT);
    e.world.hurt(e.duel.opponent, 1000, false, 0, e.duel.player.id);
    e.step(DT);
    expect(e.duel.phase).toBe('round-end');
    expect(e.duel.opponent.hp).toBe(1);
  });
});
