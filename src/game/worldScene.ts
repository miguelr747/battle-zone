import * as THREE from 'three';
import { ChestState, GraphicsQuality, LootPickup, StormState } from '../shared/types';
import { RARITY_COLORS, WEAPON_MAP } from '../shared/weapons';
import {
  MAP_HALF,
  MAP_SIZE,
  WorldBuilding,
  WorldLayout,
  WorldProp,
  getRegionAt,
  getTerrainHeight,
} from '../shared/worldGen';
import { createBuildingFacadeTexture, createTerrainTexture } from './textures';
import { buildWeaponMesh } from './models/weaponModel';

export function buildWorldEnvironment(
  scene: THREE.Scene,
  layout: WorldLayout,
  quality: GraphicsQuality,
  maxAniso: number
) {
  const castShadows = quality !== 'BAJA';

  // 1. Terrain Mesh with Biome Vertex Colors
  const segs = quality === 'ALTA' ? 160 : quality === 'MEDIA' ? 120 : 80;
  const terrainGeo = new THREE.PlaneGeometry(MAP_SIZE + 260, MAP_SIZE + 260, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getTerrainHeight(x, z);
    posAttr.setY(i, y);

    const reg = getRegionAt(x, z);
    if (y < -1.0) {
      c.setHex(0x8a795d); // lakebed / seabed sand
    } else if (reg.id === 'desert') {
      c.setHex(0xd6b06b);
    } else if (reg.id === 'mountains') {
      c.setHex(y > 16 ? 0xe2e8f0 : 0x64748b);
    } else if (reg.id === 'forest') {
      c.setHex(0x3a6b35);
    } else if (reg.id === 'city' || reg.id === 'airport' || reg.id === 'industrial') {
      c.setHex(0x475569);
    } else {
      c.setHex(0x527a3e);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: createTerrainTexture(maxAniso),
    roughness: 0.92,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 2. Water Plane (Lago Cristal & Surrounding Ocean)
  const waterGeo = new THREE.PlaneGeometry(2400, 2400);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.18,
    metalness: 0.55,
    transparent: true,
    opacity: 0.78,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = -1.6;
  scene.add(waterMesh);

  // Airport Runway Decal
  const runwayGeo = new THREE.PlaneGeometry(18, 165);
  runwayGeo.rotateX(-Math.PI / 2);
  const runwayMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const runway = new THREE.Mesh(runwayGeo, runwayMat);
  runway.position.set(60, 1.56, 445);
  runway.rotation.y = Math.PI / 2;
  runway.receiveShadow = true;
  scene.add(runway);

  // 3. Explorable Buildings with real doorways
  const facadeCache = new Map<string, THREE.MeshStandardMaterial>();
  for (const b of layout.buildings) {
    buildStructureMesh(scene, b, facadeCache, maxAniso, castShadows);
  }

  // 4. Instanced Props (Trees, Pines, Rocks, Palms, Containers, Crates)
  const propMeshes = buildInstancedProps(scene, layout.props, castShadows);

  // 5. Storm Cylinder Wall
  const stormGeo = new THREE.CylinderGeometry(1, 1, 160, 48, 1, true);
  const stormMat = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const stormMesh = new THREE.Mesh(stormGeo, stormMat);
  stormMesh.position.y = 70;
  scene.add(stormMesh);

  // 6. Transport Dropship VTOL
  const dropship = createDropshipMesh();
  dropship.visible = false;
  scene.add(dropship);

  return {
    propMeshes,
    stormMesh,
    dropship,
    updateStorm: (st: StormState) => {
      stormMesh.position.x = st.centerX;
      stormMesh.position.z = st.centerZ;
      stormMesh.scale.set(Math.max(1, st.radius), 1, Math.max(1, st.radius));
    },
  };
}

function buildStructureMesh(
  scene: THREE.Scene,
  b: WorldBuilding,
  cache: Map<string, THREE.MeshStandardMaterial>,
  maxAniso: number,
  castShadows: boolean
) {
  const key = `${b.color}_${b.accentColor}`;
  let wallMat = cache.get(key);
  if (!wallMat) {
    wallMat = new THREE.MeshStandardMaterial({
      map: createBuildingFacadeTexture(b.color, b.accentColor, maxAniso),
      roughness: 0.6,
      metalness: 0.22,
    });
    cache.set(key, wallMat);
  }

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.35,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.85,
  });

  const grp = new THREE.Group();
  grp.position.set(b.x, b.y, b.z);

  // Floor slab
  const floor = new THREE.Mesh(new THREE.BoxGeometry(b.width, 0.2, b.depth), floorMat);
  floor.position.y = 0.08;
  floor.receiveShadow = true;
  grp.add(floor);

  // Roof slab
  const roof = new THREE.Mesh(new THREE.BoxGeometry(b.width + 0.5, 0.4, b.depth + 0.5), roofMat);
  roof.position.y = b.height;
  roof.castShadow = castShadows;
  roof.receiveShadow = true;
  grp.add(roof);

  // Neon rooftop beacon trim for Futuristic City / Airport
  if (b.kind === 'TOWER') {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(b.width + 0.55, 0.28, b.depth + 0.55),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(b.accentColor),
        emissive: new THREE.Color(b.accentColor),
        emissiveIntensity: 0.65,
      })
    );
    trim.position.y = b.height + 0.25;
    grp.add(trim);
  }

  const thick = 0.45;
  const addWallWithOptionalDoor = (
    w: number,
    h: number,
    d: number,
    px: number,
    pz: number,
    hasDoor: boolean,
    alongX: boolean
  ) => {
    if (!hasDoor) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat!);
      m.position.set(px, h / 2, pz);
      m.castShadow = castShadows;
      m.receiveShadow = true;
      grp.add(m);
      return;
    }

    // Leave a 3.0m wide x 3.2m tall doorway
    const doorW = 3.0;
    const doorH = 3.2;
    if (alongX) {
      const sideW = Math.max(0.5, (w - doorW) / 2);
      const l = new THREE.Mesh(new THREE.BoxGeometry(sideW, h, d), wallMat!);
      l.position.set(px - w / 2 + sideW / 2, h / 2, pz);
      const r = new THREE.Mesh(new THREE.BoxGeometry(sideW, h, d), wallMat!);
      r.position.set(px + w / 2 - sideW / 2, h / 2, pz);
      const top = new THREE.Mesh(new THREE.BoxGeometry(doorW, Math.max(0.5, h - doorH), d), wallMat!);
      top.position.set(px, doorH + (h - doorH) / 2, pz);
      grp.add(l, r, top);
    } else {
      const sideD = Math.max(0.5, (d - doorW) / 2);
      const l = new THREE.Mesh(new THREE.BoxGeometry(w, h, sideD), wallMat!);
      l.position.set(px, h / 2, pz - d / 2 + sideD / 2);
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, sideD), wallMat!);
      r.position.set(px, h / 2, pz + d / 2 - sideD / 2);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, Math.max(0.5, h - doorH), doorW), wallMat!);
      top.position.set(px, doorH + (h - doorH) / 2, pz);
      grp.add(l, r, top);
    }
  };

  addWallWithOptionalDoor(b.width, b.height, thick, 0, -b.depth / 2, b.doorSide === 'N', true);
  addWallWithOptionalDoor(b.width, b.height, thick, 0, b.depth / 2, b.doorSide === 'S', true);
  addWallWithOptionalDoor(thick, b.height, b.depth, b.width / 2, 0, b.doorSide === 'E', false);
  addWallWithOptionalDoor(thick, b.height, b.depth, -b.width / 2, 0, b.doorSide === 'W', false);

  scene.add(grp);
}

