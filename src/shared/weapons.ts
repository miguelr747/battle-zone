import {
  ConsumableDef,
  ConsumableType,
  GameSettings,
  MaterialType,
  Rarity,
  WeaponDef,
} from './types';

export const RARITY_COLORS: Record<Rarity, string> = {
  COMUN: '#94A3B8',
  POCO_COMUN: '#22C55E',
  RARO: '#38BDF8',
  EPICO: '#A855F7',
  LEGENDARIO: '#F59E0B',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  COMUN: 'Común',
  POCO_COMUN: 'Poco común',
  RARO: 'Raro',
  EPICO: 'Épico',
  LEGENDARIO: 'Legendario',
};

export const WEAPONS: WeaponDef[] = [
  // Pistolas
  {
    id: 'pistol_vx9_common',
    name: 'Pistola Táctica VX-9',
    category: 'PISTOLA',
    rarity: 'COMUN',
    damage: 22,
    range: 75,
    fireRate: 4.5,
    spread: 0.022,
    recoil: 0.025,
    magSize: 15,
    reloadTime: 1.3,
    structureMultiplier: 1.0,
    adsZoom: 1.2,
    color: RARITY_COLORS.COMUN,
  },
  {
    id: 'pistol_vx9_rare',
    name: 'Pistola Táctica VX-9 MkII',
    category: 'PISTOLA',
    rarity: 'RARO',
    damage: 28,
    range: 85,
    fireRate: 5.2,
    spread: 0.016,
    recoil: 0.022,
    magSize: 18,
    reloadTime: 1.15,
    structureMultiplier: 1.1,
    adsZoom: 1.25,
    color: RARITY_COLORS.RARO,
  },

  // Fusiles de asalto
  {
    id: 'ar_vanguard_common',
    name: 'Rifle Vanguard AR-47',
    category: 'FUSIL',
    rarity: 'COMUN',
    damage: 27,
    range: 145,
    fireRate: 6.0,
    spread: 0.026,
    recoil: 0.032,
    magSize: 30,
    reloadTime: 2.1,
    structureMultiplier: 1.15,
    adsZoom: 1.35,
    color: RARITY_COLORS.COMUN,
  },
  {
    id: 'ar_vanguard_uncommon',
    name: 'Rifle Vanguard AR-47 Táctico',
    category: 'FUSIL',
    rarity: 'POCO_COMUN',
    damage: 31,
    range: 155,
    fireRate: 6.3,
    spread: 0.021,
    recoil: 0.028,
    magSize: 30,
    reloadTime: 1.95,
    structureMultiplier: 1.2,
    adsZoom: 1.35,
    color: RARITY_COLORS.POCO_COMUN,
  },
  {
    id: 'ar_pulso_epic',
    name: 'Carabina Pulso MK-II',
    category: 'FUSIL',
    rarity: 'EPICO',
    damage: 36,
    range: 175,
    fireRate: 7.2,
    spread: 0.014,
    recoil: 0.022,
    magSize: 35,
    reloadTime: 1.75,
    structureMultiplier: 1.35,
    adsZoom: 1.45,
    color: RARITY_COLORS.EPICO,
  },
  {
    id: 'ar_pulso_legendary',
    name: 'Carabina Pulso Ápex',
    category: 'FUSIL',
    rarity: 'LEGENDARIO',
    damage: 41,
    range: 190,
    fireRate: 7.8,
    spread: 0.011,
    recoil: 0.019,
    magSize: 40,
    reloadTime: 1.6,
    structureMultiplier: 1.5,
    adsZoom: 1.5,
    color: RARITY_COLORS.LEGENDARIO,
  },

  // Escopetas
  {
    id: 'sg_ariete_uncommon',
    name: 'Escopeta Ariete S-12',
    category: 'ESCOPETA',
    rarity: 'POCO_COMUN',
    damage: 13,
    pellets: 8,
    range: 32,
    fireRate: 1.15,
    spread: 0.085,
    recoil: 0.08,
    magSize: 6,
    reloadTime: 2.6,
    structureMultiplier: 1.6,
    adsZoom: 1.15,
    color: RARITY_COLORS.POCO_COMUN,
  },
  {
    id: 'sg_ciclon_epic',
    name: 'Escopeta Táctica Ciclón',
    category: 'ESCOPETA',
    rarity: 'EPICO',
    damage: 15,
    pellets: 9,
    range: 38,
    fireRate: 1.75,
    spread: 0.072,
    recoil: 0.065,
    magSize: 8,
    reloadTime: 2.2,
    structureMultiplier: 1.75,
    adsZoom: 1.2,
    color: RARITY_COLORS.EPICO,
  },

  // Subfusiles
  {
    id: 'smg_vibora_common',
    name: 'Subfusil Víbora SMG',
    category: 'SUBFUSIL',
    rarity: 'COMUN',
    damage: 16,
    range: 70,
    fireRate: 11.0,
    spread: 0.042,
    recoil: 0.02,
    magSize: 32,
    reloadTime: 1.6,
    structureMultiplier: 1.25,
    adsZoom: 1.25,
    color: RARITY_COLORS.COMUN,
  },
  {
    id: 'smg_vibora_rare',
    name: 'Subfusil Víbora Pro',
    category: 'SUBFUSIL',
    rarity: 'RARO',
    damage: 19,
    range: 80,
    fireRate: 12.2,
    spread: 0.032,
    recoil: 0.017,
    magSize: 38,
    reloadTime: 1.45,
    structureMultiplier: 1.35,
    adsZoom: 1.25,
    color: RARITY_COLORS.RARO,
  },

  // Rifles de precisión
  {
    id: 'sniper_eclipse_rare',
    name: 'Rifle Francotirador Eclipse .50',
    category: 'FRANCOTIRADOR',
    rarity: 'RARO',
    damage: 95,
    range: 340,
    fireRate: 0.75,
    spread: 0.002,
    recoil: 0.11,
    magSize: 4,
    reloadTime: 2.8,
    structureMultiplier: 1.8,
    adsZoom: 2.6,
    color: RARITY_COLORS.RARO,
  },
  {
    id: 'sniper_eclipse_legendary',
    name: 'Eclipse .50 Termo-Óptico',
    category: 'FRANCOTIRADOR',
    rarity: 'LEGENDARIO',
    damage: 125,
    range: 420,
    fireRate: 0.9,
    spread: 0.001,
    recoil: 0.095,
    magSize: 5,
    reloadTime: 2.4,
    structureMultiplier: 2.1,
    adsZoom: 3.1,
    color: RARITY_COLORS.LEGENDARIO,
  },

  // Explosivos
  {
    id: 'rpg_titan_epic',
    name: 'Lanzacohetes Titán RPG',
    category: 'EXPLOSIVO',
    rarity: 'EPICO',
    damage: 110,
    range: 220,
    fireRate: 0.48,
    spread: 0.01,
    recoil: 0.13,
    magSize: 1,
    reloadTime: 2.9,
    projectileSpeed: 46,
    explosionRadius: 8.5,
    structureMultiplier: 3.2,
    adsZoom: 1.3,
    color: RARITY_COLORS.EPICO,
  },

  // Especiales
  {
    id: 'special_solaris_legendary',
    name: 'Cañón de Plasma Solaris',
    category: 'ESPECIAL',
    rarity: 'LEGENDARIO',
    damage: 48,
    range: 185,
    fireRate: 4.2,
    spread: 0.008,
    recoil: 0.025,
    magSize: 24,
    reloadTime: 2.0,
    projectileSpeed: 95,
    explosionRadius: 2.8,
    structureMultiplier: 2.0,
    adsZoom: 1.55,
    color: RARITY_COLORS.LEGENDARIO,
  },
];

