import { audio } from '@/core/audio/audio-manager';
import { publishCallout } from '@/core/hud/hud-store';
import type { SceneState } from '@/core/engine/engine-types';
import type { GameEvent } from '@/core/sim/types';
import type { World } from '@/core/sim/world';
import type { GroundMaterial } from '@/content/ids';
import type { ParticleSystem } from './particles';

/**
 * Presentation director: turns simulation events into sound, particles and camera shake.
 * Every gameplay action has audible and visible feedback (spec §5 Combat Feel).
 */

const STEP_SOUND: Record<GroundMaterial, string> = {
  grass: 'footstep-grass',
  dirt: 'footstep-grass',
  sand: 'footstep',
  stone: 'footstep-stone',
  marble: 'footstep-stone',
  wood: 'footstep-wood',
  snow: 'footstep-snow',
};

const DUST: Record<GroundMaterial, string> = {
  grass: '#8a7a5a', dirt: '#8a6e50', sand: '#c8b088', stone: '#8a8580', marble: '#b8b0a8', wood: '#7a5a3a', snow: '#e8ecef',
};

export interface Shake {
  strength: number;
  duration: number;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

export class PresentationDirector {
  private readonly fx: ParticleSystem;
  onShake: (s: Shake) => void = () => {};
  private flapT = 0;
  private lowHealth = false;
  private weatherT = 0;

  constructor(fx: ParticleSystem) {
    this.fx = fx;
  }

  private sparks(x: number, y: number, n: number, color = '#ffb347', speed = 7) {
    this.fx.burst(n, () => {
      const a = r(0, Math.PI * 2);
      const s = r(speed * 0.4, speed);
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 2, life: r(0.18, 0.4), size: r(0.05, 0.09), color, gravity: 14, drag: 2, stretch: 0.035, additive: true };
    });
  }

  private flash(x: number, y: number, size: number, color = '#fff2d0', life = 0.12) {
    this.fx.spawn({ x, y, life, size, grow: 1.6, color, additive: true, alpha: 0.9 });
  }

  private dust(x: number, y: number, n: number, color: string, spread = 1, up = 1.2) {
    this.fx.burst(n, () => ({ x: x + r(-0.3, 0.3) * spread, y: y + r(0, 0.2), vx: r(-1.6, 1.6) * spread, vy: r(0.2, up), life: r(0.4, 0.8), size: r(0.25, 0.5), grow: 2.2, color, drag: 2.5, alpha: 0.45 }));
  }

  private magic(x: number, y: number, n: number, color: string, speed = 3) {
    this.fx.burst(n, () => {
      const a = r(0, Math.PI * 2);
      return { x, y, vx: Math.cos(a) * r(0.5, speed), vy: Math.sin(a) * r(0.5, speed), life: r(0.4, 0.9), size: r(0.12, 0.25), grow: 0.3, color, drag: 1.5, additive: true };
    });
  }

