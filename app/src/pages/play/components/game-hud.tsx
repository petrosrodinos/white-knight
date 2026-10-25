import { useEffect, useRef } from 'react';
import type { GameEngine, HudSnapshot } from '@/core/engine/engine-types';
import { useCalloutStore, useHudStore } from '@/core/hud/hud-store';
import { formatKeyCode, useSettingsStore } from '@/core/settings/settings-store';
import { OpenFieldEngine } from '@/engines/open-field/open-field-engine';
import { useSessionStore } from '@/stores/session-store';
import { BossHealthBar, Button, HudBanner, KeyCap, HudCorner, HudLabel, HudLayer, HudName, HudStat, IconGear, IconSkull, IconSword, IconShield, ManaBar, SegmentedHealthBar, cn } from '@/ui';

const ORDER_LABEL: Record<string, string> = { advance: 'Follow', move: 'Move', hold: 'Hold', retreat: 'Retreat', charge: 'Charge' };

function Lives({ lives, max }: { lives: number; max: number }) {
  if (max <= 1) return null;
  return (
    <div className="flex items-center gap-1" aria-label={`${lives} of ${max} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <IconShield key={i} className={cn('size-4 sm:size-5', i < lives ? 'text-bronze-300 drop-shadow' : 'text-iron-700 opacity-50')} aria-hidden />
      ))}
    </div>
  );
}

/** Energy-shield meter: cyan while ready, pulsing while up, amber + "Rebooting" when broken. */
function ShieldMeter({ shield }: { shield: NonNullable<HudSnapshot['shield']> }) {
  const key = useSettingsStore((s) => s.settings.keyBindings.shield[0]);
  const pct = Math.max(0, Math.min(1, shield.energy / shield.max)) * 100;
  return (
    <div className="flex w-full max-w-[220px] items-center gap-2" aria-label={`Energy shield ${Math.round(pct)} percent${shield.broken ? ', rebooting' : ''}`}>
      <IconShield className={cn('size-4 shrink-0', shield.broken ? 'text-oxblood-300' : 'text-[#8fdcff]')} aria-hidden />
      <div className={cn('h-2 flex-1 overflow-hidden rounded-full border border-[#0b0807] bg-night-900/70', shield.active && 'motion-safe:animate-pulse-soft')}>
        <div className={cn('h-full transition-[width] duration-150', shield.broken ? 'bg-[#e0a040]' : 'bg-[linear-gradient(90deg,#3d8fc4,#8fdcff)]')} style={{ width: `${pct}%` }} />
      </div>
      <HudLabel>{shield.broken ? 'Rebooting' : key ? formatKeyCode(key) : ''}</HudLabel>
    </div>
  );
}

/** Live controls corner: only the keys usable in the current state, using the player's bindings. */
function ControlsCorner({ controls }: { controls: HudSnapshot['controls'] }) {
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  if (controls.length === 0) return null;
  return (
    <HudCorner position="bottom-right" scrim className="max-w-[26vw]" aria-label="Controls">
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        {controls.map((c) => (
          <div key={c.label} className="contents">
            <dt className="wk-hud-label text-right">{c.label}</dt>
            <dd className="flex gap-1">
              {c.actions.map((a) => (bindings[a][0] ? <KeyCap key={a} code={bindings[a][0]} size="sm" /> : null))}
            </dd>
          </div>
        ))}
      </dl>
    </HudCorner>
  );
}

function Minimap({ engine }: { engine: OpenFieldEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = ref.current;
      const g = c?.getContext('2d');
      if (c && g) {
        const { width, units } = engine.minimap();
        g.clearRect(0, 0, c.width, c.height);
        g.fillStyle = 'rgba(12,9,7,0.6)';
        g.fillRect(0, 0, c.width, c.height);
        for (const u of units) {
          const x = (u.x / width) * c.width;
          if (u.kind === 'player') {
            g.fillStyle = '#ffe9a8';
            g.fillRect(x - 3, 2, 6, c.height - 4);
          } else if (u.kind === 'commander') {
            g.fillStyle = u.team === 0 ? '#9fc1ff' : '#ff6a4a';
            g.beginPath();
            g.arc(x, c.height / 2, 4, 0, Math.PI * 2);
            g.fill();
          } else {
            g.fillStyle = u.team === 0 ? (u.selected ? '#d8ecff' : '#6f93c8') : '#b8473a';
            g.fillRect(x - 1, u.team === 0 ? 5 : c.height - 9, 2, 4);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);
  return <canvas ref={ref} width={320} height={22} className="h-[22px] w-[min(320px,40vw)] rounded-[3px] border border-iron-600/70" aria-label="Battlefield minimap" />;
}

/** Brief callout when the player lands a special move. */
function MoveCallout() {
  const text = useCalloutStore((s) => s.text);
  const id = useCalloutStore((s) => s.id);
  if (!text) return null;
  return (
    <div key={id} className="absolute left-1/2 top-[44%] -translate-x-1/2 animate-slam-in font-display text-xl text-bronze-200 drop-shadow-[0_2px_3px_rgb(0_0_0/0.9)] sm:text-2xl" aria-live="polite">
      {text}
    </div>
  );
}

function Squads({ hud }: { hud: HudSnapshot }) {
  const tabKey = useSettingsStore((s) => s.settings.keyBindings.cycleSelection[0]);
  if (!hud.squads) return null;
  return (
    <div className="flex flex-col gap-1" aria-label="Your companies">
      {hud.squads.map((s) => (
        <div key={s.id} className={cn('flex items-center gap-2 rounded-[3px] px-2 py-0.5 text-[0.72rem] sm:text-xs', s.selected ? 'bg-bronze-700/80 text-parchment-50 ring-1 ring-bronze-300' : 'bg-night-900/55 text-parchment-200', s.alive === 0 && 'opacity-40 line-through')}>
          <span className="wk-hud-numeral w-10 tabular-nums">
            {s.alive}/{s.total}
          </span>
          <span className="truncate">{s.name}</span>
          <span className="ml-auto text-[0.65rem] uppercase tracking-wider text-parchment-300">{ORDER_LABEL[s.order]}</span>
        </div>
      ))}
      <HudLabel>{formatKeyCode(tabKey ?? 'Tab')}: select company</HudLabel>
    </div>
  );
}

export function GameHud({ engine, onPause, showControls = true }: { engine: GameEngine; onPause: () => void; showControls?: boolean }) {
  const hud = useHudStore((s) => s.hud);
  const fps = useHudStore((s) => s.fps);
  const showFps = useSettingsStore((s) => s.settings.showFps);
  const level = useSessionStore((s) => s.me?.profile.level ?? 1);
  if (!hud) return null;

  return (
    <HudLayer>
      {/* Top band (spec §5: top 20% of the screen holds the interface). */}
      <HudCorner position="top-left" scrim>
        <HudName>{hud.playerName}</HudName>
        <SegmentedHealthBar current={hud.player.hp} max={hud.player.maxHp} segments={hud.player.segments} tone="health" size="md" label={`${hud.playerName} health`} />
        {hud.shield && <ShieldMeter shield={hud.shield} />}
        <div className="flex items-center gap-3">
          <Lives lives={hud.lives} max={hud.maxLives} />
          {hud.enemiesRemaining !== null && <HudStat label="Enemies" value={hud.enemiesRemaining} icon={<IconSkull className="size-4" aria-hidden />} />}
        </div>
        {hud.allies.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {hud.allies
              .filter((a) => !a.active)
              .map((a) => (
                <div key={a.name} className="flex items-center gap-2">
                  <HudLabel>
                    {a.escort ? 'Escort · ' : ''}
                    {a.name}
                  </HudLabel>
                  <SegmentedHealthBar current={a.hp} max={a.maxHp} segments={a.segments} tone="ally" size="sm" label={`${a.name} health`} />
                </div>
              ))}
          </div>
        )}
        {hud.stunned && <span className="animate-pulse-soft font-display text-sm text-[#ffe066]">Stunned!</span>}
      </HudCorner>

      <HudCorner position="top-center" className="w-[min(560px,46vw)] max-w-none">
        <HudStat label="Kills" value={hud.kills} large icon={<IconSword className="size-5" aria-hidden />} />
        {hud.boss && (
          <div className="mt-1 flex w-full flex-col items-stretch gap-1">
            <BossHealthBar name={hud.boss.name} current={hud.boss.hp} max={hud.boss.maxHp} subtitle={hud.boss.caption ?? hud.objective} />
            {hud.boss.mana !== undefined && hud.boss.maxMana !== undefined && <ManaBar current={hud.boss.mana} max={hud.boss.maxMana} size="md" />}
          </div>
        )}
        {hud.commanders && (
          <HudLabel>
            Enemy commanders: {hud.commanders.remaining}/{hud.commanders.total}
          </HudLabel>
        )}
      </HudCorner>

      <HudCorner position="top-right" scrim interactive>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <HudName>{hud.missionLabel}</HudName>
            <HudLabel>{hud.stageLabel}</HudLabel>
            <HudLabel>Level {level}</HudLabel>
          </div>
          <Button variant="icon" size="sm" aria-label="Pause" onClick={onPause} clickSound="ui-click">
            <IconGear className="size-5" aria-hidden />
          </Button>
        </div>
        {hud.opponent && (
          <div className="mt-1 flex flex-col items-end gap-1">
            <HudName>{hud.opponent.name}</HudName>
            <SegmentedHealthBar current={hud.opponent.hp} max={hud.opponent.maxHp} segments={hud.opponent.segments} tone="enemy" size="md" label={`${hud.opponent.name} health`} />
          </div>
        )}
        {showFps && <HudLabel>{fps} FPS</HudLabel>}
      </HudCorner>

      {showControls && <ControlsCorner controls={hud.controls} />}
      <MoveCallout />
      {hud.banner && (
        <div key={hud.banner.id} className="absolute left-1/2 top-[30%] -translate-x-1/2 animate-slam-in" role="status" aria-live="polite">
          <HudBanner sub={hud.banner.subtitle}>{hud.banner.title}</HudBanner>
        </div>
      )}

      {(hud.prompt || hud.objective) && !hud.boss && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-center">
          {hud.prompt && <div className="font-display text-base text-parchment-50 drop-shadow-[0_2px_2px_rgb(0_0_0/0.9)] sm:text-lg">{hud.prompt}</div>}
          {!hud.prompt && <HudLabel>{hud.objective}</HudLabel>}
        </div>
      )}
      {hud.boss && hud.prompt && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 font-display text-base text-parchment-50 drop-shadow-[0_2px_2px_rgb(0_0_0/0.9)]">{hud.prompt}</div>
      )}

      {hud.progress !== null && (
        <div className="absolute bottom-[calc(3.2rem+env(safe-area-inset-bottom))] left-1/2 w-[min(420px,50vw)] -translate-x-1/2" aria-label="Journey progress">
          <div className="h-2 overflow-hidden rounded-full border border-iron-600 bg-night-900/70">
            <div className="h-full bg-[linear-gradient(90deg,#a8773d,#e3c27a)]" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </div>
        </div>
      )}

      {engine instanceof OpenFieldEngine && (
        <>
          <HudCorner position="bottom-left" className="max-w-[44vw] sm:max-w-[30vw]">
            <Squads hud={hud} />
          </HudCorner>
          <div className="absolute bottom-[calc(3.2rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2">
            <Minimap engine={engine} />
          </div>
        </>
      )}
      {hud.lowHealth && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgb(160_20_20/0.45)] motion-safe:animate-pulse-soft" aria-hidden />}
    </HudLayer>
  );
}
