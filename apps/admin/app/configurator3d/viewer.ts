import * as THREE from 'three';
import asset from '../../public/3d/car-concept/manifest.json';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { material, type ColorId, type FinishId, type ViewId } from './config';

export type FrameInfo = {
  frames: number;
  triangles: number;
  calls: number;
  loadMs: number;
  color: string;
  roughness: number;
  fixedMaterials: string;
  camera: string;
  groundClearance: number;
};
export type Viewer = {
  setMaterial(color: ColorId, finish: FinishId): void;
  setView(view: ViewId): void;
  zoom(direction: -1 | 1): void;
  setRotation(enabled: boolean): void;
  dispose(): void;
};
const paintNames = new Set(['Paint 1 Carmine', 'Paint 2 Carmine']);
const modelUrl = `/3d/car-concept/car-concept.glb?v=${asset.optimized.sha256}`;
const maximumBytes = 8 * 1024 * 1024;

function validateEmbeddedGlb(buffer: ArrayBuffer) {
  const header = new DataView(buffer);
  if (
    buffer.byteLength < 24 ||
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== buffer.byteLength ||
    header.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('Invalid GLB');
  const length = header.getUint32(12, true);
  if (length > buffer.byteLength - 20) throw new Error('Invalid GLB');
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
  );
  // This bundled model must never trigger a URL from inside an untrusted asset.
  for (const record of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (record.uri !== undefined) throw new Error('External model resource');
}

async function loadModel(signal: AbortSignal) {
  const response = await fetch(modelUrl, {
    signal,
    credentials: 'omit',
    redirect: 'error',
    cache: 'force-cache',
  });
  if (!response.ok || response.redirected) throw new Error('Model unavailable');
  if (Number(response.headers.get('content-length') ?? 0) > maximumBytes)
    throw new Error('Oversized model');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Model stream unavailable');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > maximumBytes) throw new Error('Oversized model');
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  validateEmbeddedGlb(bytes.buffer);
  return new GLTFLoader().parseAsync(bytes.buffer, '/3d/car-concept/');
}

export function createViewer(
  host: HTMLElement,
  callbacks: { frame(info: FrameInfo): void; error(): void },
): Viewer {
  const started = performance.now();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const canvas = renderer.domElement;
  canvas.setAttribute(
    'aria-label',
    'Автомобиль в 3D. Стрелки — вращение, плюс и минус — масштаб, Home — исходный ракурс.',
  );
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  host.append(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color('#eeefed');
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.72, 0);
  controls.minDistance = 4.8;
  controls.maxDistance = 10;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enablePan = false;
  controls.enableDamping = false;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const imageBitmaps = new Set<ImageBitmap>();
  function collect(object: THREE.Object3D) {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const entry of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        materials.add(entry);
        for (const value of Object.values(entry)) {
          if (!(value instanceof THREE.Texture)) continue;
          textures.add(value);
          if (
            typeof ImageBitmap !== 'undefined' &&
            value.image instanceof ImageBitmap
          )
            imageBitmaps.add(value.image);
        }
      }
    });
  }
  let environment: THREE.WebGLRenderTarget | undefined;
  let disposed = false;
  let frame: number | null = null;
  let rotating = false;
  let loaded = false;
  let car: THREE.Object3D | null = null;
  let frames = 0;
  let loadMs = 0;
  let groundClearance = 0;
  let lastTime = 0;
  let lastPublished = 0;
  let currentColor: ColorId = 'graphite';
  let currentFinish: FinishId = 'gloss';
  const paints: THREE.MeshPhysicalMaterial[] = [];
  const fixed = new Set<THREE.MeshStandardMaterial>();
  const request = new AbortController();
  const timer = setTimeout(() => {
    if (!loaded && !disposed) fail();
  }, 20000);

  function render(time: number) {
    frame = null;
    if (disposed || document.hidden || !loaded) return;
    try {
      if (rotating) {
        controls.autoRotate = true;
        controls.update(Math.min((time - (lastTime || time)) / 1000, 0.1));
      }
      lastTime = time;
      renderer.render(scene, camera);
      if (loaded) {
        frames++;
        if (!loadMs) loadMs = Math.round(performance.now() - started);
        if (!rotating || frames === 1 || time - lastPublished >= 200) {
          lastPublished = time;
          callbacks.frame({
            frames,
            triangles: renderer.info.render.triangles,
            calls: renderer.info.render.calls,
            loadMs,
            groundClearance,
            color: paints[0]?.color.getHexString() ?? '',
            roughness: paints[0]?.roughness ?? 0,
            fixedMaterials: [...fixed]
              .map(
                (entry) =>
                  `${entry.name}:${entry.color.getHexString()}:${entry.emissive.getHexString()}:${entry.roughness}:${entry.metalness}`,
              )
              .sort()
              .join('|'),
            camera: camera.position
              .toArray()
              .map((value) => value.toFixed(2))
              .join(','),
          });
        }
      }
      if (rotating) schedule();
    } catch {
      fail();
    }
  }
  function schedule() {
    if (!disposed && !document.hidden && frame === null)
      frame = requestAnimationFrame(render);
  }
  function initializeEnvironment() {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      environment = pmrem.fromScene(room, 0.04);
      scene.environment = environment.texture;
    } finally {
      room.dispose();
      pmrem.dispose();
    }
  }
  function fitView() {
    if (!car) return;
    car.updateWorldMatrix(true, true);
    const direction = camera.position.clone().sub(controls.target).normalize();
    const right = new THREE.Vector3()
      .crossVectors(camera.up, direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.84;
    const point = new THREE.Vector3();
    let distance = controls.minDistance;
    // Actual transformed vertices avoid empty AABB corners in joined geometry.
    car.traverseVisible((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        point
          .fromBufferAttribute(positions, index)
          .applyMatrix4(node.matrixWorld)
          .sub(controls.target);
        distance = Math.max(
          distance,
          point.dot(direction) +
            Math.abs(point.dot(right)) / (tangent * camera.aspect),
          point.dot(direction) + Math.abs(point.dot(up)) / tangent,
        );
      }
    });
    const currentDistance = camera.position.distanceTo(controls.target);
    controls.maxDistance = Math.max(12, distance * 1.5);
    camera.position
      .copy(controls.target)
      .addScaledVector(direction, Math.max(currentDistance, distance));
  }
  function setView(view: ViewId) {
    const positions: Record<ViewId, [number, number, number]> = {
      perspective: [4.8, 2.2, 5.8],
      front: [0, 1.8, 8],
      side: [8, 1.8, 0],
      rear: [0, 1.8, -8],
    };
    if (!positions[view] || disposed) return;
    camera.position.set(...positions[view]);
    fitView();
    controls.update();
    schedule();
  }
  function zoom(direction: -1 | 1) {
    if (disposed) return;
    const delta = camera.position.clone().sub(controls.target);
    delta.setLength(
      THREE.MathUtils.clamp(
        delta.length() * (direction === 1 ? 0.85 : 1.15),
        controls.minDistance,
        controls.maxDistance,
      ),
    );
    camera.position.copy(controls.target).add(delta);
    controls.update();
    schedule();
  }
  function setMaterial(color: ColorId, finish: FinishId) {
    const chosen = material(color, finish);
    currentColor = color;
    currentFinish = finish;
    for (const paint of paints) {
      const togglesClearcoat =
        paint.clearcoat > 0 !== chosen.finish.clearcoat > 0;
      paint.color.set(chosen.color.hex);
      paint.roughness = chosen.finish.roughness;
      paint.clearcoat = chosen.finish.clearcoat;
      paint.clearcoatRoughness = 0.08;
      if (togglesClearcoat) paint.needsUpdate = true;
    }
    schedule();
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Home') setView('perspective');
    else if (event.key === '+' || event.key === '=') zoom(1);
    else if (event.key === '-') zoom(-1);
    else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      if (event.key === 'ArrowLeft') spherical.theta -= 0.16;
      if (event.key === 'ArrowRight') spherical.theta += 0.16;
      if (event.key === 'ArrowUp') spherical.phi -= 0.1;
      if (event.key === 'ArrowDown') spherical.phi += 0.1;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      );
      camera.position
        .copy(new THREE.Vector3().setFromSpherical(spherical))
        .add(controls.target);
      controls.update();
      schedule();
    } else return;
    event.preventDefault();
  }
  function visibility() {
    lastTime = 0;
    if (document.hidden && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    } else schedule();
  }
  function lost(event: Event) {
    event.preventDefault();
    fail();
  }
  function releaseResources() {
    for (const geometry of geometries) geometry.dispose();
    for (const entry of materials) entry.dispose();
    for (const texture of textures) texture.dispose();
    for (const bitmap of imageBitmaps) bitmap.close();
    geometries.clear();
    materials.clear();
    textures.clear();
    imageBitmaps.clear();
    paints.length = 0;
    fixed.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    request.abort();
    if (frame !== null) cancelAnimationFrame(frame);
    controls.dispose();
    observer.disconnect();
    canvas.removeEventListener('keydown', keyboard);
    canvas.removeEventListener('webglcontextlost', lost);
    document.removeEventListener('visibilitychange', visibility);
    collect(scene);
    releaseResources();
    environment?.dispose();
    environment = undefined;
    scene.environment = null;
    light.shadow.dispose();
    scene.clear();
    car = null;
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  function fail() {
    if (disposed) return;
    dispose();
    callbacks.error();
  }
  const observer = new ResizeObserver(() => {
    const size = host.getBoundingClientRect();
    if (size.width <= 0 || size.height <= 0 || disposed) return;
    renderer.setSize(size.width, size.height);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    fitView();
    controls.update();
    schedule();
  });
  const light = new THREE.DirectionalLight(0xffffff, 1.5);
  light.position.set(3, 7, 4);
  light.castShadow = false;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -4;
  light.shadow.camera.right = 4;
  light.shadow.camera.top = 4;
  light.shadow.camera.bottom = -4;
  light.shadow.normalBias = 0.025;
  scene.add(light);
  observer.observe(host);
  controls.addEventListener('change', schedule);
  canvas.addEventListener('keydown', keyboard);
  canvas.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', visibility);
  setView('perspective');
  try {
    // Soft studio contact shadow: one small texture, no extra geometry shadow pass.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const shadowContext = shadowCanvas.getContext('2d');
    if (!shadowContext) throw new Error('Shadow unavailable');
    const gradient = shadowContext.createRadialGradient(
      128,
      128,
      24,
      128,
      128,
      128,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.14)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 256, 256);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 5.7),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    void loadModel(request.signal)
      .then((gltf) => {
        collect(gltf.scene);
        if (disposed) {
          // parseAsync cannot be cancelled; release a late decoded scene too.
          releaseResources();
          return;
        }
        // Validate/decode the local model before spending GPU work on studio light.
        initializeEnvironment();
        const box = new THREE.Box3().setFromObject(gltf.scene, true);
        const size = box.getSize(new THREE.Vector3());
        const scale = 4.5 / Math.max(size.x, size.z);
        gltf.scene.scale.setScalar(scale);
        const centered = new THREE.Box3().setFromObject(gltf.scene, true);
        const center = centered.getCenter(new THREE.Vector3());
        gltf.scene.position.set(-center.x, -centered.min.y + 0.015, -center.z);
        // Joined wheel geometry has a rotated local AABB. Precise vertex bounds
        // avoid centering on empty corners and lifting the whole car off the floor.
        groundClearance = new THREE.Box3().setFromObject(gltf.scene, true).min
          .y;
        if (groundClearance < 0 || groundClearance > 0.04)
          throw new Error('Invalid ground alignment');

        gltf.scene.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.castShadow = true;
          node.receiveShadow = true;
          const originals = Array.isArray(node.material)
            ? node.material
            : [node.material];
          const replaced = originals.map((entry) => {
            if (paintNames.has(entry.name)) {
              const paint = new THREE.MeshPhysicalMaterial({
                metalness: 0.18,
                side: entry.side,
                ...(entry instanceof THREE.MeshStandardMaterial
                  ? {
                      aoMap: entry.aoMap,
                      aoMapIntensity: entry.aoMapIntensity,
                    }
                  : {}),
              });
              paint.name = 'VEGA wrap';
              paints.push(paint);
              materials.add(paint);
              return paint;
            }
            if (entry.name === 'License') {
              const plate = document.createElement('canvas');
              plate.width = 1024;
              plate.height = 256;
              const context = plate.getContext('2d');
              if (!context) throw new Error('Plate unavailable');
              context.fillStyle = '#f3f2ed';
              context.fillRect(0, 0, 1024, 256);
              context.fillStyle = '#151515';
              context.font = '500 170px Arial';
              context.textAlign = 'center';
              context.textBaseline = 'middle';
              context.fillText('VEGA', 512, 133);
              const texture = new THREE.CanvasTexture(plate);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.flipY = false;
              textures.add(texture);
              const license = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.65,
              });
              materials.add(license);
              return license;
            }
            // The showcase asset lights some trim with emission; use studio lighting instead.
            if (
              entry instanceof THREE.MeshStandardMaterial &&
              !['Headlight', 'Brakelight', 'Signallight', 'Dashboard'].includes(
                entry.name,
              )
            )
              entry.emissive.set(0);
            if (
              entry instanceof THREE.MeshPhysicalMaterial &&
              entry.name === 'Glass'
            ) {
              entry.color.set('#6f858b');
              entry.metalness = 0;
              entry.transmission = 0;
              entry.roughness = 0.1;
              entry.transparent = true;
              entry.opacity = 0.42;
              entry.envMapIntensity = 0.55;
              entry.needsUpdate = true;
            }
            if (
              entry instanceof THREE.MeshStandardMaterial &&
              ['Rim1', 'Rim2'].includes(entry.name)
            ) {
              entry.color.set('#777d82');
              entry.roughness = 0.3;
              entry.envMapIntensity = 0.65;
            }
            if (entry instanceof THREE.MeshStandardMaterial) fixed.add(entry);
            return entry;
          });
          node.material = Array.isArray(node.material)
            ? replaced
            : replaced[0]!;
        });
        if (paints.length === 0) throw new Error('Paint surfaces missing');

        scene.add(gltf.scene);
        car = gltf.scene;
        loaded = true;
        setView('perspective');
        clearTimeout(timer);
        setMaterial(currentColor, currentFinish);
        schedule();
      })
      .catch(() => {
        if (!disposed) fail();
      });
  } catch {
    fail();
  }
  return {
    setMaterial,
    setView,
    zoom,
    setRotation(enabled) {
      rotating = enabled;
      controls.autoRotate = enabled;
      lastTime = 0;
      schedule();
    },
    dispose,
  };
}