  process(events: GameEvent[], world: World | null, scene: SceneState | null) {
    const surface = world?.surface ?? 'dirt';
    for (const e of events) {
      switch (e.type) {
        case 'swing': {
          const name = e.model === 'haunted-tree' ? 'tree-swipe' : e.model === 'troll' ? 'swing-heavy' : e.model === 'wolf' || e.model === 'boar' ? 'growl' : e.heavy ? 'swing-heavy' : 'swing-light';
          audio.play(name, { x: e.x, volume: e.isPlayer ? 0.9 : 0.6 });
          if (e.spectral) audio.play('ghost', { x: e.x, volume: 0.35 });
          if (e.model === 'troll') audio.play('troll-roar', { x: e.x, volume: 0.5 });
          break;
        }
        case 'hit': {
          if (e.outcome === 'parried') {
            audio.play('parry', { x: e.x, volume: 1 });
            this.sparks(e.x, e.y, 26, '#ffe9a8', 10);
            this.flash(e.x, e.y, 1.6, '#fff6d8', 0.16);
          } else if (e.outcome === 'blocked') {
            audio.play('block', { x: e.x });
            this.sparks(e.x, e.y, 10, '#ffd27a', 6);
            this.flash(e.x, e.y, 0.7);
          } else if (e.outcome === 'blockBreak') {
            audio.play('block-break', { x: e.x });
            this.sparks(e.x, e.y, 22, '#ffb347', 9);
            this.flash(e.x, e.y, 1.3);
          } else {
            if (e.creature) audio.play('hit-flesh', { x: e.x, volume: e.heavy ? 1 : 0.8 });
            else if (e.armored) {
              audio.play('hit-armor', { x: e.x, volume: e.heavy ? 1 : 0.85 });
              audio.play('hit-flesh', { x: e.x, volume: 0.4 });
            } else audio.play('hit-flesh', { x: e.x, volume: e.heavy ? 1 : 0.85 });
            if (!e.creature && Math.random() < (e.heavy ? 0.8 : 0.45)) audio.play('grunt', { x: e.x, volume: e.isPlayer ? 0.8 : 0.5, pitchJitter: 0.12 });
            if (e.heavy) audio.play('armor-clank', { x: e.x, volume: 0.5 });
            this.sparks(e.x, e.y, e.heavy ? 18 : 9, e.armored ? '#ffb347' : '#e8d2a0', e.heavy ? 9 : 6);
            this.flash(e.x, e.y, e.heavy ? 1.2 : 0.75);
            this.dust(e.x, e.y - 0.3, e.heavy ? 6 : 3, '#a89070', 0.6, 1.5);
          }
          break;
        }
        case 'dodge':
          audio.play(e.mounted ? 'whoosh-dodge' : 'dodge', { x: e.x, volume: e.isPlayer ? 0.8 : 0.45 });
          this.dust(e.x, 0.05, e.mounted ? 8 : 5, DUST[surface], 1.2, 0.8);
          break;
        case 'dodge-avoid':
          audio.play('whoosh-dodge', { x: e.x, volume: 0.6 });
          this.magic(e.x, e.y, 6, '#d8e8ff', 2);
          break;
        case 'jump':
          audio.play('jump', { x: e.x, volume: 0.6 });
          this.dust(e.x, 0.05, 4, DUST[surface], 0.8, 0.6);
          break;
        case 'land':
          audio.play('land', { x: e.x, volume: e.heavy ? 0.9 : 0.6 });
          this.dust(e.x, 0.05, e.heavy ? 10 : 6, DUST[e.surface], 1.4, 0.7);
          break;
        case 'footstep': {
          if (e.mounted) {
            audio.play('horse-gallop', { x: e.x, volume: e.isPlayer ? 0.45 : 0.22 });
            this.dust(e.x, 0.05, 3, DUST[e.surface], 1.3, 0.9);
          } else {
            audio.play(e.creature ? 'footstep' : STEP_SOUND[e.surface], { x: e.x, volume: e.isPlayer ? 0.35 : 0.14, pitchJitter: 0.1 });
            if (e.isPlayer) this.dust(e.x, 0.05, 1, DUST[e.surface], 0.5, 0.3);
          }
          break;
        }
        case 'block-raise':
          audio.play('shield-raise', { x: e.x, volume: 0.45 });
          break;
        case 'shield-up':
          audio.play('shield-raise', { x: e.x, volume: e.isPlayer ? 0.5 : 0.3, rate: 1.4 });
          this.magic(e.x, 1.2, 10, '#8fdcff', 2);
          break;
        case 'shield-hit':
          audio.play('block', { x: e.x, volume: 0.55, rate: 1.3 });
          this.magic(e.x, e.y, 8, '#bfeaff', 3);
          break;
        case 'shield-break':
          audio.play('block-break', { x: e.x, volume: 0.8, rate: 0.9 });
          this.magic(e.x, e.y, 24, '#8fdcff', 5);
          this.flash(e.x, e.y, 2.4, '#bfeaff', 0.2);
          break;
        case 'death': {
          const name = e.model === 'wolf' || e.model === 'boar' ? 'animal-death' : e.model === 'bird' ? 'bird' : e.model === 'troll' ? 'troll-roar' : e.model === 'haunted-tree' ? 'tree-rise' : e.spectral ? 'ghost-death' : e.enemyType === 'zombie' ? 'zombie-death' : 'death';
          audio.play(name, { x: e.x, volume: e.isPlayer ? 1 : 0.75 });
          if (e.mounted) audio.play('horse-neigh', { x: e.x, volume: 0.6 });
          if (e.spectral) this.magic(e.x, e.y + 1, 22, '#7dffb0', 3);
          else this.dust(e.x, 0.1, 12, DUST[surface], 1.6, 1.2);
          if (e.isPlayer) audio.play('defeat', { volume: 0.5 });
          break;
        }
        case 'release': {
          const name = e.kind === 'arrow' ? 'bow-shoot' : e.kind === 'spear' || e.kind === 'javelin' ? 'spear-throw' : e.kind === 'fireball' ? 'fireball' : e.kind === 'magic' || e.kind === 'cast' ? 'magic-cast' : 'catapult';
          audio.play(name, { x: e.x, volume: 0.75 });
          if (e.kind === 'cast' || e.kind === 'magic' || e.kind === 'fireball') this.magic(e.x, e.y, 14, e.kind === 'fireball' ? '#ff9a3c' : '#b48cff', 2.5);
          break;
        }
        case 'impact': {
          if (e.kind === 'fireball' || e.kind === 'magic') {
            audio.play('explosion', { x: e.x, volume: 0.8 });
            this.magic(e.x, e.y, 26, e.kind === 'fireball' ? '#ff8a2a' : '#a78bfa', 5);
            this.flash(e.x, e.y, 2.2, e.kind === 'fireball' ? '#ffb070' : '#c8b0ff', 0.2);
          } else if (e.blocked) {
            audio.play('arrow-impact', { x: e.x, volume: 0.7 });
            audio.play('block', { x: e.x, volume: 0.6 });
            this.sparks(e.x, e.y, 8, '#ffd27a', 5);
          } else if (e.kind === 'rock' || e.kind === 'fortress-shot' || e.kind === 'city-shot') {
            audio.play('rock-fall', { x: e.x, volume: 0.8 });
            this.dust(e.x, Math.max(0.05, e.y), 12, '#8a8070', 1.6, 2);
          } else {
            audio.play('arrow-impact', { x: e.x, volume: e.hitFighter ? 0.8 : 0.45 });
            if (!e.hitFighter) this.dust(e.x, 0.05, 3, DUST[surface], 0.5, 0.6);
          }
          break;
        }
        case 'hazard-warn': {
          if (e.kind === 'falling-object') audio.play('rock-fall', { x: e.x, volume: 0.25, rate: 1.3 });
          else if (e.kind === 'wind-gust') audio.play(e.variant === 'wave' ? 'wave-splash' : 'wind', { x: e.x, volume: 0.8 });
          else if (e.kind === 'beam') audio.play('magic-cast', { x: e.x, volume: 0.7, rate: 0.8 });
          else if (e.kind === 'lightning' && e.variant === 'stun') audio.play('magic-cast', { x: e.x, volume: 0.6, rate: 1.2 });
          else if (e.kind === 'terrain-wave') audio.play('terrain-quake', { x: e.x, volume: 0.6 });
          else if (e.kind === 'spike-trap') audio.play('trap', { x: e.x, volume: 0.2, rate: 0.7 });
          break;
        }
        case 'hazard-strike': {
          if (e.kind === 'spike-trap') {
            audio.play('trap', { x: e.x, volume: 0.7 });
            this.dust(e.x, 0.05, 5, '#8a8070', 0.8, 1);
          } else if (e.kind === 'falling-object') {
            audio.play('rock-fall', { x: e.x, volume: 1 });
            this.dust(e.x, 0.05, 16, '#8a8070', 2, 2);
          } else if (e.kind === 'lightning' && e.variant !== 'stun') {
            audio.play('thunder', { x: e.x, volume: 1 });
            this.sparks(e.x, 0.2, 20, '#dfe8ff', 8);
            this.flash(e.x, 2, 5, '#e8f0ff', 0.18);
          } else if (e.kind === 'beam') {
            audio.play('beam', { x: e.x, volume: 1 });
          } else if (e.kind === 'wind-gust' && e.variant === 'wave') {
            audio.play('water-splash', { x: e.x, volume: 0.8 });
          }
          break;
        }
        case 'spawn':
          if (e.spectral) audio.play('ghost', { x: e.x, volume: 0.5 });
          else if (e.enemyType === 'zombie') audio.play('zombie', { x: e.x, volume: 0.5 });
          else if (e.enemyType === 'wolf' || e.enemyType === 'boar') audio.play('growl', { x: e.x, volume: 0.6 });
          else if (e.enemyType === null) audio.play('bird', { x: e.x, volume: 0.5 });
          break;
        case 'round-start':
          audio.play('round-bell', { volume: 0.9 });
          if (scene?.env === 'tournament' || scene?.env === 'imperial-arena' || scene?.env === 'wedding-courtyard') audio.play('crowd-cheer', { volume: 0.6 });
          break;
        case 'round-end':
          audio.play('horn', { volume: 0.7 });
          if (scene?.env === 'tournament' || scene?.env === 'imperial-arena') audio.play('crowd-gasp', { volume: 0.6 });
          break;
        case 'helmet-off':
          audio.play('helmet-off', { x: e.x });
          break;
        case 'dismount':
          audio.play('dismount', { x: e.x });
          audio.play('horse-neigh', { x: e.x, volume: 0.7 });
          this.dust(e.x, 0.05, 14, DUST[surface], 2, 1);
          break;
        case 'mount':
          audio.play('mount', { x: e.x });
          audio.play('horse-snort', { x: e.x, volume: 0.6 });
          break;
        case 'stun':
          audio.play('stun', { x: e.x });
          this.magic(e.x, e.y, 16, '#ffe066', 2);
          break;
        case 'summon':
          audio.play(e.what === 'haunted-tree' ? 'tree-rise' : e.what === 'zombie' ? 'zombie' : 'ghost-summon', { x: e.x });
          this.magic(e.x, e.y + 0.5, 30, e.what === 'zombie' ? '#9acd32' : '#5dffa0', 3);
          break;
        case 'mana-drain':
          audio.play('mana-drain', { volume: 0.35 });
          break;
        case 'quake':
          audio.play('terrain-quake', { volume: 0.9 });
          break;
        case 'tag-in':
          audio.play('tag-in', { x: e.x });
          this.magic(e.x, 1.2, 18, '#ffe9a8', 3);
          break;
        case 'order':
          audio.play(`order-${e.order}`, { volume: 0.8 });
          break;
        case 'select':
          audio.play('select-unit', { volume: 0.6 });
          break;
        case 'slide-advance':
          audio.play('slide-advance', { volume: 0.7 });
          break;
        case 'wave-start':
          audio.play('wave-start', { volume: 0.8 });
          break;
        case 'enemy-alert':
          audio.play('enemy-alert', { x: e.x, volume: 0.7 });
          break;
        case 'roar':
          audio.play('troll-roar', { x: e.x });
          break;
        case 'laugh':
          audio.play(e.who === 'witch' ? 'witch-laugh' : 'wizard-laugh', { x: e.x });
          break;
        case 'heal':
          audio.play('heal', { x: e.x, volume: 0.7 });
          this.fx.burst(16, () => ({ x: e.x + r(-0.5, 0.5), y: r(0.2, 1.8), vy: r(0.8, 1.8), life: r(0.6, 1.1), size: r(0.08, 0.16), color: '#9dffb0', additive: true }));
          break;
        case 'landing':
          audio.play(e.safe ? 'landing' : 'hit-flesh', { x: e.x });
          this.dust(e.x, 3, e.safe ? 16 : 8, '#8a8070', 2, 1);
          break;
        case 'wing-flap':
          audio.play('wing-flap', { x: e.x, volume: 0.35 });
          break;
        case 'commander-down':
          audio.play('horn', { volume: 0.9 });
          audio.play(e.routed ? 'horse-gallop' : 'crowd-cheer', { volume: 0.6 });
          break;
        case 'outcome':
          audio.play(e.result === 'victory' ? 'victory' : 'defeat', { volume: 1 });
          if (e.result === 'victory') void audio.playMusic('victory', 0.6);
          break;
        case 'shake':
          this.onShake({ strength: e.strength, duration: e.duration });
          break;
        case 'special': {
          const vol = e.isPlayer ? 0.9 : 0.55;
          switch (e.move) {
            case 'bash':
              audio.play('shield-raise', { x: e.x, volume: vol });
              this.dust(e.x, 0.05, 4, DUST[surface], 0.8, 0.6);
              break;
            case 'jumpAttack':
            case 'lunge':
              audio.play('whoosh-dodge', { x: e.x, volume: vol });
              if (e.move === 'lunge') this.dust(e.x, 0.05, 6, DUST[surface], 1.4, 0.5);
              break;
            case 'plunge':
              audio.play('whoosh-dodge', { x: e.x, volume: vol, rate: 0.8 });
              break;
            case 'slam':
              audio.play('terrain-quake', { x: e.x, volume: vol });
              audio.play('land', { x: e.x, volume: 1 });
              this.dust(e.x, 0.05, 26, DUST[surface], 3.2, 1.6);
              this.sparks(e.x, 0.3, 18, '#ffd27a', 9);
              this.flash(e.x, 0.4, 3, '#fff0c8', 0.18);
              break;
            case 'finisher':
              audio.play('swing-heavy', { x: e.x, volume: vol, rate: 0.9 });
              this.magic(e.x, e.y, 10, '#ffe2a0', 3);
              break;
            case 'riposte':
              audio.play('parry', { x: e.x, volume: 1, rate: 0.85 });
              this.sparks(e.x, e.y, 30, '#ffe9a8', 11);
              this.flash(e.x, e.y, 2.4, '#fff6d8', 0.2);
              break;
          }
          if (e.isPlayer) {
            const label = { bash: 'Shield Bash!', jumpAttack: 'Jump Slash!', plunge: 'Plunging Strike!', slam: '', lunge: 'Lunge!', finisher: 'Finisher!', riposte: 'Riposte!' }[e.move];
            if (label) publishCallout(label);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** Continuous effects: projectile trails, wind streaks, weather, hippogryph wings, low-health heartbeat. */
  update(dt: number, world: World | null, scene: SceneState | null, view: { x: number; y: number; w: number; h: number }) {
    if (!world) return;
    for (const p of world.projectiles) {
      if (p.dead || p.stuck > 0) continue;
      if (p.kind === 'fireball') this.fx.spawn({ x: p.x, y: p.y, vx: -p.vx * 0.1 + r(-0.3, 0.3), vy: r(0, 0.6), life: r(0.25, 0.45), size: r(0.3, 0.55), grow: 0.2, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffc040', additive: true });
      else if (p.kind === 'magic') this.fx.spawn({ x: p.x, y: p.y, vx: r(-0.4, 0.4), vy: r(-0.4, 0.4), life: r(0.3, 0.5), size: r(0.2, 0.35), grow: 0.2, color: '#b48cff', additive: true });
      else if (p.kind === 'fortress-shot' || p.kind === 'city-shot') this.fx.spawn({ x: p.x, y: p.y, life: 0.5, size: 0.35, grow: 2, color: '#6a6058', alpha: 0.35 });
    }
    // Wind streaks while a gust blows.
    if (Math.abs(world.windForce) > 1) {
      const n = Math.min(4, Math.abs(world.windForce) / 6);
      for (let i = 0; i < n; i++) {
        const dir = Math.sign(world.windForce);
        this.fx.spawn({ x: view.x - dir * view.w * 0.55 + r(-1, 1), y: view.y + r(-view.h * 0.45, view.h * 0.35), vx: dir * r(14, 22), vy: r(-0.5, 0.5), life: r(0.7, 1.2), size: 0.05, stretch: 0.06, color: '#e8e4da', alpha: 0.35 });
      }
    }
    // Weather.
    this.weatherT += dt;
    if (scene?.fog === 'storm') {
      for (let i = 0; i < 6; i++) this.fx.spawn({ x: view.x + r(-view.w * 0.6, view.w * 0.6), y: view.y + view.h * 0.55, vx: -3 - world.windForce * 0.3, vy: -20, life: view.h / 20, size: 0.03, stretch: 0.03, color: '#c8d2e0', alpha: 0.35, z: 2 });
    } else if (scene?.ground === 'snow' && !scene.flight) {
      if (Math.random() < 0.6) this.fx.spawn({ x: view.x + r(-view.w * 0.6, view.w * 0.6), y: view.y + view.h * 0.55, vx: r(-0.6, 0.2), vy: r(-1.5, -0.8), life: 9, size: r(0.05, 0.1), color: '#ffffff', alpha: 0.8, z: 2 });
    } else if (scene && (scene.env === 'dark-hallway' || scene.env === 'mirror-hall' || scene.env === 'fortress-dungeon' || scene.env === 'grand-hall')) {
      if (Math.random() < 0.15) this.fx.spawn({ x: view.x + r(-view.w * 0.5, view.w * 0.5), y: r(0.2, 4), vx: r(-0.2, 0.2), vy: r(0.05, 0.25), life: r(3, 5), size: r(0.04, 0.08), color: '#9dffb0', additive: true, alpha: 0.6 });
    }
    // Hippogryph wingbeats and the low-health heartbeat.
    const p = world.player;
    if (p && p.mounted === 'hippogryph' && p.action !== 'dead') {
      this.flapT -= dt;
      if (this.flapT <= 0) {
        this.flapT = 0.8;
        audio.play('wing-flap', { x: p.x, volume: 0.3 });
      }
    }
    const low = !!p && p.action !== 'dead' && p.hp > 0 && p.hp / p.maxHp <= 0.25;
    if (low !== this.lowHealth) {
      this.lowHealth = low;
      if (low) audio.startLoop('low-health', 0.55);
      else audio.stopLoop('low-health');
    }
    this.fx.update(dt);
  }

  dispose() {
    audio.stopAllLoops();
  }
}
