import crypto from 'crypto';
import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ActorNetState,
  BotDifficulty,
  BuildEditShape,
  BuildPieceState,
  BuildPieceType,
  CharacterCustomization,
  ChatMessage,
  GameMode,
  KillFeedEntry,
  MaterialType,
  RoomMember,
  RoomSummary,
  StormState,
  VehicleState,
} from '../shared/types';
import { MATERIAL_STATS, WEAPON_MAP, WEAPONS } from '../shared/weapons';
import { GRID_SIZE, MAP_REGIONS, generateWorldLayout, getTerrainHeight } from '../shared/worldGen';
import { raycastWorld, resolveActorMovement } from '../shared/physics';
import { getUserByToken, recordMatchResult } from './db';

interface ConnectedClient {
  id: string;
  userId: string;
  name: string;
  customization: CharacterCustomization;
  ws: WebSocket;
  roomId: string | null;
}

interface ServerActor extends ActorNetState {
  materials: Record<MaterialType, number>;
  ammoReserve: number;
  magAmmo: number;
  lastFireAt: number;
  lastMoveAt: number;
  aiTargetX: number;
  aiTargetZ: number;
  aiNextThinkAt: number;
  aiBurstUntil: number;
  damageDealt: number;
  buildsPlaced: number;
  joinedAt: number;
}

interface GameRoom {
  id: string;
  code: string;
  name: string;
  mode: GameMode;
  difficulty: BotDifficulty;
  maxPlayers: number;
  hostId: string;
  status: 'LOBBY' | 'COUNTDOWN' | 'IN_GAME';
  countdown: number;
  members: Map<string, RoomMember>;
  chat: ChatMessage[];
  // Active Match State
  worldSeed: number;
  layout: ReturnType<typeof generateWorldLayout>;
  actors: Map<string, ServerActor>;
  builds: Map<string, BuildPieceState>;
  vehicles: Map<string, VehicleState>;
  storm: StormState;
  killFeed: KillFeedEntry[];
  matchStartedAt: number;
  ended: boolean;
}

const rooms = new Map<string, GameRoom>();
const clients = new Map<string, ConnectedClient>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function send(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastRoom(room: GameRoom, type: string, payload: unknown) {
  const msg = JSON.stringify({ type, payload });
  for (const memberId of room.members.keys()) {
    const cl = clients.get(memberId);
    if (cl && cl.ws.readyState === WebSocket.OPEN) {
      cl.ws.send(msg);
    }
  }
}

function getRoomSummaries(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const r of rooms.values()) {
    const host = r.members.get(r.hostId);
    list.push({
      id: r.id,
      code: r.code,
      name: r.name,
      mode: r.mode,
      difficulty: r.difficulty,
      maxPlayers: r.maxPlayers,
      humanCount: Array.from(r.members.values()).filter((m) => m.connected).length,
      status: r.status,
      hostName: host?.name ?? 'Operador',
    });
  }
  return list;
}

function broadcastRoomState(room: GameRoom) {
  broadcastRoom(room, 'room:state', {
    id: room.id,
    code: room.code,
    name: room.name,
    mode: room.mode,
    difficulty: room.difficulty,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    countdown: room.countdown,
    members: Array.from(room.members.values()),
    chat: room.chat.slice(-40),
  });
}

