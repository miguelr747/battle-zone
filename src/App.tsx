import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Coins,
  Crosshair,
  Gamepad2,
  Play,
  Settings,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  Warehouse,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ActorNetState,
  BotDifficulty,
  BuildPieceState,
  CharacterCustomization,
  GameMode,
  GameSettings,
  RoomSummary,
  StormState,
  UserProfile,
  VehicleState,
} from './shared/types';
import { DEFAULT_SETTINGS } from './shared/weapons';
import { CharacterStageCanvas } from './game/CharacterStageCanvas';
import { BattleZoneCanvas, HudSnapshot, MobileInputState } from './game/BattleZoneCanvas';
import { GameHUD } from './components/GameHUD';
import { ActiveRoomState, MultiplayerLobby } from './components/MultiplayerLobby';
import { ModalTab, ProgressionModals } from './components/ProgressionModals';
import { gameAudio } from './game/audio';

const SETTINGS_STORAGE_KEY = 'bz_settings_v1';
const TOKEN_STORAGE_KEY = 'bz_session_token_v1';

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ username: string; level: number; wins: number; kills: number; matches: number }>
  >([]);

  // Navigation & Modal States
  const [activeModal, setActiveModal] = useState<ModalTab | null>(null);
  const [showBrSetup, setShowBrSetup] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [musicActive, setMusicActive] = useState(false);

  // Match Configuration
  const [matchMode, setMatchMode] = useState<GameMode>('SOLO');
  const [matchDifficulty, setMatchDifficulty] = useState<BotDifficulty>('NORMAL');
  const [totalParticipants, setTotalParticipants] = useState<number>(100);
  const [inGame, setInGame] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [matchReward, setMatchReward] = useState<{ xpEarned: number; coinsEarned: number } | null>(null);

  // Multiplayer State
  const wsRef = useRef<WebSocket | null>(null);
  const mpEventsRef = useRef<{ onMessage?: (type: string, payload: any) => void }>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<ActiveRoomState | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  const [mpInitialState, setMpInitialState] = useState<{
    worldSeed: number;
    actors: ActorNetState[];
    vehicles: VehicleState[];
    builds?: BuildPieceState[];
    storm: StormState;
  } | null>(null);
  const [isMpMatch, setIsMpMatch] = useState(false);

  const mobileInputRef = useRef<MobileInputState>({
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    firing: false,
    aiming: false,
    jumping: false,
    sprinting: false,
    crouching: false,
    interactTrigger: false,
    reloadTrigger: false,
    buildToggleTrigger: false,
    placeBuildTrigger: false,
    editTrigger: false,
    rotateTrigger: false,
  });

  const apiFetch = useCallback(
    async (url: string, opts: RequestInit = {}, overrideToken?: string) => {
      const tk = overrideToken ?? token;
      const res = await fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
          ...(opts.headers || {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de servidor');
      return data;
    },
    [token]
  );

  // Bootstrap Session & Leaderboard
  useEffect(() => {
    const init = async () => {
      try {
        if (token) {
          const data = await apiFetch('/api/profile');
          setProfile(data.profile);
        } else {
          const data = await apiFetch('/api/auth/guest', { method: 'POST' });
          localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
          setToken(data.token);
          setProfile(data.profile);
        }
      } catch {
        const data = await apiFetch('/api/auth/guest', { method: 'POST' });
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        setToken(data.token);
        setProfile(data.profile);
      }

      try {
        const lb = await fetch('/api/leaderboard').then((r) => r.json());
        setLeaderboard(lb.leaderboard || []);
      } catch {
        // ignore
      }
    };
    init();
  }, []);

  // Save Settings
  const handleUpdateSettings = (next: GameSettings) => {
    setSettings(next);
    gameAudio.updateSettings(next);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  };

  // WebSocket Connection Management
  useEffect(() => {
    if (!token) return;
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;

    const connectWs = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setMpError(null);
      };

      ws.onmessage = (ev) => {
        let msg: { type: string; payload: any };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        const { type, payload } = msg;

        if (type === 'connected') {
          setRooms(payload.rooms || []);
        } else if (type === 'room:list') {
          setRooms(payload || []);
        } else if (type === 'room:state') {
          setActiveRoom(payload);
        } else if (type === 'error') {
          setMpError(payload.message);
        } else if (type === 'match:start') {
          setMatchMode(payload.mode);
          setMatchDifficulty(payload.difficulty);
          setMpInitialState(payload);
          setIsMpMatch(true);
          setShowMultiplayer(false);
          setMatchReward(null);
          setPaused(false);
          setInGame(true);
          gameAudio.stopMenuAmbience();
        } else {
          mpEventsRef.current.onMessage?.(type, payload);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connectWs, 2500);
        }
      };
    };

    connectWs();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [token]);

  // Escape key pause toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && inGame) {
        if (activeModal === 'SETTINGS') setActiveModal(null);
        else setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inGame, activeModal]);

  const startLocalMatch = (mode: GameMode, difficulty: BotDifficulty, participants: number) => {
    gameAudio.unlock();
    gameAudio.stopMenuAmbience();
    setMusicActive(false);
    setMatchMode(mode);
    setMatchDifficulty(difficulty);
    setTotalParticipants(participants);
    setIsMpMatch(false);
    setMpInitialState(null);
    setMatchReward(null);
    setShowBrSetup(false);
    setPaused(false);
    setInGame(true);
  };

  const handleMatchComplete = async (result: {
    placement: number;
    totalPlayers: number;
    kills: number;
    damage: number;
    buildsPlaced: number;
    survivalTime: number;
    victory: boolean;
  }) => {
    if (isMpMatch) {
      // Server already recorded MP stats; refresh profile
      try {
        const res = await apiFetch('/api/profile');
        setProfile(res.profile);
      } catch {
        // ignore
      }
      return;
    }

    try {
      const data = await apiFetch('/api/match/record', {
        method: 'POST',
        body: JSON.stringify({
          mode: matchMode,
          placement: result.placement,
          totalPlayers: result.totalPlayers,
          kills: result.kills,
          damage: result.damage,
          buildsPlaced: result.buildsPlaced,
          survivalTime: result.survivalTime,
        }),
      });
      setProfile(data.profile);
      setMatchReward({ xpEarned: data.xpEarned, coinsEarned: data.coinsEarned });
      const lb = await fetch('/api/leaderboard').then((r) => r.json());
      setLeaderboard(lb.leaderboard || []);
    } catch {
      // ignore
    }
  };

  const exitMatch = () => {
    setInGame(false);
    setPaused(false);
    setHud(null);
    if (isMpMatch) {
      wsRef.current?.send(JSON.stringify({ type: 'room:leave', payload: {} }));
      setActiveRoom(null);
    }
  };

  if (!profile) {
    return (
      <div className="w-screen h-screen bg-[#0B0F17] flex items-center justify-center text-slate-300 font-display text-xl">
        Iniciando BATTLE ZONE – SURVIVAL ARENA...
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#0B0F17] overflow-hidden relative">
      {/* ACTIVE GAMEPLAY VIEW */}
      {inGame ? (
        <>
          <BattleZoneCanvas
            mode={matchMode}
            difficulty={matchDifficulty}
            totalParticipants={totalParticipants}
            settings={settings}
            playerId={profile.id}
            playerName={profile.username}
            customization={profile.customization}
            isMultiplayer={isMpMatch}
            wsRef={wsRef}
            mpInitialState={mpInitialState}
            mpEventsRef={mpEventsRef}
            mobileInputRef={mobileInputRef}
            paused={paused || activeModal === 'SETTINGS'}
            onHudUpdate={setHud}
            onMatchComplete={handleMatchComplete}
          />
          {hud && (
            <GameHUD
              hud={hud}
              settings={settings}
              mobileInputRef={mobileInputRef}
              paused={paused}
              onTogglePause={() => setPaused((p) => !p)}
              onOpenSettings={() => setActiveModal('SETTINGS')}
              onExitMatch={exitMatch}
              matchReward={matchReward}
            />
          )}
        </>
      ) : (
        /* MAIN MENU WITH LIVE 3D CHARACTER DIORAMA */
        <div className="relative w-full h-full">
          {/* 3D Animated Character Background Stage */}
          <div className="absolute inset-0">
            <CharacterStageCanvas customization={profile.customization} />
          </div>

          {/* Subtle Left/Bottom Gradient Scrim for High Legibility */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, rgba(11,15,23,0.92) 0%, rgba(11,15,23,0.55) 45%, rgba(11,15,23,0.18) 100%)',
            }}
          />

          {/* Main Menu Semantic DOM Overlay */}
          <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-8 max-w-[1440px] mx-auto pointer-events-none">
            {/* Top Bar (Brand Wordmark + Nav Links + Player Profile/Coins) */}
            <header className="flex flex-wrap items-center justify-between gap-6 pointer-events-auto border-b border-white/10 pb-4">
              <div className="font-display text-xl sm:text-2xl font-bold tracking-wider text-white whitespace-nowrap shrink-0">
                BATTLE ZONE <span className="text-amber-400">· SURVIVAL ARENA</span>
              </div>

              <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
                <button
                  onClick={() => setActiveModal('GARAGE')}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Garaje
                </button>
                <button
                  onClick={() => setActiveModal('SHOP')}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Tienda
                </button>
                <button
                  onClick={() => setActiveModal('CUSTOMIZE')}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Personalización
                </button>
                <button
                  onClick={() => setActiveModal('PROGRESS')}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Progresión
                </button>
                <button
                  onClick={() => setActiveModal('SETTINGS')}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Configuración
                </button>
              </nav>

              <div className="flex items-center gap-4 shrink-0">
                <button
                  onClick={() => {
                    gameAudio.unlock();
                    if (musicActive) {
                      gameAudio.stopMenuAmbience();
                      setMusicActive(false);
                    } else {
                      gameAudio.startMenuAmbience();
                      setMusicActive(true);
                    }
                  }}
                  className="p-2 rounded-lg bg-[#141B26] border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                  title="Música Ambiental"
                >
                  {musicActive ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
                </button>

                <div className="bg-[#141B26] border border-slate-700/80 rounded-lg px-3.5 py-1.5 flex items-center gap-4">
                  <div>
                    <div className="text-xs font-bold text-white">{profile.username}</div>
                    <div className="text-[11px] text-slate-400 font-mono-hud">
                      Nivel {profile.level} · {profile.xp}/{profile.xpToNext} XP
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-mono-hud font-bold text-amber-400">
                    <Coins className="w-4 h-4" /> {profile.coins.toLocaleString()}
                  </div>
                </div>
              </div>
            </header>

            {/* Left Column Primary Actions */}
            <div className="my-auto max-w-md space-y-5 pointer-events-auto">
              <div>
                <h1 className="font-display text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
                  SUPERVIVENCIA TÁCTICA EN TIEMPO REAL
                </h1>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  Salta sobre una isla de 10 regiones, recolecta armas y materiales, construye fortificaciones al instante y vence a 99 rivales en Battle Royale.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => startLocalMatch('SOLO', matchDifficulty, 100)}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-lg py-3.5 px-6 rounded-xl flex items-center justify-between transition-colors shadow-lg cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Play className="w-5 h-5 fill-slate-950" /> JUGAR
                  </span>
                  <span className="text-xs font-sans font-semibold opacity-80">Battle Royale 100 · {matchDifficulty}</span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setShowBrSetup(true)}
                    className="bg-[#141B26] hover:bg-slate-800 border border-slate-700 text-white py-3 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Crosshair className="w-4 h-4 text-amber-400" /> BATTLE ROYALE
                  </button>
                  <button
                    onClick={() => {
                      gameAudio.unlock();
                      wsRef.current?.send(JSON.stringify({ type: 'room:list' }));
                      setShowMultiplayer(true);
                    }}
                    className="bg-[#141B26] hover:bg-slate-800 border border-slate-700 text-white py-3 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-cyan-400" /> MULTIJUGADOR
                  </button>
                </div>

                <button
                  onClick={() => startLocalMatch('TRAINING', 'NORMAL', 14)}
                  className="w-full bg-[#141B26] hover:bg-slate-800 border border-slate-700 text-slate-100 py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-emerald-400" /> ENTRENAMIENTO
                  </span>
                  <span className="text-xs text-slate-400">Práctica con Bots y Construcción Libre</span>
                </button>
              </div>

              {/* Compact Secondary Hub Buttons (visible on all screen sizes) */}
              <div className="grid grid-cols-5 gap-2 pt-2">
                <button
                  onClick={() => setActiveModal('GARAGE')}
                  className="bg-[#141B26]/90 hover:bg-slate-800 border border-slate-800 rounded-lg py-2.5 flex flex-col items-center gap-1 text-[11px] text-slate-300 cursor-pointer"
                >
                  <Warehouse className="w-4 h-4 text-amber-400" /> Garaje
                </button>
                <button
                  onClick={() => setActiveModal('SHOP')}
                  className="bg-[#141B26]/90 hover:bg-slate-800 border border-slate-800 rounded-lg py-2.5 flex flex-col items-center gap-1 text-[11px] text-slate-300 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-cyan-400" /> Tienda
                </button>
                <button
                  onClick={() => setActiveModal('CUSTOMIZE')}
                  className="bg-[#141B26]/90 hover:bg-slate-800 border border-slate-800 rounded-lg py-2.5 flex flex-col items-center gap-1 text-[11px] text-slate-300 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" /> Estilo
                </button>
                <button
                  onClick={() => setActiveModal('PROGRESS')}
                  className="bg-[#141B26]/90 hover:bg-slate-800 border border-slate-800 rounded-lg py-2.5 flex flex-col items-center gap-1 text-[11px] text-slate-300 cursor-pointer"
                >
                  <Trophy className="w-4 h-4 text-emerald-400" /> Progreso
                </button>
                <button
                  onClick={() => setActiveModal('SETTINGS')}
                  className="bg-[#141B26]/90 hover:bg-slate-800 border border-slate-800 rounded-lg py-2.5 flex flex-col items-center gap-1 text-[11px] text-slate-300 cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-300" /> Ajustes
                </button>
              </div>
            </div>

            {/* Footer Controls Hint */}
            <footer className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-4 pointer-events-auto">
              <span>Arrastra sobre el personaje para rotar · WASD Mover · Clic Disparar · Q Construir · G Editar · E Vehículo/Cofre</span>
              <span className="font-mono-hud text-slate-500">
                Victorias: {profile.stats.wins} · Eliminaciones: {profile.stats.kills}
              </span>
            </footer>
          </div>
        </div>
      )}

      {/* BATTLE ROYALE MODE & DIFFICULTY MODAL */}
      {showBrSetup && (
        <div className="fixed inset-0 bg-black/75 z-40 flex items-center justify-center p-4">
          <div className="bg-[#141B26] border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-white">CONFIGURAR BATTLE ROYALE</h2>
              <button
                onClick={() => setShowBrSetup(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Modalidad de Equipo</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['SOLO', 'SOLO'],
                    ['DUOS', 'DÚOS'],
                    ['SQUADS', 'ESCUADRONES'],
                  ] as Array<[GameMode, string]>
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setMatchMode(m)}
                    className={`py-2.5 rounded-lg text-xs font-bold cursor-pointer ${
                      matchMode === m ? 'bg-amber-500 text-slate-950' : 'bg-[#0B0F17] text-slate-300 border border-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Inteligencia Artificial (Bots)</label>
              <div className="grid grid-cols-2 gap-2">
                {(['FACIL', 'NORMAL', 'DIFICIL', 'EXPERTO'] as BotDifficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setMatchDifficulty(d)}
                    className={`py-2.5 rounded-lg text-xs font-bold cursor-pointer ${
                      matchDifficulty === d
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-[#0B0F17] text-slate-300 border border-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Participantes en la Isla: <strong className="text-white">{totalParticipants}</strong>
              </label>
              <input
                type="range"
                min={20}
                max={100}
                step={10}
                value={totalParticipants}
                onChange={(e) => setTotalParticipants(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <button
              onClick={() => startLocalMatch(matchMode, matchDifficulty, totalParticipants)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-sm cursor-pointer"
            >
              Lanzar Partida Battle Royale
            </button>
          </div>
        </div>
      )}

      {/* MULTIPLAYER LOBBY */}
      {showMultiplayer && (
        <MultiplayerLobby
          connected={wsConnected}
          playerId={profile.id}
          rooms={rooms}
          activeRoom={activeRoom}
          errorMsg={mpError}
          onRefreshRooms={() => wsRef.current?.send(JSON.stringify({ type: 'room:list' }))}
          onCreateRoom={(data) => wsRef.current?.send(JSON.stringify({ type: 'room:create', payload: data }))}
          onJoinRoom={(data) => wsRef.current?.send(JSON.stringify({ type: 'room:join', payload: data }))}
          onLeaveRoom={() => {
            wsRef.current?.send(JSON.stringify({ type: 'room:leave', payload: {} }));
            setActiveRoom(null);
          }}
          onToggleReady={() => wsRef.current?.send(JSON.stringify({ type: 'room:ready', payload: {} }))}
          onStartMatch={() => wsRef.current?.send(JSON.stringify({ type: 'room:start', payload: {} }))}
          onSendChat={(text) => wsRef.current?.send(JSON.stringify({ type: 'room:chat', payload: { text } }))}
          onClose={() => setShowMultiplayer(false)}
        />
      )}

      {/* CUSTOMIZATION / SHOP / GARAGE / PROGRESSION / SETTINGS MODALS */}
      {activeModal && (
        <ProgressionModals
          tab={activeModal}
          profile={profile}
          settings={settings}
          leaderboard={leaderboard}
          onChangeTab={setActiveModal}
          onSaveCustomization={async (cust: CharacterCustomization) => {
            const data = await apiFetch('/api/profile/customize', {
              method: 'POST',
              body: JSON.stringify(cust),
            });
            setProfile(data.profile);
          }}
          onBuyItem={async (itemId: string) => {
            const data = await apiFetch('/api/shop/buy', {
              method: 'POST',
              body: JSON.stringify({ itemId }),
            });
            setProfile(data.profile);
          }}
          onClaimMission={async (missionKey: string) => {
            const data = await apiFetch('/api/missions/claim', {
              method: 'POST',
              body: JSON.stringify({ missionKey }),
            });
            setProfile(data.profile);
          }}
          onUpdateSettings={handleUpdateSettings}
          onRegister={async (username, password) => {
            const data = await apiFetch('/api/auth/register', {
              method: 'POST',
              body: JSON.stringify({ username, password }),
            });
            localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
            setToken(data.token);
            setProfile(data.profile);
          }}
          onLogin={async (username, password) => {
            const data = await apiFetch('/api/auth/login', {
              method: 'POST',
              body: JSON.stringify({ username, password }),
            });
            localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
            setToken(data.token);
            setProfile(data.profile);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
