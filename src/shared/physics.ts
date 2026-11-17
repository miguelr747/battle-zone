import { BuildPieceState } from './types';
import { GRID_SIZE, MAP_HALF, WorldBuilding, WorldProp, getTerrainHeight } from './worldGen';

export interface PhysicsResolveResult {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
}

const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 0.28;
const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.85;

// Rotate local point around Y by -angle to transform world offset into piece-local space
function toLocalXZ(dx: number, dz: number, rotationY: number): { lx: number; lz: number } {
  const c = Math.cos(-rotationY);
  const s = Math.sin(-rotationY);
  return {
    lx: dx * c - dz * s,
    lz: dx * s + dz * c,
  };
}

function fromLocalXZ(lx: number, lz: number, rotationY: number): { dx: number; dz: number } {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return {
    dx: lx * c - lz * s,
    dz: lx * s + lz * c,
  };
}

export function resolveActorMovement(
  x: number,
  y: number,
  z: number,
  vy: number,
  dt: number,
  buildings: WorldBuilding[],
  props: WorldProp[],
  builds: BuildPieceState[]
): PhysicsResolveResult {
  let nx = Math.max(-MAP_HALF + 8, Math.min(MAP_HALF - 8, x));
  let nz = Math.max(-MAP_HALF + 8, Math.min(MAP_HALF - 8, z));
  let ny = y + vy * dt;
  let nvy = vy;
  let grounded = false;

  let supportY = getTerrainHeight(nx, nz);

  // 1. Buildings AABB + interior doorway support
  for (const b of buildings) {
    const hw = b.width / 2;
    const hd = b.depth / 2;
    const dx = nx - b.x;
    const dz = nz - b.z;
    const nearX = Math.abs(dx) < hw + PLAYER_RADIUS + 0.5;
    const nearZ = Math.abs(dz) < hd + PLAYER_RADIUS + 0.5;
    if (!nearX || !nearZ) continue;

    const roofY = b.y + b.height;
    // Standing on roof
    if (Math.abs(dx) < hw + 0.15 && Math.abs(dz) < hd + 0.15 && y >= roofY - 0.65 && ny <= roofY + 0.05) {
      if (roofY > supportY) supportY = roofY;
      continue;
    }

    // Inside floor
    const floorY = b.y + 0.15;
    const insideInterior = Math.abs(dx) < hw - 0.6 && Math.abs(dz) < hd - 0.6 && ny < roofY - 0.4;
    if (insideInterior) {
      if (floorY > supportY) supportY = floorY;
      continue;
    }

    // Check doorway opening on doorSide (width 2.8m, height 3.2m)
    if (ny < b.y + 2.8) {
      const inDoorN = b.doorSide === 'N' && dz < -hd + 1.2 && dz > -hd - 1.2 && Math.abs(dx) < 1.5;
      const inDoorS = b.doorSide === 'S' && dz > hd - 1.2 && dz < hd + 1.2 && Math.abs(dx) < 1.5;
      const inDoorE = b.doorSide === 'E' && dx > hw - 1.2 && dx < hw + 1.2 && Math.abs(dz) < 1.5;
      const inDoorW = b.doorSide === 'W' && dx < -hw + 1.2 && dx > -hw - 1.2 && Math.abs(dz) < 1.5;
      if (inDoorN || inDoorS || inDoorE || inDoorW) {
        if (floorY > supportY) supportY = floorY;
        continue;
      }
    }

    // Push out from exterior building walls if below roof
    if (ny < roofY - 0.35 && ny + PLAYER_HEIGHT > b.y + 0.2) {
      const penX = hw + PLAYER_RADIUS - Math.abs(dx);
      const penZ = hd + PLAYER_RADIUS - Math.abs(dz);
      if (penX > 0 && penZ > 0) {
        if (penX < penZ) {
          nx += dx >= 0 ? penX : -penX;
        } else {
          nz += dz >= 0 ? penZ : -penZ;
        }
      }
    }
  }

  // 2. Props cylinder collision (trees, rocks, containers)
  for (const p of props) {
    if (p.hp <= 0) continue;
    const dx = nx - p.x;
    const dz = nz - p.z;
    const rad =
      p.kind === 'CONTAINER'
        ? 2.1 * p.scale
        : p.kind === 'ROCK'
          ? 1.5 * p.scale
          : p.kind === 'CRATE'
            ? 1.0 * p.scale
            : 0.65 * p.scale;
    const distSq = dx * dx + dz * dz;
    const minDist = rad + PLAYER_RADIUS;
    if (distSq < minDist * minDist && ny < p.y + 3.2 * p.scale) {
      const dist = Math.sqrt(distSq) || 0.001;
      const push = minDist - dist;
      nx += (dx / dist) * push;
      nz += (dz / dist) * push;
    }
  }

  // 3. Player-built structures collision & ramp/floor climbing
  const halfGrid = GRID_SIZE / 2;
  for (const bp of builds) {
    if (bp.hp <= 0) continue;
    const dx = nx - bp.x;
    const dz = nz - bp.z;
    if (Math.abs(dx) > GRID_SIZE + 1 || Math.abs(dz) > GRID_SIZE + 1) continue;

    const { lx, lz } = toLocalXZ(dx, dz, bp.rotationY);

    if (bp.type === 'PISO') {
      if (Math.abs(lx) <= halfGrid + 0.15 && Math.abs(lz) <= halfGrid + 0.15) {
        const floorTop = bp.y + 0.18;
        if (y >= floorTop - 0.8 && ny <= floorTop + 0.1) {
          if (floorTop > supportY) supportY = floorTop;
        }
      }
    } else if (bp.type === 'TECHO') {
      if (Math.abs(lx) <= halfGrid + 0.15 && Math.abs(lz) <= halfGrid + 0.15) {
        const distNorm = Math.max(Math.abs(lx) / halfGrid, Math.abs(lz) / halfGrid);
        const roofTop = bp.y + (1 - Math.min(1, distNorm)) * 2.1;
        if (y >= roofTop - 0.9 && ny <= roofTop + 0.25) {
          if (roofTop > supportY) supportY = roofTop;
        }
      }
    } else if (bp.type === 'RAMPA') {
      // Ascending along -lz -> +lz from bp.y to bp.y + WALL_HEIGHT
      if (Math.abs(lx) <= halfGrid + 0.2 && Math.abs(lz) <= halfGrid + 0.25) {
        const t = Math.max(0, Math.min(1, (lz + halfGrid) / GRID_SIZE));
        const rampY = bp.y + t * WALL_HEIGHT;
        if (y >= rampY - 1.1 && ny <= rampY + 0.55) {
          if (rampY > supportY) supportY = rampY;
        }
      }
    } else if (bp.type === 'PARED') {
      // Wall lies along local X axis [-halfGrid, +halfGrid] at lz = 0, height [bp.y, bp.y + WALL_HEIGHT]
      if (ny < bp.y + WALL_HEIGHT - 0.2 && ny + PLAYER_HEIGHT > bp.y + 0.15) {
        if (Math.abs(lx) <= halfGrid + PLAYER_RADIUS * 0.6 && Math.abs(lz) < WALL_THICKNESS / 2 + PLAYER_RADIUS) {
          // Check doorway / opening cutout
          const hasDoorGap =
            (bp.editShape === 'PUERTA' && Math.abs(lx) < 0.72 && ny < bp.y + 2.3) ||
            (bp.editShape === 'ABERTURA' && Math.abs(lx) < 1.1 && ny < bp.y + 2.5);
          if (!hasDoorGap) {
            const signZ = lz >= 0 ? 1 : -1;
            const pushZ = WALL_THICKNESS / 2 + PLAYER_RADIUS - Math.abs(lz);
            const worldPush = fromLocalXZ(0, signZ * pushZ, bp.rotationY);
            nx += worldPush.dx;
            nz += worldPush.dz;
          }
        }
      }
    }
  }

  if (ny <= supportY) {
    ny = supportY;
    nvy = 0;
    grounded = true;
  }

  return { x: nx, y: ny, z: nz, vy: nvy, grounded };
}

