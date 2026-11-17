import * as THREE from 'three';
import { MaterialType } from '../shared/types';

function configureTex(tex: THREE.CanvasTexture, repeatX = 1, repeatY = 1, maxAniso = 4): THREE.CanvasTexture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrainTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5C7C47';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const sz = 1 + Math.random() * 3;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';
    ctx.fillRect(x, y, sz, sz);
  }

  return configureTex(new THREE.CanvasTexture(canvas), 60, 60, maxAniso);
}

export function createBuildTexture(material: MaterialType, maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (material === 'MADERA') {
    ctx.fillStyle = '#A8703D';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = 'rgba(45,24,10,0.45)';
      ctx.fillRect(0, y + 30, 256, 2);
    }
  } else if (material === 'PIEDRA') {
    ctx.fillStyle = '#7D8794';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      const offset = (row % 2) * 32;
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + offset;
        ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
        ctx.fillRect(x + 2, y + 2, 60, 28);
        ctx.strokeStyle = 'rgba(30,41,59,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, 62, 30);
      }
    }
  } else {
    ctx.fillStyle = '#536273';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(252, 252);
    ctx.moveTo(252, 4);
    ctx.lineTo(4, 252);
    ctx.stroke();
    // Rivets
    ctx.fillStyle = '#CBD5E1';
    for (const rx of [16, 240]) {
      for (const ry of [16, 128, 240]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return configureTex(new THREE.CanvasTexture(canvas), 1, 1, maxAniso);
}

export function createBuildingFacadeTexture(baseHex: string, accentHex: string, maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle architectural panels & lit windows
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const wx = 14 + col * 60;
      const wy = 14 + row * 60;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(wx, wy, 40, 38);
      if ((row + col) % 3 !== 0) {
        ctx.fillStyle = accentHex;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(wx + 3, wy + 3, 34, 32);
        ctx.globalAlpha = 1;
      }
    }
  }
  return configureTex(new THREE.CanvasTexture(canvas), 2, 2, maxAniso);
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
