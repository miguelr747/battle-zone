import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CharacterCustomization, VehicleKind } from '../shared/types';
import { createCharacterRig, CharacterRig } from './models/characterModel';
import { createVehicleRig } from './models/vehicleModel';
import { createContactShadowTexture } from './textures';

interface CharacterStageCanvasProps {
  customization: CharacterCustomization;
  previewEmote?: boolean;
  showcaseVehicle?: VehicleKind | null;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

export const CharacterStageCanvas: React.FC<CharacterStageCanvasProps> = ({
  customization,
  previewEmote = false,
  showcaseVehicle = null,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<CharacterRig | null>(null);
  const emoteRef = useRef(previewEmote);
  const custRef = useRef(customization);
  const vehicleKindRef = useRef(showcaseVehicle);
  const rebuildVehicleRef = useRef<((kind: VehicleKind | null) => void) | null>(null);

  useEffect(() => {
    emoteRef.current = previewEmote;
  }, [previewEmote]);

  useEffect(() => {
    custRef.current = customization;
    if (rigRef.current) {
      rigRef.current.applyCustomization(customization);
    }
  }, [customization]);

  useEffect(() => {
    vehicleKindRef.current = showcaseVehicle;
    if (rebuildVehicleRef.current) {
      rebuildVehicleRef.current(showcaseVehicle);
    }
  }, [showcaseVehicle]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.032);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0.6, 1.85, 5.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3-point tactical combat diorama lighting
    const hemi = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.4);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    // Tactical combat stage platform & backdrop pillars
    const stageGroup = new THREE.Group();
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 2.6, 0.35, 32),
      new THREE.MeshStandardMaterial({ color: 0x141b26, metalness: 0.65, roughness: 0.35 })
    );
    plinth.position.y = -0.175;
    plinth.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.32, 0.04, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.65,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85, metalness: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.35;
    floor.receiveShadow = true;
    stageGroup.add(plinth, ring, floor);

    // Distant tactical ruined pillars & skyline silhouettes
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.35 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.45,
    });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dist = 12 + (i % 2) * 4;
      const h = 4 + (i % 3) * 3;
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.4), pillarMat);
      col.position.set(Math.cos(ang) * dist, h / 2 - 0.35, Math.sin(ang) * dist);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 1.45), glowMat);
      strip.position.set(col.position.x, h - 0.8, col.position.z);
      stageGroup.add(col, strip);
    }

    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({
        map: createContactShadowTexture(),
        transparent: true,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.015;
    stageGroup.add(contactShadow);
    scene.add(stageGroup);

    // Character Rig
    const charRig = createCharacterRig(custRef.current, 'ar_pulso_epic', !isSoftwareGl);
    scene.add(charRig.root);
    rigRef.current = charRig;

    // Optional Garage Vehicle Showcase
    let vehicleGroup: THREE.Group | null = null;
    const setVehicle = (kind: VehicleKind | null) => {
      if (vehicleGroup) {
        scene.remove(vehicleGroup);
        vehicleGroup = null;
      }
      if (kind) {
        charRig.root.visible = false;
        const vRig = createVehicleRig(kind, !isSoftwareGl);
        vRig.root.scale.setScalar(0.76);
        vehicleGroup = vRig.root;
        scene.add(vehicleGroup);
      } else {
        charRig.root.visible = true;
      }
    };
    rebuildVehicleRef.current = setVehicle;
    setVehicle(vehicleKindRef.current);

    // Pointer drag rotation on stage
    let userYaw = 0.25;
    let dragging = false;
    let lastX = 0;
    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      userYaw += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
    };
    const onUp = () => {
      dragging = false;
    };
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.getElapsedTime();

      if (!dragging) {
        userYaw += dt * (vehicleGroup ? 0.35 : 0.18);
      }

      if (vehicleGroup) {
        vehicleGroup.rotation.y = userYaw;
        camera.position.lerp(new THREE.Vector3(0.4, 2.1, 5.8), 0.08);
        camera.lookAt(0, 0.85, 0);
      } else {
        charRig.root.rotation.y = userYaw;
        charRig.animate({
          time: t,
          speed: 0,
          sprinting: false,
          crouching: false,
          sliding: false,
          aiming: false,
          parachuting: false,
          emoting: emoteRef.current,
          emoteId: custRef.current.emote,
          recoil: 0,
        });
        camera.position.lerp(new THREE.Vector3(-0.35, 1.45, 4.1), 0.08);
        camera.lookAt(-0.15, 1.15, 0);
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (dom.parentNode === container) container.removeChild(dom);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
};