export interface RayHitResult {
  distance: number;
  point: { x: number; y: number; z: number };
  hitType: 'TERRAIN' | 'BUILDING' | 'PROP' | 'BUILD' | 'ACTOR';
  targetId?: string;
  headshot?: boolean;
}

export interface RayActorBox {
  id: string;
  x: number;
  y: number;
  z: number;
  crouching: boolean;
  alive: boolean;
  teamId: number;
}

// Fast analytical raycast shared between server validation and client hit detection
export function raycastWorld(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  shooterId: string,
  shooterTeamId: number,
  actors: RayActorBox[],
  buildings: WorldBuilding[],
  props: WorldProp[],
  builds: BuildPieceState[]
): RayHitResult | null {
  let bestDist = maxDist;
  let bestHit: RayHitResult | null = null;

  // 1. Check Actors (capsule approximated by cylinder + head sphere)
  for (const a of actors) {
    if (!a.alive || a.id === shooterId || (shooterTeamId > 0 && a.teamId === shooterTeamId)) continue;
    const height = a.crouching ? 1.3 : 1.85;
    const radius = 0.52;

    // Ray-sphere/cylinder test in XZ
    const rx = ox - a.x;
    const rz = oz - a.z;
    const A = dx * dx + dz * dz;
    const B = 2 * (rx * dx + rz * dz);
    const C = rx * rx + rz * rz - radius * radius;
    const disc = B * B - 4 * A * C;
    if (A > 1e-6 && disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t > 0.2 && t < bestDist) {
        const hitY = oy + dy * t;
        if (hitY >= a.y && hitY <= a.y + height) {
          bestDist = t;
          bestHit = {
            distance: t,
            point: { x: ox + dx * t, y: hitY, z: oz + dz * t },
            hitType: 'ACTOR',
            targetId: a.id,
            headshot: hitY >= a.y + height * 0.76,
          };
        }
      }
    }
  }

  // 2. Check Buildings AABBs
  for (const b of buildings) {
    const minX = b.x - b.width / 2;
    const maxX = b.x + b.width / 2;
    const minY = b.y;
    const maxY = b.y + b.height;
    const minZ = b.z - b.depth / 2;
    const maxZ = b.z + b.depth / 2;

    const tMin = intersectAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ);
    if (tMin !== null && tMin > 0.1 && tMin < bestDist) {
      bestDist = tMin;
      bestHit = {
        distance: tMin,
        point: { x: ox + dx * tMin, y: oy + dy * tMin, z: oz + dz * tMin },
        hitType: 'BUILDING',
        targetId: b.id,
      };
    }
  }

  // 3. Check Props
  for (const p of props) {
    if (p.hp <= 0) continue;
    const r = p.kind === 'CONTAINER' ? 2.1 * p.scale : p.kind === 'ROCK' ? 1.5 * p.scale : 0.85 * p.scale;
    const h = p.kind === 'TREE' || p.kind === 'PINE' ? 5.2 * p.scale : 2.6 * p.scale;
    const tMin = intersectAABB(ox, oy, oz, dx, dy, dz, p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r);
    if (tMin !== null && tMin > 0.1 && tMin < bestDist) {
      bestDist = tMin;
      bestHit = {
        distance: tMin,
        point: { x: ox + dx * tMin, y: oy + dy * tMin, z: oz + dz * tMin },
        hitType: 'PROP',
        targetId: p.id,
      };
    }
  }

  // 4. Check Player Builds (respecting edits!)
  const halfGrid = GRID_SIZE / 2;
  for (const bp of builds) {
    if (bp.hp <= 0) continue;
    if (bp.type === 'PARED') {
      // Transform ray into wall-local space
      const lOrigin = toLocalXZ(ox - bp.x, oz - bp.z, bp.rotationY);
      const lDir = toLocalXZ(dx, dz, bp.rotationY);
      if (Math.abs(lDir.lz) > 1e-5) {
        const t = -lOrigin.lz / lDir.lz;
        if (t > 0.1 && t < bestDist) {
          const hitLX = lOrigin.lx + lDir.lx * t;
          const hitY = oy + dy * t;
          if (Math.abs(hitLX) <= halfGrid && hitY >= bp.y && hitY <= bp.y + WALL_HEIGHT) {
            // Check edit cutouts (allow shooting through windows/doors/arches!)
            const inWindow = bp.editShape === 'VENTANA' && Math.abs(hitLX) < 0.72 && hitY > bp.y + 1.15 && hitY < bp.y + 2.35;
            const inDoor = bp.editShape === 'PUERTA' && Math.abs(hitLX) < 0.72 && hitY < bp.y + 2.3;
            const inArch = bp.editShape === 'ABERTURA' && Math.abs(hitLX) < 1.1 && hitY < bp.y + 2.5;
            if (!inWindow && !inDoor && !inArch) {
              bestDist = t;
              bestHit = {
                distance: t,
                point: { x: ox + dx * t, y: hitY, z: oz + dz * t },
                hitType: 'BUILD',
                targetId: bp.id,
              };
            }
          }
        }
      }
    } else if (bp.type === 'PISO' || bp.type === 'TECHO') {
      if (Math.abs(dy) > 1e-5) {
        const planeY = bp.type === 'PISO' ? bp.y + 0.1 : bp.y + 1.0;
        const t = (planeY - oy) / dy;
        if (t > 0.1 && t < bestDist) {
          const hitX = ox + dx * t;
          const hitZ = oz + dz * t;
          const local = toLocalXZ(hitX - bp.x, hitZ - bp.z, bp.rotationY);
          if (Math.abs(local.lx) <= halfGrid && Math.abs(local.lz) <= halfGrid) {
            bestDist = t;
            bestHit = {
              distance: t,
              point: { x: hitX, y: planeY, z: hitZ },
              hitType: 'BUILD',
              targetId: bp.id,
            };
          }
        }
      }
    } else if (bp.type === 'RAMPA') {
      // Approximate ramp plane normal in local space: (0, GRID_SIZE, -WALL_HEIGHT)
      const lOrigin = toLocalXZ(ox - bp.x, oz - bp.z, bp.rotationY);
      const lDir = toLocalXZ(dx, dz, bp.rotationY);
      const denom = dy * GRID_SIZE - lDir.lz * WALL_HEIGHT;
      if (Math.abs(denom) > 1e-5) {
        const num = (bp.y + WALL_HEIGHT * 0.5 - oy) * GRID_SIZE + lOrigin.lz * WALL_HEIGHT;
        const t = num / denom;
        if (t > 0.1 && t < bestDist) {
          const hlx = lOrigin.lx + lDir.lx * t;
          const hlz = lOrigin.lz + lDir.lz * t;
          if (Math.abs(hlx) <= halfGrid && Math.abs(hlz) <= halfGrid) {
            bestDist = t;
            bestHit = {
              distance: t,
              point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t },
              hitType: 'BUILD',
              targetId: bp.id,
            };
          }
        }
      }
    }
  }

  // 5. Terrain raymarch step
  const step = 3.0;
  for (let d = 1.0; d < bestDist; d += step) {
    const px = ox + dx * d;
    const py = oy + dy * d;
    const pz = oz + dz * d;
    const th = getTerrainHeight(px, pz);
    if (py <= th) {
      bestDist = d;
      bestHit = {
        distance: d,
        point: { x: px, y: th, z: pz },
        hitType: 'TERRAIN',
      };
      break;
    }
  }

  return bestHit;
}

function intersectAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): number | null {
  const invX = dx !== 0 ? 1 / dx : 1e9;
  const invY = dy !== 0 ? 1 / dy : 1e9;
  const invZ = dz !== 0 ? 1 / dz : 1e9;

  const t1 = (minX - ox) * invX;
  const t2 = (maxX - ox) * invX;
  const t3 = (minY - oy) * invY;
  const t4 = (maxY - oy) * invY;
  const t5 = (minZ - oz) * invZ;
  const t6 = (maxZ - oz) * invZ;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));

  if (tmax < 0 || tmin > tmax) return null;
  return tmin >= 0 ? tmin : tmax;
}
