import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError, isQueued, progressApi, queryKeys, submitMissionResult } from '@/api';
import type { MissionResult } from '@/api/types';
import { CHARACTER_IDS, MISSION_IDS, type CharacterId, type EnvId, type GroundMaterial, type MissionId } from '@/content/ids';
import { audio } from '@/core/audio/audio-manager';
import type { GameEngine, RunOutcome } from '@/core/engine/engine-types';
import { resetHud, useHudStore } from '@/core/hud/hud-store';
import { input } from '@/core/input/input-manager';
import { getSettings } from '@/core/settings/settings-store';
import { useDeviceSupport } from '@/hooks/use-device-support';
import { MISSIONS_BY_ID, nextMissionId } from '@/missions/catalog';
import { createEngine, missionConfig } from '@/missions/create-engine';
import type { MissionConfig } from '@/missions/configs';
import { preloadActorModels } from '@/render/actors/actor-layer';
import { GameCanvas } from '@/render/game-canvas';
import { preloadEnvironment } from '@/render/scene/environment';
import { Paths } from '@/routes/paths';
import { useSessionStore } from '@/stores/session-store';
import { Button, ErrorBoundary, LoadingScreen, Panel, PanelHeader, toast } from '@/ui';
import { RotateDeviceNotice } from '@/ui/rotate-device-notice';
import { GameHud } from './components/game-hud';
import { PauseMenu } from './components/pause-menu';
import { ResultsScreen, type SubmitState } from './components/results-screen';
import { TouchControls } from './components/touch-controls';

type Phase = 'loading' | 'ready' | 'playing' | 'results';

const CORE_SFX = ['swing-light', 'swing-heavy', 'hit-flesh', 'hit-armor', 'block', 'block-break', 'parry', 'dodge', 'whoosh-dodge', 'jump', 'land', 'footstep-grass', 'footstep-stone', 'grunt', 'death', 'shield-raise', 'round-bell', 'victory', 'defeat', 'heal'];

/** Environments and ground materials a mission needs (for preloading behind the loading screen). */
function assetsFor(mc: MissionConfig): { envs: EnvId[]; grounds: GroundMaterial[]; music: string[] } {
  const envs = new Set<EnvId>();
  const grounds = new Set<GroundMaterial>();
  const music = new Set<string>();
  if (mc.engine === 'duel') {
    envs.add(mc.config.arena.env);
    grounds.add(mc.config.arena.ground);
    music.add(mc.config.arena.music ?? 'duel');
    music.add('boss');
  } else if (mc.engine === 'open-field') {
    envs.add(mc.config.env);
    grounds.add(mc.config.ground);
    music.add(mc.config.music ?? 'battle');
  } else {
    music.add(mc.config.music ?? 'battle');
    for (const s of mc.config.slides) {
      if (s.kind === 'boss') {
        envs.add(s.arena.env);
        grounds.add(s.arena.ground);
        music.add('boss');
      } else {
        envs.add(s.env);
        if (s.kind === 'ground') grounds.add(s.ground);
        if (s.music) music.add(s.music);
      }
    }
  }
  return { envs: [...envs], grounds: [...grounds], music: [...music] };
}

function parseTraining(params: URLSearchParams, unlocked: CharacterId[]) {
  const isChar = (v: string | null): v is CharacterId => !!v && (CHARACTER_IDS as readonly string[]).includes(v);
  const p = params.get('player');
  const o = params.get('opponent');
  const player: CharacterId = isChar(p) && unlocked.includes(p) ? p : 'white-knight';
  const opponent: CharacterId = isChar(o) && (o !== 'emperor-knight' || unlocked.includes('emperor-knight')) ? o : 'red-paladin';
  return { player, opponent, mounted: params.get('mounted') === '1' };
}