function startRoomMatch(room: GameRoom) {
  room.status = 'IN_GAME';
  room.ended = false;
  room.matchStartedAt = Date.now();
  room.worldSeed = Math.floor(Math.random() * 900000) + 100000;
  room.layout = generateWorldLayout(room.worldSeed);
  room.builds.clear();
  room.actors.clear();
  room.vehicles.clear();
  room.killFeed = [];

  for (const v of room.layout.vehicles) {
    const maxHp = v.kind === 'TODOTERRENO' ? 950 : v.kind === 'AUTO' ? 650 : 420;
    room.vehicles.set(v.id, {
      id: v.id,
      kind: v.kind,
      name: v.name,
      x: v.x,
      y: getTerrainHeight(v.x, v.z) + 0.5,
      z: v.z,
      rotationY: v.rotationY,
      speed: 0,
      hp: maxHp,
      maxHp,
      fuel: 100,
      maxFuel: 100,
      driverId: null,
    });
  }

  room.storm = {
    phase: 1,
    centerX: 0,
    centerZ: 0,
    radius: 620,
    nextCenterX: (Math.random() - 0.5) * 180,
    nextCenterZ: (Math.random() - 0.5) * 180,
    nextRadius: 340,
    shrinking: false,
    timer: 35,
    dps: 2,
  };

  // Spawn human players
  let idx = 0;
  for (const member of room.members.values()) {
    const region = MAP_REGIONS[idx % MAP_REGIONS.length];
    const angle = (idx / Math.max(1, room.members.size)) * Math.PI * 2;
    const sx = region.x + Math.cos(angle) * 28;
    const sz = region.z + Math.sin(angle) * 28;
    const sy = getTerrainHeight(sx, sz);

    room.actors.set(member.id, {
      id: member.id,
      name: member.name,
      teamId: member.teamId,
      isBot: false,
      x: sx,
      y: sy,
      z: sz,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      shield: 50,
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
      activeWeaponId: 'ar_vanguard_common',
      customization: member.customization,
      materials: { MADERA: 150, PIEDRA: 100, METAL: 60 },
      ammoReserve: 120,
      magAmmo: 30,
      lastFireAt: 0,
      lastMoveAt: Date.now(),
      aiTargetX: sx,
      aiTargetZ: sz,
      aiNextThinkAt: 0,
      aiBurstUntil: 0,
      damageDealt: 0,
      buildsPlaced: 0,
      joinedAt: Date.now(),
    });
    idx++;
  }

  // Fill remaining slots with authoritative server bots (capped at 36 for smooth WebSocket bandwidth while scaling up to room.maxPlayers)
  const targetCount = Math.min(room.maxPlayers, 36);
  const botColors = ['#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6'];
  for (let b = idx; b < targetCount; b++) {
    const botId = `bot_${b}`;
    const region = MAP_REGIONS[b % MAP_REGIONS.length];
    const ang = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 65;
    const bx = region.x + Math.cos(ang) * dist;
    const bz = region.z + Math.sin(ang) * dist;
    const by = getTerrainHeight(bx, bz);
    const botWeapon = WEAPONS[Math.floor(Math.random() * Math.min(8, WEAPONS.length))];

    const teamId =
      room.mode === 'SOLO'
        ? b + 1
        : room.mode === 'DUOS'
          ? Math.floor(b / 2) + 1
          : room.mode === 'SQUADS'
            ? Math.floor(b / 4) + 1
            : 99;

    room.actors.set(botId, {
      id: botId,
      name: `Bot_${b + 1}`,
      teamId,
      isBot: true,
      difficulty: room.difficulty,
      x: bx,
      y: by,
      z: bz,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      shield: room.difficulty === 'EXPERTO' ? 50 : 25,
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
      activeWeaponId: botWeapon.id,
      customization: {
        skin: 'skin_vanguard',
        helmet: b % 2 === 0 ? 'helmet_tactical' : 'helmet_recon',
        backpack: 'pack_field',
        mask: b % 3 === 0 ? 'mask_visor' : 'mask_none',
        accessory: 'acc_none',
        primaryColor: botColors[b % botColors.length],
        accentColor: '#F59E0B',
        emote: 'emote_salute',
      },
      materials: { MADERA: 120, PIEDRA: 60, METAL: 40 },
      ammoReserve: 240,
      magAmmo: botWeapon.magSize,
      lastFireAt: 0,
      lastMoveAt: Date.now(),
      aiTargetX: bx + (Math.random() - 0.5) * 80,
      aiTargetZ: bz + (Math.random() - 0.5) * 80,
      aiNextThinkAt: 0,
      aiBurstUntil: 0,
      damageDealt: 0,
      buildsPlaced: 0,
      joinedAt: Date.now(),
    });
  }

  broadcastRoom(room, 'match:start', {
    worldSeed: room.worldSeed,
    mode: room.mode,
    difficulty: room.difficulty,
    actors: Array.from(room.actors.values()),
    vehicles: Array.from(room.vehicles.values()),
    storm: room.storm,
  });
}