export const WEAPON_MAP = new Map<string, WeaponDef>(WEAPONS.map((w) => [w.id, w]));

export const CONSUMABLES: Record<ConsumableType, ConsumableDef> = {
  BANDAGE: {
    id: 'BANDAGE',
    name: 'Vendaje Rápido',
    healHp: 20,
    healShield: 0,
    useTime: 1.6,
    maxStack: 10,
    color: '#F8FAFC',
  },
  MEDKIT: {
    id: 'MEDKIT',
    name: 'Botiquín Médico',
    healHp: 60,
    healShield: 0,
    useTime: 3.2,
    maxStack: 3,
    color: '#22C55E',
  },
  SHIELD_SMALL: {
    id: 'SHIELD_SMALL',
    name: 'Célula de Escudo',
    healHp: 0,
    healShield: 25,
    useTime: 1.5,
    maxStack: 6,
    color: '#38BDF8',
  },
  SHIELD_LARGE: {
    id: 'SHIELD_LARGE',
    name: 'Batería de Escudo Pesado',
    healHp: 0,
    healShield: 50,
    useTime: 3.0,
    maxStack: 3,
    color: '#06B6D4',
  },
};

export const MATERIAL_STATS: Record<
  MaterialType,
  { name: string; maxHp: number; buildSpeed: number; cost: number; color: string }
