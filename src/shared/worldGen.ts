import { ChestState, LootPickup, VehicleKind } from './types';
import { WEAPONS } from './weapons';

export const MAP_SIZE = 1200; // -600 to +600
export const MAP_HALF = MAP_SIZE / 2;
export const GRID_SIZE = 4; // 4m building grid

export interface MapRegion {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  biomeColor: string;
}

export const MAP_REGIONS: MapRegion[] = [
  { id: 'city', name: 'Neo-Metrópolis', subtitle: 'Ciudad Futurista', x: -160, z: -40, radius: 130, biomeColor: '#38BDF8' },
  { id: 'forest', name: 'Bosque Esmeralda', subtitle: 'Bosque Denso', x: -340, z: -280, radius: 145, biomeColor: '#22C55E' },
  { id: 'desert', name: 'Dunas Ardientes', subtitle: 'Desierto Árido', x: 320, z: 260, radius: 150, biomeColor: '#F59E0B' },
  { id: 'mountains', name: 'Cumbres Heladas', subtitle: 'Montañas', x: -20, z: -410, radius: 145, biomeColor: '#E2E8F0' },
  { id: 'industrial', name: 'Sector Fundición', subtitle: 'Zona Industrial', x: 185, z: -70, radius: 120, biomeColor: '#FB923C' },
  { id: 'port', name: 'Puerto Marea', subtitle: 'Puerto Costero', x: 430, z: -150, radius: 115, biomeColor: '#06B6D4' },
  { id: 'military', name: 'Fuerte Bastión', subtitle: 'Base Militar', x: 280, z: -340, radius: 120, biomeColor: '#84CC16' },
  { id: 'abandoned', name: 'Valle Fantasma', subtitle: 'Pueblo Abandonado', x: -370, z: 220, radius: 120, biomeColor: '#A8A29E' },
  { id: 'lake', name: 'Lago Cristal', subtitle: 'Lago Central', x: -40, z: 185, radius: 105, biomeColor: '#0EA5E9' },
  { id: 'airport', name: 'Pista Horizonte', subtitle: 'Aeropuerto', x: 60, z: 410, radius: 135, biomeColor: '#94A3B8' },
];

export interface WorldBuilding {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  accentColor: string;
  regionId: string;
  kind: 'TOWER' | 'WAREHOUSE' | 'HOUSE' | 'BUNKER' | 'HANGAR' | 'SHIP' | 'CABIN';
  doorSide: 'N' | 'S' | 'E' | 'W';
}

export interface WorldProp {
  id: string;
  kind: 'TREE' | 'PINE' | 'ROCK' | 'PALM' | 'CRATE' | 'CONTAINER';
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationY: number;
  hp: number;
  material: 'MADERA' | 'PIEDRA' | 'METAL';
}

export interface WorldVehicleSpawn {
  id: string;
  kind: VehicleKind;
  name: string;
  x: number;
  z: number;
  rotationY: number;
}

// Deterministic pseudo-random generator
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getTerrainHeight(x: number, z: number): number {
  // Base gentle rolling hills
  let h =
    Math.sin(x * 0.008) * Math.cos(z * 0.008) * 4.5 +
    Math.sin(x * 0.022 + 1.1) * Math.sin(z * 0.019) * 1.8;

  // Mountains in north (Cumbres Heladas: x=-20, z=-410)
  const dMtn = Math.hypot(x + 20, z + 410);
  if (dMtn < 190) {
    const t = 1 - dMtn / 190;
    h += t * t * 34 + Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4 * t;
  }

  // Lake depression (Lago Cristal: x=-40, z=185)
  const dLake = Math.hypot(x + 40, z - 185);
  if (dLake < 95) {
    const t = 1 - dLake / 95;
    h -= t * t * 6.5;
  }

  // Flatten POIs for clean walkable structures (City, Airport, Military, Industrial, Port)
  const flatZones = [
    { x: -160, z: -40, r: 95, targetH: 2.0 },
    { x: 60, z: 410, r: 105, targetH: 1.5 },
    { x: 280, z: -340, r: 85, targetH: 3.0 },
    { x: 185, z: -70, r: 85, targetH: 2.0 },
    { x: 430, z: -150, r: 90, targetH: 0.8 },
    { x: -370, z: 220, r: 75, targetH: 1.8 },
  ];

  for (const fz of flatZones) {
    const dist = Math.hypot(x - fz.x, z - fz.z);
    if (dist < fz.r) {
      const blend = Math.max(0, Math.min(1, (dist - fz.r * 0.55) / (fz.r * 0.45)));
      h = fz.targetH * (1 - blend) + h * blend;
    }
  }

  // Desert dunes (x=320, z=260)
  const dDesert = Math.hypot(x - 320, z - 260);
  if (dDesert < 160) {
    const t = 1 - dDesert / 160;
    h += Math.sin(x * 0.04 + z * 0.03) * 3.5 * t;
  }

  // Island outer coast falloff near edges
  const edgeDist = Math.max(Math.abs(x), Math.abs(z));
  if (edgeDist > 520) {
    const drop = ((edgeDist - 520) / 80) * 14;
    h -= drop;
  }

  return Math.max(-4.5, h);
}