function eliminateActor(room: GameRoom, victim: ServerActor, killerId: string | null, weaponName: string) {
  if (!victim.alive) return;
  victim.alive = false;

  if (victim.vehicleId) {
    const veh = room.vehicles.get(victim.vehicleId);
    if (veh && veh.driverId === victim.id) veh.driverId = null;
    victim.vehicleId = null;
  }

  let killerName = 'Tormenta';
  if (killerId) {
    const killer = room.actors.get(killerId);
    if (killer) {
      killer.kills += 1;
      killerName = killer.name;
    }
  }

  const entry: KillFeedEntry = {
    id: `kf_${Date.now()}_${Math.random()}`,
    killerName,
    victimName: victim.name,
    weaponName,
    timestamp: Date.now(),
  };
  room.killFeed.push(entry);

  const aliveActors = Array.from(room.actors.values()).filter((a) => a.alive);
  const placement = aliveActors.length + 1;

  broadcastRoom(room, 'player:eliminated', {
    victimId: victim.id,
    killerId,
    entry,
    aliveCount: aliveActors.length,
    placement,
  });

  // Record match for human victim
  if (!victim.isBot) {
    const cl = clients.get(victim.id);
    if (cl) {
      try {
        recordMatchResult(cl.userId, {
          mode: room.mode,
          placement,
          totalPlayers: room.actors.size,
          kills: victim.kills,
          damage: Math.round(victim.damageDealt),
          buildsPlaced: victim.buildsPlaced,
          survivalTime: Math.round((Date.now() - room.matchStartedAt) / 1000),
        });
      } catch {
        // Ignore DB record errors for guest disconnects
      }
    }
  }

  // Check victory condition
  const aliveTeams = new Set(aliveActors.map((a) => a.teamId));
  if (aliveTeams.size <= 1 && !room.ended) {
    room.ended = true;
    const winnerTeam = aliveActors[0]?.teamId ?? -1;
    const winners = aliveActors.map((a) => ({ id: a.id, name: a.name, kills: a.kills }));
    for (const w of aliveActors) {
      if (!w.isBot) {
        const cl = clients.get(w.id);
        if (cl) {
          try {
            recordMatchResult(cl.userId, {
              mode: room.mode,
              placement: 1,
              totalPlayers: room.actors.size,
              kills: w.kills,
              damage: Math.round(w.damageDealt),
              buildsPlaced: w.buildsPlaced,
              survivalTime: Math.round((Date.now() - room.matchStartedAt) / 1000),
            });
          } catch {
            // ignore
          }
        }
      }
    }
    broadcastRoom(room, 'match:ended', { winnerTeam, winners });
    setTimeout(() => {
      if (rooms.has(room.id)) {
        room.status = 'LOBBY';
        for (const m of room.members.values()) m.ready = false;
        broadcastRoomState(room);
      }
    }, 8000);
  }
}

