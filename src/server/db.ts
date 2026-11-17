import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  CharacterCustomization,
  GameMode,
  MatchRecord,
  MissionProgress,
  PlayerStats,
  UserProfile,
} from '../shared/types';
import { COSMETIC_CATALOG } from '../shared/weapons';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'battlezone.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    is_guest INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 600,
    customization_json TEXT NOT NULL,
    unlocked_items_json TEXT NOT NULL,
    stats_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    placement INTEGER NOT NULL,
    total_players INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    damage INTEGER NOT NULL,
    builds_placed INTEGER NOT NULL,
    survival_time INTEGER NOT NULL,
    xp_earned INTEGER NOT NULL,
    coins_earned INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS missions (
    user_id TEXT NOT NULL,
    mission_key TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, mission_key)
  );
`);

const DEFAULT_CUSTOMIZATION: CharacterCustomization = {
  skin: 'skin_vanguard',
  helmet: 'helmet_tactical',
  backpack: 'pack_field',
  mask: 'mask_none',
  accessory: 'acc_none',
  primaryColor: '#2563EB',
  accentColor: '#F59E0B',
  emote: 'emote_salute',
};

const DEFAULT_UNLOCKED = [
  'skin_vanguard',
  'helmet_none',
  'helmet_tactical',
  'pack_none',
  'pack_field',
  'mask_none',
  'acc_none',
  'emote_salute',
];

const DEFAULT_STATS: PlayerStats = {
  matches: 0,
  wins: 0,
  kills: 0,
  damage: 0,
  buildsPlaced: 0,
  top10: 0,
};

interface MissionTemplate {
  key: string;
  title: string;
  description: string;
  period: 'DIARIA' | 'SEMANAL' | 'LOGRO';
  target: number;
  rewardXp: number;
  rewardCoins: number;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    key: 'daily_kills_3',
    title: 'Cazador de la Zona',
    description: 'Elimina a 3 oponentes en cualquier modo.',
    period: 'DIARIA',
    target: 3,
    rewardXp: 250,
    rewardCoins: 180,
  },
  {
    key: 'daily_builds_15',
    title: 'Arquitecto Táctico',
    description: 'Construye 15 estructuras durante el combate.',
    period: 'DIARIA',
    target: 15,
    rewardXp: 200,
    rewardCoins: 150,
  },
  {
    key: 'weekly_matches_5',
    title: 'Veterano de Arena',
    description: 'Completa 5 partidas en Battle Royale o Multijugador.',
    period: 'SEMANAL',
    target: 5,
    rewardXp: 600,
    rewardCoins: 450,
  },
  {
    key: 'weekly_damage_1500',
    title: 'Fuego Sostenido',
    description: 'Inflige 1,500 de daño total a enemigos.',
    period: 'SEMANAL',
    target: 1500,
    rewardXp: 700,
    rewardCoins: 500,
  },
  {
    key: 'ach_first_win',
    title: 'Campeón de Survival Arena',
    description: 'Consigue tu primera victoria #1 en Battle Royale.',
    period: 'LOGRO',
    target: 1,
    rewardXp: 1200,
    rewardCoins: 900,
  },
];

export function xpRequiredForLevel(level: number): number {
  return 400 + (level - 1) * 200;
}

function hashPassword(password: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [s, orig] = stored.split(':');
  if (!s || !orig) return false;
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(orig, 'hex'));
}

function ensureUserMissions(userId: string) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO missions (user_id, mission_key, progress, claimed) VALUES (?, ?, 0, 0)`
  );
  for (const m of MISSION_TEMPLATES) {
    insert.run(userId, m.key);
  }
}

