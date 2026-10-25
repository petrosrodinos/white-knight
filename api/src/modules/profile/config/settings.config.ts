import { DifficultyId } from '@/shared/constants/game.constants';

export const GAME_ACTIONS = [
  'moveLeft',
  'moveRight',
  'moveUp',
  'moveDown',
  'dodge',
  'block',
  'shield',
  'interact',
  'lightAttack',
  'heavyAttack',
  'orderMove',
  'orderHold',
  'orderRetreat',
  'orderCharge',
  'cycleSelection',
] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

export type KeyBindings = Record<GameAction, string[]>;

export const MAX_CODES_PER_ACTION = 4;

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `Key${l}`);
const digits = Array.from({ length: 10 }, (_, i) => `Digit${i}`);
const numpad = [
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
  'NumpadEnter',
];
const functionKeys = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);

/**
 * Remappable input codes: `KeyboardEvent.code` values plus mouse buttons.
 * `Escape` is reserved for pause and is intentionally not allowed.
 */
export const ALLOWED_INPUT_CODES: ReadonlySet<string> = new Set([
  ...letters,
  ...digits,
  ...numpad,
  ...functionKeys,
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'Tab',
  'Enter',
  'Backspace',
  'CapsLock',
  'Backquote',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Insert',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Mouse0',
  'Mouse1',
  'Mouse2',
]);

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveUp: ['KeyW'],
  moveLeft: ['KeyA'],
  moveDown: ['KeyS'],
  moveRight: ['KeyD'],
  dodge: ['Space'],
  block: ['ShiftLeft', 'ShiftRight'],
  shield: ['KeyC'],
  interact: ['KeyE'],
  lightAttack: ['Mouse0'],
  heavyAttack: ['Mouse2'],
  orderMove: ['KeyQ'],
  orderHold: ['KeyR'],
  orderRetreat: ['KeyF'],
  orderCharge: ['Mouse1'],
  cycleSelection: ['Tab'],
};

export interface GameSettingsValues {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
  screenShake: boolean;
  showFps: boolean;
  difficulty: DifficultyId;
  keyBindings: KeyBindings;
}

/** Defaults applied at registration (must match the Prisma column defaults). */
export const DEFAULT_SETTINGS: GameSettingsValues = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  reducedMotion: false,
  screenShake: true,
  showFps: false,
  difficulty: 'knight',
  keyBindings: DEFAULT_KEY_BINDINGS,
};
