import { input } from '@/core/input/input-manager';
import { nearestEnemy } from '@/core/ai/controllers';
import { isAttacking } from '@/core/sim/fighter';
import { emptyIntent, type Fighter, type Intent } from '@/core/sim/types';
import type { World } from '@/core/sim/world';

/** Translate held/pressed bindings into an Intent for the player fighter (spec §8). */
export function readPlayerIntent(world: World, f: Fighter): Intent {
  const it = emptyIntent();
  const right = input.isHeld('moveRight') ? 1 : 0;
  const left = input.isHeld('moveLeft') ? 1 : 0;
  const up = input.isHeld('moveUp') ? 1 : 0;
  const down = input.isHeld('moveDown') ? 1 : 0;
  it.moveX = right - left;
  it.moveY = up - down;
  // Assumption 1: W jumps on the ground; free vertical flight only on the Hippogryph.
  it.jump = f.mounted !== 'hippogryph' && input.wasPressed('moveUp');
  it.dodge = input.wasPressed('dodge');
  it.block = input.isHeld('block');
  it.shield = input.isHeld('shield');
  it.light = input.wasPressed('lightAttack');
  it.heavy = input.wasPressed('heavyAttack');
  it.interact = input.wasPressed('interact');

  // Assisted facing: attacking without a direction turns toward the nearest foe in range.
  if ((it.light || it.heavy) && it.moveX === 0 && !isAttacking(f)) {
    const foe = nearestEnemy(world, f, 6);
    if (foe) f.facing = foe.x >= f.x ? 1 : -1;
  }
  return it;
}
