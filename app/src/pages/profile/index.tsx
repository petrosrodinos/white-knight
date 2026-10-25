import { ScreenShell } from '@/components/layout/screen-shell';
import { CharacterPortrait } from '@/components/character/character-portrait';
import { IconCheck, IconClock, IconCrown, IconShield, IconStar, LevelBadge, Panel, PanelHeader, RankBadge, StatTile, XpBar } from '@/ui';
import { CHARACTER_IDS, type CharacterId } from '@/content/ids';
import { MISSIONS } from '@/missions/catalog';
import { useMe, useMeQuery } from '@/features/me/hooks/use-me';
import { useProgress } from '@/features/progress/hooks/use-progress';
import { missionEntry, missionStatus } from '@/features/progress/utils/progress.utils';
import { getCharacterUnlockDescription } from '@/config/constants/dropdowns/characters/character-unlock-description.options';
import { Paths } from '@/routes/paths';
import { formatDuration, formatNumber, toRoman } from '@/lib/format';

/** Profile: identity, level/XP, points, per-mission bests and the fighter roster. */
export default function ProfilePage() {
  useMeQuery();
  const me = useMe();
  const { data: progress } = useProgress();
  if (!me) return null;

  const unlocked = new Set<CharacterId>([...me.unlockedCharacters, ...(progress?.unlockedCharacters ?? [])]);
  const completed = MISSIONS.filter((m) => missionStatus(progress, m.id) === 'completed').length;
  const joined = new Date(me.createdAt);

  return (
    <ScreenShell title="Profile" eyebrow="Knight’s Ledger" backTo={Paths.menu} backLabel="Menu" width="xl">
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel metal="bronze" padding="lg" className="flex flex-col items-center text-center">
            <LevelBadge level={me.profile.level} size="lg" />
            <h2 className="mt-3 font-heading text-2xl font-bold text-parchment-50">{me.username}</h2>
            <p className="italic text-accent-strong">{me.profile.title}</p>
            <XpBar className="mt-4" xpIntoLevel={me.profile.xpIntoLevel} xpForNextLevel={me.profile.xpForNextLevel} level={me.profile.level} />
            <hr className="wk-divider my-5 w-full" />
            <dl className="w-full space-y-2 text-left">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-muted">Email</dt>
                <dd className="truncate text-parchment-100">{me.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-muted">Sworn in</dt>
                <dd className="text-parchment-100">{joined.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              </div>
            </dl>
          </Panel>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-1">
            <StatTile icon={<IconCrown size={22} />} label="Total points" value={formatNumber(me.profile.totalPoints)} />
            <StatTile icon={<IconStar size={22} />} label="Experience" value={formatNumber(me.profile.xp)} sub={`Level ${me.profile.level}`} />
            <StatTile icon={<IconShield size={22} />} label="Missions completed" value={`${completed} / ${MISSIONS.length}`} />
            <StatTile icon={<IconCheck size={22} />} label="Fighters" value={`${unlocked.size} / ${CHARACTER_IDS.length}`} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <Panel padding="md">
            <PanelHeader title="Mission records" eyebrow="Best results" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[1rem]">
                <caption className="sr-only">Best result per mission</caption>
                <thead>
                  <tr className="border-b-2 border-[#3a2f22] text-left font-heading text-[0.7rem] uppercase tracking-[0.16em] text-fg-subtle">
                    <th scope="col" className="py-2 pr-3">Mission</th>
                    <th scope="col" className="hidden py-2 pr-3 text-center sm:table-cell">Rank</th>
                    <th scope="col" className="py-2 pr-3 text-right">Best score</th>
                    <th scope="col" className="py-2 pr-3 text-right">Best time</th>
                    <th scope="col" className="hidden py-2 text-right sm:table-cell">Clears</th>
                  </tr>
                </thead>
                <tbody>
                  {MISSIONS.map((m) => {
                    const e = missionEntry(progress, m.id);
                    const status = missionStatus(progress, m.id);
                    const done = !!e && e.completions > 0;
                    return (
                      <tr key={m.id} className="border-b border-[#2a221a] last:border-b-0">
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          <span className="mr-2 inline-block w-7 font-heading sm:w-8 text-[0.85rem] font-bold text-accent">{toRoman(m.number)}</span>
                          <span className={status === 'locked' ? 'text-fg-subtle' : 'text-parchment-100'}>{m.title}</span>
                        </th>
                        <td className="hidden py-2 pr-3 text-center sm:table-cell">{e?.bestRank ? <RankBadge rank={e.bestRank} size="sm" /> : <span className="text-fg-subtle">—</span>}</td>
                        <td className="py-2 pr-3 text-right font-heading tabular-nums">{done ? formatNumber(e.bestScore) : <span className="text-fg-subtle">—</span>}</td>
                        <td className="py-2 pr-3 text-right font-heading tabular-nums">
                          {done ? (
                            <span className="inline-flex items-center gap-1"><IconClock size={14} className="text-accent" />{formatDuration(e.bestTimeMs)}</span>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                        <td className="hidden py-2 text-right font-heading tabular-nums text-fg-muted sm:table-cell">{e?.completions ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel padding="md">
            <PanelHeader title="Fighters" eyebrow={`${unlocked.size} of ${CHARACTER_IDS.length} recruited`} />
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-3">
              {CHARACTER_IDS.map((id) => {
                const isLocked = !unlocked.has(id);
                return (
                  <li key={id}>
                    <CharacterPortrait id={id} locked={isLocked} lockHint={getCharacterUnlockDescription(id)} size="sm" />
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </ScreenShell>
  );
}