> = {
  MADERA: {
    name: 'Madera',
    maxHp: 150,
    buildSpeed: 3.0,
    cost: 10,
    color: '#B47B44',
  },
  PIEDRA: {
    name: 'Piedra',
    maxHp: 300,
    buildSpeed: 1.8,
    cost: 10,
    color: '#88929E',
  },
  METAL: {
    name: 'Metal',
    maxHp: 500,
    buildSpeed: 1.1,
    cost: 10,
    color: '#64748B',
  },
};

export interface CosmeticItem {
  id: string;
  slot: 'skin' | 'helmet' | 'backpack' | 'mask' | 'accessory' | 'emote';
  name: string;
  rarity: Rarity;
  price: number;
  previewColor: string;
  description: string;
}

export const COSMETIC_CATALOG: CosmeticItem[] = [
  // Skins (Trajes)
  { id: 'skin_vanguard', slot: 'skin', name: 'Centinela Táctico', rarity: 'COMUN', price: 0, previewColor: '#3B82F6', description: 'Armadura ligera estándar de la Zona.' },
  { id: 'skin_nomad', slot: 'skin', name: 'Nómada del Desierto', rarity: 'POCO_COMUN', price: 450, previewColor: '#D97706', description: 'Uniforme reforzado para tormentas de arena.' },
  { id: 'skin_spectre', slot: 'skin', name: 'Espectro Urbano', rarity: 'RARO', price: 900, previewColor: '#06B6D4', description: 'Blindaje sigiloso de Neo-Metrópolis.' },
  { id: 'skin_crimson', slot: 'skin', name: 'Comando Carmesí', rarity: 'EPICO', price: 1500, previewColor: '#EF4444', description: 'Exoesqueleto táctico de fuerzas especiales.' },
  { id: 'skin_solaris', slot: 'skin', name: 'Guardián Solaris', rarity: 'LEGENDARIO', price: 2400, previewColor: '#F59E0B', description: 'Traje energético dorado de élite.' },

  // Helmets (Cascos)
  { id: 'helmet_none', slot: 'helmet', name: 'Sin Casco', rarity: 'COMUN', price: 0, previewColor: '#64748B', description: 'Operador descubierto.' },
  { id: 'helmet_tactical', slot: 'helmet', name: 'Casco Balístico K-4', rarity: 'POCO_COMUN', price: 350, previewColor: '#475569', description: 'Protección balística estándar.' },
  { id: 'helmet_recon', slot: 'helmet', name: 'Casco Recon Óptico', rarity: 'RARO', price: 750, previewColor: '#0EA5E9', description: 'Visor panorámico con telemetría.' },
  { id: 'helmet_apex', slot: 'helmet', name: 'Yelmo Ápex Titanio', rarity: 'LEGENDARIO', price: 1600, previewColor: '#F59E0B', description: 'Casco integral de aleación aeroespacial.' },

  // Backpacks (Mochilas)
  { id: 'pack_none', slot: 'backpack', name: 'Sin Mochila', rarity: 'COMUN', price: 0, previewColor: '#475569', description: 'Perfil ligero.' },
  { id: 'pack_field', slot: 'backpack', name: 'Mochila de Asalto', rarity: 'POCO_COMUN', price: 300, previewColor: '#65A30D', description: 'Compartimentos tácticos modulares.' },
  { id: 'pack_reactor', slot: 'backpack', name: 'Núcleo Reactor VX', rarity: 'EPICO', price: 1200, previewColor: '#06B6D4', description: 'Unidad dorsal con celda lumínica.' },
  { id: 'pack_wings', slot: 'backpack', name: 'Propulsor Vector', rarity: 'LEGENDARIO', price: 1850, previewColor: '#F59E0B', description: 'Mochila aerodinámica con estabilizadores.' },

  // Masks (Máscaras / Visores)
  { id: 'mask_none', slot: 'mask', name: 'Sin Máscara', rarity: 'COMUN', price: 0, previewColor: '#94A3B8', description: 'Rostro visible.' },
  { id: 'mask_bandana', slot: 'mask', name: 'Cubrebocas Táctico', rarity: 'POCO_COMUN', price: 250, previewColor: '#334155', description: 'Filtro antipolvo de combate.' },
  { id: 'mask_visor', slot: 'mask', name: 'Visor Ciber-Pulso', rarity: 'RARO', price: 650, previewColor: '#22D3EE', description: 'Gafas tácticas luminiscentes.' },
  { id: 'mask_oni', slot: 'mask', name: 'Máscara Blindada Oni', rarity: 'EPICO', price: 1400, previewColor: '#EF4444', description: 'Máscara intimidante de fibra de carbono.' },

  // Accessories (Accesorios)
  { id: 'acc_none', slot: 'accessory', name: 'Estándar', rarity: 'COMUN', price: 0, previewColor: '#64748B', description: 'Sin hombreras extra.' },
  { id: 'acc_pauldron', slot: 'accessory', name: 'Hombreras Blindadas', rarity: 'RARO', price: 600, previewColor: '#94A3B8', description: 'Placas laterales de acero.' },
  { id: 'acc_antenna', slot: 'accessory', name: 'Antena Comms + Radio', rarity: 'POCO_COMUN', price: 400, previewColor: '#F59E0B', description: 'Transmisor táctico de largo alcance.' },

  // Emotes (Gestos y Celebraciones)
  { id: 'emote_salute', slot: 'emote', name: 'Saludo Táctico', rarity: 'COMUN', price: 0, previewColor: '#38BDF8', description: 'Saludo firme de victoria.' },
  { id: 'emote_spin', slot: 'emote', name: 'Giro de Campeón', rarity: 'POCO_COMUN', price: 350, previewColor: '#22C55E', description: 'Giro acrobático con salto.' },
  { id: 'emote_pulse', slot: 'emote', name: 'Baile Pulso Arena', rarity: 'EPICO', price: 950, previewColor: '#A855F7', description: 'Ritmo energético de celebración.' },
];

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'MEDIA',
  shadows: true,
  masterVolume: 0.75,
  sfxVolume: 0.85,
  musicVolume: 0.45,
  mouseSensitivity: 1.0,
  invertY: false,
  fov: 72,
  showFps: false,
  touchEnabled: 'AUTO',
  touchLayout: {
    joystickX: 8,
    joystickY: 10,
    joystickScale: 1,
    fireX: 7,
    fireY: 12,
    fireScale: 1,
    actionsScale: 1,
  },
  keybinds: {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    sprint: 'ShiftLeft',
    crouch: 'KeyC',
    reload: 'KeyR',
    interact: 'KeyE',
    buildToggle: 'KeyQ',
    editBuild: 'KeyG',
    rotateBuild: 'KeyT',
    inventory: 'Tab',
    map: 'KeyM',
    emote: 'KeyB',
  },
};
