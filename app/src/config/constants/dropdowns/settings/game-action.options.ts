import type { GameAction } from '@/api/types';

export interface GameActionOption {
  id: GameAction;
  label: string;
  group: 'Movement' | 'Combat' | 'Battle orders';
}

/** Display names for every remappable action, grouped for the key-binding table. */
export const GameActionOptions: GameActionOption[] = [
  { id: 'moveUp', label: 'Move up / Jump / Climb', group: 'Movement' },
  { id: 'moveLeft', label: 'Move left', group: 'Movement' },
  { id: 'moveDown', label: 'Move down / Dive', group: 'Movement' },
  { id: 'moveRight', label: 'Move right', group: 'Movement' },
  { id: 'dodge', label: 'Dodge', group: 'Movement' },
  { id: 'interact', label: 'Interact / Tag partner', group: 'Movement' },
  { id: 'lightAttack', label: 'Light attack', group: 'Combat' },
  { id: 'heavyAttack', label: 'Heavy attack', group: 'Combat' },
  { id: 'block', label: 'Block / Shield', group: 'Combat' },
  { id: 'shield', label: 'Energy shield (hold)', group: 'Combat' },
  { id: 'orderMove', label: 'Order: move to cursor', group: 'Battle orders' },
  { id: 'orderHold', label: 'Order: hold position', group: 'Battle orders' },
  { id: 'orderRetreat', label: 'Order: retreat', group: 'Battle orders' },
  { id: 'orderCharge', label: 'Order: charge', group: 'Battle orders' },
  { id: 'cycleSelection', label: 'Cycle unit selection', group: 'Battle orders' },
];

export function getGameActionLabel(a: GameAction): string {
  return GameActionOptions.find((o) => o.id === a)?.label ?? a;
}
