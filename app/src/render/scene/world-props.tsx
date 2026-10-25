import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isAlive } from '@/core/sim/fighter';
import type { Hazard } from '@/core/sim/types';
import type { World } from '@/core/sim/world';
import { loadRawScene } from '@/render/models/model-library';

/** Simple instanced pool: begin → add(matrix[, colour]) → end. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(geom: THREE.BufferGeometry, mat: THREE.Material, max = 256, order = 0) {
    this.mesh = new THREE.InstancedMesh(geom, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = order;
  }
  begin() {
    this.n = 0;
  }
  add(m: THREE.Matrix4, c?: THREE.Color) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n, m);
    if (c) this.mesh.setColorAt(this.n, c);
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Procedural fallbacks used until/unless props.glb provides the real meshes. */
function arrowGeometry(length: number, shaftR: number, headR: number): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(shaftR, shaftR, length, 5).rotateZ(Math.PI / 2);
  const head = new THREE.ConeGeometry(headR, headR * 3, 5).rotateZ(-Math.PI / 2).translate(length / 2 + headR * 1.4, 0, 0);
  const fl = new THREE.BoxGeometry(length * 0.18, headR * 2.2, 0.01).translate(-length / 2 + length * 0.09, 0, 0);
  return mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed(), fl.toNonIndexed()])!;
}

function propGeometry(scene: THREE.Group | null, name: string, fallback: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const node = scene?.getObjectByName(name);
  if (!node) return fallback();
  const geoms: THREE.BufferGeometry[] = [];
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  node.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    geoms.push(g.index ? g.toNonIndexed() : g);
  });
  return geoms.length ? mergeGeometries(geoms) ?? fallback() : fallback();
}

interface Props {
  world: () => World | null;
}