export function getRegionAt(x: number, z: number): MapRegion {
  let closest = MAP_REGIONS[0];
  let bestDist = Infinity;
  for (const r of MAP_REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < bestDist) {
      bestDist = d;
      closest = r;
    }
  }
  return closest;
}

export interface WorldLayout {
  buildings: WorldBuilding[];
  props: WorldProp[];
  chests: ChestState[];
  loot: LootPickup[];
  vehicles: WorldVehicleSpawn[];
}

export function generateWorldLayout(seed = 202607): WorldLayout {
  const rng = mulberry32(seed);
  const buildings: WorldBuilding[] = [];
  const props: WorldProp[] = [];
  const chests: ChestState[] = [];
  const loot: LootPickup[] = [];
  const vehicles: WorldVehicleSpawn[] = [];

  const addBuilding = (
    id: string,
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: string,
    accentColor: string,
    regionId: string,
    kind: WorldBuilding['kind'],
    doorSide: WorldBuilding['doorSide']
  ) => {
    const y = getTerrainHeight(x, z);
    buildings.push({ id, x, y, z, width, height, depth, color, accentColor, regionId, kind, doorSide });
  };

  // 1. Neo-Metrópolis (Futuristic City)
  const citySpecs: Array<[number, number, number, number, number, string, WorldBuilding['doorSide']]> = [
    [-195, -80, 18, 28, 18, '#1E293B', 'E'],
    [-130, -85, 20, 36, 16, '#0F172A', 'S'],
    [-190, -10, 16, 22, 20, '#334155', 'N'],
    [-125, 0, 22, 18, 18, '#1E293B', 'W'],
    [-160, 45, 16, 14, 16, '#273549', 'N'],
  ];
  citySpecs.forEach(([x, z, w, h, d, c, door], i) => {
    addBuilding(`bld_city_${i}`, x, z, w, h, d, c, '#06B6D4', 'city', 'TOWER', door);
  });

  // 2. Sector Fundición (Industrial)
  const indSpecs: Array<[number, number, number, number, number, WorldBuilding['doorSide']]> = [
    [155, -95, 24, 10, 16, 'S'],
    [210, -90, 20, 12, 18, 'W'],
    [185, -35, 26, 9, 14, 'N'],
  ];
  indSpecs.forEach(([x, z, w, h, d, door], i) => {
    addBuilding(`bld_ind_${i}`, x, z, w, h, d, '#475569', '#F97316', 'industrial', 'WAREHOUSE', door);
  });

  // 3. Fuerte Bastión (Military Base)
  const milSpecs: Array<[number, number, number, number, number, WorldBuilding['doorSide']]> = [
    [250, -365, 18, 7, 14, 'S'],
    [305, -360, 16, 8, 16, 'W'],
    [280, -310, 20, 6, 12, 'N'],
  ];
  milSpecs.forEach(([x, z, w, h, d, door], i) => {
    addBuilding(`bld_mil_${i}`, x, z, w, h, d, '#3F4E3A', '#84CC16', 'military', 'BUNKER', door);
  });

  // 4. Pista Horizonte (Airport)
  addBuilding('bld_air_0', 10, 415, 28, 10, 22, '#334155', '#38BDF8', 'airport', 'HANGAR', 'E');
  addBuilding('bld_air_1', 110, 415, 28, 10, 22, '#334155', '#38BDF8', 'airport', 'HANGAR', 'W');
  addBuilding('bld_air_ctrl', 60, 365, 12, 24, 12, '#1E293B', '#F59E0B', 'airport', 'TOWER', 'S');

  // 5. Puerto Marea (Port)
  addBuilding('bld_port_0', 405, -175, 20, 8, 14, '#334155', '#06B6D4', 'port', 'WAREHOUSE', 'E');
  addBuilding('bld_port_1', 455, -135, 14, 10, 32, '#1E3A5F', '#F59E0B', 'port', 'SHIP', 'W');

  // 6. Valle Fantasma (Abandoned Village)
  const villSpecs: Array<[number, number, WorldBuilding['doorSide']]> = [
    [-395, 195, 'E'],
    [-345, 200, 'S'],
    [-390, 250, 'N'],
    [-340, 245, 'W'],
  ];
  villSpecs.forEach(([x, z, door], i) => {
    addBuilding(`bld_vil_${i}`, x, z, 11, 6, 10, '#6B5B4B', '#A8A29E', 'abandoned', 'HOUSE', door);
  });

  // 7. Bosque Esmeralda & Cumbres Heladas Cabins
  addBuilding('bld_for_0', -340, -280, 12, 6, 10, '#785032', '#22C55E', 'forest', 'CABIN', 'S');
  addBuilding('bld_for_1', -290, -240, 10, 6, 10, '#785032', '#22C55E', 'forest', 'CABIN', 'W');
  addBuilding('bld_mtn_0', -20, -405, 14, 9, 14, '#475569', '#E2E8F0', 'mountains', 'BUNKER', 'S');
  addBuilding('bld_lake_0', -40, 185, 10, 5.5, 10, '#7C5338', '#38BDF8', 'lake', 'CABIN', 'N');

  // Helper to check if point is inside any building footprint
  const isInsideBuilding = (x: number, z: number, pad = 4) => {
    for (const b of buildings) {
      if (Math.abs(x - b.x) < b.width / 2 + pad && Math.abs(z - b.z) < b.depth / 2 + pad) {
        return true;
      }
    }
    return false;
  };

  // Generate Props (Trees, Pines, Rocks, Palms, Containers)
  let propIdx = 0;
  for (let i = 0; i < 420; i++) {
    const x = (rng() - 0.5) * (MAP_SIZE - 110);
    const z = (rng() - 0.5) * (MAP_SIZE - 110);
    const h = getTerrainHeight(x, z);
    if (h < -0.5 || isInsideBuilding(x, z, 5)) continue;

    const region = getRegionAt(x, z);
    let kind: WorldProp['kind'] = 'TREE';
    let material: WorldProp['material'] = 'MADERA';
    let hp = 120;

    if (region.id === 'forest') {
      kind = rng() > 0.35 ? 'PINE' : 'TREE';
    } else if (region.id === 'mountains') {
      kind = rng() > 0.45 ? 'ROCK' : 'PINE';
      material = kind === 'ROCK' ? 'PIEDRA' : 'MADERA';
      hp = kind === 'ROCK' ? 180 : 120;
    } else if (region.id === 'desert') {
      kind = rng() > 0.4 ? 'ROCK' : 'PALM';
      material = kind === 'ROCK' ? 'PIEDRA' : 'MADERA';
    } else if (region.id === 'industrial' || region.id === 'port') {
      kind = rng() > 0.5 ? 'CONTAINER' : 'CRATE';
      material = kind === 'CONTAINER' ? 'METAL' : 'MADERA';
      hp = kind === 'CONTAINER' ? 240 : 100;
    } else if (region.id === 'city' || region.id === 'airport') {
      if (rng() > 0.4) {
        kind = 'CRATE';
        material = 'METAL';
        hp = 140;
      } else {
        kind = 'TREE';
      }
    } else {
      const rVal = rng();
      kind = rVal < 0.6 ? 'TREE' : rVal < 0.85 ? 'ROCK' : 'CRATE';
      material = kind === 'ROCK' ? 'PIEDRA' : 'MADERA';
    }

    props.push({
      id: `prop_${propIdx++}`,
      kind,
      x,
      y: h,
      z,
      scale: 0.85 + rng() * 0.45,
      rotationY: rng() * Math.PI * 2,
      hp,
      material,
    });
  }

  // Generate Chests inside buildings and across POIs
  let chestIdx = 0;
  buildings.forEach((b, idx) => {
    const cx = b.x + (rng() - 0.5) * (b.width * 0.45);
    const cz = b.z + (rng() - 0.5) * (b.depth * 0.45);
    chests.push({
      id: `chest_${chestIdx++}`,
      x: cx,
      y: b.y + 0.15,
      z: cz,
      opened: false,
      tier: idx % 3 === 0 ? 'EPICO' : 'NORMAL',
    });
  });
  for (let i = 0; i < 28; i++) {
    const region = MAP_REGIONS[i % MAP_REGIONS.length];
    const angle = rng() * Math.PI * 2;
    const dist = 12 + rng() * (region.radius * 0.55);
    const x = region.x + Math.cos(angle) * dist;
    const z = region.z + Math.sin(angle) * dist;
    const y = getTerrainHeight(x, z);
    if (y < -0.4 || isInsideBuilding(x, z, 2)) continue;
    chests.push({
      id: `chest_${chestIdx++}`,
      x,
      y,
      z,
      opened: false,
      tier: rng() > 0.72 ? 'EPICO' : 'NORMAL',
    });
  }

  // Generate Ground Loot Pickups across POIs
  let lootIdx = 0;
  const consumables: Array<LootPickup['consumableId']> = ['BANDAGE', 'MEDKIT', 'SHIELD_SMALL', 'SHIELD_LARGE'];
  for (let i = 0; i < 85; i++) {
    const region = MAP_REGIONS[i % MAP_REGIONS.length];
    const angle = rng() * Math.PI * 2;
    const dist = 8 + rng() * (region.radius * 0.65);
    const x = region.x + Math.cos(angle) * dist;
    const z = region.z + Math.sin(angle) * dist;
    const y = getTerrainHeight(x, z);
    if (y < -0.3) continue;

    const roll = rng();
    if (roll < 0.48) {
      const w = WEAPONS[Math.floor(rng() * WEAPONS.length)];
      loot.push({ id: `loot_${lootIdx++}`, x, y, z, kind: 'WEAPON', weaponId: w.id });
    } else if (roll < 0.72) {
      loot.push({ id: `loot_${lootIdx++}`, x, y, z, kind: 'AMMO', ammoAmount: 30 + Math.floor(rng() * 30) });
    } else if (roll < 0.88) {
      loot.push({
        id: `loot_${lootIdx++}`,
        x,
        y,
        z,
        kind: 'CONSUMABLE',
        consumableId: consumables[Math.floor(rng() * consumables.length)],
      });
    } else {
      const mats: Array<'MADERA' | 'PIEDRA' | 'METAL'> = ['MADERA', 'PIEDRA', 'METAL'];
      loot.push({
        id: `loot_${lootIdx++}`,
        x,
        y,
        z,
        kind: 'MATERIAL',
        materialType: mats[Math.floor(rng() * mats.length)],
        materialAmount: 40,
      });
    }
  }

  // Generate Drivable Vehicles across key roads and POIs
  const vehiclePlacements: Array<{ kind: VehicleKind; name: string; x: number; z: number; rot: number }> = [
    { kind: 'AUTO', name: 'Interceptor GT', x: -105, z: -30, rot: 0.4 },
    { kind: 'MOTO', name: 'Relámpago RS', x: -155, z: -120, rot: 1.2 },
    { kind: 'TODOTERRENO', name: 'Titán 4x4', x: 140, z: -35, rot: -0.5 },
    { kind: 'AUTO', name: 'Interceptor GT', x: 60, z: 330, rot: 0 },
    { kind: 'TODOTERRENO', name: 'Titán 4x4', x: 295, z: 210, rot: 2.1 },
    { kind: 'MOTO', name: 'Relámpago RS', x: 245, z: -290, rot: 0.8 },
    { kind: 'TODOTERRENO', name: 'Titán 4x4', x: -320, z: 175, rot: -1.1 },
    { kind: 'AUTO', name: 'Interceptor GT', x: 390, z: -115, rot: 1.5 },
    { kind: 'MOTO', name: 'Relámpago RS', x: -295, z: -200, rot: 0.2 },
    { kind: 'TODOTERRENO', name: 'Titán 4x4', x: -10, z: -345, rot: 2.8 },
  ];

  vehiclePlacements.forEach((v, i) => {
    vehicles.push({
      id: `veh_${i}`,
      kind: v.kind,
      name: v.name,
      x: v.x,
      z: v.z,
      rotationY: v.rot,
    });
  });

  return { buildings, props, chests, loot, vehicles };
}
