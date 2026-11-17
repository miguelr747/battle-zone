import React, { useState } from 'react';
import { Check, Coins, Lock, ShieldCheck, Trophy, UserCheck } from 'lucide-react';
import {
  CharacterCustomization,
  GameSettings,
  GraphicsQuality,
  UserProfile,
  VehicleKind,
} from '../shared/types';
import { COSMETIC_CATALOG, RARITY_COLORS, RARITY_LABELS } from '../shared/weapons';
import { CharacterStageCanvas } from '../game/CharacterStageCanvas';

export type ModalTab = 'CUSTOMIZE' | 'SHOP' | 'GARAGE' | 'PROGRESS' | 'SETTINGS';

interface ProgressionModalsProps {
  tab: ModalTab;
  profile: UserProfile;
  settings: GameSettings;
  leaderboard: Array<{ username: string; level: number; wins: number; kills: number; matches: number }>;
  onChangeTab: (t: ModalTab) => void;
  onSaveCustomization: (c: CharacterCustomization) => Promise<void>;
  onBuyItem: (itemId: string) => Promise<void>;
  onClaimMission: (missionKey: string) => Promise<void>;
  onUpdateSettings: (s: GameSettings) => void;
  onRegister: (username: string, pass: string) => Promise<void>;
  onLogin: (username: string, pass: string) => Promise<void>;
  onClose: () => void;
}

const VEHICLE_SPECS: Array<{
  kind: VehicleKind;
  name: string;
  speed: string;
  armor: string;
  terrain: string;
  desc: string;
}> = [
  {
    kind: 'AUTO',
    name: 'Interceptor GT',
    speed: '97 km/h',
    armor: '650 HP',
    terrain: 'Carreteras y pistas urbanas',
    desc: 'Coupé deportivo de alta velocidad ideal para escapar de la tormenta.',
  },
  {
    kind: 'MOTO',
    name: 'Relámpago RS',
    speed: '108 km/h',
    armor: '420 HP',
    terrain: 'Maniobrabilidad extrema',
    desc: 'Motocicleta ágil para flanquear entre edificios y bosques.',
  },
  {
    kind: 'TODOTERRENO',
    name: 'Titán 4x4',
    speed: '82 km/h',
    armor: '950 HP',
    terrain: 'Montañas, desierto y asalto',
    desc: 'Camión blindado con jaula antivuelco y máxima resistencia.',
  },
];

