import * as THREE from 'three';
import { CharacterCustomization } from '../../shared/types';
import { buildWeaponMesh } from './weaponModel';

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weaponMount: THREE.Group;
  parachuteGroup: THREE.Group;
  currentWeaponId: string;
  applyCustomization: (cust: CharacterCustomization) => void;
  setWeapon: (weaponId: string) => void;
  animate: (params: {
    time: number;
    speed: number;
    sprinting: boolean;
    crouching: boolean;
    sliding: boolean;
    aiming: boolean;
    parachuting: boolean;
    emoting: boolean;
    emoteId: string;
    recoil: number;
  }) => void;
}

export function createCharacterRig(
  cust: CharacterCustomization,
  initialWeaponId = 'ar_vanguard_common',
  castShadow = true
): CharacterRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cust.primaryColor),
    roughness: 0.48,
    metalness: 0.25,
  });
  const darkArmorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.4,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cust.accentColor),
    emissive: new THREE.Color(cust.accentColor),
    emissiveIntensity: 0.22,
    roughness: 0.28,
    metalness: 0.65,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd6a37a,
    roughness: 0.72,
    metalness: 0.05,
  });

  // Torso (primary + chest armor plate)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), primaryMat);
  torso.position.set(0, 1.12, 0);
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.36), darkArmorMat);
  chestPlate.position.set(0, 1.2, 0.01);
  chestPlate.castShadow = castShadow;
  bodyGroup.add(chestPlate);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.35), accentMat);
  belt.position.set(0, 0.81, 0);
  bodyGroup.add(belt);

  // Head Group
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.5, 0);
  bodyGroup.add(headGroup);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skinMat);
  head.position.set(0, 0.19, 0);
  head.castShadow = castShadow;
  headGroup.add(head);

  // Customization slot meshes
  const helmetGroup = new THREE.Group();
  const maskGroup = new THREE.Group();
  const backpackGroup = new THREE.Group();
  const accessoryGroup = new THREE.Group();
  headGroup.add(helmetGroup, maskGroup);
  bodyGroup.add(backpackGroup, accessoryGroup);

  // Arms
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.37, 1.38, 0);
  const lUpper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.18), primaryMat);
  lUpper.position.set(0, -0.24, 0);
  lUpper.castShadow = castShadow;
  leftArm.add(lUpper);
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.37, 1.38, 0);
  const rUpper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.18), primaryMat);
  rUpper.position.set(0, -0.24, 0);
  rUpper.castShadow = castShadow;
  rightArm.add(rUpper);
  bodyGroup.add(rightArm);

  // Weapon mount attached to right forearm
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.46, 0.22);
  rightArm.add(weaponMount);

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.78, 0);
  const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.74, 0.24), darkArmorMat);
  lLegMesh.position.set(0, -0.37, 0);
  lLegMesh.castShadow = castShadow;
  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.3), accentMat);
  lBoot.position.set(0, -0.7, 0.03);
  leftLeg.add(lLegMesh, lBoot);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.78, 0);
  const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.74, 0.24), darkArmorMat);
  rLegMesh.position.set(0, -0.37, 0);
  rLegMesh.castShadow = castShadow;
  const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.3), accentMat);
  rBoot.position.set(0, -0.7, 0.03);
  rightLeg.add(rLegMesh, rBoot);
  bodyGroup.add(rightLeg);

  // Parachute / Glider Canopy
  const parachuteGroup = new THREE.Group();
  parachuteGroup.position.set(0, 2.85, 0);
  parachuteGroup.visible = false;
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 0.14, 1.35),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.2 })
  );
  const cordL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), darkArmorMat);
  cordL.position.set(-0.9, -0.75, 0);
  cordL.rotation.z = -0.35;
  const cordR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), darkArmorMat);
  cordR.position.set(0.9, -0.75, 0);
  cordR.rotation.z = 0.35;
  parachuteGroup.add(wing, cordL, cordR);
  root.add(parachuteGroup);

  const clearGroup = (g: THREE.Group) => {
    while (g.children.length > 0) g.remove(g.children[0]);
  };

  const applyCustomization = (nextCust: CharacterCustomization) => {
    primaryMat.color.set(nextCust.primaryColor);
    accentMat.color.set(nextCust.accentColor);
    accentMat.emissive.set(nextCust.accentColor);

    if (nextCust.skin === 'skin_solaris') {
      primaryMat.metalness = 0.75;
      primaryMat.roughness = 0.25;
    } else if (nextCust.skin === 'skin_spectre') {
      primaryMat.metalness = 0.45;
      primaryMat.roughness = 0.35;
    } else {
      primaryMat.metalness = 0.25;
      primaryMat.roughness = 0.52;
    }

    // Helmet
    clearGroup(helmetGroup);
    if (nextCust.helmet === 'helmet_tactical') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.44), darkArmorMat);
      cap.position.set(0, 0.34, 0);
      helmetGroup.add(cap);
    } else if (nextCust.helmet === 'helmet_recon') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.25, 0.45), primaryMat);
      cap.position.set(0, 0.34, 0);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.06), accentMat);
      visor.position.set(0, 0.24, 0.2);
      helmetGroup.add(cap, visor);
    } else if (nextCust.helmet === 'helmet_apex') {
      const helm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.44, 0.46), primaryMat);
      helm.position.set(0, 0.21, 0);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.48), accentMat);
      crest.position.set(0, 0.45, 0);
      helmetGroup.add(helm, crest);
    }

    // Mask
    clearGroup(maskGroup);
    if (nextCust.mask === 'mask_bandana') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), darkArmorMat);
      m.position.set(0, 0.1, 0.02);
      maskGroup.add(m);
    } else if (nextCust.mask === 'mask_visor') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.12), accentMat);
      m.position.set(0, 0.24, 0.16);
      maskGroup.add(m);
    } else if (nextCust.mask === 'mask_oni') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.26, 0.12), accentMat);
      m.position.set(0, 0.15, 0.16);
      maskGroup.add(m);
    }

    // Backpack
    clearGroup(backpackGroup);
    if (nextCust.backpack === 'pack_field') {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.22), darkArmorMat);
      p.position.set(0, 1.15, -0.25);
      backpackGroup.add(p);
    } else if (nextCust.backpack === 'pack_reactor') {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), darkArmorMat);
      p.position.set(0, 1.15, -0.25);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), accentMat);
      core.rotation.x = Math.PI / 2;
      core.position.set(0, 1.18, -0.36);
      backpackGroup.add(p, core);
    } else if (nextCust.backpack === 'pack_wings') {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.18), primaryMat);
      p.position.set(0, 1.18, -0.24);
      const wL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.05), accentMat);
      wL.position.set(-0.36, 1.32, -0.28);
      wL.rotation.z = 0.35;
      const wR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.05), accentMat);
      wR.position.set(0.36, 1.32, -0.28);
      wR.rotation.z = -0.35;
      backpackGroup.add(p, wL, wR);
    }

    // Accessories
    clearGroup(accessoryGroup);
    if (nextCust.accessory === 'acc_pauldron') {
      const pL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.26), accentMat);
      pL.position.set(-0.4, 1.4, 0);
      const pR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.26), accentMat);
      pR.position.set(0.4, 1.4, 0);
      accessoryGroup.add(pL, pR);
    } else if (nextCust.accessory === 'acc_antenna') {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 6), accentMat);
      ant.position.set(-0.22, 1.68, -0.22);
      accessoryGroup.add(ant);
    }
  };

  let currentWeaponId = initialWeaponId;
  const setWeapon = (weaponId: string) => {
    if (currentWeaponId === weaponId && weaponMount.children.length > 0) return;
    currentWeaponId = weaponId;
    clearGroup(weaponMount);
    const wMesh = buildWeaponMesh(weaponId);
    weaponMount.add(wMesh);
  };

  applyCustomization(cust);
  setWeapon(initialWeaponId);

  const animate: CharacterRig['animate'] = ({
    time,
    speed,
    sprinting,
    crouching,
    sliding,
    aiming,
    parachuting,
    emoting,
    emoteId,
    recoil,
  }) => {
    parachuteGroup.visible = parachuting;

    if (emoting) {
      if (emoteId === 'emote_spin') {
        bodyGroup.rotation.y = (time * 6) % (Math.PI * 2);
        bodyGroup.position.y = Math.abs(Math.sin(time * 6)) * 0.25;
        leftArm.rotation.x = -Math.PI * 0.7;
        rightArm.rotation.x = -Math.PI * 0.7;
      } else if (emoteId === 'emote_pulse') {
        bodyGroup.rotation.y = Math.sin(time * 5) * 0.4;
        bodyGroup.position.y = Math.abs(Math.sin(time * 8)) * 0.14;
        leftArm.rotation.z = -0.7 + Math.sin(time * 8) * 0.5;
        rightArm.rotation.z = 0.7 - Math.sin(time * 8) * 0.5;
      } else {
        bodyGroup.rotation.y = 0;
        bodyGroup.position.y = 0;
        rightArm.rotation.x = -2.2;
        rightArm.rotation.z = 0.35;
        leftArm.rotation.x = 0.1;
      }
      return;
    }

    bodyGroup.rotation.y = 0;
    const strideFreq = sprinting ? 12 : 8;
    const moveBlend = Math.min(1, speed / 4);
    const swing = Math.sin(time * strideFreq) * (sprinting ? 0.75 : 0.5) * moveBlend;

    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;

    if (sliding) {
      bodyGroup.position.y = -0.55;
      bodyGroup.rotation.x = -0.55;
      leftLeg.rotation.x = -0.9;
      rightLeg.rotation.x = -0.5;
    } else if (crouching) {
      bodyGroup.position.y = -0.35;
      bodyGroup.rotation.x = 0.2;
    } else {
      bodyGroup.position.y = Math.abs(Math.sin(time * strideFreq)) * 0.05 * moveBlend;
      bodyGroup.rotation.x = sprinting ? 0.12 : 0;
    }

    // Weapon holding pose
    if (aiming || recoil > 0.01) {
      rightArm.rotation.x = -Math.PI / 2 + recoil * 0.4;
      rightArm.rotation.z = 0.1;
      leftArm.rotation.x = -Math.PI / 2 + 0.15;
      leftArm.rotation.z = -0.35;
    } else {
      rightArm.rotation.x = -0.75 - swing * 0.25;
      rightArm.rotation.z = 0;
      leftArm.rotation.x = -0.35 + swing * 0.45;
      leftArm.rotation.z = -0.15;
    }
  };

  return {
    root,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    parachuteGroup,
    currentWeaponId,
    applyCustomization,
    setWeapon,
    animate,
  };
}