function buildInstancedProps(scene: THREE.Scene, props: WorldProp[], castShadows: boolean) {
  const trunks: WorldProp[] = [];
  const crowns: WorldProp[] = [];
  const pines: WorldProp[] = [];
  const rocks: WorldProp[] = [];
  const containers: WorldProp[] = [];
  const crates: WorldProp[] = [];

  for (const p of props) {
    if (p.kind === 'TREE' || p.kind === 'PALM') {
      trunks.push(p);
      crowns.push(p);
    } else if (p.kind === 'PINE') {
      trunks.push(p);
      pines.push(p);
    } else if (p.kind === 'ROCK') {
      rocks.push(p);
    } else if (p.kind === 'CONTAINER') {
      containers.push(p);
    } else {
      crates.push(p);
    }
  }

  const dummy = new THREE.Object3D();
  const makeInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    list: WorldProp[],
    yOffset: number,
    sx = 1,
    sy = 1,
    sz = 1
  ) => {
    if (list.length === 0) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = castShadows;
    im.receiveShadow = true;
    list.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + yOffset * p.scale, p.z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.set(p.scale * sx, p.scale * sy, p.scale * sz);
      dummy.updateMatrix();
      im.setMatrixAt(idx, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
    return im;
  };

  makeInstanced(
    new THREE.CylinderGeometry(0.28, 0.42, 3.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 }),
    trunks,
    1.6
  );
  makeInstanced(
    new THREE.DodecahedronGeometry(2.1, 0),
    new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.8 }),
    crowns,
    4.1
  );
  makeInstanced(
    new THREE.ConeGeometry(1.9, 4.6, 7),
    new THREE.MeshStandardMaterial({ color: 0x1e5631, roughness: 0.85 }),
    pines,
    4.2
  );
  makeInstanced(
    new THREE.DodecahedronGeometry(1.45, 0),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.92 }),
    rocks,
    0.9,
    1.2,
    0.85,
    1.1
  );
  makeInstanced(
    new THREE.BoxGeometry(2.6, 2.5, 5.4),
    new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.55, metalness: 0.45 }),
    containers,
    1.25
  );
  makeInstanced(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x9a6b38, roughness: 0.82 }),
    crates,
    0.75
  );

  return { props };
}

