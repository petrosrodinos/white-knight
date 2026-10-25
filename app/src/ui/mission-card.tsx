import type { MissionStatus, Rank } from '@/api/types';
import type { MissionMeta } from '@/missions/catalog';
import { formatDuration, formatNumber, toRoman } from '@/lib/format';
import { cn } from './cn';
import { ArtImage } from './art-image';
import { IconCheck, IconClock, IconLock, IconStar } from './icons';
import { uiSound } from './hooks';

const rankStyle: Record<Rank, string> = {
  S: 'from-[#fff1c4] via-[#e0b54d] to-[#8a5f1e] text-[#2b1a05]',
  A: 'from-[#f1f2f4] via-[#b5b9be] to-[#5a5e64] text-[#1b1c1e]',
  B: 'from-[#f0c8a0] via-[#b07a46] to-[#5a3a1d] text-[#1d1209]',
  C: 'from-[#c7cbbf] via-[#7d8574] to-[#3b4136] text-[#0f120d]',
  D: 'from-[#c99a90] via-[#7f4a42] to-[#3a1f1b] text-[#fbeede]',
};

/** Engraved rank medallion (S/A/B/C/D). */
export function RankBadge({ rank, size = 'md', className }: { rank: Rank; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'sm' ? 'size-7 text-sm' : size === 'lg' ? 'size-16 text-3xl' : 'size-10 text-lg';
  return (
    <span
      role="img"
      aria-label={`Rank ${rank}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#120c06] bg-gradient-to-b font-heading font-black shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_2px_4px_rgb(0_0_0/0.6)]',
        rankStyle[rank],
        s,
        className,
      )}
    >
      {rank}
    </span>
  );
}

export interface MissionCardProps {
  mission: MissionMeta;
  status: MissionStatus;
  bestScore?: number;
  bestTimeMs?: number | null;
  bestRank?: Rank | null;
  /** Marks the Continue target. */
  isCurrent?: boolean;
  onOpen?: () => void;
  /** Called when a locked card is clicked (shows its info instead of opening it). */
  onLockedOpen?: () => void;
  className?: string;
}

/**
 * Campaign mission tile with illustration, numeral, engine label and best result.
 * Locked missions explain how to unlock and, when `onLockedOpen` is given, open an info modal on click.
 */
export function MissionCard({ mission, status, bestScore = 0, bestTimeMs = null, bestRank = null, isCurrent, onOpen, onLockedOpen, className }: MissionCardProps) {
  const locked = status === 'locked';
  const completed = status === 'completed';
  const lockHint = mission.number > 1 ? `Complete Mission ${mission.number - 1} to unlock` : 'Locked';
  return (
    <button
      type="button"
      aria-haspopup={locked && onLockedOpen ? 'dialog' : undefined}
      aria-label={
        locked
          ? `Mission ${mission.number}: ${mission.title}. Locked. ${lockHint}.${onLockedOpen ? ' Press to read its briefing.' : ''}`
          : `Mission ${mission.number}: ${mission.title}. ${completed ? `Completed${bestRank ? `, rank ${bestRank}` : ''}, best score ${formatNumber(bestScore)}.` : status === 'in_progress' ? 'In progress.' : 'Available.'}`
      }
      onMouseEnter={() => !locked && uiSound('ui-hover')}
      onClick={() => {
        if (locked) {
          uiSound(onLockedOpen ? 'page-turn' : 'ui-error');
          onLockedOpen?.();
          return;
        }
        uiSound('page-turn');
        onOpen?.();
      }}
      className={cn(
        'wk-frame group flex flex-col overflow-hidden !p-0 text-left transition-[transform,filter] duration-200 ease-[var(--ease-weighty)]',
        completed ? 'wk-frame--bronze' : '',
        isCurrent && !locked && 'wk-frame--bronze ring-2 ring-bronze-300/60 ring-offset-2 ring-offset-night-950',
        locked ? (onLockedOpen ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed') : 'hover:-translate-y-1 hover:brightness-110',
        className,
      )}
    >
      <div className="relative aspect-[3/2] w-full">
        <ArtImage
          src={mission.illustration}
          alt=""
          fallback={mission.engine === 'open-field' ? 'forest' : mission.engine === 'duel' ? 'ember' : 'dusk'}
          className="!absolute inset-0"
          imgClassName="transition-transform duration-500 group-hover:scale-[1.04]"
          dimmed={locked}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(11_9_8/0.1)_30%,rgb(11_9_8/0.92)_100%)]" />
        <span aria-hidden="true" className="wk-gilded absolute left-3 top-2 text-3xl font-black">
          {toRoman(mission.number)}
        </span>
        {isCurrent && !locked && (
          <span className="absolute right-2 top-2 rounded-[3px] border border-bronze-300/70 bg-night-900/85 px-2 py-0.5 font-heading text-[0.65rem] font-bold uppercase tracking-[0.14em] text-accent-strong">
            Continue
          </span>
        )}
        {completed && bestRank && <RankBadge rank={bestRank} size="sm" className="absolute right-2 top-2" />}
        {locked && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-iron-600 bg-night-900/85 text-iron-300 shadow-[0_4px_12px_rgb(0_0_0/0.7)]">
              <IconLock size={28} />
            </span>
          </span>
        )}
        <p className="absolute bottom-2 left-3 right-3 font-heading text-[0.7rem] font-bold uppercase tracking-[0.14em] text-fg-muted">{mission.engineLabel}</p>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3.5 pt-2.5">
        <h3 className={cn('font-heading text-[1.02rem] font-bold leading-tight', locked ? 'text-fg-subtle' : 'text-parchment-50')}>{mission.title}</h3>
        {locked ? (
          <p className="flex items-center gap-1.5 text-[0.92rem] text-fg-subtle">
            <IconLock size={14} /> {lockHint}
          </p>
        ) : completed ? (
          <div className="mt-auto flex items-center gap-3 text-[0.92rem] text-fg-muted">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <IconStar size={15} className="text-accent" /> {formatNumber(bestScore)}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <IconClock size={15} className="text-accent" /> {formatDuration(bestTimeMs)}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-success-fg">
              <IconCheck size={15} /> Done
            </span>
          </div>
        ) : (
          <p className="line-clamp-2 text-[0.95rem] leading-snug text-fg-muted">{mission.synopsis}</p>
        )}
      </div>
    </button>
  );
}
