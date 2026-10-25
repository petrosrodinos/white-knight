import type { CharacterId, MissionId } from '@/content/ids';
import { DUEL } from '@/core/combat/combat-config';
import type { DuelConfigInput } from '@/engines/duel/duel-config';
import type { OpenFieldConfigInput } from '@/engines/open-field/open-field-config';
import type { QuestConfigInput } from '@/engines/quest/quest-config';

/**
 * Mission configurations — DATA ONLY (Core Design Rule 2). Every mission is a configured instance
 * of one of the three engines. Validated by missions/validate.ts (and unit tests).
 */
export type MissionConfig =
  | { engine: 'duel'; config: DuelConfigInput }
  | { engine: 'quest'; config: QuestConfigInput }
  | { engine: 'open-field'; config: OpenFieldConfigInput };

const W1 = 5;
const W2 = 10;
const W3 = 15;

const threeRoundKnight = [
  { mount: 'horse' as const, helmets: true, endsWhen: { type: 'hpAtOrBelow' as const, hp: DUEL.mountedEndHp } },
  { mount: 'none' as const, helmets: true, endsWhen: { type: 'hpAtOrBelow' as const, hp: DUEL.footEndHp } },
  { mount: 'none' as const, helmets: false, endsWhen: { type: 'ko' as const } },
];