function createDropshipMesh(): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.72, roughness: 0.3 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 16), hullMat);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 4.5), hullMat);
  wingL.position.set(-7, 0.8, 0);
  const wingR = wingL.clone();
  wingR.position.x = 7;
  const thrusterL = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 3.2, 12), trimMat);
  thrusterL.position.set(-10.5, 0.5, 0);
  const thrusterR = thrusterL.clone();
  thrusterR.position.x = 10.5;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.5, 6), trimMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.2, 10);

  g.add(body, wingL, wingR, thrusterL, thrusterR, nose);
  return g;
}

export class LootAndChestRenderer {
  private scene: THREE.Scene;
  private chestMeshes = new Map<string, THREE.Group>();
  private lootMeshes = new Map<string, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public syncChests(chests: ChestState[], time: number) {
    for (const ch of chests) {
      let grp = this.chestMeshes.get(ch.id);
      if (!grp) {
        grp = new THREE.Group();
        const isEpic = ch.tier === 'EPICO';
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(1.25, 0.75, 0.85),
          new THREE.MeshStandardMaterial({
            color: isEpic ? 0x7e22ce : 0xb45309,
            metalness: 0.6,
            roughness: 0.35,
          })
        );
        base.position.y = 0.38;
        const lid = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.25, 0.9),
          new THREE.MeshStandardMaterial({
            color: isEpic ? 0xf59e0b : 0xfacc15,
            emissive: isEpic ? 0xa855f7 : 0xf59e0b,
            emissiveIntensity: 0.45,
            metalness: 0.75,
            roughness: 0.25,
          })
        );
        lid.position.y = 0.86;
        grp.userData.lid = lid;
        grp.position.set(ch.x, ch.y, ch.z);
        grp.add(base, lid);
        this.scene.add(grp);
        this.chestMeshes.set(ch.id, grp);
      }

      const lid = grp.userData.lid as THREE.Mesh;
      if (ch.opened) {
        lid.rotation.x = -0.95;
        lid.position.z = -0.35;
        (lid.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05;
      } else {
        (lid.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + Math.sin(time * 4) * 0.2;
      }
    }
  }

  public syncLoot(lootList: LootPickup[], playerPos: THREE.Vector3, time: number) {
    const activeIds = new Set<string>();
    for (const item of lootList) {
      // Frustum/distance cull far loot items for crisp 60fps performance
      if (Math.hypot(item.x - playerPos.x, item.z - playerPos.z) > 110) {
        const old = this.lootMeshes.get(item.id);
        if (old) old.visible = false;
        continue;
      }

      activeIds.add(item.id);
      let grp = this.lootMeshes.get(item.id);
      if (!grp) {
        grp = new THREE.Group();
        let colorHex = '#38BDF8';

        if (item.kind === 'WEAPON' && item.weaponId) {
          const w = WEAPON_MAP.get(item.weaponId);
          colorHex = w?.color ?? RARITY_COLORS.COMUN;
          const mesh = buildWeaponMesh(item.weaponId);
          mesh.scale.setScalar(1.3);
          mesh.position.y = 0.45;
          grp.add(mesh);
        } else if (item.kind === 'AMMO') {
          colorHex = '#FACC15';
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.3, 0.32),
            new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.4, metalness: 0.6 })
          );
          box.position.y = 0.35;
          grp.add(box);
        } else if (item.kind === 'CONSUMABLE') {
          colorHex = item.consumableId?.includes('SHIELD') ? '#06B6D4' : '#22C55E';
          const box = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color(colorHex),
              emissive: new THREE.Color(colorHex),
              emissiveIntensity: 0.35,
            })
          );
          box.position.y = 0.4;
          grp.add(box);
        } else {
          colorHex = '#F97316';
          const matBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.48, 0.36, 0.48),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
          );
          matBox.position.y = 0.35;
          grp.add(matBox);
        }

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.42, 0.56, 16),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(colorHex),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.06;
        grp.add(ring);
        grp.position.set(item.x, item.y, item.z);
        this.scene.add(grp);
        this.lootMeshes.set(item.id, grp);
      }

      grp.visible = true;
      grp.children[0].rotation.y = time * 1.8;
      grp.children[0].position.y = 0.42 + Math.sin(time * 3 + item.x) * 0.08;
    }

    for (const [id, grp] of this.lootMeshes.entries()) {
      if (!lootList.some((l) => l.id === id)) {
        this.scene.remove(grp);
        this.lootMeshes.delete(id);
      }
    }
  }
}

export function clampToIsland(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.max(-MAP_HALF + 10, Math.min(MAP_HALF - 10, x)),
    z: Math.max(-MAP_HALF + 10, Math.min(MAP_HALF - 10, z)),
  };
}
