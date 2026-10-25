import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GameRunStatus, Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { LeaderboardService } from '@/modules/leaderboard/leaderboard.service';
import { levelInfo } from '@/modules/profile/utils/level-curve.utils';
import {
  sortCharacterIds,
  toProfileView,
} from '@/modules/profile/utils/profile.utils';
import { ScoreService } from '@/modules/score/score.service';
import { ErrorMessages } from '@/shared/config/error-codes';
import {
  CharacterId,
  EMPEROR_KNIGHT_CHARACTER_ID,
  isMissionId,
  MissionId,
  TRAINING_GROUNDS_MISSION_ID,
  UNLOCK_SOURCES,
} from '@/shared/constants/game.constants';
import { MissionResultDto } from './dto/mission-result.dto';
import { getMission } from './config/missions.catalog';
import { CURRENT_SAVE_VERSION, RUN_TOKEN_TTL_MS } from './config/save.config';
import {
  MissionCompleteResponse,
  MissionStartResponse,
  ProgressResponse,
  RunTokenPayload,
} from './interfaces/progress.interface';
import {
  betterRank,
  buildMissionList,
  highestUnlocked,
  isPlayable,
  isPrivilegedRole,
  missionToUnlock,
  trainingGroundsUnlocked,
  withAllUnlocked,
} from './utils/unlock.utils';
import { pendingMigrations } from './utils/save-migrations.utils';

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);
  private readonly runTokenSecret: string;
  private readonly emperorThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly scoreService: ScoreService,
    private readonly leaderboardService: LeaderboardService,
    config: ConfigService,
  ) {
    this.runTokenSecret = config.getOrThrow<string>('RUN_TOKEN_SECRET');
    this.emperorThreshold = Number(
      config.get('EMPEROR_KNIGHT_POINTS_THRESHOLD') ?? 60000,
    );
  }

  async getProgress(userId: string): Promise<ProgressResponse> {
    await this.migrateSaveIfNeeded(userId);
    return this.buildProgress(this.prisma, userId);
  }

  async startMission(
    userId: string,
    missionId: MissionId,
  ): Promise<MissionStartResponse> {
    let row = await this.prisma.missionProgress.findUnique({
      where: { user_id_mission_id: { user_id: userId, mission_id: missionId } },
    });
    // Admins and super admins can play every stage regardless of campaign progress.
    if (!isPlayable(row) && (await this.isPrivileged(this.prisma, userId))) {
      row = await this.prisma.missionProgress.upsert({
        where: {
          user_id_mission_id: { user_id: userId, mission_id: missionId },
        },
        update: { status: 'unlocked' },
        create: { user_id: userId, mission_id: missionId, status: 'unlocked' },
      });
    }
    if (!isPlayable(row))
      throw new ForbiddenException(ErrorMessages.Progress.MISSION_LOCKED);

    // Auto-save on start: Continue target + in_progress status (unless already completed).
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.gameRun.create({
        data: { user_id: userId, mission_id: missionId },
      });
      if (row.status !== 'completed') {
        await tx.missionProgress.update({
          where: { id: row.id },
          data: { status: 'in_progress' },
        });
      }
      await tx.profile.update({
        where: { user_id: userId },
        data: { current_mission_id: missionId },
      });
      return created;
    });

    const payload: RunTokenPayload = {
      sub: userId,
      rid: run.id,
      mid: missionId,
      typ: 'run',
    };
    const runToken = await this.jwt.signAsync(payload, {
      secret: this.runTokenSecret,
      expiresIn: Math.floor(RUN_TOKEN_TTL_MS / 1000),
    });

    return { runId: run.id, runToken, startedAt: run.started_at.toISOString() };
  }

  async completeMission(
    userId: string,
    dto: MissionResultDto,
  ): Promise<MissionCompleteResponse> {
    const payload = await this.verifyRunToken(userId, dto.runToken);

    const run = await this.prisma.gameRun.findUnique({
      where: { id: payload.rid },
    });
    if (
      !run ||
      run.user_id !== userId ||
      run.mission_id !== payload.mid ||
      !isMissionId(run.mission_id)
    ) {
      this.reject(
        userId,
        payload.rid,
        'run not found or does not match token',
        ErrorMessages.Progress.INVALID_RUN_TOKEN,
      );
    }
    if (run.status !== GameRunStatus.started) {
      this.reject(
        userId,
        run.id,
        `run already ${run.status}`,
        ErrorMessages.Progress.RUN_ALREADY_COMPLETED,
      );
    }

    const missionId = run.mission_id as MissionId;
    const mission = getMission(missionId);
    const serverElapsedMs = Date.now() - run.started_at.getTime();

    try {
      this.scoreService.assertPlausible(
        { userId, runId: run.id },
        mission,
        dto,
        serverElapsedMs,
      );
      if (
        dto.outcome === 'victory' &&
        missionId === TRAINING_GROUNDS_MISSION_ID &&
        dto.trainingCharacterId
      ) {
        const owned = await this.prisma.unlockedCharacter.findUnique({
          where: {
            user_id_character_id: {
              user_id: userId,
              character_id: dto.trainingCharacterId,
            },
          },
        });
        if (!owned) {
          this.reject(
            userId,
            run.id,
            `training character ${dto.trainingCharacterId} not unlocked`,
            ErrorMessages.Progress.IMPLAUSIBLE_RESULT,
          );
        }
      }
    } catch (error) {
      await this.closeRun(this.prisma, run.id, GameRunStatus.rejected);
      throw error;
    }

    if (dto.outcome === 'defeat') return this.recordDefeat(userId, run.id);
    return this.recordVictory(userId, run.id, missionId, dto);
  }

  private async recordDefeat(
    userId: string,
    runId: string,
  ): Promise<MissionCompleteResponse> {
    const claimed = await this.closeRun(
      this.prisma,
      runId,
      GameRunStatus.defeated,
    );
    if (!claimed)
      this.reject(
        userId,
        runId,
        'concurrent resubmission',
        ErrorMessages.Progress.RUN_ALREADY_COMPLETED,
      );

    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { user_id: userId },
    });
    return {
      accepted: true,
      score: 0,
      rank: 'D',
      breakdown: [],
      xpGained: 0,
      profile: toProfileView(profile),
      levelUp: false,
      newlyUnlockedMissionId: null,
      newlyUnlockedCharacters: [],
      personalBest: false,
      progress: await this.buildProgress(this.prisma, userId),
    };
  }

  private async recordVictory(
    userId: string,
    runId: string,
    missionId: MissionId,
    dto: MissionResultDto,
  ): Promise<MissionCompleteResponse> {
    const mission = getMission(missionId);

    const response = await this.prisma.$transaction(async (tx) => {
      // Claim the run first: a token can be completed exactly once.
      const claimed = await this.closeRun(tx, runId, GameRunStatus.completed);
      if (!claimed)
        this.reject(
          userId,
          runId,
          'concurrent resubmission',
          ErrorMessages.Progress.RUN_ALREADY_COMPLETED,
        );

      const [profile, rows, ownedCharacters] = await Promise.all([
        tx.profile.findUniqueOrThrow({ where: { user_id: userId } }),
        tx.missionProgress.findMany({ where: { user_id: userId } }),
        tx.unlockedCharacter.findMany({
          where: { user_id: userId },
          select: { character_id: true },
        }),
      ]);
      const row = rows.find((r) => r.mission_id === missionId);
      if (!row) throw new NotFoundException('Mission progress not found');

      const firstClear = row.completions === 0;
      const result = this.scoreService.score(mission, dto, firstClear);
      const personalBest = result.score > row.best_score;

      await tx.missionProgress.update({
        where: { id: row.id },
        data: {
          status: 'completed',
          completions: { increment: 1 },
          best_score: Math.max(row.best_score, result.score),
          best_time_ms:
            row.best_time_ms === null
              ? dto.durationMs
              : Math.min(row.best_time_ms, dto.durationMs),
          best_rank: betterRank(row.best_rank, result.rank),
          ...(firstClear && { first_completed_at: new Date() }),
        },
      });
      row.status = 'completed';

      await tx.scoreEntry.create({
        data: {
          user_id: userId,
          mission_id: missionId,
          run_id: runId,
          score: result.score,
          duration_ms: dto.durationMs,
          rank: result.rank,
          difficulty: dto.difficulty,
        },
      });

      // Strict linear unlock of the next mission.
      const toUnlock = missionToUnlock(missionId, rows);
      if (toUnlock) {
        await tx.missionProgress.upsert({
          where: {
            user_id_mission_id: { user_id: userId, mission_id: toUnlock },
          },
          update: { status: 'unlocked' },
          create: { user_id: userId, mission_id: toUnlock, status: 'unlocked' },
        });
        const existing = rows.find((r) => r.mission_id === toUnlock);
        if (existing) existing.status = 'unlocked';
        else rows.push({ ...row, mission_id: toUnlock, status: 'unlocked' });
      }

      // Story character unlocks (first completion).
      const owned = new Set(ownedCharacters.map((c) => c.character_id));
      const newCharacters: CharacterId[] = firstClear
        ? mission.unlocksCharacters.filter((id) => !owned.has(id))
        : [];
      if (newCharacters.length) {
        await tx.unlockedCharacter.createMany({
          data: newCharacters.map((character_id) => ({
            user_id: userId,
            character_id,
            source: UNLOCK_SOURCES.MISSION,
          })),
          skipDuplicates: true,
        });
        newCharacters.forEach((id) => owned.add(id));
      }

      // Totals, XP and level.
      const totals = await tx.missionProgress.aggregate({
        where: { user_id: userId },
        _sum: { best_score: true },
      });
      const totalPoints = totals._sum.best_score ?? 0;
      const xp = profile.xp + result.score;
      const info = levelInfo(xp);

      // Emperor Knight: score-threshold unlock, tracked separately from story progress (P4-08).
      let emperorUnlockedAt = profile.emperor_knight_unlocked_at;
      if (
        totalPoints >= this.emperorThreshold &&
        !owned.has(EMPEROR_KNIGHT_CHARACTER_ID)
      ) {
        await tx.unlockedCharacter.create({
          data: {
            user_id: userId,
            character_id: EMPEROR_KNIGHT_CHARACTER_ID,
            source: UNLOCK_SOURCES.SCORE_THRESHOLD,
          },
        });
        emperorUnlockedAt = emperorUnlockedAt ?? new Date();
        newCharacters.push(EMPEROR_KNIGHT_CHARACTER_ID);
      }

      // Auto-save on completion: Continue target becomes the campaign frontier.
      const highest = highestUnlocked(rows);
      const updatedProfile = await tx.profile.update({
        where: { user_id: userId },
        data: {
          xp,
          level: info.level,
          title: info.title,
          total_points: totalPoints,
          highest_unlocked_mission_id: highest,
          current_mission_id: highest,
          emperor_knight_unlocked_at: emperorUnlockedAt,
        },
      });

      return {
        accepted: true,
        score: result.score,
        rank: result.rank,
        breakdown: result.breakdown,
        xpGained: result.score,
        profile: toProfileView(updatedProfile),
        levelUp: info.level > profile.level,
        newlyUnlockedMissionId: toUnlock,
        newlyUnlockedCharacters: sortCharacterIds(newCharacters),
        personalBest,
        progress: await this.buildProgress(tx, userId),
      } satisfies MissionCompleteResponse;
    });

    await this.leaderboardService.invalidate();
    return response;
  }

  private async verifyRunToken(
    userId: string,
    token: string,
  ): Promise<RunTokenPayload> {
    let payload: RunTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RunTokenPayload>(token, {
        secret: this.runTokenSecret,
      });
    } catch (error) {
      this.reject(
        userId,
        'n/a',
        `run token invalid: ${(error as Error).message}`,
        ErrorMessages.Progress.INVALID_RUN_TOKEN,
      );
    }
    if (payload.typ !== 'run' || payload.sub !== userId || !payload.rid) {
      this.reject(
        userId,
        payload.rid ?? 'n/a',
        'run token not owned by user',
        ErrorMessages.Progress.INVALID_RUN_TOKEN,
      );
    }
    return payload;
  }

  /** Marks a started run as closed; returns false when it was already closed (replay / race). */
  private async closeRun(
    client: Prisma.TransactionClient,
    runId: string,
    status: GameRunStatus,
  ): Promise<boolean> {
    const { count } = await client.gameRun.updateMany({
      where: { id: runId, status: GameRunStatus.started },
      data: { status, completed_at: new Date() },
    });
    return count === 1;
  }

  private reject(
    userId: string,
    runId: string,
    reason: string,
    message: string,
  ): never {
    this.logger.warn(
      `Rejected mission-complete (user ${userId}, run ${runId}): ${reason}`,
    );
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message,
    });
  }

  private async isPrivileged(
    client: Prisma.TransactionClient,
    userId: string,
  ): Promise<boolean> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return isPrivilegedRole(user?.role);
  }

  private async buildProgress(
    client: Prisma.TransactionClient,
    userId: string,
  ): Promise<ProgressResponse> {
    const [profile, storedRows, characters, privileged] = await Promise.all([
      client.profile.findUnique({ where: { user_id: userId } }),
      client.missionProgress.findMany({ where: { user_id: userId } }),
      client.unlockedCharacter.findMany({
        where: { user_id: userId },
        select: { character_id: true },
      }),
      this.isPrivileged(client, userId),
    ]);
    if (!profile) throw new NotFoundException('Profile not found');
    const rows = privileged ? withAllUnlocked(storedRows) : storedRows;

    return {
      saveVersion: profile.save_version,
      currentMissionId: (isMissionId(profile.current_mission_id)
        ? profile.current_mission_id
        : 'm01') as MissionId,
      highestUnlockedMissionId: highestUnlocked(rows),
      trainingGroundsUnlocked: trainingGroundsUnlocked(rows),
      missions: buildMissionList(rows),
      unlockedCharacters: sortCharacterIds(
        characters.map((c) => c.character_id),
      ),
    };
  }

  private async migrateSaveIfNeeded(userId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { save_version: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    if (profile.save_version >= CURRENT_SAVE_VERSION) return;

    const steps = pendingMigrations(profile.save_version);
    await this.prisma.$transaction(async (tx) => {
      for (const step of steps) await step(tx, userId);
      await tx.profile.update({
        where: { user_id: userId },
        data: { save_version: CURRENT_SAVE_VERSION },
      });
    });
    this.logger.log(
      `Migrated save for user ${userId} from v${profile.save_version} to v${CURRENT_SAVE_VERSION}`,
    );
  }
}
