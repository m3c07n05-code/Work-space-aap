import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Layers,
  Eye,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface CrdNodeMeta {
  id: string;
  title: string;
  category: 'CORE' | 'WORK' | 'GATE';
  rule: string;
  status: string;
}

const CRD_NODES_META: CrdNodeMeta[] = [
  {
    id: 'DUAL-KEY-CORE',
    title: 'แกนกลาง Dual-Key Cryptographic Ledger',
    category: 'CORE',
    rule: 'แยกเลขสมาชิก 5 หลัก (Leading Zero) ออกจาก NewLoanID ระดับสัญญา ห้ามรวมข้อมูลข้ามสัญญาเด็ดขาด',
    status: 'ทำงานปกติ · 00_Project_Manifest.json',
  },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `WORK-${i + 1}`,
    title: `WORK ${i + 1} · สายงานประมวลผลสัญญา CRD`,
    category: 'WORK' as const,
    rule:
      i === 0
        ? 'คัดแยกสัญญา พม. 1 สัญญา กับกลุ่มหลายสัญญาแบบอัตโนมัติ (V003 Format Control)'
        : i === 3
          ? 'เตรียมชุดพิมพ์จดหมายแจ้งหนี้ 9 หมวด และบันทึก Tracking EMS เข้า Staging'
          : `โมดูลปฏิบัติการลำดับที่ ${i + 1} ภายใต้การควบคุม 16 Stop Gates & Zero-PII`,
    status: 'เชื่อมต่อ Dual-Key · ผ่านเกณฑ์ V003',
  })),
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `GATE-${String(i + 1).padStart(2, '0')}`,
    title: `Stop Gate ${String(i + 1).padStart(2, '0')} · ด่านตรวจสอบความปลอดภัย`,
    category: 'GATE' as const,
    rule:
      i === 0
        ? 'ตรวจสอบความครบถ้วนของเลขสมาชิก 5 หลักและคำนำหน้า 0'
        : i === 2
          ? 'PDPA Zero-PII Shield บล็อกเลขบัตร/ชื่อ-สกุลก่อนซิงก์ออกภายนอก'
          : `ตรวจสอบ Integrity ด่านที่ ${i + 1} ก่อนเขียนผลลง Google Drive Manifest`,
    status: 'PASSED · 100%',
  })),
];

type CameraPreset = 'overview' | 'core' | 'works' | 'gates';
type FinishMode = 'metallic' | 'crystal' | 'slate';

