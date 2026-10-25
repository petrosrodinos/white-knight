import type { GameAction } from '@/api/types';
import type { EngineKind, EnvId, GroundMaterial } from '@/content/ids';
import type { RunStats } from '@/core/sim/types';
import type { World } from '@/core/sim/world';

export type EngineStatus = 'intro' | 'playing' | 'victory' | 'defeat';

export interface HudBar {
  name: string;
  hp: number;
  maxHp: number;
  segments: number;
  mana?: number;
  maxMana?: number;
  /** Optional caption, e.g. "Mana" phase label. */
  caption?: string;
}

export interface HudSquad {
  id: number;
  name: string;
  alive: number;
  total: number;
  order: 'move' | 'hold' | 'retreat' | 'charge' | 'advance';
  selected: boolean;
}

/** One line of the in-game controls corner: a label and the actions whose keys are shown. */
export interface ControlHint {
  label: string;
  actions: GameAction[];
}

export interface HudSnapshot {
  playerName: string;
  lives: number;
  maxLives: number;
  player: HudBar;
  mounted: boolean;
  enemiesRemaining: number | null;
  kills: number;
  missionLabel: string;
  stageLabel: string;
  objective: string;
  /** Large boss bar (spec §5 HUD). */
  boss: HudBar | null;
  /** Duel opponent bar (non-boss duels). */
  opponent: HudBar | null;
  allies: Array<HudBar & { active: boolean; escort?: boolean }>;
  banner: { title: string; subtitle?: string; id: number } | null;
  prompt: string | null;
  stunned: boolean;
  lowHealth: boolean;
  squads: HudSquad[] | null;
  /** Open field: enemy commanders remaining / total. */
  commanders: { remaining: number; total: number } | null;
  /** Flight missions: progress to the landing zone 0..1. */
  progress: number | null;
  /** Controls usable right now (changes with mount, flight, partner, mission type). */
  controls: ControlHint[];
  /** Energy shield meter of the player (null when the fighter has none). */
  shield: { energy: number; max: number; active: boolean; broken: boolean } | null;
}

export interface SceneState {
  env: EnvId;
  ground: GroundMaterial;
  fog: 'light' | 'dark' | 'storm';
  /** Flight missions: no walkable ground; ground band shows sea/clouds. */
  flight: boolean;
  /** 0..1 fade to black (slide transitions). */
  fade: number;
  distortion: number;
  /** Visual-only props such as ships and the landing zone are read from world.hazards. */
  tint?: string;
}

export interface CameraHint {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  /** Larger value zooms out (visible world height in metres). */
  viewHeight: number;
  /** When true the camera centres on x without a dead zone (duels framing both fighters). */
  frame?: boolean;
}

export interface RunOutcome {
  outcome: 'victory' | 'defeat';
  stats: RunStats;
  healthRemainingPct: number;
  livesRemaining: number;
  durationMs: number;
  failReason?: string;
}

/** Every engine (Open Field, Quest, Duel) implements this. Configs are data; engines are reusable. */
export interface GameEngine {
  readonly kind: EngineKind;
  readonly world: World;
  status: EngineStatus;
  /** One fixed step (AI → world → rules). */
  step(dt: number): void;
  hud(): HudSnapshot;
  scene(): SceneState;
  camera(): CameraHint;
  outcome(): RunOutcome | null;
  /** Music & ambience the engine wants right now. */
  soundtrack(): { music: string; ambience: string | null };
}
