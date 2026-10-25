import type { MissionMeta } from '@/missions/catalog';
import { toRoman } from '@/lib/format';
import { ArtImage, Button, IconLock, Modal } from '@/ui';
import { ControlsReminder } from './controls-reminder';

interface Props {
  mission: MissionMeta | null;
  onClose: () => void;
}

/** Everything the briefing page shows (story, objective, lands, controls), as a read-only modal for locked missions. */
export function MissionInfoModal({ mission, onClose }: Props) {
  if (!mission) return null;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${toRoman(mission.number)} · ${mission.title}`}
      description={mission.engineLabel}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-2 rounded-[4px] border border-iron-600 bg-night-900/70 px-3 py-2 text-fg-muted">
          <IconLock size={18} className="shrink-0 text-iron-300" />
          {mission.number > 1 ? `Sealed — complete Mission ${toRoman(mission.number - 1)} to unlock it. The campaign must be played in order.` : 'Sealed.'}
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <ArtImage src={mission.illustration} alt={`Illustration: ${mission.synopsis}`} fallback={mission.engine === 'open-field' ? 'forest' : 'dusk'} className="aspect-[3/2] w-full rounded-[4px]" />
            <section aria-labelledby="mi-story">
              <h3 id="mi-story" className="wk-engraved mb-2 text-[0.8rem] text-accent">
                Story
              </h3>
              <div className="flex flex-col gap-2.5 rounded-[4px] bg-parchment-100/90 px-4 py-3 text-ink">
                {mission.briefing.map((l, i) => (
                  <p key={i} className={l.speaker ? '' : 'italic'}>
                    {l.speaker && <strong className="font-heading text-oxblood-700">{l.speaker}: </strong>}
                    {l.text}
                  </p>
                ))}
              </div>
            </section>
          </div>
          <div className="flex flex-col gap-4">
            <section aria-labelledby="mi-objective">
              <h3 id="mi-objective" className="wk-engraved mb-2 text-[0.8rem] text-accent">
                Objective
              </h3>
              <p className="text-lg leading-snug text-parchment-50">{mission.objective}</p>
            </section>
            <section aria-labelledby="mi-lands">
              <h3 id="mi-lands" className="wk-engraved mb-1.5 text-[0.8rem] text-accent">
                Lands
              </h3>
              <ul className="flex flex-wrap gap-2">
                {mission.environments.map((env, i) => (
                  <li key={env} className="rounded-[3px] border border-[#3a2f22] bg-night-900/70 px-2.5 py-0.5 text-[0.95rem] text-fg-muted">
                    <span className="mr-1 font-heading text-[0.75rem] text-accent">{i + 1}.</span>
                    {env}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="mi-controls">
              <h3 id="mi-controls" className="wk-engraved mb-2 text-[0.8rem] text-accent">
                Controls
              </h3>
              <ControlsReminder mission={mission} />
            </section>
          </div>
        </div>
      </div>
    </Modal>
  );
}
