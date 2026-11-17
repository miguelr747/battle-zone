export type GameMode = 'SOLO' | 'DUOS' | 'SQUADS' | 'TRAINING';
export type BotDifficulty = 'FACIL' | 'NORMAL' | 'DIFICIL' | 'EXPERTO';
export type GraphicsQuality = 'BAJA' | 'MEDIA' | 'ALTA';

export type Rarity = 'COMUN' | 'POCO_COMUN' | 'RARO' | 'EPICO' | 'LEGENDARIO';

export type WeaponCategory =
  | 'PISTOLA'
  | 'FUSIL'
  | 'ESCOPETA'
  | 'SUBFUSIL'
  | 'FRANCOTIRADOR'
  | 'EXPLOSIVO'
  | 'ESPECIAL';

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  rarity: Rarity;
  damage: number;
  range: number;
  fireRate: number; // shots per second
  spread: number; // radians
  recoil: number;
  magSize: number;
  reloadTime: number; // seconds
  pellets?: number;
  projectileSpeed?: number; // undefined = instant hitscan with tracer; defined = physical projectile (RPG/Plasma)
  explosionRadius?: number;
  structureMultiplier: number;
  adsZoom: number;
  color: string;
}

export type ConsumableType = 'MEDKIT' | 'BANDAGE' | 'SHIELD_SMALL' | 'SHIELD_LARGE';

export interface ConsumableDef {
  id: ConsumableType;
  name: string;
  healHp: number;
  healShield: number;
  useTime: number;
  maxStack: number;
  color: string;
}

export type MaterialType = 'MADERA' | 'PIEDRA' | 'METAL';
export type BuildPieceType = 'PARED' | 'RAMPA' | 'PISO' | 'TECHO';
export type BuildEditShape = 'SOLIDA' | 'PUERTA' | 'VENTANA' | 'ABERTURA';

export interface BuildPieceState {
  id: string;
  ownerId: string;
  type: BuildPieceType;
  material: MaterialType;
  editShape: BuildEditShape;
  x: number;
  y: number;
  z: number;
  rotationY: number; // 0, PI/2, PI, 3*PI/2
  hp: number;
  maxHp: number;
  buildProgress: number; // 0 -> 1
  createdAt: number;
}

export type VehicleKind = 'AUTO' | 'MOTO' | 'TODOTERRENO';

export interface VehicleState {
  id: string;
  kind: VehicleKind;
  name: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  speed: number;
  hp: number;
  maxHp: number;
  fuel: number;
  maxFuel: number;
  driverId: string | null;
}

export interface CharacterCustomization {
  skin: string;
  helmet: string;
  backpack: string;
  mask: string;
  accessory: string;
  primaryColor: string;
  accentColor: string;
  emote: string;
}

export interface PlayerStats {
  matches: number;
  wins: number;
  kills: number;
  damage: number;
  buildsPlaced: number;
  top10: number;
}

export interface MissionProgress {
  key: string;
  title: string;
  description: string;
  period: 'DIARIA' | 'SEMANAL' | 'LOGRO';
  progress: number;
  target: number;
  rewardXp: number;
  rewardCoins: number;
  claimed: boolean;
}

export interface MatchRecord {
  id: number;
  mode: GameMode;
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  buildsPlaced: number;
  survivalTime: number;
  xpEarned: number;
  coinsEarned: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  isGuest: boolean;
  level: number;
  xp: number;
  xpToNext: number;
  coins: number;
  customization: CharacterCustomization;
  unlockedItems: string[];
  stats: PlayerStats;
  missions: MissionProgress[];
  matchHistory: MatchRecord[];
}

export interface TouchControlLayout {
  joystickX: number; // % from left
  joystickY: number; // % from bottom
  joystickScale: number;
  fireX: number; // % from right
  fireY: number; // % from bottom
  fireScale: number;
  actionsScale: number;
}

export interface GameSettings {
  quality: GraphicsQuality;
  shadows: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  showFps: boolean;
  touchEnabled: 'AUTO' | 'SI' | 'NO';
  touchLayout: TouchControlLayout;
  keybinds: {
    forward: string;
    backward: string;
    left: string;
    right: string;
    jump: string;
    sprint: string;
    crouch: string;
    reload: string;
    interact: string;
    buildToggle: string;
    editBuild: string;
    rotateBuild: string;
    inventory: string;
    map: string;
    emote: string;
  };
}

export interface WeaponSlotItem {
  weaponId: string;
  ammoInMag: number;
}

export interface LootPickup {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: 'WEAPON' | 'AMMO' | 'CONSUMABLE' | 'MATERIAL';
  weaponId?: string;
  ammoAmount?: number;
  consumableId?: ConsumableType;
  materialType?: MaterialType;
  materialAmount?: number;
}

export interface ChestState {
  id: string;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  tier: 'NORMAL' | 'EPICO';
}

export interface StormState {
  phase: number;
  centerX: number;
  centerZ: number;
  radius: number;
  nextCenterX: number;
  nextCenterZ: number;
  nextRadius: number;
  shrinking: boolean;
  timer: number; // seconds remaining in current phase
  dps: number;
}

export interface ActorNetState {
  id: string;
  name: string;
  teamId: number;
  isBot: boolean;
  difficulty?: BotDifficulty;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  alive: boolean;
  kills: number;
  crouching: boolean;
  sliding: boolean;
  sprinting: boolean;
  airborne: boolean;
  parachuting: boolean;
  inDropship: boolean;
  aiming: boolean;
  buildingMode: boolean;
  emoting: boolean;
  vehicleId: string | null;
  activeWeaponId: string;
  customization: CharacterCustomization;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  mode: GameMode;
  difficulty: BotDifficulty;
  maxPlayers: number;
  humanCount: number;
  status: 'LOBBY' | 'COUNTDOWN' | 'IN_GAME';
  hostName: string;
}

export interface RoomMember {
  id: string;
  name: string;
  teamId: number;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  customization: CharacterCustomization;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface KillFeedEntry {
  id: string;
  killerName: string;
  victimName: string;
  weaponName: string;
  timestamp: number;
}