export const MISSION_CONFIGS: Record<Exclude<MissionId, 'm07'>, MissionConfig> = {
  m01: {
    engine: 'open-field',
    config: {
      env: 'forest', ground: 'grass', width: 160, music: 'battle', ambience: 'amb-battle',
      player: { character: 'white-knight', title: 'White Knight' },
      playerSquads: [
        { name: 'Shield Wall', look: 'infantry', count: 8 },
        { name: 'Pikemen', look: 'spearman', count: 6 },
        { name: 'Longbows', look: 'archer', count: 6 },
        { name: 'Knights', look: 'cavalry', count: 4 },
      ],
      enemyCommanders: [
        { name: 'Captain Varn', character: 'enemy-commander', position: 0.72, squads: [{ name: 'Raiders', look: 'infantry', count: 8 }, { name: 'Bowmen', look: 'archer', count: 5 }] },
        { name: 'Sergeant Brask', character: 'enemy-commander', position: 0.82, squads: [{ name: 'Spears', look: 'spearman', count: 6 }, { name: 'Skirmishers', look: 'infantry', count: 4 }] },
        { name: 'Lord Hrothmar', character: 'enemy-commander', position: 0.94, squads: [{ name: 'Lancers', look: 'cavalry', count: 4 }, { name: 'Footmen', look: 'infantry', count: 7 }] },
      ],
    },
  },
  m02: {
    engine: 'duel',
    config: {
      arena: { env: 'forest-clearing', ground: 'grass', width: 28, music: 'duel', ambience: 'amb-forest' },
      player: { character: 'white-knight' },
      opponent: { ref: 'enemy-commander', name: 'Lord Hrothmar' },
      rounds: [
        { label: 'Mounted', mount: 'horse', helmets: true, endsWhen: { type: 'hpAtOrBelow', hp: DUEL.mountedEndHp } },
        { label: 'On foot — helmets off', mount: 'none', helmets: false, endsWhen: { type: 'ko' } },
      ],
      intro: { speaker: 'Lord Hrothmar', text: 'Horse against horse — then steel against steel.' },
    },
  },
  m03: {
    engine: 'quest',
    config: {
      playable: 'white-knight', music: 'battle',
      slides: [
        {
          kind: 'ground', title: 'The Forest Road', env: 'forest', ground: 'dirt', length: 70, ambience: 'amb-forest',
          waves: [{ count: W1, enemies: [{ look: 'infantry', weight: 3 }, { look: 'archer', weight: 1 }], maxAlive: 3 }],
          hazards: [{ kind: 'projectiles', every: 15, projectile: 'arrow', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'The Mountain Pass', env: 'mountains', ground: 'stone', length: 80, ambience: 'amb-wind',
          waves: [
            { count: 4, enemies: [{ look: 'spearman', weight: 2 }, { look: 'infantry', weight: 2 }], maxAlive: 3 },
            { count: W2 - 4, enemies: [{ look: 'archer', weight: 2 }, { look: 'spearman', weight: 2 }, { look: 'infantry', weight: 1 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'projectiles', every: 7, projectile: 'javelin', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'The Bridge of Cordova', env: 'city-gate', ground: 'stone', length: 85,
          waves: [
            { count: 5, enemies: [{ look: 'infantry', weight: 2 }, { look: 'spearman', weight: 1 }], maxAlive: 4 },
            { count: W3 - 5, enemies: [{ look: 'archer', weight: 1 }, { look: 'spearman', weight: 2 }, { look: 'infantry', weight: 2 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'projectiles', every: 6, projectile: 'spear', origin: 'right' }, { kind: 'projectiles', every: 5, projectile: 'arrow', origin: 'right' }],
        },
        {
          kind: 'boss', title: 'The Black Knight',
          arena: { env: 'city-gate', ground: 'stone', width: 30, music: 'boss' },
          duel: {
            opponent: { ref: 'black-knight', name: 'The Black Knight', isBoss: true },
            rounds: threeRoundKnight,
            intro: { speaker: 'The Black Knight', text: 'You will not pass the gates of Cordova.' },
          },
        },
      ],
    },
  },
  m04: {
    engine: 'quest',
    config: {
      playable: 'white-knight', music: 'battle',
      slides: [
        {
          kind: 'ground', title: 'The High Mountains', env: 'mountains', ground: 'snow', length: 70, ambience: 'amb-wind',
          waves: [{ count: W1, enemies: [{ look: 'spearman', weight: 2 }, { look: 'infantry', weight: 2 }], maxAlive: 3 }],
          hazards: [{ kind: 'projectiles', every: 12, projectile: 'javelin', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'The Coast Road', env: 'coastline', ground: 'sand', length: 80, ambience: 'amb-sea',
          waves: [
            { count: 5, enemies: [{ look: 'archer', weight: 2 }, { look: 'infantry', weight: 2 }], maxAlive: 4 },
            { count: W2 - 5, enemies: [{ look: 'spearman', weight: 2 }, { look: 'archer', weight: 1 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'projectiles', every: 6, projectile: 'arrow', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'Foot of the Dark Tower', env: 'dark-tower', ground: 'stone', fog: 'dark', length: 85, music: 'dark',
          waves: [
            { count: 7, enemies: [{ look: 'infantry', weight: 2 }, { look: 'spearman', weight: 2 }], maxAlive: 4 },
            { count: W3 - 7, enemies: [{ look: 'archer', weight: 2 }, { look: 'spearman', weight: 1 }, { look: 'infantry', weight: 2 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'projectiles', every: 5.5, projectile: 'spear', origin: 'right' }],
        },
        {
          kind: 'boss', title: 'The Mysterious Knight',
          arena: { env: 'dark-tower', ground: 'stone', fog: 'dark', width: 32, music: 'boss' },
          duel: {
            opponent: { ref: 'mysterious-knight', name: 'The Mysterious Knight', isBoss: true },
            rounds: [{ label: 'Mounted — beware his magic', mount: 'horse', helmets: true, endsWhen: { type: 'ko' } }],
            boss: { module: 'mysterious-knight' },
            intro: { speaker: 'The Mysterious Knight', text: 'Turn back, or burn.' },
          },
        },
      ],
    },
  },
  m05: {
    engine: 'quest',
    config: {
      playable: 'white-knight', music: 'dark',
      slides: [
        {
          kind: 'ground', title: 'The Dark Hallway', env: 'dark-hallway', ground: 'stone', fog: 'dark', length: 70, ambience: 'amb-cave',
          waves: [{ count: W1, enemies: [{ look: 'servant', weight: 2 }, { look: 'zombie', weight: 1 }], maxAlive: 3 }],
          hazards: [{ kind: 'spike-traps', count: 3 }, { kind: 'falling-objects', every: 7, model: 'chandelier' }],
        },
        {
          kind: 'ground', title: 'The Shadow Mirror Hall', env: 'mirror-hall', ground: 'marble', fog: 'dark', length: 80, ambience: 'amb-cave',
          waves: [
            { count: 4, enemies: [{ look: 'ghost', weight: 2 }, { look: 'servant', weight: 1 }], maxAlive: 3 },
            { count: W2 - 4, enemies: [{ look: 'ghost', weight: 2 }, { look: 'zombie', weight: 2 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'spike-traps', count: 3 }, { kind: 'projectiles', every: 6, projectile: 'magic', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'The Grand Hall', env: 'grand-hall', ground: 'marble', fog: 'dark', length: 85, ambience: 'amb-cave',
          waves: [
            { count: 6, enemies: [{ look: 'zombie', weight: 2 }, { look: 'servant', weight: 2 }], maxAlive: 4 },
            { count: W3 - 6, enemies: [{ look: 'ghost', weight: 2 }, { look: 'zombie', weight: 2 }, { look: 'servant', weight: 1 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'falling-objects', every: 6, model: 'chandelier' }, { kind: 'projectiles', every: 7, projectile: 'magic', origin: 'right' }],
        },
        {
          kind: 'boss', title: 'The Wizard',
          arena: { env: 'grand-hall', ground: 'marble', fog: 'dark', width: 30, music: 'boss' },
          duel: {
            opponent: { ref: 'wizard', name: 'The Wizard', isBoss: true },
            rounds: [{ label: 'He cannot be harmed — outlast his mana', mount: 'none', helmets: true, endsWhen: { type: 'ko' } }],
            boss: { module: 'wizard' },
            victory: 'mana',
            intro: { speaker: 'The Wizard', text: 'Steel cannot touch me, little knight.' },
          },
        },
      ],
    },
  },
  m06: {
    engine: 'quest',
    config: {
      playable: 'mysterious-knight', music: 'sea',
      slides: [
        {
          kind: 'ground', title: 'The Tower Coast', env: 'tower-coast', ground: 'sand', length: 70, ambience: 'amb-sea',
          waves: [{ count: W1, enemies: [{ look: 'ship-archer', weight: 1 }, { look: 'infantry', weight: 1 }], maxAlive: 3 }],
          hazards: [{ kind: 'wind-gusts', every: 10, power: 12, variant: 'wind' }],
        },
        {
          kind: 'ground', title: 'The Open Sea', env: 'open-sea', ground: 'wood', fog: 'storm', length: 85, ambience: 'amb-storm',
          waves: [
            { count: 4, enemies: [{ look: 'ship-archer', weight: 1 }], maxAlive: 3 },
            { count: W2 - 4, enemies: [{ look: 'ship-archer', weight: 2 }, { look: 'infantry', weight: 1 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'ships', count: 2 }, { kind: 'wind-gusts', every: 8, power: 15, variant: 'wave' }, { kind: 'storms', every: 7 }],
        },
        {
          kind: 'ground', title: 'The European Coast', env: 'european-coast', ground: 'sand', length: 80, ambience: 'amb-sea',
          waves: [
            { count: 7, enemies: [{ look: 'ship-archer', weight: 2 }, { look: 'infantry', weight: 1 }], maxAlive: 4 },
            { count: W3 - 7, enemies: [{ look: 'ship-archer', weight: 2 }, { look: 'infantry', weight: 2 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'ships', count: 1 }, { kind: 'wind-gusts', every: 9, power: 13, variant: 'wind' }, { kind: 'storms', every: 9 }],
        },
        {
          kind: 'boss', title: 'Duel on the Shore',
          arena: { env: 'european-coast', ground: 'sand', width: 28, music: 'duel', ambience: 'amb-sea' },
          duel: {
            opponent: { ref: 'blue-paladin', name: 'Oliver, the Blue Paladin', isBoss: true },
            rounds: [
              { label: 'On foot', mount: 'none', helmets: true, endsWhen: { type: 'hpAtOrBelow', hp: DUEL.footEndHp } },
              { label: 'On foot — helmets off', mount: 'none', helmets: false, endsWhen: { type: 'ko' } },
            ],
            intro: { speaker: 'Oliver', text: 'Hold, stranger! Prove you are no servant of Cordova.' },
          },
        },
      ],
    },
  },
  m08: {
    engine: 'quest',
    config: {
      playable: 'white-knight', music: 'battle',
      slides: [
        {
          kind: 'ground', title: 'The Wild Forest', env: 'forest', ground: 'grass', length: 70, ambience: 'amb-forest',
          waves: [{ count: W1, enemies: [{ look: 'bandit', weight: 2 }, { look: 'wolf', weight: 2 }], maxAlive: 3 }],
          hazards: [{ kind: 'spike-traps', count: 3 }],
        },
        {
          kind: 'ground', title: 'The Misty Lake', env: 'lake', ground: 'dirt', length: 80, ambience: 'amb-forest',
          waves: [
            { count: 5, enemies: [{ look: 'viking', weight: 2 }, { look: 'bandit', weight: 1 }], maxAlive: 3 },
            { count: W2 - 5, enemies: [{ look: 'boar', weight: 1 }, { look: 'wolf', weight: 1 }, { look: 'viking', weight: 2 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'spike-traps', count: 4 }],
        },
        {
          kind: 'ground', title: 'The Ancient Stones', env: 'stone-circle', ground: 'stone', fog: 'dark', length: 85, ambience: 'amb-wind',
          waves: [
            { count: 7, enemies: [{ look: 'viking', weight: 2 }, { look: 'wolf', weight: 1 }], maxAlive: 4 },
            { count: W3 - 7, enemies: [{ look: 'viking', weight: 2 }, { look: 'bandit', weight: 2 }, { look: 'boar', weight: 1 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'spike-traps', count: 4 }],
        },
        {
          kind: 'boss', title: 'The Witch Spirit',
          arena: { env: 'stone-circle', ground: 'stone', fog: 'dark', width: 28, music: 'boss' },
          duel: {
            opponent: { ref: 'witch-spirit', name: 'The Witch Spirit', isBoss: true },
            rounds: [{ label: 'Beware her stun', mount: 'none', helmets: true, endsWhen: { type: 'ko' } }],
            boss: { module: 'witch-spirit' },
            intro: { speaker: 'The Witch Spirit', text: 'The herb is mine, and so is your soul.' },
          },
        },
      ],
    },
  },
  m09: {
    engine: 'quest',
    config: {
      playable: 'white-knight', mount: 'hippogryph', music: 'flight',
      slides: [
        { kind: 'flight', title: 'The Continental Sky', env: 'sky-continental', length: 150, surface: 'land', ambience: 'amb-wind', hazards: [{ kind: 'birds', every: 2.6 }, { kind: 'wind-gusts', every: 9, power: 12 }] },
        { kind: 'flight', title: 'The Storm Zone', env: 'storm-zone', fog: 'storm', length: 160, surface: 'clouds', ambience: 'amb-storm', hazards: [{ kind: 'storms', every: 2.4 }, { kind: 'wind-gusts', every: 5, power: 16 }, { kind: 'birds', every: 4 }] },
        {
          kind: 'flight', title: 'Enemy Fortress Airspace', env: 'fortress-airspace', length: 170, surface: 'land', ambience: 'amb-wind',
          hazards: [{ kind: 'projectiles', every: 1.8, projectile: 'fortress-shot', origin: 'below' }, { kind: 'birds', every: 4 }, { kind: 'storms', every: 6 }],
          landing: { width: 9, height: 3.2, label: 'You stand upon the fortress walls' },
        },
      ],
    },
  },
  m10: {
    engine: 'quest',
    config: {
      playable: 'white-knight', music: 'dark',
      slides: [
        {
          kind: 'ground', title: 'The Fortress Walls', env: 'fortress-walls', ground: 'stone', length: 70, ambience: 'amb-wind',
          waves: [{ count: W1, enemies: [{ look: 'servant', weight: 2 }, { look: 'zombie', weight: 1 }], maxAlive: 3 }],
          hazards: [{ kind: 'falling-objects', every: 8, model: 'boulder' }, { kind: 'projectiles', every: 8, projectile: 'magic', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'The Fortress Hallways', env: 'fortress-halls', ground: 'stone', fog: 'dark', length: 80, ambience: 'amb-cave',
          waves: [
            { count: 5, enemies: [{ look: 'servant', weight: 1 }, { look: 'zombie', weight: 2 }], maxAlive: 4 },
            { count: W2 - 5, enemies: [{ look: 'zombie', weight: 2 }, { look: 'servant', weight: 2 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'spike-traps', count: 4 }, { kind: 'falling-objects', every: 7, model: 'beam' }],
        },
        {
          kind: 'ground', title: 'The Fortress Dungeon', env: 'fortress-dungeon', ground: 'stone', fog: 'dark', length: 85, ambience: 'amb-cave',
          waves: [
            { count: 7, enemies: [{ look: 'zombie', weight: 2 }, { look: 'servant', weight: 1 }], maxAlive: 4 },
            { count: W3 - 7, enemies: [{ look: 'zombie', weight: 2 }, { look: 'servant', weight: 2 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'spike-traps', count: 4 }, { kind: 'projectiles', every: 6, projectile: 'magic', origin: 'right' }],
        },
        {
          kind: 'boss', title: 'The Bewitched Ally',
          arena: { env: 'fortress-dungeon', ground: 'stone', fog: 'dark', width: 26, music: 'boss' },
          duel: {
            opponent: { ref: 'bewitched-ally', name: 'Brown Feather (Bewitched)', isBoss: true },
            rounds: [{ label: 'Break the curse', mount: 'none', helmets: true, endsWhen: { type: 'ko' } }],
            intro: { speaker: 'Brown Feather', text: '…kill… the knight…' },
          },
        },
        {
          kind: 'boss', title: 'The Evil Witch',
          arena: { env: 'fortress-dungeon', ground: 'stone', fog: 'dark', width: 28, music: 'boss' },
          duel: {
            opponent: { ref: 'evil-witch', name: 'The Evil Witch', isBoss: true },
            rounds: [{ label: 'Two against one — drain her mana', mount: 'none', helmets: true, endsWhen: { type: 'ko' } }],
            boss: { module: 'evil-witch' },
            tagTeam: { partner: 'bronze-knight' },
            victory: 'mana',
            intro: { speaker: 'The Evil Witch', text: 'Two little knights. One little witch. Let us play.' },
          },
        },
      ],
    },
  },
  m11: {
    engine: 'quest',
    config: {
      playable: 'green-chestnut', mount: 'hippogryph', music: 'flight',
      slides: [
        { kind: 'flight', title: 'Flight above the Ocean', env: 'ocean-sky', length: 150, surface: 'sea', ambience: 'amb-sea', hazards: [{ kind: 'birds', every: 2.8 }, { kind: 'wind-gusts', every: 8, power: 13 }, { kind: 'storms', every: 8 }] },
        {
          kind: 'flight', title: 'The Continental Sky', env: 'sky-continental', length: 160, surface: 'land', ambience: 'amb-wind',
          hazards: [{ kind: 'projectiles', every: 2.2, projectile: 'city-shot', origin: 'below' }, { kind: 'projectiles', every: 3, projectile: 'arrow', origin: 'below' }, { kind: 'birds', every: 3.5 }, { kind: 'wind-gusts', every: 9, power: 13 }],
        },
        {
          kind: 'flight', title: 'Landing on the Right Coast', env: 'swamp-coast', length: 120, surface: 'sea', ambience: 'amb-sea',
          hazards: [{ kind: 'projectiles', every: 2.6, projectile: 'city-shot', origin: 'below' }, { kind: 'storms', every: 6 }, { kind: 'birds', every: 4 }],
          landing: { width: 10, height: 1.0, label: 'Green Chestnut lands on the swampy coast' },
        },
        {
          kind: 'boss', title: 'The Swamp Troll',
          arena: { env: 'swamp-coast', ground: 'dirt', width: 30, music: 'boss', ambience: 'amb-sea' },
          duel: {
            opponent: { ref: 'swamp-troll', name: 'The Swamp Troll', isBoss: true },
            rounds: [{ label: 'Save the young lady', mount: 'none', helmets: true, endsWhen: { type: 'ko' } }],
            intro: { speaker: 'The Swamp Troll', text: 'GRAAAH! Mine! The lady is MINE!' },
          },
        },
      ],
    },
  },
  m12: {
    engine: 'open-field',
    config: {
      env: 'mercenary-field', ground: 'grass', width: 180, music: 'battle', ambience: 'amb-battle',
      player: { character: 'rogue-paladin', title: 'Rogue Paladin' },
      playerSquads: [
        { name: 'Mercenary Foot', look: 'infantry', count: 9 },
        { name: 'Halberdiers', look: 'spearman', count: 7 },
        { name: 'Crossbows', look: 'archer', count: 6 },
        { name: 'Free Lances', look: 'cavalry', count: 5 },
      ],
      enemyCommanders: [
        { name: 'The Crimson Emir', character: 'saracen-leader-1', position: 0.74, squads: [{ name: 'Guard', look: 'infantry', count: 12 }, { name: 'Riders', look: 'cavalry', count: 6 }] },
        { name: 'The Indigo Vizier', character: 'saracen-leader-2', position: 0.86, squads: [{ name: 'Spears', look: 'spearman', count: 10 }, { name: 'Archers', look: 'archer', count: 8 }] },
        { name: 'The Desert Hawk', character: 'saracen-leader-1', position: 0.96, squads: [{ name: 'Lancers', look: 'cavalry', count: 6 }, { name: 'Swords', look: 'infantry', count: 8 }] },
      ],
    },
  },
  m13: {
    engine: 'duel',
    config: {
      arena: { env: 'imperial-arena', ground: 'sand', width: 30, music: 'duel', ambience: 'amb-crowd' },
      player: { character: 'emperor-disguise' },
      opponent: { ref: 'white-knight', name: 'The White Knight', isBoss: true },
      rounds: [
        { label: 'Mounted', mount: 'horse', helmets: true, endsWhen: { type: 'hpAtOrBelow', hp: DUEL.mountedEndHp } },
        { label: 'On foot', mount: 'none', helmets: true, endsWhen: { type: 'ko' } },
      ],
      intro: { speaker: 'Herald', text: 'Champions! First with horse and blade — then on foot until one yields!' },
    },
  },
  m14: {
    engine: 'quest',
    config: {
      playable: 'white-knight', music: 'battle',
      escort: { character: 'green-chestnut', name: 'Green Chestnut' },
      slides: [
        {
          kind: 'ground', title: 'The Balkan Forest', env: 'balkan-forest', ground: 'dirt', length: 75, ambience: 'amb-forest',
          waves: [{ count: W1, enemies: [{ look: 'bandit', weight: 2 }, { look: 'wolf', weight: 1 }], maxAlive: 3 }],
          hazards: [],
        },
        {
          kind: 'ground', title: 'The Valachia Mountains', env: 'valachia-mountains', ground: 'snow', length: 85, ambience: 'amb-wind',
          waves: [
            { count: 5, enemies: [{ look: 'balkan-soldier', weight: 2 }, { look: 'boar', weight: 1 }], maxAlive: 4 },
            { count: W2 - 5, enemies: [{ look: 'balkan-soldier', weight: 2 }, { look: 'archer', weight: 1 }, { look: 'wolf', weight: 1 }], maxAlive: 4 },
          ],
          hazards: [{ kind: 'projectiles', every: 12, projectile: 'javelin', origin: 'right' }],
        },
        {
          kind: 'ground', title: 'The German Fields', env: 'german-fields', ground: 'grass', length: 90, ambience: 'amb-wind',
          waves: [
            { count: 7, enemies: [{ look: 'infantry', weight: 2 }, { look: 'spearman', weight: 1 }, { look: 'bandit', weight: 1 }], maxAlive: 4 },
            { count: W3 - 7, enemies: [{ look: 'archer', weight: 1 }, { look: 'spearman', weight: 2 }, { look: 'infantry', weight: 2 }], maxAlive: 5 },
          ],
          hazards: [{ kind: 'projectiles', every: 6, projectile: 'arrow', origin: 'right' }],
        },
      ],
    },
  },
  m15: {
    engine: 'duel',
    config: {
      arena: { env: 'wedding-courtyard', ground: 'stone', width: 30, music: 'boss', ambience: 'amb-crowd' },
      player: { character: 'white-knight' },
      opponent: { ref: 'black-knight', name: 'The Black Knight', isBoss: true },
      rounds: threeRoundKnight,
      intro: { speaker: 'The Black Knight', text: 'You took Cordova from me. Today I take everything from you.' },
    },
  },
};

/** Mission 7 Training Grounds: built from the player's selection (still config, not code). */
export function trainingConfig(player: CharacterId, opponent: CharacterId, mounted: boolean): MissionConfig {
  return {
    engine: 'duel',
    config: {
      arena: { env: 'tournament', ground: 'sand', width: 30, music: 'duel', ambience: 'amb-crowd' },
      player: { character: player },
      opponent: { ref: opponent },
      rounds: [{ label: mounted ? 'Mounted bout' : 'On-foot bout', mount: mounted ? 'horse' : 'none', helmets: true, endsWhen: { type: 'ko' } }],
    },
  };
}
