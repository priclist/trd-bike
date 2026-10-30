// The S1000 RR in 3D. One WebGL canvas is fixed over the page; as you scroll, the bike flies between four
// invisible slots (stage, features, showcase, finale) and turns to a new angle in each.
// Until the model has loaded, or if it can't (no WebGL, reduced motion, model file missing), the cut-out
// photo in each slot simply stays put, so the section still reads.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js/+esm";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js/+esm";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js/+esm";

// MODEL: "BMW S1000 RR" by VTX_car on Sketchfab, CC BY-NC-SA 4.0. Download the .glb and save it at this path
// (README has the steps and a command to shrink it). Set FLIP to true if it loads facing the wrong way.
const MODEL = "assets/models/bmw-s1000rr.glb";
const FLIP = false;

const root = document.querySelector("[data-rr]");
const canvas = root && root.querySelector("[data-rr-canvas]");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const wide = matchMedia("(min-width: 951px)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

const hasWebGL = () => {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch { return false; }
};

if (root && canvas && !reduceMotion.matches && hasWebGL()) start();

function start() {
  const slots = [...root.querySelectorAll("[data-rr-slot]")];
  const sections = slots.map((s) => s.closest("section"));
  const loadBar = root.querySelector("[data-rr-load]");
  root.classList.add("is-loading");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, wide.matches ? 2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  // a soft studio room for the paint and chrome to reflect, then a red rim from behind to pick out the silhouette
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-5, 8, 6);
  const rim = new THREE.DirectionalLight(0xff3b1f, 3.2);
  rim.position.set(4, 3, -8);
  const kick = new THREE.DirectionalLight(0xffd9c9, 0.9);
  kick.position.set(7, -2, 3);
  scene.add(key, rim, kick);

  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 500);
  const tan2 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  // group: scroll pose + mouse turntable. pivot: lays the model on its side, nose left, centred, 4 units long.
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  scene.add(group);

  // yaw, then pitch (top toward camera), then lean
  const pose = (yaw, pitch = 0, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "ZXY"));
  const POSES = [
    pose(0, 0.05),                         // stage: side profile, nose left
    pose(Math.PI / 2 - 0.5, 0.14, 0.38),   // features: head-on three-quarter, leaned into a left-hander
    pose(Math.PI, 0.04),                   // showcase: side profile, nose right, cropped by the screen edge
    pose(Math.PI / 2 + 0.55, 0.16),        // finale: front three-quarter from above
  ];

  let points = null; // a few thousand vertices, for measuring the bike's silhouette at any angle
  const v = new THREE.Vector3();
  function extent(q) {
    const e = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, maxZ: -Infinity };
    for (let i = 0; i < points.length; i += 3) {
      v.set(points[i], points[i + 1], points[i + 2]).applyQuaternion(q);
      if (v.x < e.minX) e.minX = v.x; if (v.x > e.maxX) e.maxX = v.x;
      if (v.y < e.minY) e.minY = v.y; if (v.y > e.maxY) e.maxY = v.y;
      if (v.z > e.maxZ) e.maxZ = v.z;
    }
    e.w = e.maxX - e.minX;
    e.h = e.maxY - e.minY;
    return e;
  }
  let poseExt = [];

  const draco = new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");
  new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).load(
    MODEL,
    (gltf) => {
      const model = gltf.scene;
      const raw = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      pivot.add(model);
      pivot.rotation.y = (raw.z > raw.x ? Math.PI / 2 : 0) + (FLIP ? Math.PI : 0);
      pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pivot);
      const size = box.getSize(new THREE.Vector3());
      const s = 4 / Math.max(size.x, size.z);
      pivot.scale.setScalar(s);
      pivot.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s);
      pivot.updateMatrixWorld(true);

      const meshes = [];
      let total = 0;
      model.traverse((o) => {
        if (!o.isMesh) return;
        meshes.push(o);
        total += o.geometry.attributes.position.count;
        o.frustumCulled = false; // the bike is always on screen while we render; skip per-mesh culling
      });
      const step = Math.max(1, Math.floor(total / 4000));
      const out = [];
      meshes.forEach((m) => {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          out.push(v.x, v.y, v.z);
        }
      });
      points = new Float32Array(out);
      poseExt = POSES.map(extent);

      draco.dispose();
      root.classList.replace("is-loading", "is-3d");
      resize();
      watch();
    },
    (e) => { if (loadBar && e.total) loadBar.style.setProperty("--load", (e.loaded / e.total).toFixed(3)); },
    (err) => {
      console.warn(`3D bike: couldn't load ${MODEL}, showing the photo instead.`, err);
      root.classList.replace("is-loading", "is-flat");
      renderer.dispose();
    },
  );

  // ---------- sizing ----------
  let vw = 1, vh = 1;
  function resize() {
    vw = canvas.clientWidth;
    vh = canvas.clientHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);

  // ---------- mouse turntable (touch screens get a slow idle sway instead) ----------
  let aimYaw = 0, aimPitch = 0, yaw = 0, pitch = 0;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    aimYaw = (e.clientX / innerWidth - 0.5) * 0.4;
    aimPitch = (e.clientY / innerHeight - 0.5) * 0.1;
  }, { passive: true });

  // 0 while a section is still below the screen, 1 once it has scrolled in
  const progress = (el) => {
    const t = THREE.MathUtils.clamp((vh - el.getBoundingClientRect().top) / (vh * 0.9), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // where each slot wants the bike: screen centre and camera distance
  function target(i, r) {
    const e = poseExt[i];
    if (i === 2 && wide.matches) {
      // showcase: the bike is drawn ~2× the slot's width with its nose just inside the slot's right edge,
      // so the screen edge crops the tail and only the front half shows
      const W = r.width * 1.9;
      return { x: r.right - 24 - W / 2, y: r.top + r.height / 2, d: e.maxZ + e.w * vh / (tan2 * W) };
    }
    const fill = 0.96;
    const d = e.maxZ + Math.max(e.w / (r.width * fill), e.h / (r.height * fill)) * vh / tan2;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, d };
  }

  // ---------- frame loop: runs only while the 3D sections are on screen ----------
  const ts = [0, 0, 0];
  const qPose = new THREE.Quaternion(), qMouse = new THREE.Quaternion(), qNow = new THREE.Quaternion();
  const lerp = THREE.MathUtils.lerp;
  let raf = 0, last = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    const k = 1 - Math.exp(-dt * 6); // ease toward the scroll position, the same at 60 Hz and 120 Hz

    for (let i = 0; i < 3; i++) ts[i] += (progress(sections[i + 1]) - ts[i]) * k;
    const rects = slots.map((s) => s.getBoundingClientRect());
    const goals = rects.map((r, i) => target(i, r));

    let x = goals[0].x, y = goals[0].y, d = goals[0].d;
    qPose.copy(POSES[0]);
    for (let i = 0; i < 3; i++) {
      x = lerp(x, goals[i + 1].x, ts[i]);
      y = lerp(y, goals[i + 1].y, ts[i]);
      d = lerp(d, goals[i + 1].d, ts[i]);
      qPose.slerp(POSES[i + 1], ts[i]);
    }

    if (!finePointer.matches) { aimYaw = Math.sin(now / 2400) * 0.22; aimPitch = 0; }
    yaw += (aimYaw - yaw) * k * 0.6;
    pitch += (aimPitch - pitch) * k * 0.6;
    const m = 1 - 0.65 * Math.max(...ts); // full turntable on the stage, a hint of it after
    qMouse.setFromEuler(new THREE.Euler(pitch * m, yaw * m, 0));
    qNow.copy(qMouse).multiply(qPose);
    group.quaternion.copy(qNow);

    // centre the bike's silhouette (not its pivot) on the camera axis, then slide the camera's view window so
    // that axis lands on the slot point. Sliding the window instead of the bike keeps the angle true anywhere on screen.
    const e = extent(qNow);
    group.position.set(-(e.minX + e.maxX) / 2, -(e.minY + e.maxY) / 2, 0);
    camera.setViewOffset(vw, vh, vw / 2 - x, vh / 2 - y, vw, vh);
    camera.position.set(0, 0, d);
    renderer.render(scene, camera);
  }

  function watch() {
    const run = (on) => {
      canvas.style.visibility = on ? "visible" : "hidden";
      if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    let inView = false;
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; run(inView && !document.hidden); }).observe(root);
    document.addEventListener("visibilitychange", () => run(inView && !document.hidden));
  }
}
