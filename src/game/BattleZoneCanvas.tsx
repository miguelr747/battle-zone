import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ActorNetState,
  BotDifficulty,
  BuildEditShape,
  BuildPieceState,
  BuildPieceType,
  CharacterCustomization,
  ChestState,
  ConsumableType,
  GameMode,
  GameSettings,
  KillFeedEntry,
  LootPickup,
  MaterialType,
  StormState,
  VehicleState,
  WeaponSlotItem,
} from '../shared/types';
import { CONSUMABLES, MATERIAL_STATS, WEAPON_MAP, WEAPONS } from '../shared/weapons';
import { GRID_SIZE, MAP_REGIONS, generateWorldLayout, getRegionAt, getTerrainHeight } from '../shared/worldGen';
import { raycastWorld, resolveActorMovement } from '../shared/physics';
import { createCharacterRig, CharacterRig } from './models/characterModel';
import { createVehicleRig, VehicleRig } from './models/vehicleModel';
import { BuildingRenderer } from './building';
import { LootAndChestRenderer, buildWorldEnvironment } from './worldScene';
import { LocalBotState, spawnOfflineBots, stepOfflineBots } from './botAI';
import { gameAudio } from './audio';

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  aliveCount: number;
  totalCount: number;
  kills: number;
  damageDealt: number;
  buildsPlaced: number;
  alive: boolean;
  placement: number;
  victory: boolean;
  spectatingName: string | null;
  inDropship: boolean;
  parachuting: boolean;
  inVehicle: VehicleState | null;
  nearbyVehicle: VehicleState | null;
  nearbyChest: ChestState | null;
  nearbyLoot: LootPickup | null;
  slots: Array<WeaponSlotItem | null>;
  activeSlot: number;
  ammoReserve: number;
  reloading: boolean;
  reloadProgress: number;
  consumables: Record<ConsumableType, number>;
  healingItem: ConsumableType | null;
  healProgress: number;
  materials: Record<MaterialType, number>;
  buildingMode: boolean;
  buildPieceType: BuildPieceType;
  buildMaterial: MaterialType;
  buildRotationDeg: number;
  regionName: string;
  storm: StormState;
  inStorm: boolean;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  killFeed: KillFeedEntry[];
  hitmarkerAt: number;
  headshotHit: boolean;
  fps: number;
  pointerLocked: boolean;
  actorsForMinimap: Array<{ x: number; z: number; isBot: boolean; alive: boolean; teamId: number }>;
}

export interface MobileInputState {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  firing: boolean;
  aiming: boolean;
  jumping: boolean;
  sprinting: boolean;
  crouching: boolean;
  interactTrigger: boolean;
  reloadTrigger: boolean;
  buildToggleTrigger: boolean;
  placeBuildTrigger: boolean;
  editTrigger: boolean;
  rotateTrigger: boolean;
  pieceSelect?: BuildPieceType;
  slotSelect?: number;
}

export interface BattleZoneCanvasProps {
  mode: GameMode;
  difficulty: BotDifficulty;
  totalParticipants: number;
  settings: GameSettings;
  playerId: string;
  playerName: string;
  customization: CharacterCustomization;
  isMultiplayer: boolean;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  mpInitialState?: {
    worldSeed: number;
    actors: ActorNetState[];
    vehicles: VehicleState[];
    builds?: BuildPieceState[];
    storm: StormState;
  } | null;
  mpEventsRef?: React.MutableRefObject<{
    onMessage?: (type: string, payload: any) => void;
  }>;
  mobileInputRef: React.MutableRefObject<MobileInputState>;
  paused: boolean;
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchComplete: (result: {
    placement: number;
    totalPlayers: number;
    kills: number;
    damage: number;
    buildsPlaced: number;
    survivalTime: number;
    victory: boolean;
  }) => void;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

// Pre-allocated scratch math helpers (Zero GC inside render loop)
const _camTarget = new THREE.Vector3();
const _camIdeal = new THREE.Vector3();
const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();

interface ActiveTracer {
  mesh: THREE.Mesh;
  life: number;
}

interface ActiveProjectile {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  radius: number;
  structMult: number;
  weaponName: string;
  life: number;
}

interface ActiveParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export const BattleZoneCanvas: React.FC<BattleZoneCanvasProps> = ({
  mode,
  difficulty,
  totalParticipants,
  settings,
  playerId,
  playerName,
  customization,
  isMultiplayer,
  wsRef,
  mpInitialState,
  mpEventsRef,
  mobileInputRef,
  paused,
  onHudUpdate,
  onMatchComplete,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const pausedRef = useRef(paused);

  useEffect(() => {
    settingsRef.current = settings;
    gameAudio.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [paused]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const worldSeed = mpInitialState?.worldSeed ?? Math.floor(Math.random() * 900000) + 100000;
    const layout = generateWorldLayout(worldSeed);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7ec8e3);
    scene.fog = new THREE.FogExp2(0x7ec8e3, settingsRef.current.quality === 'BAJA' ? 0.0048 : 0.0028);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(settingsRef.current.fov, width / height, 0.15, 700);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && settingsRef.current.quality !== 'BAJA',
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    const maxPR = settingsRef.current.quality === 'ALTA' ? 2 : settingsRef.current.quality === 'MEDIA' ? 1.5 : 1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, maxPR));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl && settingsRef.current.shadows && settingsRef.current.quality !== 'BAJA';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Outdoor Sunlight + Cool Sky/Ground Hemisphere
    const hemi = new THREE.HemisphereLight(0xa5d8ff, 0x3b4d2b, 0.78);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5d6, 2.0);
    sun.position.set(120, 220, 80);
    sun.castShadow = renderer.shadowMap.enabled;
    const smSize = settingsRef.current.quality === 'ALTA' ? 2048 : 1024;
    sun.shadow.mapSize.set(smSize, smSize);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    const d = 140;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const worldEnv = buildWorldEnvironment(scene, layout, settingsRef.current.quality, maxAniso);
    const buildRenderer = new BuildingRenderer(scene, maxAniso);
    const lootRenderer = new LootAndChestRenderer(scene);

    // Match State Initialization
    const isDropMode = !isMultiplayer && mode !== 'TRAINING';
    const startDropshipX = -460;
    const startDropshipZ = -220;

    const playerState: ActorNetState = {
      id: playerId,
      name: playerName,
      teamId: 1,
      isBot: false,
      x: isDropMode ? startDropshipX : -140,
      y: isDropMode ? 145 : getTerrainHeight(-140, -40),
      z: isDropMode ? startDropshipZ : -40,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0.4,
      pitch: -0.1,
      hp: 100,
      maxHp: 100,
      shield: mode === 'TRAINING' ? 50 : 0,
      maxShield: 100,
      alive: true,
      kills: 0,
      crouching: false,
      sliding: false,
      sprinting: false,
      airborne: isDropMode,
      parachuting: false,
      inDropship: isDropMode,
      aiming: false,
      buildingMode: false,
      emoting: false,
      vehicleId: null,
      activeWeaponId: 'ar_vanguard_common',
      customization,
    };

    if (isMultiplayer && mpInitialState) {
      const me = mpInitialState.actors.find((a) => a.id === playerId);
      if (me) Object.assign(playerState, me);
    }

