import {
  ActorNetState,
  BotDifficulty,
  BuildPieceState,
  ChestState,
  GameMode,
  LootPickup,
  MaterialType,
  StormState,
} from '../shared/types';
import { MATERIAL_STATS, WEAPON_MAP, WEAPONS } from '../shared/weapons';
import { GRID_SIZE, MAP_REGIONS, WorldBuilding, WorldProp, getTerrainHeight } from '../shared/worldGen';
import { raycastWorld, resolveActorMovement } from '../shared/physics';

export type BotPersonality = 'AGRESIVO' | 'CONSTRUCTOR' | 'FRANCOTIRADOR' | 'SAQUEADOR';

export interface LocalBotState extends ActorNetState {
  personality: BotPersonality;
  materials: Record<MaterialType, number>;
  medkits: number;
  shields: number;
  targetX: number;
  targetZ: number;
  nextThinkAt: number;
  lastFireAt: number;
  healUntil: number;
  recoil: number;
}

const BOT_NAMES = [
  'Kobra_99', 'AresTáctico', 'ValkiriaX', 'SombraAlfa', 'TitánRojo', 'Nómada07',
  'HalcónSur', 'Centella', 'Raptor_V', 'OmegaZero', 'LoboGris', 'FénixDelta',
  'MantisPro', 'Jabalí_88', 'Relámpago', 'Vértigo', 'Ciclón_AR', 'Espectro7',
  'Escorpión', 'PumaNorte', 'CazadorV', 'BastiónX', 'Goliath', 'Nébula9',
];

export function spawnOfflineBots(
  count: number,
  mode: GameMode,
  difficulty: BotDifficulty
): LocalBotState[] {
  const bots: LocalBotState[] = [];
  const personalities: BotPersonality[] = ['AGRESIVO', 'CONSTRUCTOR', 'FRANCOTIRADOR', 'SAQUEADOR'];
  const colors = ['#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#F97316', '#0EA5E9'];

  for (let i = 0; i < count; i++) {
    const reg = MAP_REGIONS[i % MAP_REGIONS.length];
    const ang = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * (reg.radius * 0.72);
    const x = reg.x + Math.cos(ang) * dist;
    const z = reg.z + Math.sin(ang) * dist;
    const y = getTerrainHeight(x, z);

    const personality = personalities[i % personalities.length];
    const weaponPool =
      personality === 'FRANCOTIRADOR'
        ? WEAPONS.filter((w) => w.category === 'FRANCOTIRADOR' || w.category === 'FUSIL')
        : WEAPONS;
    const w = weaponPool[Math.floor(Math.random() * weaponPool.length)];

    const teamId =
      mode === 'SOLO'
        ? i + 2
        : mode === 'DUOS'
          ? Math.floor(i / 2) + 2
          : mode === 'SQUADS'
            ? Math.floor(i / 4) + 2
            : 2;

    bots.push({
      id: `bot_${i}`,
      name: `${BOT_NAMES[i % BOT_NAMES.length]}_${i + 1}`,
      teamId,
      isBot: true,
      difficulty,
      personality,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      shield: difficulty === 'EXPERTO' ? 75 : difficulty === 'DIFICIL' ? 50 : 25,
      maxShield: 100,
      alive: true,
      kills: 0,
      crouching: false,
      sliding: false,
      sprinting: false,
      airborne: false,
      parachuting: false,
      inDropship: false,
      aiming: false,
      buildingMode: false,
      emoting: false,
      vehicleId: null,
      activeWeaponId: w.id,
      customization: {
        skin: i % 4 === 0 ? 'skin_crimson' : 'skin_vanguard',
        helmet: i % 2 === 0 ? 'helmet_tactical' : 'helmet_recon',
        backpack: 'pack_field',
        mask: i % 3 === 0 ? 'mask_visor' : 'mask_none',
        accessory: 'acc_none',
        primaryColor: colors[i % colors.length],
        accentColor: '#F59E0B',
        emote: 'emote_salute',
      },
      materials: { MADERA: 120, PIEDRA: 60, METAL: 30 },
      medkits: difficulty === 'FACIL' ? 1 : 2,
      shields: difficulty === 'EXPERTO' ? 2 : 1,
      targetX: x,
      targetZ: z,
      nextThinkAt: Math.random() * 600,
      lastFireAt: 0,
      healUntil: 0,
      recoil: 0,
    });
  }

  return bots;
}