export const ProgressionModals: React.FC<ProgressionModalsProps> = ({
  tab,
  profile,
  settings,
  leaderboard,
  onChangeTab,
  onSaveCustomization,
  onBuyItem,
  onClaimMission,
  onUpdateSettings,
  onRegister,
  onLogin,
  onClose,
}) => {
  const [draftCust, setDraftCust] = useState<CharacterCustomization>(profile.customization);
  const [previewEmote, setPreviewEmote] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleKind>('AUTO');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('REGISTER');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const unlocked = new Set(profile.unlockedItems);

  const handleEquip = async (slot: keyof CharacterCustomization, value: string) => {
    const next = { ...draftCust, [slot]: value };
    setDraftCust(next);
    await onSaveCustomization(next);
  };

  return (
    <div className="fixed inset-0 bg-[#0B0F17]/95 z-40 flex flex-col">
      {/* Top Navigation */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {(
            [
              ['CUSTOMIZE', 'Personalización'],
              ['SHOP', 'Tienda'],
              ['GARAGE', 'Garaje'],
              ['PROGRESS', 'Progresión'],
              ['SETTINGS', 'Configuración'],
            ] as Array<[ModalTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onChangeTab(id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                tab === id ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-[#141B26] text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm font-mono-hud text-amber-400">
            <Coins className="w-4 h-4" /> {profile.coins.toLocaleString()}
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mx-6 mt-3 bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 px-4 py-2 rounded-lg text-xs">
          {feedback}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'CUSTOMIZE' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 h-[420px] lg:h-[540px] bg-[#141B26] border border-slate-800 rounded-xl overflow-hidden relative">
              <CharacterStageCanvas customization={draftCust} previewEmote={previewEmote} />
              <button
                onClick={() => setPreviewEmote((v) => !v)}
                className="absolute bottom-4 left-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
              >
                {previewEmote ? 'Detener Gesto' : 'Probar Gesto'}
              </button>
            </div>

            <div className="lg:col-span-7 space-y-5">
              {/* Colors */}
              <div className="bg-[#141B26] border border-slate-800 rounded-xl p-4">
                <h3 className="font-display text-sm font-bold text-white mb-3">Colores de Armadura</h3>
                <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
                  <label className="flex items-center gap-2">
                    Primario:
                    <input
                      type="color"
                      value={draftCust.primaryColor}
                      onChange={(e) => handleEquip('primaryColor', e.target.value)}
                      className="w-9 h-7 rounded cursor-pointer bg-transparent"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Acento / Neón:
                    <input
                      type="color"
                      value={draftCust.accentColor}
                      onChange={(e) => handleEquip('accentColor', e.target.value)}
                      className="w-9 h-7 rounded cursor-pointer bg-transparent"
                    />
                  </label>
                </div>
              </div>

              {(
                [
                  ['skin', 'Ropa / Traje'],
                  ['helmet', 'Casco'],
                  ['backpack', 'Mochila'],
                  ['mask', 'Máscara / Visor'],
                  ['accessory', 'Accesorios'],
                  ['emote', 'Gesto de Celebración'],
                ] as Array<[keyof CharacterCustomization, string]>
              ).map(([slotKey, label]) => {
                const items = COSMETIC_CATALOG.filter((i) => i.slot === slotKey);
                return (
                  <div key={slotKey} className="bg-[#141B26] border border-slate-800 rounded-xl p-4">
                    <h3 className="font-display text-sm font-bold text-white mb-3">{label}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {items.map((item) => {
                        const owned = unlocked.has(item.id);
                        const equipped = draftCust[slotKey] === item.id;
                        return (
                          <button
                            key={item.id}
                            disabled={!owned}
                            onClick={() => owned && handleEquip(slotKey, item.id)}
                            className={`p-2.5 rounded-lg border text-left transition-colors ${
                              equipped
                                ? 'bg-amber-500/20 border-amber-400 cursor-pointer'
                                : owned
                                  ? 'bg-[#0B0F17] border-slate-700 hover:border-slate-500 cursor-pointer'
                                  : 'bg-[#0B0F17]/50 border-slate-800 opacity-55 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.previewColor }} />
                              {equipped ? (
                                <Check className="w-3.5 h-3.5 text-amber-400" />
                              ) : !owned ? (
                                <Lock className="w-3 h-3 text-slate-500" />
                              ) : null}
                            </div>
                            <div className="text-xs font-medium text-white mt-2 truncate">{item.name}</div>
                            <div className="text-[10px]" style={{ color: RARITY_COLORS[item.rarity] }}>
                              {RARITY_LABELS[item.rarity]}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'SHOP' && (
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h2 className="font-display text-2xl font-bold text-white">TIENDA DE EQUIPO</h2>
              <p className="text-xs text-slate-400">
                Desbloquea skins, cascos, mochilas, máscaras y gestos usando exclusivamente monedas virtuales ganadas jugando.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {COSMETIC_CATALOG.filter((i) => i.price > 0).map((item) => {
                const owned = unlocked.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="bg-[#141B26] border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div
                        className="h-24 rounded-lg mb-3 flex items-center justify-center border border-white/10"
                        style={{
                          background: `radial-gradient(circle at center, ${item.previewColor}33, #0B0F17)`,
                        }}
                      >
                        <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: item.previewColor }} />
                      </div>
                      <div className="text-xs" style={{ color: RARITY_COLORS[item.rarity] }}>
                        {RARITY_LABELS[item.rarity]}
                      </div>
                      <h3 className="font-display text-base font-bold text-white mt-0.5">{item.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                    </div>
                    <button
                      disabled={owned || profile.coins < item.price}
                      onClick={async () => {
                        try {
                          await onBuyItem(item.id);
                          setFeedback(`Desbloqueaste ${item.name}`);
                        } catch (e: any) {
                          setFeedback(e.message);
                        }
                      }}
                      className={`mt-4 w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                        owned
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                          : profile.coins >= item.price
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {owned ? (
                        'En tu Inventario'
                      ) : (
                        <>
                          <Coins className="w-3.5 h-3.5" /> Comprar por {item.price}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'GARAGE' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 h-[420px] lg:h-[500px] bg-[#141B26] border border-slate-800 rounded-xl overflow-hidden">
              <CharacterStageCanvas customization={profile.customization} showcaseVehicle={selectedVehicle} />
            </div>
            <div className="lg:col-span-5 space-y-3">
              <h2 className="font-display text-2xl font-bold text-white mb-2">GARAJE DE VEHÍCULOS</h2>
              {VEHICLE_SPECS.map((v) => (
                <button
                  key={v.kind}
                  onClick={() => setSelectedVehicle(v.kind)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    selectedVehicle === v.kind
                      ? 'bg-[#141B26] border-amber-400'
                      : 'bg-[#141B26]/60 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold text-white">{v.name}</span>
                    <span className="font-mono-hud text-xs text-amber-400">{v.speed}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{v.desc}</p>
                  <div className="mt-2 text-[11px] text-cyan-300 font-mono-hud">
                    Resistencia: {v.armor} · Terreno: {v.terrain}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'PROGRESS' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Missions */}
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Partidas', profile.stats.matches],
                  ['Victorias #1', profile.stats.wins],
                  ['Eliminaciones', profile.stats.kills],
                  ['Estructuras', profile.stats.buildsPlaced],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} className="bg-[#141B26] border border-slate-800 rounded-xl p-4">
                    <div className="text-xs text-slate-400">{lbl}</div>
                    <div className="font-mono-hud text-2xl font-bold text-white mt-1">{val}</div>
                  </div>
                ))}
              </div>

              <div className="bg-[#141B26] border border-slate-800 rounded-xl p-5">
                <h3 className="font-display text-lg font-bold text-white mb-4">Misiones y Logros</h3>
                <div className="space-y-3">
                  {profile.missions.map((m) => {
                    const done = m.progress >= m.target;
                    return (
                      <div
                        key={m.key}
                        className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="flex-1">
                          <div className="text-xs text-cyan-400 font-medium">{m.period}</div>
                          <div className="text-sm font-semibold text-white">{m.title}</div>
                          <div className="text-xs text-slate-400">{m.description}</div>
                          <div className="mt-2 h-1.5 bg-slate-800 rounded overflow-hidden">
                            <div
                              className="h-full bg-amber-500"
                              style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono-hud text-amber-400 mb-1.5">
                            +{m.rewardXp} XP · +{m.rewardCoins} Mon.
                          </div>
                          <button
                            disabled={!done || m.claimed}
                            onClick={() => onClaimMission(m.key)}
                            className={`px-3 py-1.5 rounded text-xs font-bold ${
                              m.claimed
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : done
                                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                  : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {m.claimed ? 'Reclamada' : done ? 'Reclamar' : `${m.progress}/${m.target}`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Match History */}
              <div className="bg-[#141B26] border border-slate-800 rounded-xl p-5">
                <h3 className="font-display text-lg font-bold text-white mb-3">Historial Reciente</h3>
                {profile.matchHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">Juega tu primera partida para registrar estadísticas.</p>
                ) : (
                  <div className="space-y-2">
                    {profile.matchHistory.slice(0, 6).map((h) => (
                      <div
                        key={h.id}
                        className="bg-[#0B0F17] border border-slate-800 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs font-mono-hud"
                      >
                        <span className="text-white">
                          #{h.placement}/{h.totalPlayers} · {h.mode}
                        </span>
                        <span className="text-slate-400">
                          {h.kills} Elim · {h.damage} Daño · +{h.xpEarned} XP
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Global Leaderboard */}
            <div className="bg-[#141B26] border border-slate-800 rounded-xl p-5 h-fit">
              <h3 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" /> Clasificación Global
              </h3>
              <div className="space-y-2">
                {leaderboard.map((row, idx) => (
                  <div
                    key={row.username}
                    className="bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-xs font-mono-hud"
                  >
                    <div className="flex items-center gap-2">
                      <span className={idx < 3 ? 'text-amber-400 font-bold' : 'text-slate-500'}>#{idx + 1}</span>
                      <span className="text-slate-100">{row.username}</span>
                    </div>
                    <span className="text-cyan-300">
                      Niv.{row.level} · {row.wins}V · {row.kills}E
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'SETTINGS' && (
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Graphics & Audio */}
            <div className="bg-[#141B26] border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="font-display text-lg font-bold text-white">Gráficos y Rendimiento</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Calidad Gráfica</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['BAJA', 'MEDIA', 'ALTA'] as GraphicsQuality[]).map((q) => (
                    <button
                      key={q}
                      onClick={() => onUpdateSettings({ ...settings, quality: q, shadows: q !== 'BAJA' })}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        settings.quality === q ? 'bg-amber-500 text-slate-950' : 'bg-[#0B0F17] text-slate-300 border border-slate-800'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between text-xs text-slate-300">
                <span>Sombras Dinámicas</span>
                <input
                  type="checkbox"
                  checked={settings.shadows}
                  onChange={(e) => onUpdateSettings({ ...settings, shadows: e.target.checked })}
                  className="accent-amber-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-300">
                <span>Mostrar Contador FPS</span>
                <input
                  type="checkbox"
                  checked={settings.showFps}
                  onChange={(e) => onUpdateSettings({ ...settings, showFps: e.target.checked })}
                  className="accent-amber-500 w-4 h-4"
                />
              </label>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Volumen Maestro ({Math.round(settings.masterVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.masterVolume}
                  onChange={(e) => onUpdateSettings({ ...settings, masterVolume: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Efectos de Sonido ({Math.round(settings.sfxVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) => onUpdateSettings({ ...settings, sfxVolume: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Música Ambiental ({Math.round(settings.musicVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.musicVolume}
                  onChange={(e) => onUpdateSettings({ ...settings, musicVolume: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>

            {/* Controls, Touch Layout & Account Security */}
            <div className="space-y-6">
              <div className="bg-[#141B26] border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="font-display text-lg font-bold text-white">Controles y Móvil</h3>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Sensibilidad de Cámara ({settings.mouseSensitivity.toFixed(1)}x)
                  </label>
                  <input
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.1}
                    value={settings.mouseSensitivity}
                    onChange={(e) => onUpdateSettings({ ...settings, mouseSensitivity: Number(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Controles Táctiles (Celular)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['AUTO', 'SI', 'NO'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => onUpdateSettings({ ...settings, touchEnabled: mode })}
                        className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                          settings.touchEnabled === mode
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-[#0B0F17] text-slate-300 border border-slate-800'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                  <label>
                    Tamaño Joystick ({settings.touchLayout.joystickScale.toFixed(1)}x)
                    <input
                      type="range"
                      min={0.7}
                      max={1.4}
                      step={0.1}
                      value={settings.touchLayout.joystickScale}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          touchLayout: { ...settings.touchLayout, joystickScale: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </label>
                  <label>
                    Tamaño Botones ({settings.touchLayout.fireScale.toFixed(1)}x)
                    <input
                      type="range"
                      min={0.7}
                      max={1.4}
                      step={0.1}
                      value={settings.touchLayout.fireScale}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          touchLayout: { ...settings.touchLayout, fireScale: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </label>
                </div>
              </div>

              {/* Account Security (Hashed server-side!) */}
              <div className="bg-[#141B26] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" /> Cuenta y Guardado
                  </h3>
                  <span className="text-xs text-slate-400">
                    {profile.isGuest ? 'Invitado' : `Cuenta: ${profile.username}`}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAuthMode('REGISTER')}
                    className={`flex-1 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                      authMode === 'REGISTER' ? 'bg-amber-500 text-slate-950' : 'bg-[#0B0F17] text-slate-400'
                    }`}
                  >
                    {profile.isGuest ? 'Guardar Progreso (Registro)' : 'Crear Cuenta'}
                  </button>
                  <button
                    onClick={() => setAuthMode('LOGIN')}
                    className={`flex-1 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                      authMode === 'LOGIN' ? 'bg-amber-500 text-slate-950' : 'bg-[#0B0F17] text-slate-400'
                    }`}
                  >
                    Iniciar Sesión
                  </button>
                </div>

                <input
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                  placeholder="Nombre de operador"
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                />
                <input
                  type="password"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres)"
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                />
                <button
                  onClick={async () => {
                    try {
                      if (authMode === 'REGISTER') await onRegister(authUser, authPass);
                      else await onLogin(authUser, authPass);
                      setFeedback('Sesión sincronizada con el servidor.');
                      setAuthPass('');
                    } catch (e: any) {
                      setFeedback(e.message);
                    }
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  {authMode === 'REGISTER' ? 'Registrar Cuenta Segura' : 'Entrar a mi Cuenta'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