export function WorldProps({ world }: Props) {
  const [props, setProps] = useState<THREE.Group | null>(null);
  const [ship, setShip] = useState<THREE.Group | null>(null);
  useEffect(() => {
    void loadRawScene('props').then(setProps);
    void loadRawScene('ship').then(setShip);
  }, []);

  const pools = useMemo(() => {
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.8 });
    const iron = new THREE.MeshStandardMaterial({ color: '#8d9096', roughness: 0.45, metalness: 0.6 });
    const stone = new THREE.MeshStandardMaterial({ color: '#7d766c', roughness: 0.95 });
    // Landing walls use the painted stone texture, tiled in world units.
    const wallTex = new THREE.TextureLoader().load('/assets/images/ground/stone.webp');
    wallTex.colorSpace = THREE.SRGBColorSpace;
    wallTex.wrapS = wallTex.wrapT = THREE.MirroredRepeatWrapping;
    wallTex.repeat.set(3, 2);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: '#b8ada0', roughness: 0.95 });
    const glow = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const shadow = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, opacity: 0.38, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bubbleMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const quad = new THREE.PlaneGeometry(1, 1);
    const pools = {
      arrow: new Pool(propGeometry(props, 'Arrow', () => arrowGeometry(0.85, 0.018, 0.035)), wood),
      spear: new Pool(propGeometry(props, 'Spear', () => arrowGeometry(2.0, 0.03, 0.06)), wood),
      javelin: new Pool(propGeometry(props, 'Javelin', () => arrowGeometry(1.6, 0.025, 0.05)), wood),
      rock: new Pool(propGeometry(props, 'Rock', () => new THREE.DodecahedronGeometry(0.4, 0)), stone),
      boulder: new Pool(propGeometry(props, 'Boulder', () => new THREE.DodecahedronGeometry(0.9, 0)), stone),
      beamProp: new Pool(propGeometry(props, 'FallingBeam', () => new THREE.BoxGeometry(2.2, 0.3, 0.3)), wood),
      chandelier: new Pool(propGeometry(props, 'Chandelier', () => new THREE.TorusGeometry(0.6, 0.06, 6, 16).rotateX(Math.PI / 2)), iron),
      trapBase: new Pool(propGeometry(props, 'SpikeTrap_Base', () => new THREE.BoxGeometry(1.6, 0.08, 0.8)), iron),
      trapSpikes: new Pool(
        propGeometry(props, 'SpikeTrap_Spikes', () =>
          mergeGeometries([-0.6, -0.3, 0, 0.3, 0.6].map((x) => new THREE.ConeGeometry(0.09, 0.7, 5).translate(x, 0.35, 0).toNonIndexed()))!,
        ),
        iron,
      ),
      bubble: new Pool(propGeometry(props, 'ShieldBubble', () => new THREE.SphereGeometry(1.2, 20, 14)), bubbleMat, 16, 25),
      glow: new Pool(quad, glow, 256, 30),
      shadow: new Pool(quad, shadow, 256, -5),
      beam: new Pool(quad, beamMat, 16, 31),
      platform: new Pool(new THREE.BoxGeometry(1, 1, 3), wallMat, 4),
      flag: new Pool(propGeometry(props, 'LandingFlag', () => new THREE.BoxGeometry(0.08, 3, 0.08).translate(0, 1.5, 0)), wood, 4),
    };
    pools.glow.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    pools.beam.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3);
    pools.bubble.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3);
    return pools;
  }, [props]);

  const shipModel = useMemo(() => {
    if (ship) {
      const g = ship.clone(true);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.MeshStandardMaterial).name === 'Primary') (m.material as THREE.MeshStandardMaterial).color.set('#7a2e24');
      });
      return g;
    }
    // Fallback cog: hull, mast and sail.
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 3), new THREE.MeshStandardMaterial({ color: '#5a3e26', roughness: 0.9 }));
    hull.position.y = 1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9), new THREE.MeshStandardMaterial({ color: '#4a3220' }));
    mast.position.y = 6;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ color: '#7a2e24', side: THREE.DoubleSide }));
    sail.position.set(0, 6.5, 0.3);
    g.add(hull, mast, sail);
    return g;
  }, [ship]);

  const ships = useMemo(() => Array.from({ length: 6 }, () => shipModel.clone(true)), [shipModel]);

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() }), []);

  const put = (pool: Pool, x: number, y: number, z: number, rz: number, sx: number, sy = sx, sz = sx, color?: string) => {
    tmp.e.set(0, 0, rz);
    tmp.q.setFromEuler(tmp.e);
    tmp.p.set(x, y, z);
    tmp.s.set(sx, sy, sz);
    tmp.m.compose(tmp.p, tmp.q, tmp.s);
    if (color) pool.add(tmp.m, tmp.c.set(color));
    else pool.add(tmp.m);
  };

  useFrame((state) => {
    const w = world();
    const all = Object.values(pools);
    for (const p of all) p.begin();
    ships.forEach((s) => (s.visible = false));
    if (w) {
      const t = state.clock.elapsedTime;
      // Blob shadows anchor fighters to the ground.
      for (const f of w.fighters) {
        if (f.removed || f.look.model === 'bird') continue;
        const h = Math.max(0, f.y);
        const k = Math.max(0.25, 1 - h / 6);
        const wdt = (f.mounted === 'horse' ? 3 : f.look.model === 'troll' ? 2.6 : 1.3) * k * f.fade;
        const floor = w.floorAt(f);
        if (f.mounted === 'hippogryph' && h > 5) continue;
        put(pools.shadow, f.x, floor + 0.02, -0.4, 0, wdt, wdt * 0.22, 1);
      }
      // Energy-shield bubbles; they turn amber and flicker as the energy runs low.
      for (const f of w.fighters) {
        if (!f.shieldOn || f.removed) continue;
        const k = f.shield / f.shieldMax;
        const s = (f.mounted === 'horse' ? 1.55 : 1) * f.look.scale * (0.84 + 0.025 * Math.sin(t * 6));
        const flicker = k < 0.25 && Math.sin(t * 28) > 0.3 ? 0.35 : 1;
        const cy = f.y + (f.mounted === 'horse' ? 1.7 : 1.0) * f.look.scale;
        put(pools.bubble, f.x, cy, f.isPlayer ? 0.9 : 0.4, 0, s, s, s, tmp.c.setHSL(0.55 - 0.45 * Math.max(0, 0.5 - k), 0.85, 0.6 * flicker).getStyle());
      }
      for (const pr of w.projectiles) {
        const angle = Math.atan2(pr.vy, pr.vx);
        const fade = pr.stuck > 0 ? Math.min(1, pr.stuck) : 1;
        switch (pr.kind) {
          case 'arrow':
            put(pools.arrow, pr.x, pr.y, 0.3, angle, fade);
            break;
          case 'spear':
            put(pools.spear, pr.x, pr.y, 0.3, angle, fade);
            break;
          case 'javelin':
            put(pools.javelin, pr.x, pr.y, 0.3, angle, fade);
            break;
          case 'rock':
          case 'fortress-shot':
          case 'city-shot':
            put(pools.rock, pr.x, pr.y, 0.3, t * 4, pr.kind === 'rock' ? 1 : 0.8);
            if (pr.kind === 'city-shot') put(pools.glow, pr.x, pr.y, 0.35, 0, 1.2, 1.2, 1, '#ff8a3a');
            break;
          case 'fireball':
            put(pools.glow, pr.x, pr.y, 0.4, 0, 1.4, 1.4, 1, '#ff7a1a');
            put(pools.glow, pr.x, pr.y, 0.42, 0, 0.7, 0.7, 1, '#fff0b0');
            break;
          case 'magic':
            put(pools.glow, pr.x, pr.y, 0.4, 0, 1.1, 1.1, 1, '#9b6bff');
            put(pools.glow, pr.x, pr.y, 0.42, 0, 0.5, 0.5, 1, '#f0e6ff');
            break;
        }
      }
      let shipIdx = 0;
      for (const h of w.hazards) drawHazard(h, t, w, () => ships[shipIdx++]);
    }
    for (const p of all) p.end();
  });

  function drawHazard(h: Hazard, t: number, w: World, nextShip: () => THREE.Object3D | undefined) {
    switch (h.kind) {
      case 'spike-trap': {
        const cycle = h.warn + h.active + h.rest;
        const local = h.t % cycle;
        let rise = 0;
        if (local < h.warn) rise = 0.12 + Math.sin(local * 40) * 0.03;
        else if (local < h.warn + 0.08) rise = (local - h.warn) / 0.08;
        else if (local < h.warn + h.active) rise = 1;
        else if (local < h.warn + h.active + 0.25) rise = 1 - (local - h.warn - h.active) / 0.25;
        put(pools.trapBase, h.x, 0.02, -0.2, 0, 1);
        // Spikes grow out of the plate (scaled from their base) so nothing shows below ground when retracted.
        if (rise > 0.02) put(pools.trapSpikes, h.x, 0.04, -0.2, 0, 1, rise, 1);
        if (local < h.warn) put(pools.glow, h.x, 0.1, -0.1, 0, 2, 0.5, 1, '#ff5a2a');
        break;
      }
      case 'falling-object': {
        const landed = h.active > 0;
        const k = landed ? 1 : Math.min(1, h.t / Math.max(0.01, h.warn));
        if (!landed) put(pools.shadow, h.x, 0.03, -0.3, 0, h.width * (0.4 + k * 0.8), h.width * 0.2, 1);
        if (h.t >= h.warn || landed) {
          const fade = landed ? Math.max(0, 1 - (h.t - h.active) / 1.2) : 1;
          const pool = h.model === 'chandelier' ? pools.chandelier : h.model === 'beam' ? pools.beamProp : h.model === 'boulder' ? pools.boulder : pools.rock;
          put(pool, h.x, h.y + (h.model === 'chandelier' ? 0.2 : 0.4), 0, landed ? 0.2 : t * 3, fade);
          if (h.model === 'chandelier' && !landed) put(pools.glow, h.x, h.y + 0.5, 0.1, 0, 1.6, 1.6, 1, '#ffb060');
        }
        break;
      }
      case 'beam': {
        const x0 = h.dir > 0 ? h.x : h.x - h.width;
        const cx = x0 + h.width / 2;
        if (h.t < h.warn) {
          const flick = 0.5 + Math.sin(h.t * 50) * 0.5;
          put(pools.beam, cx, h.y, 0.5, 0, h.width, 0.08 + 0.05 * flick, 1, '#c084fc');
          put(pools.glow, h.x, h.y, 0.55, 0, 1 + h.t * 2, 1 + h.t * 2, 1, '#d8b4fe');
        } else if (h.t < h.warn + h.active + 0.2) {
          const k = 1 - Math.max(0, h.t - h.warn - h.active) / 0.2;
          put(pools.beam, cx, h.y, 0.5, 0, h.width, 1.1 * k, 1, '#a855f7');
          put(pools.beam, cx, h.y, 0.52, 0, h.width, 0.45 * k, 1, '#fdf4ff');
        }
        break;
      }
      case 'lightning': {
        const stun = h.variant === 'stun';
        if (h.t < h.warn) {
          const k = h.t / h.warn;
          put(pools.glow, h.x, 0.08, 0.2, 0, (stun ? 2.6 : 2.2) * (1.2 - k * 0.4), 0.6, 1, stun ? '#ffe066' : '#bcd4ff');
        } else if (h.t < h.warn + 0.3) {
          const k = 1 - (h.t - h.warn) / 0.3;
          if (stun) put(pools.glow, h.x, 1, 0.4, 0, 3 * k, 3 * k, 1, '#ffe066');
          else {
            put(pools.beam, h.x, 6, 0.4, Math.PI / 2 + Math.sin(h.t * 80) * 0.05, 12, 0.5 * k, 1, '#e0ebff');
            put(pools.glow, h.x, 0.5, 0.45, 0, 4 * k, 2 * k, 1, '#dfe8ff');
          }
        }
        break;
      }
      case 'terrain-wave':
        if (h.t >= h.warn) put(pools.glow, h.x, 0.2, 0.2, 0, 1.4, 0.7, 1, '#b08850');
        break;
      case 'ship': {
        const s = nextShip();
        if (!s) break;
        s.visible = true;
        // Ships sail in the background sea, behind the foreground swell layer (z -20) so waves hide their hulls.
        s.position.set(h.x, 0.75 + Math.sin(t * 0.9 + h.id) * 0.12, -26);
        s.rotation.set(0, h.dir > 0 ? 0 : Math.PI, Math.sin(t * 0.7 + h.id) * 0.04);
        s.scale.setScalar(0.48);
        break;
      }
      case 'landing-zone': {
        const height = h.y + 3;
        put(pools.platform, h.x, h.y - height / 2, -0.5, 0, h.width, height, 1);
        put(pools.flag, h.x + h.width / 2 - 0.4, h.y, -0.2, 0, 1);
        put(pools.glow, h.x, h.y + 0.1, 0.2, 0, h.width * 1.1, 0.6, 1, '#ffd27a');
        void w;
        break;
      }
      default:
        break;
    }
  }

  void isAlive;
  return (
    <group>
      {Object.values(pools).map((p) => (
        <primitive key={p.mesh.uuid} object={p.mesh} />
      ))}
      {ships.map((s) => (
        <primitive key={s.uuid} object={s} />
      ))}
    </group>
  );
}
