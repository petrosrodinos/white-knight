import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { GameAction } from '@/api/types';
import type { EngineKind } from '@/content/ids';
import { useHudStore } from '@/core/hud/hud-store';
import { input } from '@/core/input/input-manager';
import { useTouchSettingsStore } from '@/stores/touch-settings-store';
import { cn } from '@/ui';

const SIZE = { small: 52, medium: 64, large: 78 } as const;

/** A button that holds a game action while pressed (pointer capture keeps it held while sliding). */
function ActionButton({ action, label, sub, size, className, tone = 'iron' }: { action: GameAction; label: ReactNode; sub?: string; size: number; className?: string; tone?: 'iron' | 'oxblood' | 'bronze' | 'forest' }) {
  const [down, setDown] = useState(false);
  const press = (e: RPointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDown(true);
    input.setVirtual(action, true);
  };
  const release = () => {
    setDown(false);
    input.setVirtual(action, false);
  };
  useEffect(() => () => input.setVirtual(action, false), [action]);
  const toneCls = {
    iron: 'from-iron-500 to-iron-800 border-iron-300/60',
    oxblood: 'from-oxblood-400 to-oxblood-800 border-oxblood-300/60',
    bronze: 'from-bronze-400 to-bronze-700 border-bronze-200/60',
    forest: 'from-forest-400 to-forest-700 border-forest-300/60',
  }[tone];
  return (
    <button
      type="button"
      aria-label={typeof label === 'string' ? label : sub ?? action}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: size, height: size }}
      className={cn(
        'pointer-events-auto flex select-none flex-col items-center justify-center rounded-full border-2 bg-gradient-to-b font-display text-parchment-50 shadow-[0_4px_10px_rgb(0_0_0/0.6)] [touch-action:none]',
        toneCls,
        down && 'scale-95 brightness-125',
        className,
      )}
    >
      <span className="text-[0.8rem] leading-none">{label}</span>
      {sub && <span className="mt-0.5 text-[0.55rem] uppercase tracking-wider text-parchment-200">{sub}</span>}
    </button>
  );
}

/** Virtual stick mapped onto the digital move actions (left/right/up/down). */
function Stick({ size }: { size: number }) {
  const base = size * 2.1;
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const apply = (dx: number, dy: number) => {
    const r = base / 2;
    const len = Math.hypot(dx, dy);
    const k = len > r ? r / len : 1;
    setKnob({ x: dx * k, y: dy * k });
    const t = r * 0.35;
    input.setVirtual('moveLeft', dx < -t);
    input.setVirtual('moveRight', dx > t);
    input.setVirtual('moveUp', dy < -t * 1.4);
    input.setVirtual('moveDown', dy > t * 1.4);
  };
  const center = () => {
    const r = ref.current!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const end = () => {
    active.current = null;
    apply(0, 0);
  };
  useEffect(
    () => () => {
      for (const a of ['moveLeft', 'moveRight', 'moveUp', 'moveDown'] as const) input.setVirtual(a, false);
    },
    [],
  );
  return (
    <div
      ref={ref}
      role="presentation"
      onPointerDown={(e) => {
        e.preventDefault();
        active.current = e.pointerId;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        const c = center();
        apply(e.clientX - c.x, e.clientY - c.y);
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        const c = center();
        apply(e.clientX - c.x, e.clientY - c.y);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ width: base, height: base }}
      className="pointer-events-auto relative rounded-full border-2 border-iron-400/50 bg-night-900/45 [touch-action:none]"
      aria-label="Movement stick"
    >
      <div
        className="absolute left-1/2 top-1/2 rounded-full border-2 border-parchment-200/70 bg-gradient-to-b from-iron-400 to-iron-700 shadow-lg"
        style={{ width: size * 0.95, height: size * 0.95, transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

/** On-screen controls for phones and tablets. Mirrors the keyboard/mouse actions of spec §8. */
export function TouchControls({ engineKind, flight }: { engineKind: EngineKind; flight: boolean }) {
  const touch = useTouchSettingsStore((s) => s.touch);
  const hp = useHudStore((s) => s.hud?.player.hp ?? 0);
  const lastHp = useRef(hp);
  useEffect(() => {
    if (touch.haptics && hp < lastHp.current && 'vibrate' in navigator) navigator.vibrate?.(hp <= 0 ? 120 : 35);
    lastHp.current = hp;
  }, [hp, touch.haptics]);
  if (!touch.enabled) return null;
  const s = SIZE[touch.size];
  const left = touch.leftHanded;
  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ opacity: touch.opacity }}>
      <div className={cn('absolute bottom-[calc(1rem+env(safe-area-inset-bottom))]', left ? 'right-[calc(1rem+env(safe-area-inset-right))]' : 'left-[calc(1rem+env(safe-area-inset-left))]')}>
        <Stick size={s} />
        <div className="mt-1 text-center font-display text-[0.6rem] uppercase tracking-wider text-parchment-200">{flight ? 'Fly' : 'Move · up = jump'}</div>
      </div>
      <div className={cn('absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] grid grid-cols-3 items-end gap-2', left ? 'left-[calc(1rem+env(safe-area-inset-left))]' : 'right-[calc(1rem+env(safe-area-inset-right))]')}>
        <ActionButton action="block" label="Block" size={s} tone="iron" />
        <ActionButton action="heavyAttack" label="Heavy" size={s * 1.05} tone="oxblood" />
        <ActionButton action="shield" label="Shield" sub="hold" size={s * 0.85} tone="forest" />
        <ActionButton action="dodge" label="Dodge" size={s} tone="forest" />
        <ActionButton action="lightAttack" label="Strike" size={s * 1.3} tone="bronze" />
        <ActionButton action="interact" label="E" sub="Act" size={s * 0.8} tone="iron" />
      </div>
      {engineKind === 'open-field' && (
        <div className="absolute right-[calc(1rem+env(safe-area-inset-right))] top-[24%] flex flex-col gap-2">
          <ActionButton action="cycleSelection" label="Next" sub="Company" size={s * 0.85} />
          <ActionButton action="orderMove" label="Move" sub="tap map" size={s * 0.85} />
          <ActionButton action="orderHold" label="Hold" size={s * 0.85} />
          <ActionButton action="orderRetreat" label="Retreat" size={s * 0.85} />
          <ActionButton action="orderCharge" label="Charge" size={s * 0.85} tone="oxblood" />
        </div>
      )}
    </div>
  );
}