// Authoritative 20Hz simulation tick for active multiplayer rooms
setInterval(() => {
  const now = Date.now();
  const dt = 0.05;

  for (const room of rooms.values()) {
    if (room.status === 'COUNTDOWN') {
      room.countdown -= dt;
      if (room.countdown <= 0) {
        startRoomMatch(room);
      }
      continue;
    }
    if (room.status !== 'IN_GAME' || room.ended) continue;

    // 1. Storm update
    const st = room.storm;
    st.timer -= dt;
    if (st.timer <= 0) {
      if (!st.shrinking) {
        st.shrinking = true;
        st.timer = 25;
      } else {
        st.shrinking = false;
        st.phase = Math.min(6, st.phase + 1);
        st.centerX = st.nextCenterX;
        st.centerZ = st.nextCenterZ;
        st.radius = st.nextRadius;
        st.nextCenterX = st.centerX + (Math.random() - 0.5) * st.radius * 0.35;
        st.nextCenterZ = st.centerZ + (Math.random() - 0.5) * st.radius * 0.35;
        st.nextRadius = Math.max(25, st.radius * 0.52);
        st.timer = 30;
        st.dps = st.phase * 2.5;
      }
    } else if (st.shrinking) {
      const rate = dt / Math.max(1, st.timer + dt);
      st.centerX += (st.nextCenterX - st.centerX) * rate;
      st.centerZ += (st.nextCenterZ - st.centerZ) * rate;
      st.radius += (st.nextRadius - st.radius) * rate;
    }

    // 2. Build progress
    const buildsArr = Array.from(room.builds.values());
    for (const bp of buildsArr) {
      if (bp.buildProgress < 1) {
        bp.buildProgress = Math.min(1, bp.buildProgress + dt * MATERIAL_STATS[bp.material].buildSpeed);
      }
    }

    const actorsArr = Array.from(room.actors.values());
    const rayActors = actorsArr.map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      z: a.z,
      crouching: a.crouching,
      alive: a.alive,
      teamId: a.teamId,
    }));

    // 3. Storm damage & AI Bot simulation
    for (const actor of actorsArr) {
      if (!actor.alive) continue;

      const dStorm = Math.hypot(actor.x - st.centerX, actor.z - st.centerZ);
      if (dStorm > st.radius) {
        actor.hp -= st.dps * dt;
        if (actor.hp <= 0) {
          eliminateActor(room, actor, null, 'Tormenta');
          continue;
        }
      }

      if (!actor.isBot) continue;

      // Bot decision loop
      if (now >= actor.aiNextThinkAt) {
        actor.aiNextThinkAt = now + 400 + Math.random() * 400;
        if (dStorm > st.radius * 0.85) {
          actor.aiTargetX = st.centerX + (Math.random() - 0.5) * 40;
          actor.aiTargetZ = st.centerZ + (Math.random() - 0.5) * 40;
        } else if (Math.hypot(actor.aiTargetX - actor.x, actor.aiTargetZ - actor.z) < 8) {
          actor.aiTargetX = actor.x + (Math.random() - 0.5) * 110;
          actor.aiTargetZ = actor.z + (Math.random() - 0.5) * 110;
        }
      }

      // Find nearest enemy
      let nearestEnemy: ServerActor | null = null;
      let nearestDist = actor.difficulty === 'EXPERTO' ? 95 : actor.difficulty === 'DIFICIL' ? 75 : 55;
      for (const other of actorsArr) {
        if (!other.alive || other.id === actor.id) continue;
        if (room.mode !== 'SOLO' && other.teamId === actor.teamId) continue;
        const d = Math.hypot(other.x - actor.x, other.z - actor.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = other;
        }
      }

      let moveAngle = Math.atan2(actor.aiTargetX - actor.x, actor.aiTargetZ - actor.z);
      const speed = nearestEnemy ? 5.2 : 6.4;

      if (nearestEnemy) {
        const dx = nearestEnemy.x - actor.x;
        const dz = nearestEnemy.z - actor.z;
        const dy = nearestEnemy.y + 1.2 - (actor.y + 1.4);
        actor.yaw = Math.atan2(dx, dz);
        actor.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        // Strafe
        moveAngle = actor.yaw + (Math.sin(now * 0.002 + actor.teamId) > 0 ? Math.PI / 2 : -Math.PI / 2);

        // Tactical build for Normal/Hard/Expert bots
        if (
          (actor.difficulty === 'DIFICIL' || actor.difficulty === 'EXPERTO') &&
          actor.hp < 75 &&
          actor.materials.MADERA >= 10 &&
          Math.random() < 0.08
        ) {
          const bx = Math.round((actor.x + Math.sin(actor.yaw) * 3.5) / GRID_SIZE) * GRID_SIZE;
          const bz = Math.round((actor.z + Math.cos(actor.yaw) * 3.5) / GRID_SIZE) * GRID_SIZE;
          const by = Math.floor(getTerrainHeight(bx, bz));
          const rot = Math.round(actor.yaw / (Math.PI / 2)) * (Math.PI / 2);
          const id = `bp_bot_${now}_${Math.floor(Math.random() * 999)}`;
          const piece: BuildPieceState = {
            id,
            ownerId: actor.id,
            type: 'PARED',
            material: 'MADERA',
            editShape: 'SOLIDA',
            x: bx,
            y: by,
            z: bz,
            rotationY: rot,
            hp: 150,
            maxHp: 150,
            buildProgress: 0.25,
            createdAt: now,
          };
          room.builds.set(id, piece);
          actor.materials.MADERA -= 10;
          broadcastRoom(room, 'build:placed', piece);
        }

        // Fire weapon
        const w = WEAPON_MAP.get(actor.activeWeaponId) ?? WEAPONS[0];
        if (now - actor.lastFireAt > 1000 / Math.max(0.5, w.fireRate * 0.7)) {
          actor.lastFireAt = now;
          const accError =
            actor.difficulty === 'EXPERTO'
              ? 0.025
              : actor.difficulty === 'DIFICIL'
                ? 0.055
                : actor.difficulty === 'NORMAL'
                  ? 0.09
                  : 0.14;
          const fx = Math.sin(actor.yaw + (Math.random() - 0.5) * accError) * Math.cos(actor.pitch);
          const fy = Math.sin(actor.pitch + (Math.random() - 0.5) * accError);
          const fz = Math.cos(actor.yaw + (Math.random() - 0.5) * accError) * Math.cos(actor.pitch);

          const hit = raycastWorld(
            actor.x,
            actor.y + 1.45,
            actor.z,
            fx,
            fy,
            fz,
            w.range,
            actor.id,
            room.mode === 'SOLO' ? -1 : actor.teamId,
            rayActors,
            room.layout.buildings,
            room.layout.props,
            buildsArr
          );

          broadcastRoom(room, 'shot:fired', {
            shooterId: actor.id,
            ox: actor.x,
            oy: actor.y + 1.45,
            oz: actor.z,
            tx: hit ? hit.point.x : actor.x + fx * 60,
            ty: hit ? hit.point.y : actor.y + 1.45 + fy * 60,
            tz: hit ? hit.point.z : actor.z + fz * 60,
            weaponId: w.id,
          });

          if (hit && hit.hitType === 'ACTOR' && hit.targetId) {
            const target = room.actors.get(hit.targetId);
            if (target && target.alive) {
              const dmg = Math.round(w.damage * (hit.headshot ? 1.45 : 1) * (actor.difficulty === 'FACIL' ? 0.55 : 0.8));
              applyDamage(room, actor, target, dmg, w.name);
            }
          } else if (hit && hit.hitType === 'BUILD' && hit.targetId) {
            const bp = room.builds.get(hit.targetId);
            if (bp) {
              bp.hp -= w.damage * w.structureMultiplier;
              if (bp.hp <= 0) {
                room.builds.delete(bp.id);
                broadcastRoom(room, 'build:destroyed', { id: bp.id });
              }
            }
          }
        }
      } else {
        actor.yaw = moveAngle;
      }

      const nextX = actor.x + Math.sin(moveAngle) * speed * dt;
      const nextZ = actor.z + Math.cos(moveAngle) * speed * dt;
      const resolved = resolveActorMovement(
        nextX,
        actor.y,
        nextZ,
        actor.vy - 24 * dt,
        dt,
        room.layout.buildings,
        room.layout.props,
        buildsArr
      );
      actor.x = resolved.x;
      actor.y = resolved.y;
      actor.z = resolved.z;
      actor.vy = resolved.vy;
      actor.sprinting = !nearestEnemy;
    }

    // 4. Broadcast delta state snapshot
    broadcastRoom(room, 'state:delta', {
      actors: actorsArr.map((a) => ({
        id: a.id,
        x: Math.round(a.x * 100) / 100,
        y: Math.round(a.y * 100) / 100,
        z: Math.round(a.z * 100) / 100,
        yaw: Math.round(a.yaw * 100) / 100,
        pitch: Math.round(a.pitch * 100) / 100,
        hp: Math.round(a.hp),
        shield: Math.round(a.shield),
        alive: a.alive,
        kills: a.kills,
        crouching: a.crouching,
        sprinting: a.sprinting,
        sliding: a.sliding,
        aiming: a.aiming,
        buildingMode: a.buildingMode,
        emoting: a.emoting,
        vehicleId: a.vehicleId,
        activeWeaponId: a.activeWeaponId,
      })),
      vehicles: Array.from(room.vehicles.values()),
      storm: room.storm,
    });
  }
}, 50);

