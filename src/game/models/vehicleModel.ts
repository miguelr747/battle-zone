import * as THREE from 'three';
import { VehicleKind } from '../../shared/types';

export interface VehicleRig {
  root: THREE.Group;
  wheels: THREE.Object3D[];
}

export function createVehicleRig(kind: VehicleKind, castShadow = true): VehicleRig {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    roughness: 0.15,
    metalness: 0.7,
    transparent: true,
    opacity: 0.72,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 0.85,
  });

  const makeWheel = (radius: number, width: number, x: number, y: number, z: number) => {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = castShadow;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.02, 10), rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(tire, rim);
    root.add(wg);
    wheels.push(wg);
  };

  if (kind === 'AUTO') {
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x2563eb,
      roughness: 0.25,
      metalness: 0.7,
      clearcoat: 0.9,
    });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.68, 4.3), bodyMat);
    chassis.position.set(0, 0.7, 0);
    chassis.castShadow = castShadow;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 2.0), glassMat);
    cabin.position.set(0, 1.3, -0.15);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.12, 1.85), bodyMat);
    roof.position.set(0, 1.62, -0.15);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.35), rimMat);
    spoiler.position.set(0, 1.22, -1.98);
    const headL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.1), headlightMat);
    headL.position.set(-0.68, 0.75, 2.15);
    const headR = headL.clone();
    headR.position.x = 0.68;

    root.add(chassis, cabin, roof, spoiler, headL, headR);
    makeWheel(0.42, 0.3, -1.05, 0.42, 1.32);
    makeWheel(0.42, 0.3, 1.05, 0.42, 1.32);
    makeWheel(0.42, 0.3, -1.05, 0.42, -1.32);
    makeWheel(0.42, 0.3, 1.05, 0.42, -1.32);
  } else if (kind === 'MOTO') {
    const fairingMat = new THREE.MeshPhysicalMaterial({
      color: 0xef4444,
      roughness: 0.22,
      metalness: 0.6,
      clearcoat: 0.9,
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 1.65), fairingMat);
    frame.position.set(0, 0.68, 0);
    frame.castShadow = castShadow;
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.08), glassMat);
    windshield.position.set(0, 1.05, 0.68);
    windshield.rotation.x = -0.45;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), rimMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 1.02, 0.56);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.1), headlightMat);
    head.position.set(0, 0.82, 0.85);
    root.add(frame, windshield, handle, head);
    makeWheel(0.38, 0.2, 0, 0.38, 0.82);
    makeWheel(0.38, 0.22, 0, 0.38, -0.82);
  } else {
    // TODOTERRENO 4x4
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.42,
      metalness: 0.45,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.5 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.85, 4.5), bodyMat);
    hull.position.set(0, 0.95, 0);
    hull.castShadow = castShadow;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.75, 2.2), glassMat);
    cab.position.set(0, 1.72, 0.15);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 2.25), darkMat);
    roof.position.set(0, 2.12, 0.15);
    const bullbar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 0.2), rimMat);
    bullbar.position.set(0, 0.88, 2.32);
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.16), headlightMat);
    lightBar.position.set(0, 2.24, 1.15);
    root.add(hull, cab, roof, bullbar, lightBar);

    makeWheel(0.56, 0.42, -1.18, 0.56, 1.42);
    makeWheel(0.56, 0.42, 1.18, 0.56, 1.42);
    makeWheel(0.56, 0.42, -1.18, 0.56, -1.42);
    makeWheel(0.56, 0.42, 1.18, 0.56, -1.42);
  }

  return { root, wheels };
}
