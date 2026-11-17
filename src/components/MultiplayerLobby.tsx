import React, { useState } from 'react';
import { Copy, Check, Send, Users, Play, RefreshCw, LogOut, Plus } from 'lucide-react';
import { BotDifficulty, ChatMessage, GameMode, RoomMember, RoomSummary } from '../shared/types';

export interface ActiveRoomState {
  id: string;
  code: string;
  name: string;
  mode: GameMode;
  difficulty: BotDifficulty;
  maxPlayers: number;
  hostId: string;
  status: 'LOBBY' | 'COUNTDOWN' | 'IN_GAME';
  countdown: number;
  members: RoomMember[];
  chat: ChatMessage[];
}

interface MultiplayerLobbyProps {
  connected: boolean;
  playerId: string;
  rooms: RoomSummary[];
  activeRoom: ActiveRoomState | null;
  errorMsg: string | null;
  onRefreshRooms: () => void;
  onCreateRoom: (data: { name: string; mode: GameMode; difficulty: BotDifficulty; maxPlayers: number }) => void;
  onJoinRoom: (roomIdOrCode: { roomId?: string; code?: string }) => void;
  onLeaveRoom: () => void;
  onToggleReady: () => void;
  onStartMatch: () => void;
  onSendChat: (text: string) => void;
  onClose: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  connected,
  playerId,
  rooms,
  activeRoom,
  errorMsg,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onStartMatch,
  onSendChat,
  onClose,
}) => {
  const [roomName, setRoomName] = useState('Arena Táctica');
  const [mode, setMode] = useState<GameMode>('SOLO');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('NORMAL');
  const [maxPlayers, setMaxPlayers] = useState(36);
  const [joinCode, setJoinCode] = useState('');
  const [chatText, setChatText] = useState('');
  const [copied, setCopied] = useState(false);

  const copyInvite = () => {
    if (!activeRoom) return;
    navigator.clipboard?.writeText(activeRoom.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 bg-[#0B0F17]/95 z-40 flex items-center justify-center p-4">
      <div className="bg-[#141B26] border border-slate-700/80 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">MULTIJUGADOR ONLINE</h2>
            <p className="text-xs text-slate-400">
              Servidor autoritativo WebSocket · {connected ? 'Conectado al servidor' : 'Reconectando...'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
          >
            Volver al Menú
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 bg-red-500/15 border border-red-500/40 text-red-300 text-xs px-4 py-2 rounded-lg">
            {errorMsg}
          </div>
        )}

        {activeRoom ? (
          /* INSIDE ROOM LOBBY */
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Room Info & Player List */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-display text-xl font-bold text-white">{activeRoom.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Modo {activeRoom.mode} · Bots {activeRoom.difficulty} · Capacidad {activeRoom.maxPlayers} (relleno automático con IA)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyInvite}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-lg text-xs font-mono-hud text-amber-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Código: {activeRoom.code}
                  </button>
                  <button
                    onClick={onLeaveRoom}
                    className="bg-red-600/20 hover:bg-red-600/35 border border-red-500/40 px-3 py-2 rounded-lg text-xs text-red-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Salir
                  </button>
                </div>
              </div>

              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    Jugadores en Sala ({activeRoom.members.length})
                  </h3>
                  {activeRoom.status === 'COUNTDOWN' && (
                    <span className="font-mono-hud text-sm font-bold text-amber-400">
                      Despegando en {Math.ceil(activeRoom.countdown)}s...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeRoom.members.map((m) => (
                    <div
                      key={m.id}
                      className="bg-[#141B26] border border-slate-800 rounded-lg px-3.5 py-2.5 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">
                          {m.name} {m.isHost ? '· Anfitrión' : ''}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Equipo #{m.teamId} · {m.connected ? 'En línea' : 'Reconectando'}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          m.ready ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {m.ready ? 'Listo' : 'Esperando'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onToggleReady}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg text-sm font-semibold cursor-pointer"
                >
                  Alternar Listo
                </button>
                {activeRoom.hostId === playerId && (
                  <button
                    onClick={onStartMatch}
                    disabled={activeRoom.status !== 'LOBBY'}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4" /> Iniciar Partida
                  </button>
                )}
              </div>
            </div>

            {/* Right: Live Room Text Chat */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 flex flex-col h-80 lg:h-auto">
              <h3 className="font-display text-sm font-bold text-slate-200 mb-3">Chat de Sala</h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {activeRoom.chat.map((c) => (
                  <div key={c.id} className={c.system ? 'text-amber-400/90' : 'text-slate-300'}>
                    <strong className={c.system ? 'text-amber-400' : 'text-cyan-400'}>{c.sender}: </strong>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatText.trim()) return;
                  onSendChat(chatText);
                  setChatText('');
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-[#141B26] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-lg cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* ROOM BROWSER & CREATION */
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create Room Panel */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-5 space-y-4">
              <h3 className="font-display text-lg font-bold text-white">Crear Nueva Sala</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre de la Sala</label>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-[#141B26] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Modo de Juego</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['SOLO', 'DUOS', 'SQUADS', 'TRAINING'] as GameMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                        mode === m ? 'bg-amber-500 text-slate-950' : 'bg-[#141B26] text-slate-300 border border-slate-800'
                      }`}
                    >
                      {m === 'SQUADS' ? 'ESCUADRONES' : m === 'TRAINING' ? 'ENTRENAMIENTO' : m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dificultad de Bots</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['FACIL', 'NORMAL', 'DIFICIL', 'EXPERTO'] as BotDifficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                        difficulty === d ? 'bg-cyan-500 text-slate-950' : 'bg-[#141B26] text-slate-300 border border-slate-800'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Participantes Totales (con IA): <strong className="text-white">{maxPlayers}</strong>
                </label>
                <input
                  type="range"
                  min={8}
                  max={100}
                  step={4}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <button
                onClick={() => onCreateRoom({ name: roomName, mode, difficulty, maxPlayers })}
                disabled={!connected}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Crear Sala
              </button>
            </div>

            {/* Active Rooms & Code Join */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center gap-3">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Código de invitación (ej. A7K9P2)"
                  className="flex-1 min-w-[200px] bg-[#141B26] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono-hud text-white outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => joinCode.trim() && onJoinRoom({ code: joinCode.trim() })}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                >
                  Unirse por Código
                </button>
                <button
                  onClick={onRefreshRooms}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                </button>
              </div>

              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 flex-1">
                <h3 className="font-display text-sm font-bold text-slate-200 mb-3">Salas Públicas Disponibles</h3>
                {rooms.length === 0 ? (
                  <div className="text-center py-12 text-sm text-slate-500">
                    No hay salas activas todavía. Crea una sala para jugar con amigos o bots.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {rooms.map((r) => (
                      <div
                        key={r.id}
                        className="bg-[#141B26] border border-slate-800 rounded-lg p-3.5 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {r.name} <span className="text-xs font-mono-hud text-amber-400">[{r.code}]</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Anfitrión: {r.hostName} · {r.mode} · {r.difficulty} · {r.humanCount}/{r.maxPlayers}
                          </div>
                        </div>
                        <button
                          onClick={() => onJoinRoom({ roomId: r.id })}
                          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                        >
                          {r.status === 'IN_GAME' ? 'Reconectar / Entrar' : 'Unirse'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
