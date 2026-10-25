import type { GameAction } from '@/api/types';
import type { MissionMeta } from '@/missions/catalog';
import { formatKeyCode, useSettingsStore } from '@/core/settings/settings-store';
import { KeyBindingDisplay } from '@/ui';

interface Row {
  action: GameAction;
  label: string;
}

const BASE: Row[] = [
  { action: 'moveLeft', label: 'Move left' },
  { action: 'moveRight', label: 'Move right' },
  { action: 'moveUp', label: 'Jump' },
  { action: 'dodge', label: 'Dodge' },
  { action: 'block', label: 'Block' },
  { action: 'shield', label: 'Energy shield (hold)' },
  { action: 'lightAttack', label: 'Light attack' },
  { action: 'heavyAttack', label: 'Heavy attack' },
];

const ORDERS: Row[] = [
  { action: 'cycleSelection', label: 'Select company' },
  { action: 'orderMove', label: 'Move to cursor' },
  { action: 'orderHold', label: 'Hold position' },
  { action: 'orderRetreat', label: 'Retreat' },
  { action: 'orderCharge', label: 'Charge' },
];

const FLIGHT: Row[] = [
  { action: 'moveUp', label: 'Climb' },
  { action: 'moveDown', label: 'Dive' },
  { action: 'moveLeft', label: 'Slow' },
  { action: 'moveRight', label: 'Fly on' },
  { action: 'dodge', label: 'Evade' },
];

type Bindings = Record<GameAction, string[]>;
const k = (b: Bindings, a: GameAction) => formatKeyCode(b[a][0] ?? '?');

/** Contextual moves built from the basic actions (no extra keys). */
const MOVES: Array<{ name: string; how: (b: Bindings) => string }> = [
  { name: 'Shield bash', how: (b) => `hold ${k(b, 'block')} + ${k(b, 'lightAttack')} — breaks a guard` },
  { name: 'Energy shield', how: (b) => `hold ${k(b, 'shield')} — a bubble that soaks any damage, magic too; breaks when drained` },
  { name: 'Perfect block', how: (b) => `raise ${k(b, 'block')} just before a blow — your next strike is a riposte` },
  { name: 'Jump slash', how: (b) => `${k(b, 'moveUp')} then ${k(b, 'lightAttack')} in the air` },
  { name: 'Plunging strike', how: (b) => `${k(b, 'moveUp')} then ${k(b, 'heavyAttack')} — ground slam hits all nearby` },
  { name: 'Lunge', how: (b) => `${k(b, 'dodge')} then ${k(b, 'lightAttack')}` },
  { name: 'Combo finisher', how: (b) => `${k(b, 'lightAttack')} three times in rhythm` },
];

export function isFlightMission(m: MissionMeta): boolean {
  return /flight|hippogryph/i.test(m.engineLabel);
}

/** Controls relevant to the mission's engine, using the player's current bindings. */
export function ControlsReminder({ mission }: { mission: MissionMeta }) {
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const flight = isFlightMission(mission);
  const sections: Array<{ title: string; rows: Row[] }> = [];
  if (flight) sections.push({ title: 'Hippogryph flight', rows: FLIGHT });
  sections.push({ title: flight ? 'On the ground' : 'Combat', rows: BASE });
  if (mission.engine === 'open-field') sections.push({ title: 'Battle orders', rows: ORDERS });
  if (mission.engine === 'quest' && /tag/i.test(mission.briefing.map((b) => b.speaker ?? '').join(' '))) {
    sections.push({ title: 'Tag team', rows: [{ action: 'interact', label: 'Tag partner' }] });
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="wk-engraved mb-2 text-[0.75rem] text-accent">{s.title}</h3>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5">
            {s.rows.map((r) => (
              <div key={`${s.title}-${r.action}`} className="contents">
                <dt className="text-[0.98rem] text-fg-muted">{r.label}</dt>
                <dd>
                  <KeyBindingDisplay codes={bindings[r.action]} size="sm" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {!flight && (
        <div>
          <h3 className="wk-engraved mb-2 text-[0.75rem] text-accent">Special moves</h3>
          <ul className="grid gap-1 text-[0.95rem] text-fg-muted">
            {MOVES.map((m) => (
              <li key={m.name}>
                <span className="font-heading text-fg">{m.name}</span> — {m.how(bindings)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[0.92rem] text-fg-subtle">
        <kbd className="font-heading font-bold">Esc</kbd> pauses. Rebind keys in Settings.
      </p>
    </div>
  );
}