function applyDamage(room: GameRoom, attacker: ServerActor, victim: ServerActor, dmg: number, weaponName: string) {
  let remaining = dmg;
  if (victim.shield > 0) {
    const absorbed = Math.min(victim.shield, remaining);
    victim.shield -= absorbed;
    remaining -= absorbed;
  }
  victim.hp -= remaining;
  attacker.damageDealt += dmg;

  broadcastRoom(room, 'player:hit', {
    targetId: victim.id,
    attackerId: attacker.id,
    hp: Math.max(0, Math.round(victim.hp)),
    shield: Math.max(0, Math.round(victim.shield)),
    damage: dmg,
  });

  if (victim.hp <= 0) {
    eliminateActor(room, victim, attacker.id, weaponName);
  }
}

export function attachWebSocketServer(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token') ?? undefined;
    const profile = getUserByToken(token);

    if (!profile) {
      send(ws, 'error', { message: 'Sesión inválida para multijugador.' });
      ws.close();
      return;
    }

    const clientId = profile.id;
    const client: ConnectedClient = {
      id: clientId,
      userId: profile.id,
      name: profile.username,
      customization: profile.customization,
      ws,
      roomId: null,
    };
    clients.set(clientId, client);

    send(ws, 'connected', { clientId, rooms: getRoomSummaries() });

    ws.on('message', (raw) => {
      let msg: { type: string; payload?: any };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const { type, payload } = msg;

      if (type === 'room:list') {
        send(ws, 'room:list', getRoomSummaries());
        return;
      }

      if (type === 'room:create') {
        const mode: GameMode = ['SOLO', 'DUOS', 'SQUADS', 'TRAINING'].includes(payload?.mode) ? payload.mode : 'SOLO';
        const difficulty: BotDifficulty = ['FACIL', 'NORMAL', 'DIFICIL', 'EXPERTO'].includes(payload?.difficulty)
          ? payload.difficulty
          : 'NORMAL';
        const maxPlayers = Math.max(8, Math.min(100, Number(payload?.maxPlayers) || 36));
        const roomId = `room_${crypto.randomUUID().slice(0, 8)}`;
        const code = generateCode();
        const room: GameRoom = {
          id: roomId,
          code,
          name: String(payload?.name || `Sala de ${client.name}`).slice(0, 28),
          mode,
          difficulty,
          maxPlayers,
          hostId: clientId,
          status: 'LOBBY',
          countdown: 5,
          members: new Map(),
          chat: [
            {
              id: `sys_${Date.now()}`,
              sender: 'Sistema',
              text: `Sala creada (${mode}). Código de invitación: ${code}`,
              timestamp: Date.now(),
              system: true,
            },
          ],
          worldSeed: 202607,
          layout: generateWorldLayout(202607),
          actors: new Map(),
          builds: new Map(),
          vehicles: new Map(),
          storm: {
            phase: 1,
            centerX: 0,
            centerZ: 0,
            radius: 620,
            nextCenterX: 0,
            nextCenterZ: 0,
            nextRadius: 340,
            shrinking: false,
            timer: 35,
            dps: 2,
          },
          killFeed: [],
          matchStartedAt: 0,
          ended: false,
        };
        room.members.set(clientId, {
          id: clientId,
          name: client.name,
          teamId: 1,
          ready: true,
          isHost: true,
          connected: true,
          customization: client.customization,
        });
        rooms.set(roomId, room);
        client.roomId = roomId;
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:join') {
        const target = Array.from(rooms.values()).find(
          (r) => r.id === payload?.roomId || r.code === String(payload?.code || '').toUpperCase()
        );
        if (!target) {
          send(ws, 'error', { message: 'Sala no encontrada.' });
          return;
        }
        if (target.members.size >= target.maxPlayers) {
          send(ws, 'error', { message: 'La sala está llena.' });
          return;
        }
        // Reconnection support if already a member
        const existingMember = target.members.get(clientId);
        if (existingMember) {
          existingMember.connected = true;
        } else {
          const teamSize = target.mode === 'DUOS' ? 2 : target.mode === 'SQUADS' ? 4 : 1;
          const teamId = Math.floor(target.members.size / teamSize) + 1;
          target.members.set(clientId, {
            id: clientId,
            name: client.name,
            teamId,
            ready: false,
            isHost: target.hostId === clientId,
            connected: true,
            customization: client.customization,
          });
        }
        client.roomId = target.id;
        broadcastRoomState(target);

        // If game already running (reconnection!), sync full state
        if (target.status === 'IN_GAME') {
          send(ws, 'match:start', {
            worldSeed: target.worldSeed,
            mode: target.mode,
            difficulty: target.difficulty,
            actors: Array.from(target.actors.values()),
            vehicles: Array.from(target.vehicles.values()),
            builds: Array.from(target.builds.values()),
            storm: target.storm,
          });
        }
        return;
      }

      if (type === 'room:leave') {
        if (client.roomId) {
          const room = rooms.get(client.roomId);
          if (room) {
            room.members.delete(clientId);
            if (room.members.size === 0) {
              rooms.delete(room.id);
            } else {
              if (room.hostId === clientId) {
                const nextHost = room.members.values().next().value;
                if (nextHost) {
                  room.hostId = nextHost.id;
                  nextHost.isHost = true;
                }
              }
              broadcastRoomState(room);
            }
          }
          client.roomId = null;
        }
        return;
      }

      const room = client.roomId ? rooms.get(client.roomId) : undefined;
      if (!room) return;

      if (type === 'room:ready') {
        const mem = room.members.get(clientId);
        if (mem) {
          mem.ready = !mem.ready;
          broadcastRoomState(room);
        }
      } else if (type === 'room:chat') {
        const text = String(payload?.text || '').trim().slice(0, 180);
        if (text) {
          room.chat.push({
            id: `msg_${Date.now()}_${Math.random()}`,
            sender: client.name,
            text,
            timestamp: Date.now(),
          });
          broadcastRoomState(room);
        }
      } else if (type === 'room:start' && room.hostId === clientId && room.status === 'LOBBY') {
        room.status = 'COUNTDOWN';
        room.countdown = 3;
        broadcastRoomState(room);
      } else if (room.status === 'IN_GAME') {
        const actor = room.actors.get(clientId);
        if (!actor || !actor.alive) return;

        if (type === 'player:input') {
          // Server-authoritative speed clamping anti-cheat
          const now = Date.now();
          const elapsed = Math.max(0.02, Math.min(0.25, (now - actor.lastMoveAt) / 1000));
          actor.lastMoveAt = now;
          const maxStep = (actor.vehicleId ? 38 : actor.sprinting ? 14 : 10) * elapsed + 1.5;

          const tx = Number(payload?.x);
          const ty = Number(payload?.y);
          const tz = Number(payload?.z);
          if (Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(tz)) {
            const dist = Math.hypot(tx - actor.x, tz - actor.z);
            if (dist <= maxStep) {
              actor.x = tx;
              actor.y = ty;
              actor.z = tz;
            }
          }
          actor.yaw = Number(payload?.yaw) || actor.yaw;
          actor.pitch = Number(payload?.pitch) || actor.pitch;
          actor.crouching = Boolean(payload?.crouching);
          actor.sprinting = Boolean(payload?.sprinting);
          actor.sliding = Boolean(payload?.sliding);
          actor.aiming = Boolean(payload?.aiming);
          actor.buildingMode = Boolean(payload?.buildingMode);
          actor.emoting = Boolean(payload?.emoting);
          if (typeof payload?.activeWeaponId === 'string' && WEAPON_MAP.has(payload.activeWeaponId)) {
            actor.activeWeaponId = payload.activeWeaponId;
          }
        } else if (type === 'player:shoot') {
          const w = WEAPON_MAP.get(payload?.weaponId) ?? WEAPONS[0];
          const now = Date.now();
          if (now - actor.lastFireAt < (1000 / w.fireRate) * 0.85) return; // Anti-rapid-fire validation
          actor.lastFireAt = now;

          const ox = Number(payload?.ox) || actor.x;
          const oy = Number(payload?.oy) || actor.y + 1.45;
          const oz = Number(payload?.oz) || actor.z;
          const dx = Number(payload?.dx) || 0;
          const dy = Number(payload?.dy) || 0;
          const dz = Number(payload?.dz) || 1;
          const len = Math.hypot(dx, dy, dz) || 1;
          const ndx = dx / len;
          const ndy = dy / len;
          const ndz = dz / len;

          const rayActors = Array.from(room.actors.values()).map((a) => ({
            id: a.id,
            x: a.x,
            y: a.y,
            z: a.z,
            crouching: a.crouching,
            alive: a.alive,
            teamId: a.teamId,
          }));
          const buildsArr = Array.from(room.builds.values());
          const pellets = w.pellets ?? 1;
          let finalHitPoint = { x: ox + ndx * w.range, y: oy + ndy * w.range, z: oz + ndz * w.range };

          for (let p = 0; p < pellets; p++) {
            const sp = w.spread * (actor.aiming ? 0.45 : 1);
            const sx = ndx + (Math.random() - 0.5) * sp;
            const sy = ndy + (Math.random() - 0.5) * sp;
            const sz = ndz + (Math.random() - 0.5) * sp;
            const hit = raycastWorld(
              ox,
              oy,
              oz,
              sx,
              sy,
              sz,
              w.range,
              actor.id,
              room.mode === 'SOLO' ? -1 : actor.teamId,
              rayActors,
              room.layout.buildings,
              room.layout.props,
              buildsArr
            );
            if (hit) {
              finalHitPoint = hit.point;
              if (hit.hitType === 'ACTOR' && hit.targetId) {
                const target = room.actors.get(hit.targetId);
                if (target && target.alive) {
                  applyDamage(room, actor, target, Math.round(w.damage * (hit.headshot ? 1.5 : 1)), w.name);
                }
              } else if (hit.hitType === 'BUILD' && hit.targetId) {
                const bp = room.builds.get(hit.targetId);
                if (bp) {
                  bp.hp -= w.damage * w.structureMultiplier;
                  if (bp.hp <= 0) {
                    room.builds.delete(bp.id);
                    broadcastRoom(room, 'build:destroyed', { id: bp.id });
                  }
                }
              }
            }
          }

          broadcastRoom(room, 'shot:fired', {
            shooterId: actor.id,
            ox,
            oy,
            oz,
            tx: finalHitPoint.x,
            ty: finalHitPoint.y,
            tz: finalHitPoint.z,
            weaponId: w.id,
          });
        } else if (type === 'build:place') {
          const mat: MaterialType = ['MADERA', 'PIEDRA', 'METAL'].includes(payload?.material) ? payload.material : 'MADERA';
          const bType: BuildPieceType = ['PARED', 'RAMPA', 'PISO', 'TECHO'].includes(payload?.type) ? payload.type : 'PARED';
          const cost = MATERIAL_STATS[mat].cost;
          if (actor.materials[mat] < cost) return; // Authoritative material check

          const bx = Math.round(Number(payload?.x) / GRID_SIZE) * GRID_SIZE;
          const bz = Math.round(Number(payload?.z) / GRID_SIZE) * GRID_SIZE;
          const by = Math.round(Number(payload?.y) * 2) / 2;
          const rot = Number(payload?.rotationY) || 0;
          if (Math.hypot(bx - actor.x, bz - actor.z) > 16) return;

          actor.materials[mat] -= cost;
          actor.buildsPlaced += 1;
          const id = `bp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          const piece: BuildPieceState = {
            id,
            ownerId: actor.id,
            type: bType,
            material: mat,
            editShape: 'SOLIDA',
            x: bx,
            y: by,
            z: bz,
            rotationY: rot,
            hp: MATERIAL_STATS[mat].maxHp,
            maxHp: MATERIAL_STATS[mat].maxHp,
            buildProgress: 0.2,
            createdAt: Date.now(),
          };
          room.builds.set(id, piece);
          broadcastRoom(room, 'build:placed', piece);
        } else if (type === 'build:edit') {
          const bp = room.builds.get(String(payload?.id));
          const shape: BuildEditShape = ['SOLIDA', 'PUERTA', 'VENTANA', 'ABERTURA'].includes(payload?.editShape)
            ? payload.editShape
            : 'SOLIDA';
          if (bp && bp.ownerId === actor.id) {
            bp.editShape = shape;
            broadcastRoom(room, 'build:edited', { id: bp.id, editShape: shape });
          }
        } else if (type === 'build:remove') {
          const bp = room.builds.get(String(payload?.id));
          if (bp && bp.ownerId === actor.id) {
            room.builds.delete(bp.id);
            broadcastRoom(room, 'build:destroyed', { id: bp.id });
          }
        } else if (type === 'vehicle:enter') {
          const veh = room.vehicles.get(String(payload?.vehicleId));
          if (veh && !veh.driverId && veh.hp > 0 && Math.hypot(veh.x - actor.x, veh.z - actor.z) < 7) {
            veh.driverId = actor.id;
            actor.vehicleId = veh.id;
          }
        } else if (type === 'vehicle:exit') {
          if (actor.vehicleId) {
            const veh = room.vehicles.get(actor.vehicleId);
            if (veh && veh.driverId === actor.id) veh.driverId = null;
            actor.vehicleId = null;
          }
        } else if (type === 'vehicle:update' && actor.vehicleId) {
          const veh = room.vehicles.get(actor.vehicleId);
          if (veh && veh.driverId === actor.id) {
            veh.x = Number(payload?.x) || veh.x;
            veh.y = Number(payload?.y) || veh.y;
            veh.z = Number(payload?.z) || veh.z;
            veh.rotationY = Number(payload?.rotationY) || veh.rotationY;
            veh.speed = Number(payload?.speed) || 0;
            veh.fuel = Math.max(0, Number(payload?.fuel) ?? veh.fuel);
          }
        }
      }
    });

    ws.on('close', () => {
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) {
          const mem = room.members.get(clientId);
          if (mem) mem.connected = false;
          broadcastRoomState(room);
        }
      }
      clients.delete(clientId);
    });
  });
}