export function getUserProfileById(userId: string): UserProfile | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!row) return null;
  ensureUserMissions(userId);

  const missionRows = db.prepare(`SELECT mission_key, progress, claimed FROM missions WHERE user_id = ?`).all(userId) as any[];
  const missionMap = new Map(missionRows.map((r) => [r.mission_key, r]));

  const missions: MissionProgress[] = MISSION_TEMPLATES.map((tpl) => {
    const state = missionMap.get(tpl.key) ?? { progress: 0, claimed: 0 };
    return {
      ...tpl,
      progress: Math.min(tpl.target, state.progress),
      claimed: Boolean(state.claimed),
    };
  });

  const historyRows = db
    .prepare(
      `SELECT id, mode, placement, total_players, kills, damage, builds_placed, survival_time, xp_earned, coins_earned, created_at
       FROM match_history WHERE user_id = ? ORDER BY id DESC LIMIT 15`
    )
    .all(userId) as any[];

  const matchHistory: MatchRecord[] = historyRows.map((h) => ({
    id: h.id,
    mode: h.mode,
    placement: h.placement,
    totalPlayers: h.total_players,
    kills: h.kills,
    damage: h.damage,
    buildsPlaced: h.builds_placed,
    survivalTime: h.survival_time,
    xpEarned: h.xp_earned,
    coinsEarned: h.coins_earned,
    createdAt: h.created_at,
  }));

  return {
    id: row.id,
    username: row.username,
    isGuest: Boolean(row.is_guest),
    level: row.level,
    xp: row.xp,
    xpToNext: xpRequiredForLevel(row.level),
    coins: row.coins,
    customization: JSON.parse(row.customization_json),
    unlockedItems: JSON.parse(row.unlocked_items_json),
    stats: JSON.parse(row.stats_json),
    missions,
    matchHistory,
  };
}

export function getUserByToken(token: string | undefined): UserProfile | null {
  if (!token) return null;
  const sess = db.prepare(`SELECT user_id FROM sessions WHERE token = ?`).get(token) as any;
  if (!sess) return null;
  return getUserProfileById(sess.user_id);
}

