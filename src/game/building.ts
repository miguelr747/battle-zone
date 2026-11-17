import * as THREE from 'three';
import { BuildEditShape, BuildPieceState, BuildPieceType, MaterialType } from '../shared/types';
import { GRID_SIZE } from '../shared/worldGen';
import { createBuildTexture } from './textures';

const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 0.28;

export class BuildingRenderer {
  private scene: THREE.Scene;
  private meshes = new Map<string, THREE.Group>();
  private materials: Record<MaterialType, THREE.MeshStandardMaterial>;
  private ghostGroup: THREE.Group;
  private ghostMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, maxAniso = 4) {
    this.scene = scene;
    this.materials = {
      MADERA: new THREE.MeshStandardMaterial({
        map: createBuildTexture('MADERA', maxAniso),
        roughness: 0.78,
        metalness: 0.05,
      }),
      PIEDRA: new THREE.MeshStandardMaterial({
        map: createBuildTexture('PIEDRA', maxAniso),
        roughness: 0.88,
        metalness: 0.08,
      }),
      METAL: new THREE.MeshStandardMaterial({
        map: createBuildTexture('METAL', maxAniso),
        roughness: 0.35,
        metalness: 0.82,
      }),
    };

    this.ghostMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);
  }

  private buildPieceGeometryGroup(
    type: BuildPieceType,
    editShape: BuildEditShape,
    mat: THREE.Material,
    castShadow: boolean
  ): THREE.Group {
    const g = new THREE.Group();

    if (type === 'PARED') {
      if (editShape === 'SOLIDA') {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, WALL_HEIGHT, WALL_THICKNESS), mat);
        wall.position.set(0, WALL_HEIGHT / 2, 0);
        wall.castShadow = castShadow;
        wall.receiveShadow = true;
        g.add(wall);
      } else if (editShape === 'PUERTA') {
        // Left pillar, right pillar, top lintel (doorway 1.5m wide x 2.3m tall)
        const sideW = (GRID_SIZE - 1.5) / 2;
        const pL = new THREE.Mesh(new THREE.BoxGeometry(sideW, WALL_HEIGHT, WALL_THICKNESS), mat);
        pL.position.set(-GRID_SIZE / 2 + sideW / 2, WALL_HEIGHT / 2, 0);
        const pR = new THREE.Mesh(new THREE.BoxGeometry(sideW, WALL_HEIGHT, WALL_THICKNESS), mat);
        pR.position.set(GRID_SIZE / 2 - sideW / 2, WALL_HEIGHT / 2, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, WALL_HEIGHT - 2.3, WALL_THICKNESS), mat);
        top.position.set(0, 2.3 + (WALL_HEIGHT - 2.3) / 2, 0);
        pL.castShadow = pR.castShadow = top.castShadow = castShadow;
        pL.receiveShadow = pR.receiveShadow = top.receiveShadow = true;
        g.add(pL, pR, top);
      } else if (editShape === 'VENTANA') {
        const sideW = (GRID_SIZE - 1.5) / 2;
        const pL = new THREE.Mesh(new THREE.BoxGeometry(sideW, WALL_HEIGHT, WALL_THICKNESS), mat);
        pL.position.set(-GRID_SIZE / 2 + sideW / 2, WALL_HEIGHT / 2, 0);
        const pR = new THREE.Mesh(new THREE.BoxGeometry(sideW, WALL_HEIGHT, WALL_THICKNESS), mat);
        pR.position.set(GRID_SIZE / 2 - sideW / 2, WALL_HEIGHT / 2, 0);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, WALL_THICKNESS), mat);
        sill.position.set(0, 1.15 / 2, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, WALL_HEIGHT - 2.35, WALL_THICKNESS), mat);
        top.position.set(0, 2.35 + (WALL_HEIGHT - 2.35) / 2, 0);
        pL.castShadow = pR.castShadow = sill.castShadow = top.castShadow = castShadow;
        g.add(pL, pR, sill, top);
      } else {
        // ABERTURA (wide arch)
        const sideW = (GRID_SIZE - 2.2) / 2;
        const pL = new THREE.Mesh(new THREE.BoxGeometry(sideW, WALL_HEIGHT, WALL_THICKNESS), mat);
        pL.position.set(-GRID_SIZE / 2 + sideW / 2, WALL_HEIGHT / 2, 0);
        const pR = new THREE.Mesh(new THREE.BoxGeometry(sideW, WALL_HEIGHT, WALL_THICKNESS), mat);
        pR.position.set(GRID_SIZE / 2 - sideW / 2, WALL_HEIGHT / 2, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, WALL_HEIGHT - 2.5, WALL_THICKNESS), mat);
        top.position.set(0, 2.5 + (WALL_HEIGHT - 2.5) / 2, 0);
        g.add(pL, pR, top);
      }
    } else if (type === 'PISO') {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, 0.22, GRID_SIZE), mat);
      floor.position.set(0, 0.08, 0);
      floor.receiveShadow = true;
      floor.castShadow = castShadow;
      g.add(floor);
    } else if (type === 'RAMPA') {
      const len = Math.hypot(GRID_SIZE, WALL_HEIGHT);
      const angle = Math.atan2(WALL_HEIGHT, GRID_SIZE);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, 0.22, len), mat);
      ramp.position.set(0, WALL_HEIGHT / 2, 0);
      ramp.rotation.x = -angle;
      ramp.castShadow = castShadow;
      ramp.receiveShadow = true;
      g.add(ramp);
    } else {
      // TECHO (Pyramid / roof)
      const cone = new THREE.Mesh(new THREE.ConeGeometry(GRID_SIZE * 0.72, 2.1, 4), mat);
      cone.position.set(0, 1.05, 0);
      cone.rotation.y = Math.PI / 4;
      cone.castShadow = castShadow;
      cone.receiveShadow = true;
      g.add(cone);
    }

    return g;
  }

  public syncBuilds(builds: BuildPieceState[], castShadows: boolean) {
    const activeIds = new Set<string>();

    for (const bp of builds) {
      activeIds.add(bp.id);
      let grp = this.meshes.get(bp.id);
      const sig = `${bp.type}_${bp.material}_${bp.editShape}`;

      if (!grp || grp.userData.sig !== sig) {
        if (grp) this.scene.remove(grp);
        const mat = this.materials[bp.material].clone();
        grp = this.buildPieceGeometryGroup(bp.type, bp.editShape, mat, castShadows);
        grp.userData.sig = sig;
        grp.userData.mat = mat;
        this.scene.add(grp);
        this.meshes.set(bp.id, grp);
      }

      grp.position.set(bp.x, bp.y, bp.z);
      grp.rotation.y = bp.rotationY;

      // Construction scale-in & damage darkening
      const prog = Math.max(0.2, Math.min(1, bp.buildProgress));
      grp.scale.set(1, prog, 1);
      const mat = grp.userData.mat as THREE.MeshStandardMaterial;
      const hpRatio = Math.max(0.25, bp.hp / bp.maxHp);
      mat.opacity = 0.55 + prog * 0.45;
      mat.transparent = prog < 0.99;
      mat.color.setRGB(hpRatio * 0.6 + 0.4, hpRatio * 0.6 + 0.4, hpRatio * 0.6 + 0.4);
    }

    for (const [id, grp] of this.meshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(grp);
        this.meshes.delete(id);
      }
    }
  }

  public updateGhost(
    visible: boolean,
    type: BuildPieceType,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    canAfford: boolean
  ) {
    this.ghostGroup.visible = visible;
    if (!visible) return;

    if (this.ghostGroup.userData.type !== type) {
      while (this.ghostGroup.children.length > 0) {
        this.ghostGroup.remove(this.ghostGroup.children[0]);
      }
      const preview = this.buildPieceGeometryGroup(type, 'SOLIDA', this.ghostMat, false);
      this.ghostGroup.add(preview);
      this.ghostGroup.userData.type = type;
    }

    this.ghostMat.color.setHex(canAfford ? 0x06b6d4 : 0xef4444);
    this.ghostMat.emissive.setHex(canAfford ? 0x06b6d4 : 0xef4444);
    this.ghostGroup.position.set(x, y, z);
    this.ghostGroup.rotation.y = rotationY;
  }
}
