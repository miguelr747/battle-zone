import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Hammer,
  Pause,
  RotateCw,
  Shield,
  Heart,
  Car,
  Trophy,
  Eye,
  LogOut,
  Edit3,
  Package,
} from 'lucide-react';
import {
  BuildPieceType,
  GameSettings,
  MaterialType,
} from '../shared/types';
import { CONSUMABLES, RARITY_LABELS, WEAPON_MAP } from '../shared/weapons';
import { MAP_REGIONS, MAP_SIZE } from '../shared/worldGen';
import { HudSnapshot, MobileInputState } from '../game/BattleZoneCanvas';

interface GameHUDProps {
  hud: HudSnapshot;
  settings: GameSettings;
  mobileInputRef: React.MutableRefObject<MobileInputState>;
  paused: boolean;
  onTogglePause: () => void;
  onOpenSettings: () => void;
  onExitMatch: () => void;
  matchReward?: { xpEarned: number; coinsEarned: number } | null;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  settings,
  mobileInputRef,
  paused,
  onTogglePause,
  onOpenSettings,
  onExitMatch,
  matchReward,
}) => {
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [spectatingDismissed, setSpectatingDismissed] = useState(false);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);
  const lookTouchRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(settings.touchEnabled === 'SI' || (settings.touchEnabled === 'AUTO' && hasTouch));
  }, [settings.touchEnabled]);

  // Draw Minimap at 15Hz
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const scale = size / MAP_SIZE;
    const toCanvas = (wx: number, wz: number) => ({
      x: (wx + MAP_SIZE / 2) * scale,
      y: (wz + MAP_SIZE / 2) * scale,
    });

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, size, size);

    // Island landmass outline
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(10, 10, size - 20, size - 20);

    // Regions
    ctx.font = '7px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    for (const r of MAP_REGIONS) {
      const p = toCanvas(r.x, r.z);
      ctx.fillStyle = r.biomeColor;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText(r.name.split(' ')[0], p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // Next safe zone (white dashed)
    const nPos = toCanvas(hud.storm.nextCenterX, hud.storm.nextCenterZ);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(nPos.x, nPos.y, hud.storm.nextRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current storm ring (purple)
    const sPos = toCanvas(hud.storm.centerX, hud.storm.centerZ);
    ctx.strokeStyle = '#A855F7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sPos.x, sPos.y, hud.storm.radius * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Detected nearby enemies / teammates
    for (const a of hud.actorsForMinimap) {
      const ap = toCanvas(a.x, a.z);
      const dist = Math.hypot(a.x - hud.playerX, a.z - hud.playerZ);
      if (a.teamId === 1) {
        ctx.fillStyle = '#22C55E';
      } else if (dist < 110) {
        ctx.fillStyle = '#EF4444';
      } else {
        continue;
      }
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow
    const pp = toCanvas(hud.playerX, hud.playerZ);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-hud.playerYaw + Math.PI);
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [hud]);

  const activeSlotObj = hud.slots[hud.activeSlot];
  const activeWeapon = activeSlotObj ? WEAPON_MAP.get(activeSlotObj.weaponId) : null;
  const hitmarkerActive = performance.now() - hud.hitmarkerAt < 180;

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-20 flex flex-col justify-between p-3 sm:p-4">
      {/* Storm Vignette */}
      {hud.inStorm && hud.alive && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ boxShadow: 'inset 0 0 90px rgba(139, 92, 246, 0.55)' }}
        />
      )}

      {/* TOP BAR: Minimap (Left) & Match Info / Kill Feed (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Minimap & Storm Info */}
        <div className="flex items-start gap-3">
          <div className="bg-[#0B0F17]/85 border border-slate-700/70 rounded-lg p-1.5 shadow-lg">
            <canvas ref={minimapRef} width={144} height={144} className="rounded block" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300 px-1 font-mono-hud">
              <span className="truncate max-w-[92px] text-amber-400 font-medium">{hud.regionName}</span>
              <span>
                {hud.storm.shrinking ? 'Cierre ' : 'Zona '}
                {Math.max(0, Math.ceil(hud.storm.timer))}s
              </span>
            </div>
          </div>
        </div>

        {/* Top Right Telemetry & Pause */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 pointer-events-auto">
            {settings.showFps && (
              <div className="bg-[#0B0F17]/85 border border-slate-700/70 px-2.5 py-1.5 rounded-lg text-xs font-mono-hud text-emerald-400">
                {hud.fps} FPS
              </div>
            )}
            <div className="bg-[#0B0F17]/85 border border-slate-700/70 px-3 py-1.5 rounded-lg flex items-center gap-4 text-xs font-mono-hud">
              <span className="text-slate-200">
                Vivos: <strong className="text-amber-400">{hud.aliveCount}</strong>/{hud.totalCount}
              </span>
              <span className="text-slate-200">
                Eliminaciones: <strong className="text-red-400">{hud.kills}</strong>
              </span>
            </div>
            <button
              onClick={onTogglePause}
              className="bg-[#0B0F17]/85 hover:bg-slate-800 border border-slate-700/70 p-2 rounded-lg text-slate-200 transition-colors cursor-pointer"
              title="Pausa (Esc)"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          {/* Kill Feed */}
          <div className="flex flex-col items-end gap-1 mt-1">
            {hud.killFeed.map((kf) => (
              <div
                key={kf.id}
                className="bg-[#0B0F17]/80 border border-slate-800 px-2.5 py-1 rounded text-[11px] text-slate-300 flex items-center gap-1.5"
              >
                <span className="text-amber-400 font-medium">{kf.killerName}</span>
                <span className="text-slate-500">[{kf.weaponName}]</span>
                <span className="text-red-400 font-medium">{kf.victimName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER CROSSHAIR & PROMPTS */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        {hud.alive && !hud.inDropship && !hud.inVehicle && (
          <div className="relative flex items-center justify-center">
            <Crosshair
              className={`w-6 h-6 transition-transform duration-75 ${
                hud.buildingMode ? 'text-cyan-400' : 'text-white/90'
              }`}
              strokeWidth={1.75}
            />
            {hitmarkerActive && (
              <div
                className={`absolute w-8 h-8 border-2 rotate-45 ${
                  hud.headshotHit ? 'border-amber-400' : 'border-red-500'
                }`}
              />
            )}
          </div>
        )}

        {/* Dropship / Parachute Prompt */}
        {hud.alive && hud.inDropship && (
          <div className="mt-44 bg-[#0B0F17]/90 border border-amber-500/50 px-5 py-2.5 rounded-lg text-center">
            <p className="font-display text-sm tracking-wide text-amber-400">NAVE DE TRANSPORTE EN RUTA</p>
            <p className="text-xs text-slate-200 mt-0.5">Presiona ESPACIO o E para saltar al campo de batalla</p>
          </div>
        )}

        {/* Interaction Prompt */}
        {hud.alive && !hud.inDropship && (hud.nearbyChest || hud.nearbyLoot || hud.nearbyVehicle) && (
          <div className="mt-32 bg-[#0B0F17]/90 border border-slate-600 px-4 py-1.5 rounded-lg text-xs text-slate-100 flex items-center gap-2">
            <span className="bg-amber-500 text-slate-950 font-bold px-1.5 py-0.5 rounded">E</span>
            {hud.nearbyVehicle ? (
              <span>Conducir {hud.nearbyVehicle.name}</span>
            ) : hud.nearbyChest ? (
              <span>Abrir Cofre {hud.nearbyChest.tier === 'EPICO' ? 'Épico' : 'Táctico'}</span>
            ) : hud.nearbyLoot?.kind === 'WEAPON' && hud.nearbyLoot.weaponId ? (
              <span>
                Recoger {WEAPON_MAP.get(hud.nearbyLoot.weaponId)?.name} (
                {RARITY_LABELS[WEAPON_MAP.get(hud.nearbyLoot.weaponId)!.rarity]})
              </span>
            ) : hud.nearbyLoot?.kind === 'CONSUMABLE' && hud.nearbyLoot.consumableId ? (
              <span>Recoger {CONSUMABLES[hud.nearbyLoot.consumableId].name}</span>
            ) : (
              <span>Recoger suministros</span>
            )}
          </div>
        )}

        {/* Reload / Heal Progress */}
        {(hud.reloading || hud.healingItem) && (
          <div className="mt-24 w-44 bg-[#0B0F17]/90 border border-slate-700 rounded-lg p-2">
            <div className="text-[11px] text-center text-slate-200 mb-1">
              {hud.healingItem ? CONSUMABLES[hud.healingItem].name : 'Recargando...'}
            </div>
            <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full ${hud.healingItem ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{ width: `${Math.round((hud.healingItem ? hud.healProgress : hud.reloadProgress) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Click to lock mouse hint on PC */}
        {hud.alive && !hud.pointerLocked && !isTouchDevice && !paused && (
          <div className="mt-64 bg-[#0B0F17]/80 border border-slate-700 px-3 py-1 rounded text-[11px] text-slate-300">
            Haz clic en la pantalla para fijar la mira · Esc para menú
          </div>
        )}
      </div>

      {/* BOTTOM HUD: Health/Shield (Left) & Weapons/Build/Materials (Right) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3">
        {/* Health & Shield */}
        <div className="bg-[#0B0F17]/85 border border-slate-700/70 rounded-lg p-3 w-full sm:w-72">
          {hud.inVehicle && (
            <div className="mb-2 pb-2 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <Car className="w-3.5 h-3.5" /> {hud.inVehicle.name}
              </span>
              <span className="font-mono-hud text-slate-300">
                {Math.abs(Math.round(hud.inVehicle.speed * 3.6))} km/h · Comb. {Math.round(hud.inVehicle.fuel)}%
              </span>
            </div>
          )}

          {/* Shield */}
          <div className="flex items-center gap-2 mb-1.5">
            <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="flex-1 h-2.5 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-100"
                style={{ width: `${(hud.shield / hud.maxShield) * 100}%` }}
              />
            </div>
            <span className="font-mono-hud text-xs w-8 text-right text-cyan-300">{hud.shield}</span>
          </div>

          {/* HP */}
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1 h-3 bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.hp > 35 ? 'bg-emerald-500' : 'bg-red-500'
                }`}
                style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
              />
            </div>
            <span className="font-mono-hud text-xs w-8 text-right text-emerald-300">{hud.hp}</span>
          </div>

          {/* Quick Heal Indicators */}
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>[H] Botiquín: {hud.consumables.MEDKIT}</span>
            <span>[J] Escudo: {hud.consumables.SHIELD_LARGE}</span>
            <span>[F] Recolectar</span>
          </div>
        </div>

        {/* Weapons, Building & Materials */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {/* Materials + Build Mode Banner */}
          <div className="bg-[#0B0F17]/85 border border-slate-700/70 rounded-lg px-3 py-2 flex items-center gap-4 text-xs font-mono-hud">
            <span className={hud.buildMaterial === 'MADERA' && hud.buildingMode ? 'text-amber-400 font-bold' : 'text-amber-200/80'}>
              Madera: {hud.materials.MADERA}
            </span>
            <span className={hud.buildMaterial === 'PIEDRA' && hud.buildingMode ? 'text-amber-400 font-bold' : 'text-slate-300'}>
              Piedra: {hud.materials.PIEDRA}
            </span>
            <span className={hud.buildMaterial === 'METAL' && hud.buildingMode ? 'text-amber-400 font-bold' : 'text-cyan-300'}>
              Metal: {hud.materials.METAL}
            </span>
          </div>

          {hud.buildingMode ? (
            <div className="bg-[#0B0F17]/90 border border-cyan-500/60 rounded-lg p-2 flex items-center gap-2">
              {(['PARED', 'PISO', 'RAMPA', 'TECHO'] as BuildPieceType[]).map((piece) => (
                <button
                  key={piece}
                  onClick={() => {
                    mobileInputRef.current.pieceSelect = piece;
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                    hud.buildPieceType === piece
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {piece}
                </button>
              ))}
              <button
                onClick={() => {
                  mobileInputRef.current.rotateTrigger = true;
                }}
                className="px-2 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                title="Rotar [T]"
              >
                <RotateCw className="w-3.5 h-3.5" /> {hud.buildRotationDeg}°
              </button>
              <button
                onClick={() => {
                  mobileInputRef.current.editTrigger = true;
                }}
                className="px-2 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                title="Editar [G]"
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {hud.slots.map((slot, idx) => {
                const w = slot ? WEAPON_MAP.get(slot.weaponId) : null;
                const isActive = idx === hud.activeSlot;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      mobileInputRef.current.slotSelect = idx;
                    }}
                    className={`w-20 sm:w-24 h-14 rounded-lg border px-2 py-1 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-slate-800/95 border-amber-400'
                        : 'bg-[#0B0F17]/85 border-slate-700/70 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-hud">
                      <span>{idx + 1}</span>
                      {slot && w && <span style={{ color: w.color }}>{slot.ammoInMag}</span>}
                    </div>
                    <div className="text-[11px] text-slate-100 font-medium truncate mt-1">
                      {w ? w.name.split(' ').slice(0, 2).join(' ') : 'Vacío'}
                    </div>
                  </button>
                );
              })}
              {activeWeapon && activeSlotObj && (
                <div className="bg-[#0B0F17]/90 border border-slate-700 rounded-lg px-3 h-14 flex flex-col justify-center font-mono-hud">
                  <div className="text-lg font-bold text-white leading-none">
                    {activeSlotObj.ammoInMag}
                    <span className="text-xs text-slate-400 font-normal"> / {hud.ammoReserve}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[110px]">[Q] Construir · [R] Recargar</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MOBILE TOUCH CONTROLS OVERLAY */}
      {isTouchDevice && hud.alive && !paused && (
        <div className="fixed inset-0 pointer-events-none z-30">
          {/* Right half camera drag zone */}
          <div
            className="absolute top-16 right-0 w-1/2 h-[65%] pointer-events-auto"
            onTouchStart={(e) => {
              const t = e.changedTouches[0];
              lookTouchRef.current = { id: t.identifier, x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              if (!lookTouchRef.current) return;
              for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === lookTouchRef.current.id) {
                  mobileInputRef.current.lookDeltaX += t.clientX - lookTouchRef.current.x;
                  mobileInputRef.current.lookDeltaY += t.clientY - lookTouchRef.current.y;
                  lookTouchRef.current.x = t.clientX;
                  lookTouchRef.current.y = t.clientY;
                }
              }
            }}
            onTouchEnd={() => {
              lookTouchRef.current = null;
            }}
          />

          {/* Left Virtual Joystick */}
          <div
            className="absolute pointer-events-auto rounded-full bg-slate-900/50 border-2 border-white/20 flex items-center justify-center touch-none"
            style={{
              left: `${settings.touchLayout.joystickX}%`,
              bottom: `${settings.touchLayout.joystickY + 12}%`,
              width: `${112 * settings.touchLayout.joystickScale}px`,
              height: `${112 * settings.touchLayout.joystickScale}px`,
            }}
            onTouchStart={(e) => {
              const t = e.changedTouches[0];
              joyOriginRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              if (!joyOriginRef.current) return;
              const t = e.changedTouches[0];
              const maxR = 42 * settings.touchLayout.joystickScale;
              const dx = t.clientX - joyOriginRef.current.x;
              const dy = t.clientY - joyOriginRef.current.y;
              const dist = Math.min(maxR, Math.hypot(dx, dy));
              const ang = Math.atan2(dy, dx);
              const kx = Math.cos(ang) * dist;
              const ky = Math.sin(ang) * dist;
              setJoyKnob({ x: kx, y: ky });
              mobileInputRef.current.moveX = kx / maxR;
              mobileInputRef.current.moveY = -ky / maxR;
              mobileInputRef.current.sprinting = dist > maxR * 0.78 && -ky / maxR > 0.5;
            }}
            onTouchEnd={() => {
              joyOriginRef.current = null;
              setJoyKnob({ x: 0, y: 0 });
              mobileInputRef.current.moveX = 0;
              mobileInputRef.current.moveY = 0;
              mobileInputRef.current.sprinting = false;
            }}
          >
            <div
              className="w-11 h-11 rounded-full bg-amber-500/80 border border-white/40"
              style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
            />
          </div>

          {/* Right Action Cluster (Fire, Aim, Jump, Build, Reload, Interact) */}
          <div
            className="absolute pointer-events-auto flex flex-col items-end gap-2"
            style={{
              right: `${settings.touchLayout.fireX}%`,
              bottom: `${settings.touchLayout.fireY + 14}%`,
              transform: `scale(${settings.touchLayout.fireScale})`,
              transformOrigin: 'bottom right',
            }}
          >
            <div className="flex items-center gap-2">
              <button
                onTouchStart={() => {
                  mobileInputRef.current.reloadTrigger = true;
                }}
                className="w-12 h-12 rounded-full bg-slate-900/80 border border-slate-500 text-xs font-bold text-white"
              >
                REC
              </button>
              <button
                onTouchStart={() => {
                  mobileInputRef.current.buildToggleTrigger = true;
                }}
                className={`w-12 h-12 rounded-full border text-xs font-bold flex items-center justify-center ${
                  hud.buildingMode ? 'bg-cyan-500 text-slate-950 border-white' : 'bg-slate-900/80 border-slate-500 text-white'
                }`}
              >
                <Hammer className="w-5 h-5" />
              </button>
              <button
                onTouchStart={() => {
                  mobileInputRef.current.jumping = true;
                }}
                onTouchEnd={() => {
                  mobileInputRef.current.jumping = false;
                }}
                className="w-14 h-14 rounded-full bg-slate-900/80 border border-slate-400 text-xs font-bold text-white"
              >
                SALTO
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onTouchStart={() => {
                  mobileInputRef.current.interactTrigger = true;
                }}
                className="w-12 h-12 rounded-full bg-amber-600/85 border border-amber-300 text-xs font-bold text-white flex items-center justify-center"
              >
                <Package className="w-5 h-5" />
              </button>
              <button
                onTouchStart={() => {
                  mobileInputRef.current.aiming = !mobileInputRef.current.aiming;
                }}
                className="w-13 h-13 rounded-full bg-slate-900/80 border border-cyan-400 text-xs font-bold text-cyan-300"
              >
                MIRA
              </button>
              <button
                onTouchStart={() => {
                  if (hud.buildingMode) mobileInputRef.current.placeBuildTrigger = true;
                  else mobileInputRef.current.firing = true;
                }}
                onTouchEnd={() => {
                  mobileInputRef.current.firing = false;
                }}
                className="w-16 h-16 rounded-full bg-red-600/90 border-2 border-white text-xs font-bold text-white shadow-lg"
              >
                {hud.buildingMode ? 'PONER' : 'FUEGO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / ELIMINATION / SPECTATOR MODAL */}
      {(!hud.alive || hud.victory) && !spectatingDismissed && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center pointer-events-auto z-40 p-4">
          <div className="bg-[#141B26] border border-slate-700 rounded-xl max-w-md w-full p-6 text-center shadow-2xl">
            {hud.victory ? (
              <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            ) : (
              <div className="font-display text-3xl font-bold text-red-400 mb-2">ELIMINADO</div>
            )}
            <h2 className="font-display text-2xl font-bold text-white">
              {hud.victory ? '¡VICTORIA CAMPAL #1!' : `Posición #${hud.placement} de ${hud.totalCount}`}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Sobreviviste en la Survival Arena con {hud.kills} eliminaciones.
            </p>

            <div className="grid grid-cols-3 gap-3 my-5">
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400">Eliminaciones</div>
                <div className="font-mono-hud text-xl font-bold text-amber-400">{hud.kills}</div>
              </div>
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400">Daño</div>
                <div className="font-mono-hud text-xl font-bold text-white">{hud.damageDealt}</div>
              </div>
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400">Estructuras</div>
                <div className="font-mono-hud text-xl font-bold text-cyan-400">{hud.buildsPlaced}</div>
              </div>
            </div>

            {matchReward && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 mb-5 text-xs text-amber-300 font-mono-hud">
                Recompensa: +{matchReward.xpEarned} XP · +{matchReward.coinsEarned} Monedas
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              {!hud.victory && hud.spectatingName && (
                <button
                  onClick={() => setSpectatingDismissed(true)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-100 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" /> Espectar Partida
                </button>
              )}
              <button
                onClick={onExitMatch}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Volver al Menú
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spectator Floating Banner */}
      {!hud.alive && !hud.victory && spectatingDismissed && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#0B0F17]/90 border border-slate-700 rounded-lg px-5 py-2.5 flex items-center gap-4 pointer-events-auto z-40">
          <span className="text-xs text-slate-300">
            Espectando a <strong className="text-amber-400">{hud.spectatingName ?? 'Superviviente'}</strong>
          </span>
          <button
            onClick={onExitMatch}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
          >
            Salir al Menú
          </button>
        </div>
      )}

      {/* PAUSE MODAL */}
      {paused && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center pointer-events-auto z-50 p-4">
          <div className="bg-[#141B26] border border-slate-700 rounded-xl w-full max-w-sm p-6 space-y-3">
            <h2 className="font-display text-2xl font-bold text-white text-center mb-4">PARTIDA EN PAUSA</h2>
            <button
              onClick={onTogglePause}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-sm cursor-pointer"
            >
              Continuar Combate
            </button>
            <button
              onClick={onOpenSettings}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium py-2.5 rounded-lg text-sm cursor-pointer"
            >
              Configuración
            </button>
            <button
              onClick={onExitMatch}
              className="w-full bg-red-600/90 hover:bg-red-500 text-white font-medium py-2.5 rounded-lg text-sm cursor-pointer"
            >
              Abandonar Partida
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