// Pre-allocated zero-GC scratch math helpers for 60fps loop
const _vec3 = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createProceduralDeckTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d8e2ee';
  ctx.fillRect(0, 0, 512, 512);

  // Fine radial measurement rings & grid
  ctx.strokeStyle = 'rgba(20, 36, 58, 0.08)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(29, 78, 216, 0.14)';
  ctx.lineWidth = 2;
  [110, 185, 240].forEach((r) => {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 126);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const CrdArchitecture3DView: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [finishMode, setFinishMode] = useState<FinishMode>('metallic');
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedNode, setSelectedNode] = useState<CrdNodeMeta>(CRD_NODES_META[0]);
  const [webglLost, setWebglLost] = useState(false);

  // Stable refs read inside WebGL animation loop without re-initializing scene
  const explodeRef = useRef(0);
  const finishRef = useRef<FinishMode>('metallic');
  const isPlayingRef = useRef(true);
  const presetTriggerRef = useRef<CameraPreset | null>(null);

  useEffect(() => {
    explodeRef.current = explodeFactor;
  }, [explodeFactor]);

  useEffect(() => {
    finishRef.current = finishMode;
  }, [finishMode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const handleSelectPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    presetTriggerRef.current = preset;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const bgHex = 0xe3ebf4;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.018);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 180);
    camera.position.set(13, 10.5, 16);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => {
      setWebglLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Mandatory studio environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 6;
    controls.maxDistance = 32;
    controls.target.set(0, 1.4, 0);

    controls.addEventListener('start', () => {
      presetTriggerRef.current = null;
    });

    // Studio 3-point warm/cool lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x475569, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.85);
    keyLight.position.set(11, 18, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 45;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-12, 9, -11);
    scene.add(rimLight);

    // Textures
    const deckTex = createProceduralDeckTexture();
    deckTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();

    // Floor Stage
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      map: deckTex,
      roughness: 0.72,
      metalness: 0.12,
    });
    const stageMesh = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.4, 0.3, 64), stageMat);
    stageMesh.position.y = -0.15;
    stageMesh.receiveShadow = true;
    scene.add(stageMesh);

    const gridRingMat = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ringOverlay = new THREE.Mesh(new THREE.RingGeometry(5.3, 5.38, 72), gridRingMat);
    ringOverlay.rotation.x = -Math.PI / 2;
    ringOverlay.position.y = 0.02;
    scene.add(ringOverlay);

    // Materials (varied roughness & metalness)
    const brushedMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.22,
      anisotropy: 0.7,
    });
    const matteCeramicMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.08,
      roughness: 0.62,
    });
    const sapphireGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      metalness: 0.05,
      roughness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.45 : 1,
      ior: 1.55,
      thickness: 1.2,
      clearcoat: 1.0,
    });
    const accentGoldMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.72,
      roughness: 0.24,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.18,
    });
    const gatePassMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.35,
      roughness: 0.35,
      emissive: 0x059669,
      emissiveIntensity: 0.22,
    });

    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });

    const clickables: THREE.Object3D[] = [];
    const registerClickable = (mesh: THREE.Object3D, metaId: string) => {
      mesh.layers.enable(1);
      mesh.userData.metaId = metaId;
      clickables.push(mesh);
    };

    // --- 1. HERO COMPOSITE SUBJECT: DUAL-KEY LEDGER CORE (7 Parts, bottom-center pivot y=0) ---
    const dualKeyCore = new THREE.Group();
    scene.add(dualKeyCore);

    const coreShadow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), shadowPlaneMat);
    coreShadow.rotation.x = -Math.PI / 2;
    coreShadow.position.y = 0.01;
    dualKeyCore.add(coreShadow);

    // Part 1: Stepped Plinth
    const corePlinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 0.45, 32), brushedMetalMat);
    corePlinth.position.y = 0.225;
    corePlinth.castShadow = true;
    corePlinth.receiveShadow = true;
    dualKeyCore.add(corePlinth);

    // Part 2: Ceramic Collar
    const coreCollar = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.32, 32), matteCeramicMat);
    coreCollar.position.y = 0.61;
    coreCollar.castShadow = true;
    dualKeyCore.add(coreCollar);

    // Part 3: Lathe Rotor Housing (Lower Key: Mem_ID 5-Digit)
    const lathePoints = [
      new THREE.Vector2(0.4, 0),
      new THREE.Vector2(1.35, 0.1),
      new THREE.Vector2(1.45, 0.45),
      new THREE.Vector2(1.15, 0.72),
      new THREE.Vector2(0.55, 0.78),
    ];
    const latheGeo = new THREE.LatheGeometry(lathePoints, 32);
    const memKeyRotor = new THREE.Mesh(latheGeo, brushedMetalMat);
    memKeyRotor.position.y = 0.85;
    memKeyRotor.castShadow = true;
    dualKeyCore.add(memKeyRotor);

    // Part 4: Crystalline Dual-Key Prism Vault (Explodable Layer)
    const prismCoreGroup = new THREE.Group();
    prismCoreGroup.position.y = 1.9;
    dualKeyCore.add(prismCoreGroup);

    const crystalVault = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), sapphireGlassMat);
    crystalVault.castShadow = true;
    prismCoreGroup.add(crystalVault);

    const innerAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.2, 20), accentGoldMat);
    prismCoreGroup.add(innerAxis);

    // Part 5 & 6: Orbital Dual Rings
    const keyRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.075, 16, 48), accentGoldMat);
    keyRing1.rotation.x = Math.PI / 2;
    prismCoreGroup.add(keyRing1);

    const keyRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.055, 16, 48), matteCeramicMat);
    keyRing2.rotation.x = Math.PI / 3;
    prismCoreGroup.add(keyRing2);

    // Part 7: Top Telemetry Crown
    const crownGroup = new THREE.Group();
    crownGroup.position.y = 3.2;
    dualKeyCore.add(crownGroup);
    const crownMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.05, 0.35, 6), brushedMetalMat);
    crownMesh.castShadow = true;
    crownGroup.add(crownMesh);

    const coreProxy = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 3.6, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    coreProxy.position.y = 1.8;
    dualKeyCore.add(coreProxy);
    registerClickable(coreProxy, 'DUAL-KEY-CORE');

    // --- 2. NINE CRD WORK STATIONS (Composite 5-part Group + TubeGeometry conduits) ---
    const workStationGroups: THREE.Group[] = [];
    const hexShape = new THREE.Shape();
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const hx = Math.cos(a) * 0.68;
      const hy = Math.sin(a) * 0.68;
      if (s === 0) hexShape.moveTo(hx, hy);
      else hexShape.lineTo(hx, hy);
    }
    hexShape.closePath();
    const hexGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: 0.7,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 2,
    });
    hexGeo.rotateX(-Math.PI / 2);

    const workRadius = 5.4;
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const wx = Math.cos(angle) * workRadius;
      const wz = Math.sin(angle) * workRadius;

      const station = new THREE.Group();
      station.position.set(wx, 0, wz);
      station.lookAt(0, 0, 0);
      scene.add(station);
      workStationGroups.push(station);

      const stShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), shadowPlaneMat);
      stShadow.rotation.x = -Math.PI / 2;
      stShadow.position.y = 0.015;
      station.add(stShadow);

      const stBase = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.88, 0.25, 16), brushedMetalMat);
      stBase.position.y = 0.125;
      stBase.castShadow = true;
      station.add(stBase);

      const stBody = new THREE.Mesh(hexGeo, matteCeramicMat);
      stBody.position.y = 0.26;
      stBody.castShadow = true;
      station.add(stBody);

      const stCollar = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 12, 24), accentGoldMat);
      stCollar.rotation.x = Math.PI / 2;
      stCollar.position.y = 1.05;
      station.add(stCollar);

      const stCap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.45, 6), sapphireGlassMat);
      stCap.position.y = 1.35;
      station.add(stCap);

      // TubeGeometry conduit linking each WORK station to Core
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(wx * 0.38, 0.35, wz * 0.38),
        new THREE.Vector3(wx * 0.65, 0.18, wz * 0.65),
        new THREE.Vector3(wx * 0.88, 0.32, wz * 0.88),
      ]);
      const conduitGeo = new THREE.TubeGeometry(curve, 16, 0.055, 8, false);
      const conduit = new THREE.Mesh(conduitGeo, brushedMetalMat);
      scene.add(conduit);

      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.8, 1.5),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      proxy.position.y = 0.9;
      station.add(proxy);
      registerClickable(proxy, `WORK-${i + 1}`);
    }

    // --- 3. 16 STOP GATES OUTER SECURITY RING (Composite 4-part Pylon Groups) ---
    const gateGroups: THREE.Group[] = [];
    const gateRadius = 9.4;
    const pillarGeo = new THREE.BoxGeometry(0.16, 1.4, 0.16);
    const archGeo = new THREE.BoxGeometry(0.95, 0.16, 0.22);
    const gateBaseGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.18, 12);

    for (let g = 0; g < 16; g++) {
      const angle = (g / 16) * Math.PI * 2;
      const gx = Math.cos(angle) * gateRadius;
      const gz = Math.sin(angle) * gateRadius;

      const gateGroup = new THREE.Group();
      gateGroup.position.set(gx, 0, gz);
      gateGroup.lookAt(0, 0, 0);
      scene.add(gateGroup);
      gateGroups.push(gateGroup);

      const gBase = new THREE.Mesh(gateBaseGeo, brushedMetalMat);
      gBase.position.y = 0.09;
      gBase.castShadow = true;
      gateGroup.add(gBase);

      const leftPillar = new THREE.Mesh(pillarGeo, matteCeramicMat);
      leftPillar.position.set(-0.34, 0.85, 0);
      leftPillar.castShadow = true;
      gateGroup.add(leftPillar);

      const rightPillar = new THREE.Mesh(pillarGeo, matteCeramicMat);
      rightPillar.position.set(0.34, 0.85, 0);
      rightPillar.castShadow = true;
      gateGroup.add(rightPillar);

      const topBar = new THREE.Mesh(archGeo, gatePassMat);
      topBar.position.set(0, 1.56, 0);
      gateGroup.add(topBar);

      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.8, 0.8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      proxy.position.y = 0.9;
      gateGroup.add(proxy);
      registerClickable(proxy, `GATE-${String(g + 1).padStart(2, '0')}`);
    }

    // --- 4. INSTANCED DATA PACKETS FLOWING AROUND TRACKS (48 Instances) ---
    const PACKET_COUNT = 48;
    const packetGeo = new THREE.BoxGeometry(0.22, 0.14, 0.34);
    const packetMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.4,
      roughness: 0.25,
      emissive: 0x2563eb,
      emissiveIntensity: 0.3,
    });
    const packetInstances = new THREE.InstancedMesh(packetGeo, packetMat, PACKET_COUNT);
    packetInstances.frustumCulled = false;
    scene.add(packetInstances);
    packetInstances.computeBoundingSphere();

    // Raycaster on layer 1
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickables, false);
      if (hits.length > 0) {
        const metaId = hits[0].object.userData.metaId as string;
        const found = CRD_NODES_META.find((n) => n.id === metaId);
        if (found) {
          setSelectedNode(found);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // Resize handling
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Pre-warm shaders on GPU devices
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Software WebGL afterDraw helper
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

    const clock = new THREE.Clock();
    let packetElapsed = 0;
    let currentExplode = 0;
    let lastAppliedFinish: FinishMode = 'metallic';

    const applyFinishMaterials = (mode: FinishMode) => {
      if (mode === 'metallic') {
        brushedMetalMat.color.setHex(0x334155);
        brushedMetalMat.metalness = 0.88;
        brushedMetalMat.roughness = 0.22;
        accentGoldMat.color.setHex(0x2563eb);
        accentGoldMat.emissive.setHex(0x1d4ed8);
      } else if (mode === 'crystal') {
        brushedMetalMat.color.setHex(0x94a3b8);
        brushedMetalMat.metalness = 0.45;
        brushedMetalMat.roughness = 0.14;
        accentGoldMat.color.setHex(0x0ea5e9);
        accentGoldMat.emissive.setHex(0x0284c7);
      } else {
        brushedMetalMat.color.setHex(0x1e293b);
        brushedMetalMat.metalness = 0.25;
        brushedMetalMat.roughness = 0.68;
        accentGoldMat.color.setHex(0x0f766e);
        accentGoldMat.emissive.setHex(0x0d9488);
      }
    };

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);

      if (finishRef.current !== lastAppliedFinish) {
        lastAppliedFinish = finishRef.current;
        applyFinishMaterials(lastAppliedFinish);
      }

      if (isPlayingRef.current) {
        packetElapsed += dt;
        memKeyRotor.rotation.y += dt * 0.35;
        prismCoreGroup.rotation.y -= dt * 0.45;
        keyRing2.rotation.z += dt * 0.28;
      }

      // Smooth exponential damping for Exploded View layers
      currentExplode = THREE.MathUtils.damp(currentExplode, explodeRef.current, 6, dt);
      prismCoreGroup.position.y = 1.9 + currentExplode * 1.4;
      crownGroup.position.y = 3.2 + currentExplode * 2.6;
      workStationGroups.forEach((wg, idx) => {
        wg.position.y = currentExplode * (0.55 + (idx % 3) * 0.25);
      });
      gateGroups.forEach((gg, idx) => {
        gg.position.y = currentExplode * (0.25 + (idx % 2) * 0.2);
      });

      // Smooth camera preset transitions using exponential damping
      if (presetTriggerRef.current) {
        const p = presetTriggerRef.current;
        if (p === 'overview') {
          _targetPos.set(13, 10.5, 16);
          _targetLook.set(0, 1.4, 0);
        } else if (p === 'core') {
          _targetPos.set(4.5, 3.6, 5.2);
          _targetLook.set(0, 2.0, 0);
        } else if (p === 'works') {
          _targetPos.set(9.5, 6.2, 9.5);
          _targetLook.set(2.5, 0.9, 2.5);
        } else {
          _targetPos.set(15.5, 7.8, 13.5);
          _targetLook.set(0, 1.0, 0);
        }

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, 5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, 5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, 5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, 5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, 5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, 5, dt);

        if (camera.position.distanceTo(_targetPos) < 0.08) {
          presetTriggerRef.current = null;
        }
      }

      // Animate InstancedMesh packets along WORK ring & Gate ring (Zero GC)
      for (let i = 0; i < PACKET_COUNT; i++) {
        const isOuter = i % 2 === 0;
        const r = isOuter ? 7.45 : 3.55;
        const speed = isOuter ? 0.26 : -0.42;
        const angle = (i / PACKET_COUNT) * Math.PI * 2 + packetElapsed * speed;
        _vec3.set(
          Math.cos(angle) * r,
          0.32 + Math.sin(packetElapsed * 2.2 + i) * 0.08 + currentExplode * 0.5,
          Math.sin(angle) * r
        );
        _euler.set(0, -angle, 0);
        _quat.setFromEuler(_euler);
        _mat4.compose(_vec3, _quat, _scale);
        packetInstances.setMatrixAt(i, _mat4);
      }
      packetInstances.instanceMatrix.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      deckTex.dispose();
      shadowTex.dispose();
      stageMat.dispose();
      brushedMetalMat.dispose();
      matteCeramicMat.dispose();
      sapphireGlassMat.dispose();
      accentGoldMat.dispose();
      gatePassMat.dispose();
      packetGeo.dispose();
      packetMat.dispose();
      hexGeo.dispose();
      latheGeo.dispose();
      pillarGeo.dispose();
      archGeo.dispose();
      gateBaseGeo.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[76vh] min-h-[540px] rounded-3xl overflow-hidden border border-slate-300/80 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.16)] bg-[#e3ebf4]">
      {/* Dedicated WebGL Canvas Ref Container (outside sibling UI overlays) */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {webglLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 text-slate-800 text-sm font-semibold z-20">
          กำลังกู้คืนการแสดงผล 3 มิติ (WebGL Context Restoring)...
        </div>
      )}

      {/* Top-Left Compact Semantic Inspector Card (Solid RGBA surface, zero backdrop-filter over WebGL, zero pulsating dots) */}
      <div
        className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-sm rounded-2xl p-4 border border-slate-300/90 shadow-lg z-10 pointer-events-auto"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.92)' }}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500 mb-1">
          <span>{selectedNode.id}</span>
          <span className="text-emerald-700 font-bold">{selectedNode.status}</span>
        </div>
        <h3 className="text-sm font-bold text-[#14243A] leading-snug">{selectedNode.title}</h3>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{selectedNode.rule}</p>
        <p className="text-[11px] text-slate-500 mt-2">
          ลากเพื่อหมุน · เลื่อนล้อเมาส์เพื่อซูม · แตะที่เสา/โหนดเพื่อดูรายละเอียด
        </p>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion, solid/rgba only) */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-3xl z-10 flex flex-col items-center pointer-events-auto transition-transform duration-300"
        style={{ transform: dockCollapsed ? 'translate(-50%, calc(100% - 34px))' : 'translate(-50%, 0)' }}
      >
        {/* Collapse Toggle Handle */}
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="px-4 py-1.5 rounded-t-xl border border-b-0 border-slate-300/90 text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-sm cursor-pointer"
          style={{ backgroundColor: 'rgba(248, 250, 252, 0.95)' }}
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'แสดงแผงควบคุม 3D' : 'ซ่อนแผงควบคุม'}</span>
        </button>

        {/* Main Bottom Dock Surface */}
        <div
          className="w-full rounded-2xl border border-slate-300/90 p-3 shadow-xl flex flex-wrap items-center justify-between gap-3"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.94)' }}
        >
          {/* Exploded View Slider */}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 shrink-0">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>แยกชั้น:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={explodeFactor}
              onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
              className="w-20 sm:w-24 accent-blue-600 cursor-pointer"
            />
          </label>

          {/* Camera Presets */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
            {(
              [
                { id: 'overview', label: 'ภาพรวม' },
                { id: 'core', label: 'Dual-Key' },
                { id: 'works', label: 'WORK 1-9' },
                { id: 'gates', label: '16 Gates' },
              ] as const
            ).map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => handleSelectPreset(cam.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  cameraPreset === cam.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          {/* Material Finish + Play/Pause */}
          <div className="flex items-center gap-1.5">
            <select
              value={finishMode}
              onChange={(e) => setFinishMode(e.target.value as FinishMode)}
              className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-800 cursor-pointer focus:outline-none"
              aria-label="พื้นผิววัสดุ"
            >
              <option value="metallic">วัสดุ: Titanium</option>
              <option value="crystal">วัสดุ: Crystal</option>
              <option value="slate">วัสดุ: Matte Slate</option>
            </select>

            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 cursor-pointer"
              title={isPlaying ? 'หยุดการไหลข้อมูล' : 'เล่นการไหลข้อมูล'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setExplodeFactor(0);
                handleSelectPreset('overview');
                setSelectedNode(CRD_NODES_META[0]);
              }}
              className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 cursor-pointer"
              title="รีเซ็ตมุมกล้อง"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
