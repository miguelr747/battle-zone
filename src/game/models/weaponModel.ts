import * as THREE from 'three';
import { WeaponDef } from '../../shared/types';
import { WEAPON_MAP } from '../../shared/weapons';

export function buildWeaponMesh(weaponId: string): THREE.Group {
  const def: WeaponDef | undefined = WEAPON_MAP.get(weaponId);
  const group = new THREE.Group();
  const cat = def?.category ?? 'FUSIL';
  const rarityHex = def?.color ?? '#94A3B8';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.32,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.88,
    roughness: 0.22,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rarityHex),
    emissive: new THREE.Color(rarityHex),
    emissiveIntensity: 0.35,
    metalness: 0.5,
    roughness: 0.35,
  });

  if (cat === 'PISTOLA') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.28), bodyMat);
    slide.position.set(0, 0.08, 0.06);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), barrelMat);
    grip.position.set(0, -0.01, -0.03);
    grip.rotation.x = -0.22;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.03), trimMat);
    sight.position.set(0, 0.135, 0.16);
    group.add(slide, grip, sight);
  } else if (cat === 'ESCOPETA') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.36), bodyMat);
    receiver.position.set(0, 0.05, 0.05);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.48, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.08, 0.42);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.065, 0.2), trimMat);
    pump.position.set(0, 0.03, 0.36);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.24), barrelMat);
    stock.position.set(0, 0.02, -0.22);
    group.add(receiver, barrel, pump, stock);
  } else if (cat === 'FRANCOTIRADOR') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.45), bodyMat);
    receiver.position.set(0, 0.05, 0.04);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.68, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.07, 0.56);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.26, 10), barrelMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.15, 0.08);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10), trimMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.15, 0.21);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.09), trimMat);
    mag.position.set(0, -0.05, 0.08);
    group.add(receiver, barrel, scope, lens, mag);
  } else if (cat === 'EXPLOSIVO') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.95, 12), bodyMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.08, 0.15);
    const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.22, 12), trimMat);
    warhead.rotation.x = Math.PI / 2;
    warhead.position.set(0, 0.08, 0.68);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), barrelMat);
    grip.position.set(0, -0.04, 0.05);
    group.add(tube, warhead, grip);
  } else if (cat === 'ESPECIAL') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.62), bodyMat);
    hull.position.set(0, 0.06, 0.16);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.42, 12), trimMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0.09, 0.25);
    const emitter = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.015, 8, 16), trimMat);
    emitter.position.set(0, 0.06, 0.5);
    group.add(hull, core, emitter);
  } else {
    // FUSIL / SUBFUSIL
    const isSmg = cat === 'SUBFUSIL';
    const len = isSmg ? 0.34 : 0.46;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, len), bodyMat);
    receiver.position.set(0, 0.05, 0.08);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, isSmg ? 0.24 : 0.38, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.065, isSmg ? 0.34 : 0.44);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 0.075), trimMat);
    mag.position.set(0, -0.07, 0.14);
    mag.rotation.x = 0.18;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.1, 0.22), barrelMat);
    stock.position.set(0, 0.03, -0.18);
    group.add(receiver, barrel, mag, stock);
  }

  return group;
}