function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`).run(token, userId, Date.now());
  return token;
}

export function createGuestUser(): { token: string; profile: UserProfile } {
  const id = `usr_${crypto.randomUUID()}`;
  const tag = Math.floor(1000 + Math.random() * 9000);
  const username = `Operador_${tag}`;
  db.prepare(
    `INSERT INTO users (id, username, password_hash, is_guest, level, xp, coins, customization_json, unlocked_items_json, stats_json, created_at)
     VALUES (?, ?, NULL, 1, 1, 0, 800, ?, ?, ?, ?)`
  ).run(
    id,
    username,
    JSON.stringify(DEFAULT_CUSTOMIZATION),
    JSON.stringify(DEFAULT_UNLOCKED),
    JSON.stringify(DEFAULT_STATS),
    new Date().toISOString()
  );
  ensureUserMissions(id);
  const token = createSession(id);
  return { token, profile: getUserProfileById(id)! };
}

export function registerUser(
  username: string,
  password: string,
  upgradeGuestId?: string
): { token: string; profile: UserProfile } {
  const cleanName = username.trim().slice(0, 20);
  if (cleanName.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.');
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');

  const existing = db.prepare(`SELECT id FROM users WHERE LOWER(username) = LOWER(?)`).get(cleanName) as any;
  if (existing && existing.id !== upgradeGuestId) {
    throw new Error('Ese nombre de usuario ya está registrado.');
  }

  const hash = hashPassword(password);

  if (upgradeGuestId) {
    const guest = db.prepare(`SELECT id, is_guest FROM users WHERE id = ?`).get(upgradeGuestId) as any;
    if (guest && guest.is_guest) {
      db.prepare(`UPDATE users SET username = ?, password_hash = ?, is_guest = 0 WHERE id = ?`).run(
        cleanName,
        hash,
        upgradeGuestId
      );
      const token = createSession(upgradeGuestId);
      return { token, profile: getUserProfileById(upgradeGuestId)! };
    }
  }

  const id = `usr_${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO users (id, username, password_hash, is_guest, level, xp, coins, customization_json, unlocked_items_json, stats_json, created_at)
     VALUES (?, ?, ?, 0, 1, 0, 1000, ?, ?, ?, ?)`
  ).run(
    id,
    cleanName,
    hash,
    JSON.stringify(DEFAULT_CUSTOMIZATION),
    JSON.stringify(DEFAULT_UNLOCKED),
    JSON.stringify(DEFAULT_STATS),
    new Date().toISOString()
  );
  ensureUserMissions(id);
  const token = createSession(id);
  return { token, profile: getUserProfileById(id)! };
}

export function loginUser(username: string, password: string): { token: string; profile: UserProfile } {
  const row = db.prepare(`SELECT id, password_hash FROM users WHERE LOWER(username) = LOWER(?)`).get(username.trim()) as any;
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    throw new Error('Usuario o contraseña incorrectos.');
  }
  const token = createSession(row.id);
  return { token, profile: getUserProfileById(row.id)! };
}

export function updateCustomization(userId: string, cust: CharacterCustomization): UserProfile {
  const profile = getUserProfileById(userId);
  if (!profile) throw new Error('Usuario no encontrado.');
  const unlocked = new Set(profile.unlockedItems);

  const safeCust: CharacterCustomization = {
    skin: unlocked.has(cust.skin) ? cust.skin : profile.customization.skin,
    helmet: unlocked.has(cust.helmet) ? cust.helmet : profile.customization.helmet,
    backpack: unlocked.has(cust.backpack) ? cust.backpack : profile.customization.backpack,
    mask: unlocked.has(cust.mask) ? cust.mask : profile.customization.mask,
    accessory: unlocked.has(cust.accessory) ? cust.accessory : profile.customization.accessory,
    emote: unlocked.has(cust.emote) ? cust.emote : profile.customization.emote,
    primaryColor: /^#[0-9A-Fa-f]{6}$/.test(cust.primaryColor) ? cust.primaryColor : profile.customization.primaryColor,
    accentColor: /^#[0-9A-Fa-f]{6}$/.test(cust.accentColor) ? cust.accentColor : profile.customization.accentColor,
  };

  db.prepare(`UPDATE users SET customization_json = ? WHERE id = ?`).run(JSON.stringify(safeCust), userId);
  return getUserProfileById(userId)!;
}

export function buyShopItem(userId: string, itemId: string): UserProfile {
  const item = COSMETIC_CATALOG.find((i) => i.id === itemId);
  if (!item) throw new Error('Artículo no válido.');

  const tx = db.transaction(() => {
    const row = db.prepare(`SELECT coins, unlocked_items_json FROM users WHERE id = ?`).get(userId) as any;
    if (!row) throw new Error('Usuario no encontrado.');
    const unlocked: string[] = JSON.parse(row.unlocked_items_json);
    if (unlocked.includes(item.id)) throw new Error('Ya posees este artículo.');
    if (row.coins < item.price) throw new Error('Monedas insuficientes.');

    unlocked.push(item.id);
    db.prepare(`UPDATE users SET coins = coins - ?, unlocked_items_json = ? WHERE id = ?`).run(
      item.price,
      JSON.stringify(unlocked),
      userId
    );
  });

  tx();
  return getUserProfileById(userId)!;
}

function addXpAndCoins(userId: string, xpGain: number, coinGain: number) {
  const row = db.prepare(`SELECT level, xp, coins FROM users WHERE id = ?`).get(userId) as any;
  if (!row) return;
  let level = row.level;
  let xp = row.xp + xpGain;
  while (xp >= xpRequiredForLevel(level)) {
    xp -= xpRequiredForLevel(level);
    level += 1;
  }
  db.prepare(`UPDATE users SET level = ?, xp = ?, coins = coins + ? WHERE id = ?`).run(level, xp, coinGain, userId);
}

export function recordMatchResult(
  userId: string,
  payload: {
    mode: GameMode;
    placement: number;
    totalPlayers: number;
    kills: number;
    damage: number;
    buildsPlaced: number;
    survivalTime: number;
  }
): { profile: UserProfile; xpEarned: number; coinsEarned: number } {
  const kills = Math.max(0, Math.min(99, Math.floor(payload.kills)));
  const damage = Math.max(0, Math.min(25000, Math.floor(payload.damage)));
  const buildsPlaced = Math.max(0, Math.min(500, Math.floor(payload.buildsPlaced)));
  const survivalTime = Math.max(0, Math.min(3600, Math.floor(payload.survivalTime)));
  const placement = Math.max(1, Math.min(100, Math.floor(payload.placement)));
  const totalPlayers = Math.max(2, Math.min(100, Math.floor(payload.totalPlayers)));

  const isWin = placement === 1 && payload.mode !== 'TRAINING';
  const xpEarned = Math.round(60 + kills * 75 + survivalTime * 0.6 + (isWin ? 350 : placement <= 10 ? 120 : 0));
  const coinsEarned = Math.round(25 + kills * 35 + (isWin ? 250 : placement <= 10 ? 80 : 0));

  const tx = db.transaction(() => {
    const row = db.prepare(`SELECT stats_json FROM users WHERE id = ?`).get(userId) as any;
    if (!row) throw new Error('Usuario no encontrado.');
    const stats: PlayerStats = JSON.parse(row.stats_json);
    stats.matches += 1;
    stats.kills += kills;
    stats.damage += damage;
    stats.buildsPlaced += buildsPlaced;
    if (isWin) stats.wins += 1;
    if (placement <= 10) stats.top10 += 1;

    db.prepare(`UPDATE users SET stats_json = ? WHERE id = ?`).run(JSON.stringify(stats), userId);
    addXpAndCoins(userId, xpEarned, coinsEarned);

    db.prepare(
      `INSERT INTO match_history (user_id, mode, placement, total_players, kills, damage, builds_placed, survival_time, xp_earned, coins_earned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      payload.mode,
      placement,
      totalPlayers,
      kills,
      damage,
      buildsPlaced,
      survivalTime,
      xpEarned,
      coinsEarned,
      new Date().toISOString()
    );

    ensureUserMissions(userId);
    db.prepare(`UPDATE missions SET progress = progress + ? WHERE user_id = ? AND mission_key = 'daily_kills_3'`).run(kills, userId);
    db.prepare(`UPDATE missions SET progress = progress + ? WHERE user_id = ? AND mission_key = 'daily_builds_15'`).run(buildsPlaced, userId);
    db.prepare(`UPDATE missions SET progress = progress + 1 WHERE user_id = ? AND mission_key = 'weekly_matches_5'`).run(userId);
    db.prepare(`UPDATE missions SET progress = progress + ? WHERE user_id = ? AND mission_key = 'weekly_damage_1500'`).run(damage, userId);
    if (isWin) {
      db.prepare(`UPDATE missions SET progress = progress + 1 WHERE user_id = ? AND mission_key = 'ach_first_win'`).run(userId);
    }
  });

  tx();
  return { profile: getUserProfileById(userId)!, xpEarned, coinsEarned };
}

