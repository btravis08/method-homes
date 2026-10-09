import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise2 } from "./lawn";

/*
  SCENERY for the aerial descent (Bryce, 2026-10-09, after
  ownprimland.com): the wilderness the camera starts above and drops
  through on scroll. Everything is procedural and cheap enough for a
  phone:

  - TERRAIN: one heightfield (200² vertices) from ridge noise, flat
    across a BASIN sized to the viewer's landing pose (the 8° lens sits
    ~330 m out, so the ridges must start well beyond that or they wall
    off the home — the first capture landed behind a rock face), then
    rising to ridges, coloured by height and slope (canopy green → rock
    above the treeline). It sits just below the lawn, which keeps its
    own relief.
  - FOREST: a few thousand low-poly pines (two cones + a trunk) as two
    InstancedMeshes, placed by altitude, slope and a patchiness noise,
    kept off the pad. From above they read as the canopy in Primland's
    aerial; up close the viewer's scanned plants take over.
  - CLOUDS: three translucent noise planes at different altitudes. Their
    alpha is value-noise fbm in the fragment shader (no textures), they
    drift with scroll and time, and each one whites out as the camera
    passes through it, then clears — the "through the clouds" moment.
  - HAZE: distance fog in the page's surface colour, so the far ridges
    dissolve into the page instead of ending at a horizon.
*/

export interface Footprint { width_m: number; depth_m: number; height_m: number }

export interface SceneryHandle {
  group: THREE.Group;
  /* camera altitude (m), scroll drift (0–1) and time (s) each frame */
  update(cameraY: number, drift: number, time: number): void;
  /* 0 = full scenery, 1 = gone (plan mode) */
  setFade(e: number): void;
  dispose(): void;
}

export const CLOUD_ALTITUDES = [330, 560, 820];
const SEG = 200;
const TREELINE = 190;
const PINES = 12000;

/* `reach` = how far out (m) the landing camera sits; the basin floor
   extends past it so the approach never looks through a hillside */
