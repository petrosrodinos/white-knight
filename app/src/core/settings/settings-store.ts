import { create } from 'zustand';
import type { GameAction, GameSettings, KeyBindings } from '@/api/types';

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

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  reducedMotion: false,
  screenShake: true,
  showFps: false,
  difficulty: 'knight',
  keyBindings: DEFAULT_KEY_BINDINGS,
};

/** Codes that can never be bound (reserved for pause / browser). */
export const RESERVED_CODES = ['Escape', 'F5', 'F11', 'F12'];

const STORAGE_KEY = 'wk.settings.v1';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function loadLocal(): GameSettings {
  const base: GameSettings = { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...base,
      ...parsed,
      keyBindings: { ...DEFAULT_KEY_BINDINGS, ...(parsed.keyBindings ?? {}) },
    };
  } catch {
    return base;
  }
}

function saveLocal(settings: GameSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode) — settings still live in memory
  }
}

interface SettingsState {
  settings: GameSettings;
  /** Merge a partial update (local only — callers sync to the server via PATCH /me/settings). */
  update: (patch: Partial<GameSettings>) => void;
  /** Replace with server copy (e.g. after login / GET /me). */
  hydrate: (settings: GameSettings) => void;
  bind: (action: GameAction, codes: string[]) => void;
  resetBindings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadLocal(),
  update: (patch) => {
    const next = { ...get().settings, ...patch };
    saveLocal(next);
    set({ settings: next });
  },
  hydrate: (settings) => {
    const next = { ...settings, keyBindings: { ...DEFAULT_KEY_BINDINGS, ...settings.keyBindings } };
    saveLocal(next);
    set({ settings: next });
  },
  bind: (action, codes) => {
    const keyBindings = { ...get().settings.keyBindings };
    // A code may only drive one action: remove it from others.
    for (const other of Object.keys(keyBindings) as GameAction[]) {
      if (other !== action) keyBindings[other] = keyBindings[other].filter((c) => !codes.includes(c));
    }
    keyBindings[action] = codes;
    get().update({ keyBindings });
  },
  resetBindings: () => get().update({ keyBindings: DEFAULT_KEY_BINDINGS }),
}));

/** Non-React accessor for the game loop. */
export const getSettings = () => useSettingsStore.getState().settings;

/** Human-readable label for a key code, e.g. 'KeyW' → 'W', 'Mouse0' → 'LMB'. */
export function formatKeyCode(code: string): string {
  const map: Record<string, string> = {
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', Enter: 'Enter',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