    const slots: Array<WeaponSlotItem | null> = [
      { weaponId: 'pistol_vx9_common', ammoInMag: 15 },
      { weaponId: 'ar_vanguard_common', ammoInMag: 30 },
      mode === 'TRAINING' ? { weaponId: 'sg_ariete_uncommon', ammoInMag: 6 } : null,
      mode === 'TRAINING' ? { weaponId: 'sniper_eclipse_rare', ammoInMag: 4 } : null,
      null,
    ];
    let activeSlot = 1;
    let ammoReserve = mode === 'TRAINING' ? 240 : 90;
    let reloading = false;
    let reloadTimer = 0;

    const consumables: Record<ConsumableType, number> = {
      BANDAGE: 3,
      MEDKIT: mode === 'TRAINING' ? 2 : 1,
      SHIELD_SMALL: 2,
      SHIELD_LARGE: mode === 'TRAINING' ? 2 : 0,
    };
    let healingItem: ConsumableType | null = null;
    let healTimer = 0;

    const materials: Record<MaterialType, number> = {
      MADERA: mode === 'TRAINING' ? 400 : 120,
      PIEDRA: mode === 'TRAINING' ? 250 : 60,
      METAL: mode === 'TRAINING' ? 150 : 30,
    };
    let buildingMode = false;
    let buildPieceType: BuildPieceType = 'PARED';
    let buildMaterial: MaterialType = 'MADERA';
    let buildRotIndex = 0;

    let damageDealt = 0;
    let buildsPlaced = 0;
    let matchReported = false;
    let victory = false;
    let finalPlacement = totalParticipants;
    let spectateIdx = 0;

    const builds: BuildPieceState[] = mpInitialState?.builds ? [...mpInitialState.builds] : [];
    const vehicles: VehicleState[] = mpInitialState?.vehicles
      ? mpInitialState.vehicles.map((v) => ({ ...v }))
      : layout.vehicles.map((v) => ({
          id: v.id,
          kind: v.kind,
          name: v.name,
          x: v.x,
          y: getTerrainHeight(v.x, v.z) + 0.5,
          z: v.z,
          rotationY: v.rotationY,
          speed: 0,
          hp: v.kind === 'TODOTERRENO' ? 950 : v.kind === 'AUTO' ? 650 : 420,
          maxHp: v.kind === 'TODOTERRENO' ? 950 : v.kind === 'AUTO' ? 650 : 420,
          fuel: 100,
          maxFuel: 100,
          driverId: null,
        }));

    let storm: StormState = mpInitialState?.storm
      ? { ...mpInitialState.storm }
      : {
          phase: 1,
          centerX: 0,
          centerZ: 0,
          radius: 620,
          nextCenterX: (Math.random() - 0.5) * 180,
          nextCenterZ: (Math.random() - 0.5) * 180,
          nextRadius: 340,
          shrinking: false,
          timer: 40,
          dps: 2,
        };

    const killFeed: KillFeedEntry[] = [];
    const offlineBots: LocalBotState[] = isMultiplayer
      ? []
      : spawnOfflineBots(Math.max(4, totalParticipants - 1), mode, difficulty);

    const remoteActors = new Map<string, ActorNetState>();
    if (isMultiplayer && mpInitialState) {
      for (const a of mpInitialState.actors) {
        if (a.id !== playerId) remoteActors.set(a.id, a);
      }
    }

    // 3D Rig Maps
    const playerRig = createCharacterRig(customization, playerState.activeWeaponId, renderer.shadowMap.enabled);
    scene.add(playerRig.root);
    const actorRigs = new Map<string, CharacterRig>();
    const vehicleRigs = new Map<string, VehicleRig>();

    for (const v of vehicles) {
      const vr = createVehicleRig(v.kind, renderer.shadowMap.enabled);
      vr.root.position.set(v.x, v.y - 0.45, v.z);
      vr.root.rotation.y = v.rotationY;
      scene.add(vr.root);
      vehicleRigs.set(v.id, vr);
    }

    // Visual effects pools
    const tracers: ActiveTracer[] = [];
    const projectiles: ActiveProjectile[] = [];
    const particles: ActiveParticle[] = [];

    const spawnTracer = (ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, colorHex: string) => {
      _v3A.set(ox, oy, oz);
      _v3B.set(tx, ty, tz);
      const dist = _v3A.distanceTo(_v3B);
      if (dist < 0.2) return;
      const geo = new THREE.CylinderGeometry(0.035, 0.035, dist, 4);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.85 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(_v3A).lerp(_v3B, 0.5);
      m.lookAt(_v3B);
      scene.add(m);
      tracers.push({ mesh: m, life: 0.08 });
    };