export function buildScenery(fp: Footprint, reach: number, seed = 11): SceneryHandle {
  const group = new THREE.Group();
  group.name = "scenery";
  const n = noise2(seed);
  const n2 = noise2(seed + 101);
  const pad = Math.max(fp.width_m, fp.depth_m) * 0.9 + 14;
  const basin = Math.max(pad * 3, reach * 1.25);
  const SIZE = Math.max(2400, Math.round(basin * 9));
  const smooth = (a: number, b: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  /* ridge noise: the meadow the home sits in rises to ridges all round */
  const height = (x: number, z: number) => {
    const d = Math.hypot(x, z);
    const ring = smooth(basin, basin * 2.6, d);
    const r = 1 - Math.abs(n(x / 520, z / 520));
    const ridges = Math.pow(r, 1.6) * 260;
    const rolling = n2(x / 170 + 3, z / 170 - 7) * 26;
    const bowl = d * 0.03;
    /* the meadow itself undulates a little past the lawn */
    const meadow = (n2(x / 140 - 5, z / 140 + 2) * 3.5 + 3.5) * smooth(pad, pad * 2.2, d);
    return (ridges + rolling + bowl) * ring + meadow * (1 - ring);
  };

  // ---- terrain
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color("#35522d");
  const cMid = new THREE.Color("#4e6e3a");
  const cRock = new THREE.Color("#63605a");
  const cHigh = new THREE.Color("#85827a");
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h - 0.06);
    /* slope from finite differences */
    const dx = height(x + 8, z) - height(x - 8, z);
    const dz = height(x, z + 8) - height(x, z - 8);
    const slope = Math.hypot(dx, dz) / 16;
    const v = n2(x / 90, z / 90) * 0.5 + 0.5; // 0–1 patchiness
    tmp.copy(cLow).lerp(cMid, v);
    const rock = Math.max(smooth(0.75, 1.15, slope), smooth(TREELINE - 15, TREELINE + 25, h));
    tmp.lerp(cRock, rock);
    tmp.lerp(cHigh, smooth(TREELINE + 30, TREELINE + 70, h) * 0.8);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, transparent: true });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.name = "terrain";
  terrain.receiveShadow = true;
  group.add(terrain);

  // ---- forest (two instanced meshes sharing the placement)
  const canopy = mergeGeometries([
    new THREE.ConeGeometry(3.2, 10, 7).translate(0, 8, 0),
    new THREE.ConeGeometry(2.3, 6.5, 7).translate(0, 12.8, 0),
  ])!;
  const trunk = new THREE.CylinderGeometry(0.35, 0.55, 3.6, 5).translate(0, 1.8, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true, transparent: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a3a2c", roughness: 1, transparent: true });
  const canopyMesh = new THREE.InstancedMesh(canopy, canopyMat, PINES);
  const trunkMesh = new THREE.InstancedMesh(trunk, trunkMat, PINES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let rand = seed * 7919;
  const rnd = () => ((rand = (rand * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g1 = new THREE.Color("#2e4a2a");
  const g2 = new THREE.Color("#4c6d35");
  let count = 0;
  for (let i = 0; i < PINES * 4 && count < PINES; i++) {
    const a = rnd() * Math.PI * 2;
    /* denser toward the basin, where the landing view actually sees them */
    const d = Math.pow(rnd(), 0.65) * (SIZE * 0.47);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    /* the near meadow stays the viewer's own lawn and scanned plants */
    if (d < pad * 1.6) continue;
    const h = height(x, z);
    if (h > TREELINE) continue;
    const dx = height(x + 8, z) - height(x - 8, z);
    const dz = height(x, z + 8) - height(x, z - 8);
    if (Math.hypot(dx, dz) / 16 > 0.9) continue;
    if (n(x / 210 + 9, z / 210 + 4) < -0.22) continue; // clearings
    const sc = 0.75 + rnd() * 0.75;
    p.set(x, h - 0.2, z);
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    s.set(sc, sc * (0.9 + rnd() * 0.3), sc);
    m.compose(p, q, s);
    canopyMesh.setMatrixAt(count, m);
    trunkMesh.setMatrixAt(count, m);
    tmp.copy(g1).lerp(g2, rnd());
    canopyMesh.setColorAt(count, tmp);
    count++;
  }
  canopyMesh.count = count;
  trunkMesh.count = count;
  canopyMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
  canopyMesh.name = "forest-canopy";
  trunkMesh.name = "forest-trunks";
  group.add(canopyMesh, trunkMesh);

  // ---- clouds
  const cloudMats: THREE.ShaderMaterial[] = [];
  const cloudGeo = new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6, 1, 1).rotateX(-Math.PI / 2);
  CLOUD_ALTITUDES.forEach((alt, i) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDrift: { value: new THREE.Vector2(0, 0) },
        uScale: { value: 9.0 + i * 2.0 },
        uCover: { value: 0.60 - i * 0.02 },
        uWhiteout: { value: 0 },
        uOpacity: { value: 0.9 },
        uColor: { value: new THREE.Color(i === 0 ? "#f4f5f6" : "#f9f9f8") },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime, uScale, uCover, uWhiteout, uOpacity, uFade;
        uniform vec2 uDrift;
        uniform vec3 uColor;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int k = 0; k < 5; k++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
          return v;
        }
        void main() {
          vec2 p = (vUv - 0.5) * uScale + uDrift + vec2(uTime * 0.004, uTime * 0.0015);
          float f = fbm(p);
          float body = smoothstep(uCover, uCover + 0.26, f);
          /* no square edge: the sheet thins out toward its rim */
          float rim = 1.0 - smoothstep(0.30, 0.5, length(vUv - 0.5));
          float a = body * rim * uOpacity;
          a = mix(a, 1.0, uWhiteout);
          /* a touch of shading: thicker cloud is a little greyer */
          vec3 c = mix(uColor, uColor * 0.90, smoothstep(0.6, 0.9, f) * (1.0 - uWhiteout));
          gl_FragColor = vec4(c, a * uFade);
        }
      `,
    });
    const mesh = new THREE.Mesh(cloudGeo, mat);
    mesh.position.y = alt;
    mesh.renderOrder = 20 + i;
    mesh.name = `cloud-${i}`;
    mesh.frustumCulled = false;
    group.add(mesh);
    cloudMats.push(mat);
  });

  const drifts = [new THREE.Vector2(0.9, 0.3), new THREE.Vector2(-0.6, 0.5), new THREE.Vector2(0.4, -0.8)];
  let fade = 0;
  return {
    group,
    update(cameraY, drift, time) {
      cloudMats.forEach((mat, i) => {
        mat.uniforms.uTime.value = time;
        mat.uniforms.uDrift.value.copy(drifts[i]).multiplyScalar(drift * 1.4);
        /* passing through: white-out within ~30 m of the sheet, clear again
           beyond it (either side) */
        const dist = Math.abs(cameraY - CLOUD_ALTITUDES[i]);
        mat.uniforms.uWhiteout.value = (1 - THREE.MathUtils.smoothstep(dist, 6, 34)) * 0.96;
        mat.uniforms.uFade.value = 1 - fade;
      });
    },
    setFade(e) {
      fade = e;
      const o = 1 - e;
      terrainMat.opacity = o;
      canopyMat.opacity = o;
      trunkMat.opacity = o;
      group.visible = e < 0.98;
    },
    dispose() {
      geo.dispose();
      canopy.dispose();
      trunk.dispose();
      cloudGeo.dispose();
      terrainMat.dispose();
      canopyMat.dispose();
      trunkMat.dispose();
      cloudMats.forEach((c) => c.dispose());
    },
  };
}
