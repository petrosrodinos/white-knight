import {
  MISSION_IDS,
  MissionId,
  MissionRankId,
  nextMissionId,
  TRAINING_GROUNDS_MISSION_ID,
} from '@/shared/constants/game.constants';
import {
  MissionStatusId,
  MissionSummary,
} from '../interfaces/progress.interface';

export interface MissionProgressRow {
  mission_id: string;
  status: MissionStatusId;
  best_score: number;
  best_time_ms: number | null;
  best_rank: MissionRankId | null;
  completions: number;
}

const RANK_ORDER: Record<MissionRankId, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

export const isPlayable = (
  row: Pick<MissionProgressRow, 'status'> | undefined | null,
): boolean => Boolean(row && row.status !== 'locked');

/** Roles that bypass the linear campaign lock. */
export const isPrivilegedRole = (role: string | null | undefined): boolean =>
  role === 'ADMIN' || role === 'SUPER_ADMIN';

/** Rows with every mission (training grounds included) playable; real progress is kept. */
export function withAllUnlocked(
  rows: MissionProgressRow[],
): MissionProgressRow[] {
  const byId = new Map(rows.map((row) => [row.mission_id, row]));
  const filled: MissionProgressRow[] = MISSION_IDS.map((missionId) => {
    const row = byId.get(missionId);
    if (row && row.status !== 'locked') return row;
    return {
      mission_id: missionId,
      status: 'unlocked',
      best_score: row?.best_score ?? 0,
      best_time_ms: row?.best_time_ms ?? null,
      best_rank: row?.best_rank ?? null,
      completions: row?.completions ?? 0,
    };
  });
  return filled;
}

/** Full ordered mission list; missions without a stored row are `locked`. */
export function buildMissionList(rows: MissionProgressRow[]): MissionSummary[] {
  const byId = new Map(rows.map((row) => [row.mission_id, row]));
  return MISSION_IDS.map((missionId) => {
    const row = byId.get(missionId);
    return {
      missionId,
      status: row?.status ?? 'locked',
      bestScore: row?.best_score ?? 0,
      bestTimeMs: row?.best_time_ms ?? null,
      completions: row?.completions ?? 0,
      bestRank: row?.best_rank ?? null,
    };
  });
}

/**
 * Strict linear unlocks: completing mN unlocks mN+1 (only if it is not already playable).
 * Returns the mission to unlock, or null.
 */
export function missionToUnlock(
  completed: MissionId,
  rows: Pick<MissionProgressRow, 'mission_id' | 'status'>[],
): MissionId | null {
  const next = nextMissionId(completed);
  if (!next) return null;
  const existing = rows.find((row) => row.mission_id === next);
  return isPlayable(existing) ? null : next;
}

/** Highest mission (in campaign order) that is playable. */
export function highestUnlocked(
  rows: Pick<MissionProgressRow, 'mission_id' | 'status'>[],
): MissionId {
  let highest: MissionId = MISSION_IDS[0];
  for (const id of MISSION_IDS) {
    if (isPlayable(rows.find((row) => row.mission_id === id))) highest = id;
  }
  return highest;
}

export const trainingGroundsUnlocked = (
  rows: Pick<MissionProgressRow, 'mission_id' | 'status'>[],
): boolean =>
  isPlayable(
    rows.find((row) => row.mission_id === TRAINING_GROUNDS_MISSION_ID),
  );

export function betterRank(
  a: MissionRankId | null,
  b: MissionRankId | null,
): MissionRankId | null {
  if (!a) return b;
  if (!b) return a;
  return RANK_ORDER[a] >= RANK_ORDER[b] ? a : b;
}