export default function PlayPage() {
  const { missionId: rawId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useSessionStore((s) => s.me);
  const device = useDeviceSupport();
  const missionId = (MISSION_IDS as readonly string[]).includes(rawId ?? '') ? (rawId as MissionId) : null;
  const meta = missionId ? MISSIONS_BY_ID[missionId] : null;
  // Key on the unlock list's contents (not the session object), so a session refresh mid-bout
  // never rebuilds the training engine and restarts the fight.
  const unlockedKey = (me?.unlockedCharacters ?? ['white-knight']).join(',');
  const searchKey = search.toString();
  const training = useMemo(
    () => (missionId === 'm07' ? parseTraining(new URLSearchParams(searchKey), unlockedKey.split(',') as CharacterId[]) : undefined),
    [missionId, searchKey, unlockedKey],
  );

  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'pending' });
  const runToken = useRef<string | null>(null);
  const objective = useHudStore((s) => s.hud?.objective ?? '');

  // Start a run: auto-save on mission start (server) and fetch a signed run token.
  const startRun = useCallback(async () => {
    if (!missionId) return;
    runToken.current = null;
    try {
      const r = await progressApi.missionStart(missionId);
      runToken.current = r.runToken;
      void queryClient.invalidateQueries({ queryKey: queryKeys.progress });
    } catch (err) {
      if (isApiError(err) && err.status === 403) {
        toast.error('That mission is still locked.');
        navigate(Paths.campaign, { replace: true });
        throw err;
      }
      toast.info('Playing offline — this run will not be scored.');
    }
  }, [missionId, navigate, queryClient]);

  // Loading: preload models, textures and audio behind the loading screen (spec §3.4).
  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;
    const mc = missionConfig(missionId, training);
    const { envs, grounds, music } = assetsFor(mc);
    const tasks: Array<Promise<unknown>> = [preloadActorModels(), preloadEnvironment(envs, grounds), audio.preload(CORE_SFX, music), startRun()];
    let done = 0;
    for (const t of tasks) void t.then(() => !cancelled && setProgress(++done / tasks.length)).catch(() => undefined);
    Promise.all(tasks)
      .then(() => {
        if (!cancelled) setPhase('ready');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [missionId, training, startRun]);

  // Create the engine for each run (restart = new key).
  const loaded = phase !== 'loading';
  const playerName = useRef(me?.username ?? 'Knight');
  const engine = useMemo<GameEngine | null>(
    () => (loaded && missionId ? createEngine(missionId, { difficulty: getSettings().difficulty, playerName: playerName.current, training, seed: 1 + runKey * 7919 + (missionId.charCodeAt(2) << 8) }) : null),
    // runKey forces a fresh engine on restart.
    [loaded, missionId, training, runKey],
  );
  useEffect(() => {
    resetHud();
    // Dev-only handle for automated browser testing.
    if (import.meta.env.DEV) Object.assign(window as object, { __wkEngine: engine, __wkInput: input });
  }, [engine]);

  useEffect(
    () => () => {
      audio.stopAllLoops();
      void audio.playAmbience(null);
      input.reset();
      resetHud();
    },
    [],
  );

  // Auto-pause when the tab is hidden or the window loses focus mid-fight.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') setPaused(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase]);

  const finish = useCallback(async () => {
    if (!engine || !missionId) return;
    const out = engine.outcome();
    if (!out) return;
    setOutcome(out);
    setPhase('results');
    setPaused(false);
    audio.stopAllLoops();
    if (!runToken.current) {
      setSubmit({ kind: 'offline' });
      return;
    }
    setSubmit({ kind: 'pending' });
    const result: MissionResult = {
      runToken: runToken.current,
      outcome: out.outcome,
      durationMs: out.durationMs,
      kills: out.stats.kills,
      bossesDefeated: out.stats.bossesDefeated,
      damageTaken: Math.round(out.stats.damageTaken),
      perfectBlocks: out.stats.perfectBlocks,
      dodges: out.stats.dodges,
      noHitRounds: out.stats.noHitRounds,
      healthRemainingPct: Math.max(0, Math.min(1, out.healthRemainingPct)),
      livesRemaining: Math.max(0, out.livesRemaining),
      difficulty: getSettings().difficulty,
      ...(missionId === 'm07' && training ? { trainingCharacterId: training.player } : {}),
    };
    runToken.current = null;
    try {
      const res = await submitMissionResult(result);
      if (isQueued(res)) setSubmit({ kind: 'queued' });
      else {
        setSubmit({ kind: 'done', res });
        useSessionStore.getState().patchMe({ profile: res.profile, unlockedCharacters: res.progress.unlockedCharacters });
        void queryClient.invalidateQueries({ queryKey: queryKeys.progress });
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardAll });
      }
    } catch (err) {
      setSubmit({ kind: 'error', message: isApiError(err) && err.status === 422 ? 'This result could not be verified and was not recorded.' : 'Your result could not be submitted.' });
    }
  }, [engine, missionId, queryClient, training]);

  const restart = useCallback(async () => {
    setPaused(false);
    setOutcome(null);
    setSubmit({ kind: 'pending' });
    audio.stopAllLoops();
    try {
      await startRun();
    } catch {
      return;
    }
    setRunKey((k) => k + 1);
    setPhase('playing');
  }, [startRun]);

  const quit = useCallback(() => {
    audio.stopAllLoops();
    navigate(missionId === 'm07' ? Paths.training : Paths.menu);
  }, [navigate, missionId]);

  if (!missionId || !meta) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Panel className="max-w-md">
          <PanelHeader title="Unknown mission" />
          <Button onClick={() => navigate(Paths.campaign)}>Back to campaign</Button>
        </Panel>
      </div>
    );
  }

  const next = nextMissionId(missionId);
  const flight = missionId === 'm09' || missionId === 'm11';

  return (
    <div className="fixed inset-0 overflow-hidden bg-night-950 text-fg">
      {engine && phase !== 'loading' && (
        <ErrorBoundary
          fallback={({ error, reset }) => (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
              <Panel className="max-w-md">
                <PanelHeader title="The battle was interrupted" />
                <p className="mb-3 text-fg-muted">{error.message}</p>
                <div className="flex gap-2">
                  <Button onClick={reset}>Try again</Button>
                  <Button variant="secondary" onClick={quit}>Leave</Button>
                </div>
              </Panel>
            </div>
          )}
        >
          <GameCanvas key={runKey} engine={engine} paused={paused || phase !== 'playing'} onPause={() => phase === 'playing' && setPaused((p) => !p)} onFinished={() => void finish()} />
          {phase === 'playing' && <GameHud engine={engine} onPause={() => setPaused(true)} showControls={!device.isTouch} />}
          {phase === 'playing' && device.isTouch && !paused && <TouchControls engineKind={meta.engine} flight={flight} />}
        </ErrorBoundary>
      )}

      {phase === 'loading' && <LoadingScreen progress={progress} title={meta.title} label={`Mission ${meta.number} · ${meta.engineLabel}`} />}

      {phase === 'ready' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-night-950/60 p-4">
          <Panel className="w-full max-w-lg animate-rise-in text-center">
            <PanelHeader eyebrow={`Mission ${meta.number} · ${meta.engineLabel}`} title={meta.title} />
            <p className="mb-2 text-fg-muted">{meta.objective}</p>
            {training && (
              <p className="mb-2 text-parchment-100">
                {training.mounted ? 'Mounted' : 'On foot'} bout
              </p>
            )}
            <Button
              variant="primary"
              size="lg"
              block
              autoFocus
              onClick={() => {
                // A user gesture unlocks WebAudio on every browser.
                input.reset();
                setPhase('playing');
              }}
            >
              To battle!
            </Button>
            <p className="mt-3 text-xs text-fg-subtle">{device.isTouch ? 'Use the on-screen stick and buttons.' : 'WASD move · Space dodge · Shift block · LMB / RMB attack · Esc pause'}</p>
          </Panel>
        </div>
      )}

      <PauseMenu open={paused && phase === 'playing'} onResume={() => setPaused(false)} onRestart={() => void restart()} onQuit={quit} missionTitle={meta.title} objective={objective} />

      {phase === 'results' && outcome && (
        <ResultsScreen
          meta={meta}
          outcome={outcome}
          submit={submit}
          onRetry={() => void restart()}
          onMenu={() => navigate(Paths.menu)}
          onNext={
            missionId === 'm07'
              ? null
              : next && submit.kind === 'done' && submit.res.progress.missions.some((m) => m.missionId === next && m.status !== 'locked')
                ? () => navigate(next === 'm07' ? Paths.training : Paths.briefing(next))
                : null
          }
        />
      )}

      {device.rotate && <RotateDeviceNotice />}
    </div>
  );
}