export function claimMission(userId: string, missionKey: string): UserProfile {
  const tpl = MISSION_TEMPLATES.find((m) => m.key === missionKey);
  if (!tpl) throw new Error('Misión no encontrada.');

  const tx = db.transaction(() => {
    const row = db
      .prepare(`SELECT progress, claimed FROM missions WHERE user_id = ? AND mission_key = ?`)
      .get(userId, missionKey) as any;
    if (!row) throw new Error('Misión no inicializada.');
    if (row.claimed) throw new Error('Recompensa ya reclamada.');
    if (row.progress < tpl.target) throw new Error('Misión aún no completada.');

    db.prepare(`UPDATE missions SET claimed = 1 WHERE user_id = ? AND mission_key = ?`).run(userId, missionKey);
    addXpAndCoins(userId, tpl.rewardXp, tpl.rewardCoins);
  });

  tx();
  return getUserProfileById(userId)!;
}

export function getLeaderboard(): Array<{
  username: string;
  level: number;
  wins: number;
  kills: number;
  matches: number;
}> {
  const rows = db
    .prepare(`SELECT username, level, stats_json FROM users ORDER BY level DESC LIMIT 50`)
    .all() as any[];
  return rows
    .map((r) => {
      const stats: PlayerStats = JSON.parse(r.stats_json);
      return {
        username: r.username,
        level: r.level,
        wins: stats.wins,
        kills: stats.kills,
        matches: stats.matches,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills || b.level - a.level)
    .slice(0, 20);
}