export interface BotStepCallbacks {
  onShot: (shooter: ActorNetState, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, weaponId: string) => void;
  onDamageActor: (attackerId: string, targetId: string, damage: number, weaponName: string, headshot: boolean) => void;
  onPlaceBuild: (piece: BuildPieceState) => void;
  onDamageBuild: (buildId: string, damage: number) => void;
  onEliminateByStorm: (victimId: string) => void;
}

export function stepOfflineBots(
  bots: LocalBotState[],
  player: ActorNetState,
  storm: StormState,
  chests: ChestState[],
  loot: LootPickup[],
  buildings: WorldBuilding[],
  props: WorldProp[],
  builds: BuildPieceState[],
  mode: GameMode,
  dt: number,
  nowMs: number,
  callbacks: BotStepCallbacks
) {
  const allActors: ActorNetState[] = [player, ...bots];
  const rayActors = allActors.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    z: a.z,
    crouching: a.crouching,
    alive: a.alive,
    teamId: a.teamId,
  }));

  for (const bot of bots) {
    if (!bot.alive) continue;
    bot.recoil = Math.max(0, bot.recoil - dt * 4);

    // 1. Storm damage check
    const distToStormCenter = Math.hypot(bot.x - storm.centerX, bot.z - storm.centerZ);
    if (distToStormCenter > storm.radius) {
      bot.hp -= storm.dps * dt;
      if (bot.hp <= 0) {
        callbacks.onEliminateByStorm(bot.id);
        continue;
      }
    }

    // 2. Healing behavior when injured
    if (nowMs < bot.healUntil) {
      bot.crouching = true;
      bot.sprinting = false;
      continue;
    }
    bot.crouching = false;

    if (bot.hp < 55 && bot.medkits > 0 && bot.difficulty !== 'FACIL') {
      bot.medkits -= 1;
      bot.hp = Math.min(100, bot.hp + 55);
      bot.healUntil = nowMs + 1600;
      continue;
    }

    // 3. Find nearest hostile actor (player or enemy bot)
    let enemy: ActorNetState | null = null;
    let bestEnemyDist =
      bot.difficulty === 'EXPERTO'
        ? 110
        : bot.difficulty === 'DIFICIL'
          ? 85
          : bot.difficulty === 'NORMAL'
            ? 65
            : 45;

    for (const other of allActors) {
      if (!other.alive || other.id === bot.id) continue;
      if (mode !== 'SOLO' && other.teamId === bot.teamId) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < bestEnemyDist) {
        bestEnemyDist = d;
        enemy = other;
      }
    }

    // 4. Periodic Goal Selection (Storm Safe Zone, Chests, Loot, Exploration)
    if (nowMs >= bot.nextThinkAt) {
      bot.nextThinkAt = nowMs + 450 + Math.random() * 450;

      if (distToStormCenter > storm.radius * 0.85) {
        // Urgently move inside safe zone
        const ang = Math.atan2(storm.centerZ - bot.z, storm.centerX - bot.x);
        bot.targetX = bot.x + Math.cos(ang) * 75;
        bot.targetZ = bot.z + Math.sin(ang) * 75;
      } else if (bot.personality === 'SAQUEADOR' || bot.hp > 70) {
        // Look for nearby unopened chest or loot
        let foundLoot = false;
        for (const l of loot) {
          if (Math.hypot(l.x - bot.x, l.z - bot.z) < 28) {
            bot.targetX = l.x;
            bot.targetZ = l.z;
            foundLoot = true;
            break;
          }
        }
        if (!foundLoot) {
          for (const ch of chests) {
            if (!ch.opened && Math.hypot(ch.x - bot.x, ch.z - bot.z) < 35) {
              bot.targetX = ch.x;
              bot.targetZ = ch.z;
              foundLoot = true;
              break;
            }
          }
        }
        if (!foundLoot && Math.hypot(bot.targetX - bot.x, bot.targetZ - bot.z) < 8) {
          const targetReg = MAP_REGIONS[Math.floor(Math.random() * MAP_REGIONS.length)];
          bot.targetX = targetReg.x + (Math.random() - 0.5) * 60;
          bot.targetZ = targetReg.z + (Math.random() - 0.5) * 60;
        }
      }
    }

    // Pick up ground loot if walking over it
    for (let i = loot.length - 1; i >= 0; i--) {
      const l = loot[i];
      if (Math.hypot(l.x - bot.x, l.z - bot.z) < 2.2) {
        if (l.kind === 'WEAPON' && l.weaponId) {
          bot.activeWeaponId = l.weaponId;
        } else if (l.kind === 'MATERIAL' && l.materialType) {
          bot.materials[l.materialType] += l.materialAmount ?? 30;
        }
        loot.splice(i, 1);
      }
    }

    // 5. Combat, Building Cover & Movement
    let moveAngle = Math.atan2(bot.targetX - bot.x, bot.targetZ - bot.z);
    let moveSpeed = bot.sprinting ? 6.8 : 4.9;

    if (enemy) {
      const dx = enemy.x - bot.x;
      const dz = enemy.z - bot.z;
      const dy = enemy.y + 1.25 - (bot.y + 1.45);
      bot.yaw = Math.atan2(dx, dz);
      bot.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      bot.aiming = true;

      // Personality-based movement
      if (bot.personality === 'AGRESIVO' && bestEnemyDist > 14) {
        moveAngle = bot.yaw + Math.sin(nowMs * 0.003 + bot.teamId) * 0.45;
        bot.sprinting = true;
      } else if (bot.personality === 'FRANCOTIRADOR' && bestEnemyDist < 22) {
        moveAngle = bot.yaw + Math.PI; // Backpedal
        bot.sprinting = false;
      } else {
        // Strafe
        moveAngle = bot.yaw + (Math.sin(nowMs * 0.0025 + bot.teamId) > 0 ? Math.PI / 2 : -Math.PI / 2);
        bot.sprinting = false;
      }

      // Tactical building for Normal/Hard/Expert bots
      const buildChance =
        bot.difficulty === 'EXPERTO'
          ? 0.085
          : bot.difficulty === 'DIFICIL'
            ? 0.05
            : bot.difficulty === 'NORMAL'
              ? 0.018
              : 0;

      if (buildChance > 0 && (bot.hp < 85 || bot.personality === 'CONSTRUCTOR') && bot.materials.MADERA >= 10) {
        if (Math.random() < buildChance) {
          const distAhead = 3.2;
          const bx = Math.round((bot.x + Math.sin(bot.yaw) * distAhead) / GRID_SIZE) * GRID_SIZE;
          const bz = Math.round((bot.z + Math.cos(bot.yaw) * distAhead) / GRID_SIZE) * GRID_SIZE;
          const by = Math.floor(getTerrainHeight(bx, bz));
          const rot = Math.round(bot.yaw / (Math.PI / 2)) * (Math.PI / 2);
          const bType = bot.difficulty === 'EXPERTO' && Math.random() > 0.65 ? 'RAMPA' : 'PARED';
          const matType: MaterialType = bot.materials.PIEDRA >= 10 && bot.difficulty === 'EXPERTO' ? 'PIEDRA' : 'MADERA';

          const piece: BuildPieceState = {
            id: `bp_ai_${nowMs}_${Math.floor(Math.random() * 9999)}`,
            ownerId: bot.id,
            type: bType,
            material: matType,
            editShape: 'SOLIDA',
            x: bx,
            y: by,
            z: bz,
            rotationY: rot,
            hp: MATERIAL_STATS[matType].maxHp,
            maxHp: MATERIAL_STATS[matType].maxHp,
            buildProgress: 0.25,
            createdAt: nowMs,
          };
          bot.materials[matType] -= 10;
          callbacks.onPlaceBuild(piece);
        }
      }

      // Fire weapon with difficulty-scaled accuracy & cadence
      const w = WEAPON_MAP.get(bot.activeWeaponId) ?? WEAPONS[0];
      const fireCadenceScale =
        bot.difficulty === 'EXPERTO' ? 0.95 : bot.difficulty === 'DIFICIL' ? 0.78 : bot.difficulty === 'NORMAL' ? 0.58 : 0.38;

      if (nowMs - bot.lastFireAt > 1000 / Math.max(0.4, w.fireRate * fireCadenceScale)) {
        bot.lastFireAt = nowMs;
        bot.recoil = 0.3;
        const spreadErr =
          bot.difficulty === 'EXPERTO'
            ? 0.025
            : bot.difficulty === 'DIFICIL'
              ? 0.055
              : bot.difficulty === 'NORMAL'
                ? 0.095
                : 0.16;

        const fx = Math.sin(bot.yaw + (Math.random() - 0.5) * spreadErr) * Math.cos(bot.pitch);
        const fy = Math.sin(bot.pitch + (Math.random() - 0.5) * spreadErr);
        const fz = Math.cos(bot.yaw + (Math.random() - 0.5) * spreadErr) * Math.cos(bot.pitch);

        const hit = raycastWorld(
          bot.x,
          bot.y + 1.45,
          bot.z,
          fx,
          fy,
          fz,
          Math.min(w.range, 140),
          bot.id,
          mode === 'SOLO' ? -1 : bot.teamId,
          rayActors,
          buildings,
          props,
          builds
        );

        const tx = hit ? hit.point.x : bot.x + fx * 65;
        const ty = hit ? hit.point.y : bot.y + 1.45 + fy * 65;
        const tz = hit ? hit.point.z : bot.z + fz * 65;
        callbacks.onShot(bot, bot.x, bot.y + 1.45, bot.z, tx, ty, tz, w.id);

        if (hit && hit.hitType === 'ACTOR' && hit.targetId) {
          const dmgMult =
            bot.difficulty === 'EXPERTO' ? 0.85 : bot.difficulty === 'DIFICIL' ? 0.65 : bot.difficulty === 'NORMAL' ? 0.45 : 0.3;
          callbacks.onDamageActor(
            bot.id,
            hit.targetId,
            Math.max(4, Math.round(w.damage * dmgMult * (hit.headshot ? 1.3 : 1))),
            w.name,
            Boolean(hit.headshot)
          );
        } else if (hit && hit.hitType === 'BUILD' && hit.targetId) {
          callbacks.onDamageBuild(hit.targetId, w.damage * w.structureMultiplier);
        }
      }
    } else {
      bot.aiming = false;
      bot.sprinting = true;
      bot.yaw = moveAngle;
    }

    // 6. Move & resolve physics (full detail if near player, fast terrain snap if far)
    const distToPlayer = Math.hypot(bot.x - player.x, bot.z - player.z);
    const nx = bot.x + Math.sin(moveAngle) * moveSpeed * dt;
    const nz = bot.z + Math.cos(moveAngle) * moveSpeed * dt;

    if (distToPlayer < 160) {
      const resolved = resolveActorMovement(nx, bot.y, nz, bot.vy - 24 * dt, dt, buildings, props, builds);
      bot.x = resolved.x;
      bot.y = resolved.y;
      bot.z = resolved.z;
      bot.vy = resolved.vy;
    } else {
      bot.x = nx;
      bot.z = nz;
      bot.y = getTerrainHeight(nx, nz);
    }
  }
}
