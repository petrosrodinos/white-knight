import type { CharacterId, Difficulty, EnemyType, MissionId } from '@/content/ids';

/** Shapes mirror docs/contracts.md §2. Keep in sync with the API. */

export const GAME_ACTIONS = [
  'moveLeft', 'moveRight', 'moveUp', 'moveDown', 'dodge', 'block', 'shield', 'interact',
  'lightAttack', 'heavyAttack', 'orderMove', 'orderHold', 'orderRetreat', 'orderCharge', 'cycleSelection',
] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

export type KeyBindings = Record<GameAction, string[]>;

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
  screenShake: boolean;
  showFps: boolean;
  difficulty: Difficulty;
  keyBindings: KeyBindings;
}

export interface ProfileSummary {
  level: number;
  xp: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  totalPoints: number;
  title: string;
}

export interface MeResponse {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: string;
  profile: ProfileSummary;
  settings: GameSettings;
  unlockedCharacters: CharacterId[];
}

export type MissionStatus = 'locked' | 'unlocked' | 'in_progress' | 'completed';
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

export interface MissionProgressEntry {
  missionId: MissionId;
  status: MissionStatus;
  bestScore: number;
  bestTimeMs: number | null;
  completions: number;
  bestRank: Rank | null;
}

export interface ProgressResponse {
  saveVersion: number;
  currentMissionId: MissionId;
  highestUnlockedMissionId: MissionId;
  trainingGroundsUnlocked: boolean;
  missions: MissionProgressEntry[];
  unlockedCharacters: CharacterId[];
}

export interface MissionStartResponse {
  runId: string;
  runToken: string;
  startedAt: string;
}

export interface MissionResult {
  runToken: string;
  outcome: 'victory' | 'defeat';
  durationMs: number;
  kills: Partial<Record<EnemyType, number>>;
  bossesDefeated: number;
  damageTaken: number;
  perfectBlocks: number;
  dodges: number;
  noHitRounds: number;
  healthRemainingPct: number;
  livesRemaining: number;
  difficulty: Difficulty;
  trainingCharacterId?: CharacterId;
}

export interface MissionCompleteResponse {
  accepted: boolean;
  score: number;
  rank: Rank;
  breakdown: Array<{ key: string; label: string; points: number }>;
  xpGained: number;
  profile: ProfileSummary;
  levelUp: boolean;
  newlyUnlockedMissionId: MissionId | null;
  newlyUnlockedCharacters: CharacterId[];
  personalBest: boolean;
  progress: ProgressResponse;
}

export type LeaderboardScope = 'global' | 'mission';
export type LeaderboardWindow = 'all' | 'monthly' | 'weekly';
export type LeaderboardSort = 'points' | 'time';

export interface LeaderboardQuery {
  scope: LeaderboardScope;
  missionId?: MissionId;
  window: LeaderboardWindow;
  sort: LeaderboardSort;
  page: number;
  limit: number;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  level: number;
  points: number;
  bestTimeMs: number | null;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  data: LeaderboardRow[];
  pagination: { total: number; page: number; limit: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
  me: Omit<LeaderboardRow, 'isCurrentUser'> | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
