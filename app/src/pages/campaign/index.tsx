import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '@/components/layout/screen-shell';
import { MissionCard, StatTile, IconFlag, IconStar, IconTrophy, Button, IconRefresh } from '@/ui';
import { MISSIONS, type MissionMeta } from '@/missions/catalog';
import { MissionInfoModal } from './components/mission-info-modal';
import { useProgress } from '@/features/progress/hooks/use-progress';
import { getContinueMissionId, missionEntry, missionStatus } from '@/features/progress/utils/progress.utils';
import { Paths } from '@/routes/paths';
import { formatNumber } from '@/lib/format';

/** Mission select: the 15 missions in a strictly linear grid (locked ones cannot be opened). */
export default function CampaignPage() {
  const navigate = useNavigate();
  const [lockedInfo, setLockedInfo] = useState<MissionMeta | null>(null);
  const { data: progress, isError, refetch, isFetching } = useProgress();
  const continueId = progress ? getContinueMissionId(progress) : null;
  const completed = MISSIONS.filter((m) => missionStatus(progress, m.id) === 'completed').length;
  const total = progress?.missions.reduce((sum, m) => sum + m.bestScore, 0) ?? 0;
  const sRanks = progress?.missions.filter((m) => m.bestRank === 'S').length ?? 0;

  return (
    <ScreenShell title="Campaign" eyebrow="The Chronicle of the White Knight" backTo={Paths.menu} width="xl">
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={<IconFlag size={22} />} label="Missions completed" value={`${completed} / ${MISSIONS.length}`} />
        <StatTile icon={<IconStar size={22} />} label="Campaign score" value={formatNumber(total)} />
        <StatTile icon={<IconTrophy size={22} />} label="S ranks" value={sRanks} />
      </div>
      {isError && !progress && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border-2 border-oxblood-600/70 bg-night-900/80 px-4 py-3 text-danger-fg">
          Your progress could not be loaded. Only the first mission is shown as available.
          <Button size="sm" leadingIcon={<IconRefresh size={16} />} loading={isFetching} onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}
      <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Missions">
        {MISSIONS.map((m, i) => {
          const entry = missionEntry(progress, m.id);
          return (
            <li key={m.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <MissionCard
                className="h-full w-full"
                mission={m}
                status={missionStatus(progress, m.id)}
                bestScore={entry?.bestScore}
                bestTimeMs={entry?.bestTimeMs}
                bestRank={entry?.bestRank}
                isCurrent={m.id === continueId}
                onOpen={() => navigate(m.isTraining ? Paths.training : Paths.briefing(m.id))}
                onLockedOpen={() => setLockedInfo(m)}
              />
            </li>
          );
        })}
      </ol>
      <MissionInfoModal mission={lockedInfo} onClose={() => setLockedInfo(null)} />
    </ScreenShell>
  );
}