    const spawnBurst = (x: number, y: number, z: number, colorHex: number, count = 12, speed = 8) => {
      const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        scene.add(m);
        particles.push({
          mesh: m,
          vx: (Math.random() - 0.5) * speed * 2,
          vy: Math.random() * speed + 2,
          vz: (Math.random() - 0.5) * speed * 2,
          life: 0.45 + Math.random() * 0.3,
          maxLife: 0.75,
        });
      }
    };

    // Input State
    const keys: Record<string, boolean> = {};
    let mouseDownLeft = false;
    let mouseDownRight = false;
    let lastFireAt = 0;
    let recoilOffset = 0;
    let hitmarkerAt = 0;
    let headshotHit = false;
    let slideTimer = 0;
    let footstepTimer = 0;
    let dropshipTime = 0;

    const tryPlaceBuild = () => {
      const cost = MATERIAL_STATS[buildMaterial].cost;
      if (materials[buildMaterial] < cost) return;
      const dist = 3.8;
      const gx = Math.round((playerState.x + Math.sin(playerState.yaw) * dist) / GRID_SIZE) * GRID_SIZE;
      const gz = Math.round((playerState.z + Math.cos(playerState.yaw) * dist) / GRID_SIZE) * GRID_SIZE;
      const gy = Math.max(Math.round(playerState.y * 2) / 2, Math.floor(getTerrainHeight(gx, gz)));
      const rot = (Math.round(playerState.yaw / (Math.PI / 2)) + buildRotIndex) * (Math.PI / 2);

      materials[buildMaterial] -= cost;
      buildsPlaced += 1;
      gameAudio.playBuild(buildMaterial);

      if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'build:place',
            payload: { type: buildPieceType, material: buildMaterial, x: gx, y: gy, z: gz, rotationY: rot },
          })
        );
      } else {
        builds.push({
          id: `bp_p_${Date.now()}_${Math.floor(Math.random() * 999)}`,
          ownerId: playerId,
          type: buildPieceType,
          material: buildMaterial,
          editShape: 'SOLIDA',
          x: gx,
          y: gy,
          z: gz,
          rotationY: rot,
          hp: MATERIAL_STATS[buildMaterial].maxHp,
          maxHp: MATERIAL_STATS[buildMaterial].maxHp,
          buildProgress: 0.2,
          createdAt: Date.now(),
        });
      }
    };

    const tryEditTargetedBuild = () => {
      const fx = Math.sin(playerState.yaw) * Math.cos(playerState.pitch);
      const fy = Math.sin(playerState.pitch);
      const fz = Math.cos(playerState.yaw) * Math.cos(playerState.pitch);
      const hit = raycastWorld(
        playerState.x,
        playerState.y + 1.5,
        playerState.z,
        fx,
        fy,
        fz,
        10,
        playerId,
        -1,
        [],
        [],
        [],
        builds
      );
      if (hit && hit.hitType === 'BUILD' && hit.targetId) {
        const bp = builds.find((b) => b.id === hit.targetId);
        if (bp && bp.type === 'PARED') {
          const order: BuildEditShape[] = ['SOLIDA', 'PUERTA', 'VENTANA', 'ABERTURA'];
          const next = order[(order.indexOf(bp.editShape) + 1) % order.length];
          bp.editShape = next;
          gameAudio.playBuild(bp.material);
          if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'build:edit', payload: { id: bp.id, editShape: next } }));
          }
        }
      }
    };

    const tryInteract = () => {
      if (!playerState.alive) return;
      if (playerState.inDropship) {
        playerState.inDropship = false;
        playerState.airborne = true;
        playerState.vy = -4;
        return;
      }

      if (playerState.vehicleId) {
        const veh = vehicles.find((v) => v.id === playerState.vehicleId);
        if (veh) {
          veh.driverId = null;
          playerState.x = veh.x + Math.cos(veh.rotationY) * 2.4;
          playerState.z = veh.z - Math.sin(veh.rotationY) * 2.4;
          playerState.y = getTerrainHeight(playerState.x, playerState.z);
        }
        playerState.vehicleId = null;
        if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'vehicle:exit', payload: {} }));
        }
        return;
      }

      // Check nearby vehicle
      for (const v of vehicles) {
        if (!v.driverId && v.hp > 0 && Math.hypot(v.x - playerState.x, v.z - playerState.z) < 4.5) {
          v.driverId = playerId;
          playerState.vehicleId = v.id;
          buildingMode = false;
          if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'vehicle:enter', payload: { vehicleId: v.id } }));
          }
          return;
        }
      }

      // Check nearby chest
      for (const ch of layout.chests) {
        if (!ch.opened && Math.hypot(ch.x - playerState.x, ch.z - playerState.z) < 3.6) {
          ch.opened = true;
          gameAudio.playPickup();
          const epicPool = WEAPONS.filter((w) => w.rarity === 'EPICO' || w.rarity === 'LEGENDARIO');
          const normPool = WEAPONS.filter((w) => w.rarity !== 'COMUN');
          const pool = ch.tier === 'EPICO' ? epicPool : normPool;
          const rw = pool[Math.floor(Math.random() * pool.length)];
          layout.loot.push({
            id: `loot_ch_${Date.now()}_1`,
            x: ch.x + 0.7,
            y: ch.y,
            z: ch.z + 0.5,
            kind: 'WEAPON',
            weaponId: rw.id,
          });
          layout.loot.push({
            id: `loot_ch_${Date.now()}_2`,
            x: ch.x - 0.7,
            y: ch.y,
            z: ch.z + 0.5,
            kind: 'CONSUMABLE',
            consumableId: ch.tier === 'EPICO' ? 'SHIELD_LARGE' : 'MEDKIT',
          });
          materials.MADERA += 35;
          materials.PIEDRA += 25;
          ammoReserve += 35;
          return;
        }
      }

      // Check nearby ground loot
      for (let i = layout.loot.length - 1; i >= 0; i--) {
        const l = layout.loot[i];
        if (Math.hypot(l.x - playerState.x, l.z - playerState.z) < 3.2) {
          gameAudio.playPickup();
          if (l.kind === 'WEAPON' && l.weaponId) {
            const w = WEAPON_MAP.get(l.weaponId)!;
            const emptyIdx = slots.findIndex((s) => s === null);
            const targetIdx = emptyIdx !== -1 ? emptyIdx : activeSlot;
            slots[targetIdx] = { weaponId: w.id, ammoInMag: w.magSize };
            activeSlot = targetIdx;
            playerState.activeWeaponId = w.id;
            playerRig.setWeapon(w.id);
          } else if (l.kind === 'AMMO') {
            ammoReserve += l.ammoAmount ?? 30;
          } else if (l.kind === 'CONSUMABLE' && l.consumableId) {
            consumables[l.consumableId] = Math.min(
              CONSUMABLES[l.consumableId].maxStack,
              consumables[l.consumableId] + 1
            );
          } else if (l.kind === 'MATERIAL' && l.materialType) {
            materials[l.materialType] += l.materialAmount ?? 40;
          }
          layout.loot.splice(i, 1);
          return;
        }
      }
    };

    const startHeal = (type: ConsumableType) => {
      if (consumables[type] <= 0 || healingItem) return;
      if (CONSUMABLES[type].healHp > 0 && playerState.hp >= 100) return;
      if (CONSUMABLES[type].healShield > 0 && playerState.shield >= 100) return;
      healingItem = type;
      healTimer = CONSUMABLES[type].useTime;
    };

    const startReload = () => {
      const slot = slots[activeSlot];
      if (!slot || reloading || ammoReserve <= 0) return;
      const w = WEAPON_MAP.get(slot.weaponId);
      if (!w || slot.ammoInMag >= w.magSize) return;
      reloading = true;
      reloadTimer = w.reloadTime;
      gameAudio.playReload();
    };

    // Multiplayer Event Handler Hook
    if (isMultiplayer && mpEventsRef) {
      mpEventsRef.current.onMessage = (type, payload) => {
        if (type === 'state:delta') {
          for (const a of payload.actors as ActorNetState[]) {
            if (a.id === playerId) {
              playerState.hp = a.hp;
              playerState.shield = a.shield;
              playerState.alive = a.alive;
              playerState.kills = a.kills;
            } else {
              const prev = remoteActors.get(a.id);
              if (prev) Object.assign(prev, a);
              else remoteActors.set(a.id, a);
            }
          }
          if (payload.storm) storm = payload.storm;
          if (payload.vehicles) {
            for (const nv of payload.vehicles as VehicleState[]) {
              const cur = vehicles.find((v) => v.id === nv.id);
              if (cur && cur.driverId !== playerId) Object.assign(cur, nv);
            }
          }
        } else if (type === 'build:placed') {
          if (!builds.some((b) => b.id === payload.id)) builds.push(payload);
        } else if (type === 'build:edited') {
          const bp = builds.find((b) => b.id === payload.id);
          if (bp) bp.editShape = payload.editShape;
        } else if (type === 'build:destroyed') {
          const idx = builds.findIndex((b) => b.id === payload.id);
          if (idx !== -1) builds.splice(idx, 1);
        } else if (type === 'shot:fired') {
          const w = WEAPON_MAP.get(payload.weaponId);
          spawnTracer(payload.ox, payload.oy, payload.oz, payload.tx, payload.ty, payload.tz, w?.color ?? '#F59E0B');
          if (payload.shooterId !== playerId) {
            const dist = Math.hypot(payload.ox - playerState.x, payload.oz - playerState.z);
            gameAudio.playGunshot(w?.category ?? 'FUSIL', dist);
          }
        } else if (type === 'player:hit') {
          if (payload.attackerId === playerId) {
            hitmarkerAt = performance.now();
            gameAudio.playHitmarker(false);
            damageDealt += payload.damage;
          }
        } else if (type === 'player:eliminated') {
          killFeed.unshift(payload.entry);
          if (killFeed.length > 5) killFeed.pop();
          if (payload.victimId === playerId) {
            playerState.alive = false;
            finalPlacement = payload.placement;
            if (!matchReported) {
              matchReported = true;
              onMatchComplete({
                placement: finalPlacement,
                totalPlayers: remoteActors.size + 1,
                kills: playerState.kills,
                damage: Math.round(damageDealt),
                buildsPlaced,
                survivalTime: Math.round(clock.getElapsedTime()),
                victory: false,
              });
            }
          }
        } else if (type === 'match:ended') {
          const won = (payload.winners as Array<{ id: string }>).some((w) => w.id === playerId);
          if (won && !matchReported) {
            victory = true;
            finalPlacement = 1;
            matchReported = true;
            gameAudio.playVictoryFanfare();
            onMatchComplete({
              placement: 1,
              totalPlayers: remoteActors.size + 1,
              kills: playerState.kills,
              damage: Math.round(damageDealt),
              buildsPlaced,
              survivalTime: Math.round(clock.getElapsedTime()),
              victory: true,
            });
          }
        }
      };
    }

    // Event Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      keys[e.code] = true;
      const kb = settingsRef.current.keybinds;

      if (e.code === kb.reload) startReload();
      else if (e.code === kb.interact) tryInteract();
      else if (e.code === kb.buildToggle) {
        buildingMode = !buildingMode;
        playerState.buildingMode = buildingMode;
      } else if (e.code === kb.editBuild) {
        tryEditTargetedBuild();
      } else if (e.code === kb.rotateBuild) {
        buildRotIndex = (buildRotIndex + 1) % 4;
      } else if (e.code === kb.emote) {
        playerState.emoting = !playerState.emoting;
      } else if (e.code === 'KeyZ') {
        buildingMode = true;
        buildPieceType = 'PARED';
      } else if (e.code === 'KeyX') {
        buildingMode = true;
        buildPieceType = 'PISO';
      } else if (e.code === 'KeyV') {
        buildingMode = true;
        buildPieceType = 'RAMPA';
      } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5') {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        if (buildingMode && idx < 3) {
          buildMaterial = idx === 0 ? 'MADERA' : idx === 1 ? 'PIEDRA' : 'METAL';
        } else if (slots[idx]) {
          buildingMode = false;
          activeSlot = idx;
          reloading = false;
          playerState.activeWeaponId = slots[idx]!.weaponId;
          playerRig.setWeapon(slots[idx]!.weaponId);
        }
      } else if (e.code === 'KeyH') startHeal('MEDKIT');
      else if (e.code === 'KeyJ') startHeal('SHIELD_LARGE');
      else if (e.code === 'KeyF') {
        // Harvest nearby prop for materials!
        for (const p of layout.props) {
          if (p.hp > 0 && Math.hypot(p.x - playerState.x, p.z - playerState.z) < 4.2) {
            p.hp -= 45;
            materials[p.material] += 22;
            gameAudio.playBuild(p.material);
            spawnBurst(p.x, p.y + 1.4, p.z, 0xf59e0b, 6, 4);
            break;
          }
        }
      } else if (e.code === kb.jump && playerState.inDropship) {
        playerState.inDropship = false;
        playerState.airborne = true;
        playerState.vy = -4;
      } else if (e.code === kb.jump && playerState.airborne && !playerState.parachuting && playerState.y - getTerrainHeight(playerState.x, playerState.z) > 10) {
        playerState.parachuting = true;
      } else if (e.code === kb.crouch && playerState.sprinting && !playerState.airborne && slideTimer <= 0) {
        slideTimer = 0.65;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (pausedRef.current) return;
      gameAudio.unlock();
      const target = e.target as HTMLElement;
      if (target !== renderer.domElement) return;

      if (!document.pointerLockElement && settingsRef.current.touchEnabled !== 'SI') {
        renderer.domElement.requestPointerLock?.();
      }
      if (e.button === 0) {
        mouseDownLeft = true;
        if (buildingMode) tryPlaceBuild();
      } else if (e.button === 2) {
        mouseDownRight = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDownLeft = false;
      else if (e.button === 2) mouseDownRight = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement || pausedRef.current) return;
      const sens = 0.0022 * settingsRef.current.mouseSensitivity;
      const inv = settingsRef.current.invertY ? -1 : 1;
      playerState.yaw -= e.movementX * sens;
      playerState.pitch = Math.max(-1.15, Math.min(1.15, playerState.pitch - e.movementY * sens * inv));
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const applyOfflineDamage = (
      attackerId: string,
      targetId: string,
      dmg: number,
      weaponName: string,
      headshot: boolean
    ) => {
      const target = targetId === playerId ? playerState : offlineBots.find((b) => b.id === targetId);
      if (!target || !target.alive) return;

      let rem = dmg;
      if (target.shield > 0) {
        const abs = Math.min(target.shield, rem);
        target.shield -= abs;
        rem -= abs;
      }
      target.hp -= rem;
      if (attackerId === playerId) {
        damageDealt += dmg;
        hitmarkerAt = performance.now();
        headshotHit = headshot;
        gameAudio.playHitmarker(headshot);
      }

      if (target.hp <= 0) {
        target.alive = false;
        const killer = attackerId === playerId ? playerState : offlineBots.find((b) => b.id === attackerId);
        if (killer) killer.kills += 1;

        killFeed.unshift({
          id: `kf_${Date.now()}_${Math.random()}`,
          killerName: killer?.name ?? 'Tormenta',
          victimName: target.name,
          weaponName,
          timestamp: Date.now(),
        });
        if (killFeed.length > 5) killFeed.pop();

        // Drop loot from eliminated bot
        if (target.isBot) {
          layout.loot.push({
            id: `loot_drop_${Date.now()}_${Math.random()}`,
            x: target.x,
            y: target.y,
            z: target.z,
            kind: 'WEAPON',
            weaponId: target.activeWeaponId,
          });
        }

        const remaining = (playerState.alive ? 1 : 0) + offlineBots.filter((b) => b.alive).length;
        if (target.id === playerId && !matchReported) {
          finalPlacement = remaining + 1;
          matchReported = true;
          onMatchComplete({
            placement: finalPlacement,
            totalPlayers: totalParticipants,
            kills: playerState.kills,
            damage: Math.round(damageDealt),
            buildsPlaced,
            survivalTime: Math.round(clock.getElapsedTime()),
            victory: false,
          });
        } else if (playerState.alive && remaining === 1 && mode !== 'TRAINING' && !matchReported) {
          victory = true;
          finalPlacement = 1;
          matchReported = true;
          gameAudio.playVictoryFanfare();
          onMatchComplete({
            placement: 1,
            totalPlayers: totalParticipants,
            kills: playerState.kills,
            damage: Math.round(damageDealt),
            buildsPlaced,
            survivalTime: Math.round(clock.getElapsedTime()),
            victory: true,
          });
        }
      }
    };

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lastHudEmit = 0;
    let lastMpSend = 0;
    let fpsAccumulator = 0;
    let fpsFrames = 0;
    let currentFps = 60;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();
      const nowMs = performance.now();

      fpsAccumulator += dt;
      fpsFrames += 1;
      if (fpsAccumulator >= 0.5) {
        currentFps = Math.round(fpsFrames / fpsAccumulator);
        fpsAccumulator = 0;
        fpsFrames = 0;
      }

      // Sync mobile one-shot triggers
      const mob = mobileInputRef.current;
      if (mob.lookDeltaX !== 0 || mob.lookDeltaY !== 0) {
        const sens = 0.004 * settingsRef.current.mouseSensitivity;
        playerState.yaw -= mob.lookDeltaX * sens;
        playerState.pitch = Math.max(-1.15, Math.min(1.15, playerState.pitch - mob.lookDeltaY * sens));
        mob.lookDeltaX = 0;
        mob.lookDeltaY = 0;
      }
      if (mob.interactTrigger) {
        mob.interactTrigger = false;
        tryInteract();
      }
      if (mob.reloadTrigger) {
        mob.reloadTrigger = false;
        startReload();
      }
      if (mob.buildToggleTrigger) {
        mob.buildToggleTrigger = false;
        buildingMode = !buildingMode;
        playerState.buildingMode = buildingMode;
      }
      if (mob.placeBuildTrigger) {
        mob.placeBuildTrigger = false;
        tryPlaceBuild();
      }
      if (mob.editTrigger) {
        mob.editTrigger = false;
        tryEditTargetedBuild();
      }
      if (mob.rotateTrigger) {
        mob.rotateTrigger = false;
        buildRotIndex = (buildRotIndex + 1) % 4;
      }
      if (mob.pieceSelect) {
        buildingMode = true;
        buildPieceType = mob.pieceSelect;
        mob.pieceSelect = undefined;
      }
      if (mob.slotSelect !== undefined) {
        if (slots[mob.slotSelect]) {
          buildingMode = false;
          activeSlot = mob.slotSelect;
          playerState.activeWeaponId = slots[activeSlot]!.weaponId;
          playerRig.setWeapon(playerState.activeWeaponId);
        }
        mob.slotSelect = undefined;
      }

      if (!pausedRef.current && playerState.alive) {
        // Reload & Healing timers
        if (reloading) {
          reloadTimer -= dt;
          if (reloadTimer <= 0) {
            reloading = false;
            const slot = slots[activeSlot];
            const w = slot ? WEAPON_MAP.get(slot.weaponId) : null;
            if (slot && w) {
              const needed = w.magSize - slot.ammoInMag;
              const take = Math.min(needed, ammoReserve);
              slot.ammoInMag += take;
              ammoReserve -= take;
            }
          }
        }

        if (healingItem) {
          healTimer -= dt;
          if (healTimer <= 0) {
            const def = CONSUMABLES[healingItem];
            consumables[healingItem] = Math.max(0, consumables[healingItem] - 1);
            playerState.hp = Math.min(100, playerState.hp + def.healHp);
            playerState.shield = Math.min(100, playerState.shield + def.healShield);
            healingItem = null;
            gameAudio.playPickup();
          }
        }

        // Dropship Flight Phase
        if (playerState.inDropship) {
          dropshipTime += dt;
          const shipX = startDropshipX + dropshipTime * 42;
          const shipZ = startDropshipZ + dropshipTime * 22;
          worldEnv.dropship.visible = true;
          worldEnv.dropship.position.set(shipX, 148, shipZ);
          worldEnv.dropship.rotation.y = Math.atan2(42, 22);
          playerState.x = shipX;
          playerState.y = 145;
          playerState.z = shipZ;

          if (shipX > 460 || mob.jumping) {
            playerState.inDropship = false;
            playerState.airborne = true;
            playerState.vy = -4;
          }
        } else {
          if (worldEnv.dropship.visible) {
            worldEnv.dropship.position.x += dt * 42;
            worldEnv.dropship.position.z += dt * 22;
            if (worldEnv.dropship.position.x > 650) worldEnv.dropship.visible = false;
          }

          const kb = settingsRef.current.keybinds;
          const fwd = (keys[kb.forward] ? 1 : 0) - (keys[kb.backward] ? 1 : 0) + mob.moveY;
          const str = (keys[kb.right] ? 1 : 0) - (keys[kb.left] ? 1 : 0) + mob.moveX;

          if (playerState.vehicleId) {
            // Vehicle Physics
            const veh = vehicles.find((v) => v.id === playerState.vehicleId);
            if (veh) {
              const maxSpd = veh.kind === 'MOTO' ? 30 : veh.kind === 'AUTO' ? 27 : 23;
              const accel = veh.fuel > 0 ? fwd * 22 : 0;
              veh.speed = THREE.MathUtils.clamp(veh.speed + accel * dt, -10, maxSpd);
              if (Math.abs(fwd) < 0.05) veh.speed *= Math.exp(-2.8 * dt);
              if (keys[kb.jump]) veh.speed *= Math.exp(-6.5 * dt); // Handbrake

              const steer = -str * 2.1 * (veh.speed >= -0.5 ? 1 : -1) * Math.min(1, Math.abs(veh.speed) / 4);
              veh.rotationY += steer * dt;
              veh.x = THREE.MathUtils.clamp(veh.x + Math.sin(veh.rotationY) * veh.speed * dt, -585, 585);
              veh.z = THREE.MathUtils.clamp(veh.z + Math.cos(veh.rotationY) * veh.speed * dt, -585, 585);
              veh.y = getTerrainHeight(veh.x, veh.z) + 0.5;
              if (Math.abs(veh.speed) > 1) veh.fuel = Math.max(0, veh.fuel - dt * 0.7);

              playerState.x = veh.x;
              playerState.y = veh.y + 0.6;
              playerState.z = veh.z;
              playerState.yaw = veh.rotationY;

              if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'vehicle:update',
                    payload: { x: veh.x, y: veh.y, z: veh.z, rotationY: veh.rotationY, speed: veh.speed, fuel: veh.fuel },
                  })
                );
              }
            }
          } else {
            // Character Locomotion
            const aiming = (mouseDownRight || mob.aiming) && !buildingMode && !playerState.parachuting;
            playerState.aiming = aiming;
            playerState.crouching = Boolean(keys[kb.crouch] || mob.crouching) && slideTimer <= 0;
            playerState.sliding = slideTimer > 0;
            if (slideTimer > 0) slideTimer -= dt;

            const wantsSprint = Boolean(keys[kb.sprint] || mob.sprinting) && fwd > 0.2 && !aiming && !playerState.crouching;
            playerState.sprinting = wantsSprint;

            let moveSpeed = playerState.parachuting
              ? 12.5
              : playerState.sliding
                ? 11.2
                : wantsSprint
                  ? 8.8
                  : playerState.crouching
                    ? 3.4
                    : 5.8;
            if (aiming) moveSpeed *= 0.65;

            const inputLen = Math.hypot(fwd, str);
            let moveX = 0;
            let moveZ = 0;
            if (inputLen > 0.05) {
              playerState.emoting = false;
              const nf = fwd / Math.max(1, inputLen);
              const ns = str / Math.max(1, inputLen);
              moveX = (Math.sin(playerState.yaw) * nf - Math.cos(playerState.yaw) * ns) * moveSpeed;
              moveZ = (Math.cos(playerState.yaw) * nf + Math.sin(playerState.yaw) * ns) * moveSpeed;
            }

            if ((keys[kb.jump] || mob.jumping) && !playerState.airborne && !playerState.parachuting) {
              playerState.vy = 9.4;
              playerState.airborne = true;
            }

            const gravity = playerState.parachuting ? -4.5 : -24;
            playerState.vy += gravity * dt;
            if (playerState.parachuting && playerState.vy < -5.2) playerState.vy = -5.2;

            const resolved = resolveActorMovement(
              playerState.x + moveX * dt,
              playerState.y,
              playerState.z + moveZ * dt,
              playerState.vy,
              dt,
              layout.buildings,
              layout.props,
              builds
            );
            playerState.x = resolved.x;
            playerState.y = resolved.y;
            playerState.z = resolved.z;
            playerState.vy = resolved.vy;
            playerState.airborne = !resolved.grounded;
            if (resolved.grounded) playerState.parachuting = false;
            else if (playerState.y - getTerrainHeight(playerState.x, playerState.z) > 8 && playerState.vy < -16) {
              playerState.parachuting = true;
            }

            // Footstep audio
            if (resolved.grounded && inputLen > 0.2) {
              footstepTimer -= dt;
              if (footstepTimer <= 0) {
                footstepTimer = wantsSprint ? 0.3 : 0.44;
                gameAudio.playFootstep();
              }
            }

            // Firing weapons
            const isFiring = (mouseDownLeft || mob.firing) && !buildingMode && !playerState.parachuting && !reloading;
            const slot = slots[activeSlot];
            const weapon = slot ? WEAPON_MAP.get(slot.weaponId) : null;
            if (isFiring && slot && weapon && nowMs - lastFireAt >= 1000 / weapon.fireRate) {
              if (slot.ammoInMag <= 0) {
                startReload();
              } else {
                lastFireAt = nowMs;
                slot.ammoInMag -= 1;
                recoilOffset = weapon.recoil;
                playerState.pitch = Math.min(1.15, playerState.pitch + weapon.recoil * 0.45);
                healingItem = null;
                gameAudio.playGunshot(weapon.category, 0);

                const ox = playerState.x + Math.cos(playerState.yaw) * 0.35;
                const oy = playerState.y + (playerState.crouching ? 1.05 : 1.48);
                const oz = playerState.z - Math.sin(playerState.yaw) * 0.35;

                const dirX = Math.sin(playerState.yaw) * Math.cos(playerState.pitch);
                const dirY = Math.sin(playerState.pitch);
                const dirZ = Math.cos(playerState.yaw) * Math.cos(playerState.pitch);

                if (weapon.projectileSpeed && !isMultiplayer) {
                  // Physical rocket / plasma bolt
                  const pMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(weapon.category === 'EXPLOSIVO' ? 0.22 : 0.14, 8, 8),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color(weapon.color) })
                  );
                  pMesh.position.set(ox, oy, oz);
                  scene.add(pMesh);
                  projectiles.push({
                    mesh: pMesh,
                    x: ox,
                    y: oy,
                    z: oz,
                    vx: dirX * weapon.projectileSpeed,
                    vy: dirY * weapon.projectileSpeed,
                    vz: dirZ * weapon.projectileSpeed,
                    damage: weapon.damage,
                    radius: weapon.explosionRadius ?? 4,
                    structMult: weapon.structureMultiplier,
                    weaponName: weapon.name,
                    life: 3.5,
                  });
                } else if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: 'player:shoot',
                      payload: { weaponId: weapon.id, ox, oy, oz, dx: dirX, dy: dirY, dz: dirZ },
                    })
                  );
                } else {
                  const rayActors = [
                    playerState,
                    ...offlineBots,
                  ].map((a) => ({
                    id: a.id,
                    x: a.x,
                    y: a.y,
                    z: a.z,
                    crouching: a.crouching,
                    alive: a.alive,
                    teamId: a.teamId,
                  }));

                  const pellets = weapon.pellets ?? 1;
                  for (let p = 0; p < pellets; p++) {
                    const sp = weapon.spread * (aiming ? 0.35 : 1);
                    const sx = dirX + (Math.random() - 0.5) * sp;
                    const sy = dirY + (Math.random() - 0.5) * sp;
                    const sz = dirZ + (Math.random() - 0.5) * sp;

                    const hit = raycastWorld(
                      ox,
                      oy,
                      oz,
                      sx,
                      sy,
                      sz,
                      weapon.range,
                      playerId,
                      mode === 'SOLO' ? -1 : playerState.teamId,
                      rayActors,
                      layout.buildings,
                      layout.props,
                      builds
                    );
                    const tx = hit ? hit.point.x : ox + sx * weapon.range;
                    const ty = hit ? hit.point.y : oy + sy * weapon.range;
                    const tz = hit ? hit.point.z : oz + sz * weapon.range;
                    spawnTracer(ox, oy, oz, tx, ty, tz, weapon.color);

                    if (hit && hit.hitType === 'ACTOR' && hit.targetId) {
                      const dmg = Math.round(weapon.damage * (hit.headshot ? 1.55 : 1));
                      applyOfflineDamage(playerId, hit.targetId, dmg, weapon.name, Boolean(hit.headshot));
                      spawnBurst(tx, ty, tz, 0xef4444, 5, 4);
                    } else if (hit && hit.hitType === 'BUILD' && hit.targetId) {
                      const bp = builds.find((b) => b.id === hit.targetId);
                      if (bp) {
                        bp.hp -= weapon.damage * weapon.structureMultiplier;
                        spawnBurst(tx, ty, tz, 0xf59e0b, 4, 3);
                        if (bp.hp <= 0) {
                          const idx = builds.indexOf(bp);
                          if (idx !== -1) builds.splice(idx, 1);
                        }
                      }
                    } else if (hit) {
                      spawnBurst(tx, ty, tz, 0xcbd5e1, 3, 3);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Offline Storm & Bot Simulation
      if (!isMultiplayer) {
        storm.timer -= dt;
        if (storm.timer <= 0) {
          if (!storm.shrinking) {
            storm.shrinking = true;
            storm.timer = 28;
          } else {
            storm.shrinking = false;
            storm.phase = Math.min(6, storm.phase + 1);
            storm.centerX = storm.nextCenterX;
            storm.centerZ = storm.nextCenterZ;
            storm.radius = storm.nextRadius;
            storm.nextCenterX = storm.centerX + (Math.random() - 0.5) * storm.radius * 0.35;
            storm.nextCenterZ = storm.centerZ + (Math.random() - 0.5) * storm.radius * 0.35;
            storm.nextRadius = Math.max(25, storm.radius * 0.52);
            storm.timer = 32;
            storm.dps = storm.phase * 2.5;
          }
        } else if (storm.shrinking) {
          const rate = dt / Math.max(1, storm.timer + dt);
          storm.centerX += (storm.nextCenterX - storm.centerX) * rate;
          storm.centerZ += (storm.nextCenterZ - storm.centerZ) * rate;
          storm.radius += (storm.nextRadius - storm.radius) * rate;
        }

        if (playerState.alive && !playerState.inDropship) {
          const dPlayerStorm = Math.hypot(playerState.x - storm.centerX, playerState.z - storm.centerZ);
          if (dPlayerStorm > storm.radius) {
            playerState.hp -= storm.dps * dt;
            if (playerState.hp <= 0) {
              applyOfflineDamage('storm', playerId, 999, 'Tormenta', false);
            }
          }
        }

        for (let i = builds.length - 1; i >= 0; i--) {
          const bp = builds[i];
          if (bp.buildProgress < 1) {
            bp.buildProgress = Math.min(1, bp.buildProgress + dt * MATERIAL_STATS[bp.material].buildSpeed);
          }
        }

        stepOfflineBots(
          offlineBots,
          playerState,
          storm,
          layout.chests,
          layout.loot,
          layout.buildings,
          layout.props,
          builds,
          mode,
          dt,
          nowMs,
          {
            onShot: (shooter, ox, oy, oz, tx, ty, tz, weaponId) => {
              const d = Math.hypot(ox - playerState.x, oz - playerState.z);
              if (d < 130) {
                const w = WEAPON_MAP.get(weaponId);
                spawnTracer(ox, oy, oz, tx, ty, tz, w?.color ?? '#F59E0B');
                gameAudio.playGunshot(w?.category ?? 'FUSIL', d);
              }
            },
            onDamageActor: applyOfflineDamage,
            onPlaceBuild: (piece) => builds.push(piece),
            onDamageBuild: (buildId, dmg) => {
              const idx = builds.findIndex((b) => b.id === buildId);
              if (idx !== -1) {
                builds[idx].hp -= dmg;
                if (builds[idx].hp <= 0) builds.splice(idx, 1);
              }
            },
            onEliminateByStorm: (victimId) => applyOfflineDamage('storm', victimId, 999, 'Tormenta', false),
          }
        );
      }

      // Projectiles update (RPG / Plasma)
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.life -= dt;
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.z += pr.vz * dt;
        pr.mesh.position.set(pr.x, pr.y, pr.z);

        let exploded = pr.life <= 0 || pr.y <= getTerrainHeight(pr.x, pr.z);
        if (!exploded) {
          for (const b of offlineBots) {
            if (b.alive && Math.hypot(b.x - pr.x, b.z - pr.z) < 1.2 && Math.abs(pr.y - (b.y + 1)) < 1.3) {
              exploded = true;
              break;
            }
          }
        }
        if (exploded) {
          gameAudio.playExplosion();
          spawnBurst(pr.x, pr.y + 0.5, pr.z, 0xf97316, 18, 12);
          for (const b of offlineBots) {
            if (!b.alive) continue;
            const d = Math.hypot(b.x - pr.x, b.z - pr.z);
            if (d <= pr.radius) {
              const falloff = 1 - d / (pr.radius + 0.5);
              applyOfflineDamage(playerId, b.id, Math.round(pr.damage * falloff), pr.weaponName, false);
            }
          }
          for (let j = builds.length - 1; j >= 0; j--) {
            const bp = builds[j];
            if (Math.hypot(bp.x - pr.x, bp.z - pr.z) <= pr.radius) {
              bp.hp -= pr.damage * pr.structMult;
              if (bp.hp <= 0) builds.splice(j, 1);
            }
          }
          scene.remove(pr.mesh);
          projectiles.splice(i, 1);
        }
      }

      // Tracers & Particles cleanup
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].mesh);
          tracers[i].mesh.geometry.dispose();
          tracers.splice(i, 1);
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life -= dt;
        pt.vy -= 18 * dt;
        pt.mesh.position.x += pt.vx * dt;
        pt.mesh.position.y += pt.vy * dt;
        pt.mesh.position.z += pt.vz * dt;
        (pt.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, pt.life / pt.maxLife);
        if (pt.life <= 0) {
          scene.remove(pt.mesh);
          particles.splice(i, 1);
        }
      }

      // Sync Player Rig & Vehicles & Bots/Remote Actors
      recoilOffset = Math.max(0, recoilOffset - dt * 0.45);
      playerRig.root.visible = playerState.alive && !playerState.inDropship && !playerState.vehicleId;
      playerRig.root.position.set(playerState.x, playerState.y, playerState.z);
      playerRig.root.rotation.y = playerState.yaw;
      playerRig.animate({
        time: elapsed,
        speed: playerState.airborne ? 0 : 6,
        sprinting: playerState.sprinting,
        crouching: playerState.crouching,
        sliding: playerState.sliding,
        aiming: playerState.aiming,
        parachuting: playerState.parachuting,
        emoting: playerState.emoting,
        emoteId: customization.emote,
        recoil: recoilOffset,
      });

      for (const v of vehicles) {
        const vr = vehicleRigs.get(v.id);
        if (vr) {
          vr.root.position.set(v.x, v.y - 0.45, v.z);
          vr.root.rotation.y = v.rotationY;
          for (const w of vr.wheels) w.rotation.x += v.speed * dt * 1.4;
        }
      }

      // Sync visible bots (distance culled to nearest 170m for crisp 60fps!) + remote multiplayer actors
      const otherActors: ActorNetState[] = isMultiplayer
        ? Array.from(remoteActors.values())
        : offlineBots;

      const activeRigIds = new Set<string>();
      for (const a of otherActors) {
        if (!a.alive || a.inDropship || a.vehicleId) continue;
        const dist = Math.hypot(a.x - playerState.x, a.z - playerState.z);
        if (!isMultiplayer && dist > 170) continue;

        activeRigIds.add(a.id);
        let rig = actorRigs.get(a.id);
        if (!rig) {
          rig = createCharacterRig(a.customization, a.activeWeaponId, renderer.shadowMap.enabled);
          scene.add(rig.root);
          actorRigs.set(a.id, rig);
        }
        rig.root.visible = true;
        rig.setWeapon(a.activeWeaponId);
        rig.root.position.lerp(_v3A.set(a.x, a.y, a.z), isMultiplayer ? 0.35 : 0.7);
        rig.root.rotation.y = a.yaw;
        rig.animate({
          time: elapsed,
          speed: 5.5,
          sprinting: a.sprinting,
          crouching: a.crouching,
          sliding: a.sliding,
          aiming: a.aiming,
          parachuting: a.parachuting,
          emoting: a.emoting,
          emoteId: a.customization.emote,
          recoil: 0,
        });
      }
      for (const [id, rig] of actorRigs.entries()) {
        if (!activeRigIds.has(id)) {
          rig.root.visible = false;
        }
      }

      // Sync Builds & Ghost Blueprint
      buildRenderer.syncBuilds(builds, renderer.shadowMap.enabled);
      if (buildingMode && playerState.alive && !playerState.vehicleId && !playerState.inDropship) {
        const gx = Math.round((playerState.x + Math.sin(playerState.yaw) * 3.8) / GRID_SIZE) * GRID_SIZE;
        const gz = Math.round((playerState.z + Math.cos(playerState.yaw) * 3.8) / GRID_SIZE) * GRID_SIZE;
        const gy = Math.max(Math.round(playerState.y * 2) / 2, Math.floor(getTerrainHeight(gx, gz)));
        const rot = (Math.round(playerState.yaw / (Math.PI / 2)) + buildRotIndex) * (Math.PI / 2);
        buildRenderer.updateGhost(
          true,
          buildPieceType,
          gx,
          gy,
          gz,
          rot,
          materials[buildMaterial] >= MATERIAL_STATS[buildMaterial].cost
        );
      } else {
        buildRenderer.updateGhost(false, buildPieceType, 0, 0, 0, 0, true);
      }

      // Sync Storm, Chests, Loot
      worldEnv.updateStorm(storm);
      lootRenderer.syncChests(layout.chests, elapsed);
      _v3A.set(playerState.x, playerState.y, playerState.z);
      lootRenderer.syncLoot(layout.loot, _v3A, elapsed);

      // Update Sun Shadow Frustum around player
      sun.position.set(playerState.x + 110, playerState.y + 190, playerState.z + 75);
      sun.target.position.set(playerState.x, playerState.y, playerState.z);

      // Camera Follow (Player or Spectated Survivor)
      let camSubject: ActorNetState = playerState;
      let spectatingName: string | null = null;
      if (!playerState.alive) {
        const survivors = otherActors.filter((a) => a.alive);
        if (survivors.length > 0) {
          camSubject = survivors[spectateIdx % survivors.length];
          spectatingName = camSubject.name;
        }
      }

      const activeWeapon = slots[activeSlot] ? WEAPON_MAP.get(slots[activeSlot]!.weaponId) : null;
      const targetFov =
        playerState.aiming && activeWeapon
          ? settingsRef.current.fov / activeWeapon.adsZoom
          : playerState.sprinting || playerState.vehicleId
            ? settingsRef.current.fov + 7
            : settingsRef.current.fov;

      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 10, dt);
        camera.updateProjectionMatrix();
      }

      if (camSubject.inDropship) {
        _camTarget.set(camSubject.x, camSubject.y, camSubject.z);
        _camIdeal.set(camSubject.x - 26, camSubject.y + 18, camSubject.z - 28);
      } else {
        const camDist = camSubject.vehicleId ? 7.8 : playerState.aiming ? 2.4 : 4.6;
        const shoulderRight = camSubject.vehicleId ? 0 : 0.75;
        const heightOffset = camSubject.crouching ? 1.15 : 1.65;

        const lookX = Math.sin(camSubject.yaw) * Math.cos(camSubject.pitch);
        const lookY = Math.sin(camSubject.pitch);
        const lookZ = Math.cos(camSubject.yaw) * Math.cos(camSubject.pitch);

        _camTarget.set(
          camSubject.x + Math.cos(camSubject.yaw) * shoulderRight + lookX * 8,
          camSubject.y + heightOffset + lookY * 8,
          camSubject.z - Math.sin(camSubject.yaw) * shoulderRight + lookZ * 8
        );

        _camIdeal.set(
          camSubject.x + Math.cos(camSubject.yaw) * shoulderRight - lookX * camDist,
          camSubject.y + heightOffset - lookY * camDist + 0.55,
          camSubject.z - Math.sin(camSubject.yaw) * shoulderRight - lookZ * camDist
        );

        const groundBelowCam = getTerrainHeight(_camIdeal.x, _camIdeal.z) + 0.7;
        if (_camIdeal.y < groundBelowCam) _camIdeal.y = groundBelowCam;
      }

      camera.position.lerp(_camIdeal, 1 - Math.exp(-18 * dt));
      camera.lookAt(_camTarget);

      renderer.render(scene, camera);

      // Send Multiplayer Input Snapshot at 20Hz
      if (isMultiplayer && wsRef?.current?.readyState === WebSocket.OPEN && nowMs - lastMpSend > 50) {
        lastMpSend = nowMs;
        wsRef.current.send(
          JSON.stringify({
            type: 'player:input',
            payload: {
              x: playerState.x,
              y: playerState.y,
              z: playerState.z,
              yaw: playerState.yaw,
              pitch: playerState.pitch,
              crouching: playerState.crouching,
              sprinting: playerState.sprinting,
              sliding: playerState.sliding,
              aiming: playerState.aiming,
              buildingMode,
              emoting: playerState.emoting,
              activeWeaponId: playerState.activeWeaponId,
            },
          })
        );
      }

      // Emit React HUD Update at ~15Hz so React never slows down WebGL
      if (nowMs - lastHudEmit > 66) {
        lastHudEmit = nowMs;
        const aliveSurvivors =
          (playerState.alive ? 1 : 0) + otherActors.filter((a) => a.alive).length;
        const curVeh = playerState.vehicleId ? vehicles.find((v) => v.id === playerState.vehicleId) ?? null : null;
        const nearVeh = !curVeh
          ? vehicles.find((v) => !v.driverId && v.hp > 0 && Math.hypot(v.x - playerState.x, v.z - playerState.z) < 4.5) ?? null
          : null;
        const nearChest =
          layout.chests.find((c) => !c.opened && Math.hypot(c.x - playerState.x, c.z - playerState.z) < 3.6) ?? null;
        const nearLoot =
          layout.loot.find((l) => Math.hypot(l.x - playerState.x, l.z - playerState.z) < 3.2) ?? null;

        onHudUpdate({
          hp: Math.max(0, Math.round(playerState.hp)),
          maxHp: playerState.maxHp,
          shield: Math.max(0, Math.round(playerState.shield)),
          maxShield: playerState.maxShield,
          aliveCount: aliveSurvivors,
          totalCount: isMultiplayer ? otherActors.length + 1 : totalParticipants,
          kills: playerState.kills,
          damageDealt: Math.round(damageDealt),
          buildsPlaced,
          alive: playerState.alive,
          placement: finalPlacement,
          victory,
          spectatingName,
          inDropship: playerState.inDropship,
          parachuting: playerState.parachuting,
          inVehicle: curVeh,
          nearbyVehicle: nearVeh,
          nearbyChest: nearChest,
          nearbyLoot: nearLoot,
          slots: [...slots],
          activeSlot,
          ammoReserve,
          reloading,
          reloadProgress: reloading && activeWeapon ? 1 - Math.max(0, reloadTimer / activeWeapon.reloadTime) : 0,
          consumables: { ...consumables },
          healingItem,
          healProgress: healingItem ? 1 - Math.max(0, healTimer / CONSUMABLES[healingItem].useTime) : 0,
          materials: { ...materials },
          buildingMode,
          buildPieceType,
          buildMaterial,
          buildRotationDeg: (buildRotIndex * 90) % 360,
          regionName: getRegionAt(playerState.x, playerState.z).name,
          storm: { ...storm },
          inStorm: Math.hypot(playerState.x - storm.centerX, playerState.z - storm.centerZ) > storm.radius,
          playerX: playerState.x,
          playerZ: playerState.z,
          playerYaw: playerState.yaw,
          killFeed: [...killFeed],
          hitmarkerAt,
          headshotHit,
          fps: currentFps,
          pointerLocked: document.pointerLockElement === renderer.domElement,
          actorsForMinimap: otherActors
            .filter((a) => a.alive)
            .slice(0, 40)
            .map((a) => ({ x: a.x, z: a.z, isBot: a.isBot, alive: a.alive, teamId: a.teamId })),
        });
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, [mode, difficulty, totalParticipants, playerId, isMultiplayer]);

  return <div ref={mountRef} className="w-full h-full relative" />;
};
