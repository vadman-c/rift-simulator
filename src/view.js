// 3D 전투 화면 (three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DH, EQUIP_IMG } from './data.js';
import { FX } from './fx.js';
import { CELL, GAP, COLS, ROWS_SIDE, cellToPos } from './sim.js';

const rndf = (a, b) => a + Math.random() * (b - a);
const MODEL_FILES = ['DH_base', 'DH_anims', 'DH_shotgun', 'DH_rifle', 'SR_base', 'SR_energy', 'SR_meteor', 'Shana', 'BK_base', 'BK_wave', 'BK_asura', 'BD_base', 'BD_shock', 'BD_protect', 'BD_rescue', 'BD_valiant', 'SR_lobby', 'BK_lobby', 'BD_lobby', 'Hidaka', 'Shuheri', 'Silian', 'Neria', 'Archer', 'Shieldman', 'Merchant', 'Anabel', 'Federico', 'Lahart', 'Azena', 'Inanna', 'ValtanRed', 'ValtanRev', 'SpikeArm', 'Aman', 'Willy', 'Pumpkin', 'WhiteMane', 'ThickArm', 'ArmorDog', 'BareDog', 'BlackBeast', 'WingBeast', 'ManeTail', 'Wolf_Red', 'Wolf_Blue', 'Beast_01', 'Beast_02'];
const ROOT_BONES = ['b_root', 'b_effectworldzero'];

function b64ToBuf(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail ' + src)); document.head.appendChild(s); }); }

// 루트 모션 제거: 루트 뼈의 위치 트랙을 첫 프레임 값으로 고정 (샷건 연사 등이 뒤로 밀리지 않게)
function stripRootMotion(clip, rootNames) {
  for (const tr of clip.tracks) {
    const [node, prop] = tr.name.split('.');
    if (prop !== 'position' || !rootNames.includes(node)) continue;
    const v = tr.values, n = v.length / 3;
    for (let i = 1; i < n; i++) { v[i * 3] = v[0]; v[i * 3 + 1] = v[1]; v[i * 3 + 2] = v[2]; }
  }
  return clip;
}

export class View {
  constructor(host, overlay) {
    this.host = host; this.overlay = overlay;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    // 이펙트용 점광원은 미리 만들어 두고 돌려 쓴다 (2026-10-31 3차). 전투 중 광원을 새로 넣고 빼면
    // 광원 개수가 바뀌어 화면의 모든 재질 셰이더가 다시 컴파일되며 프레임이 크게 끊긴다 (아제나 고대의 창 렉 원인)
    this.lightPool = Array.from({ length: 5 }, () => { const l = new THREE.PointLight(0xffffff, 0, 10); l.userData.busy = false; this.scene.add(l); return l; });
    this.scene.background = new THREE.Color(0x0d0f14);
    this.scene.fog = new THREE.Fog(0x0d0f14, 26, 48);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.models = {}; this.clips = {};
    this.units = new Map(); this.fx = []; this.projs = []; this.anims = []; this.shift = 0; this.shiftT = 0;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this._buildStage();
    this.vfx = new FX(this.scene, this.camera);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.active = false;
    const loop = () => { requestAnimationFrame(loop); this._frame(); };
    loop();
  }

  async load(progress) {
    const L = new GLTFLoader();
    let i = 0;
    for (const n of MODEL_FILES) {
      if (!window.__GLB?.[n]) await loadScript(`assets/${n}.js`);
      const g = await L.parseAsync(b64ToBuf(window.__GLB[n]), '');
      delete window.__GLB[n];
      this.models[n] = g;
      const roots = [...ROOT_BONES];
      g.scene.traverse(o => { if (o.isSkinnedMesh && o.skeleton.bones[0]) roots.push(o.skeleton.bones[0].name); });
      this.clips[n] = Object.fromEntries(g.animations.map(c => [c.name, stripRootMotion(c, roots)]));
      progress?.(++i / MODEL_FILES.length, n);
    }
    // 스킬 이펙트 텍스처
    if (!window.__FXTEX) await loadScript('assets/FX.js');
    await this.vfx.load();
        // 데빌헌터: 기본(쌍권총) + 샷건 + 라이플 무기, 애니메이션은 세 파일 + 기본세트 합본
    this.clips.DH = { ...this.clips.DH_anims, ...this.clips.DH_base, ...this.clips.DH_shotgun, ...this.clips.DH_rifle };
    this.clips.SR = { ...this.clips.SR_base, ...this.clips.SR_energy, ...this.clips.SR_meteor, ...this.clips.SR_lobby };
    this.clips.BK = { ...this.clips.BK_base, ...this.clips.BK_wave, ...this.clips.BK_asura, ...this.clips.BK_lobby };
    this.clips.BD = { ...this.clips.BD_base, ...this.clips.BD_shock, ...this.clips.BD_protect, ...this.clips.BD_rescue, ...this.clips.BD_valiant, ...this.clips.BD_lobby };
    this.clips.ThickArm = { ...this.clips.WhiteMane, ...this.clips.ThickArm }; // 굵은팔 갈기 = 흰갈기 마수와 같은 골격
    this.tornadoTex = View.streakTexture();
    this.weapons = {};
    for (const [k, f] of [['shotgun', 'DH_shotgun'], ['rifle', 'DH_rifle']]) {
      let w = null; this.models[f].scene.traverse(o => { if (o.isMesh && /wp_gdh/.test(o.name)) w = o; });
      this.weapons[k] = { mesh: w, bone: w.parent.name };
    }
  }

  _buildStage() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xcfd8ff, 0x3a2a20, 1.6); s.add(this.hemi);
    const key = new THREE.DirectionalLight(0xfff1d6, 2.6); this.keyLight = key;
    key.position.set(-6, 16, 10); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
    s.add(key);
    const rim = new THREE.DirectionalLight(0xff6a4a, 0.9); rim.position.set(6, 6, -14); s.add(rim); this.rimLight = rim;

    // 바닥: 절차적 텍스처 (검은 산 분위기)
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a2b24'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = Math.random() * 6 + 1;
      const c = 30 + Math.random() * 30;
      g.fillStyle = `rgba(${c + 8},${c + 10},${c},${Math.random() * 0.5 + 0.2})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6); tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.ground = ground;
    const M = new THREE.Group(); M.add(ground); s.add(M); this.themes = { mountain: M }; this.theme = 'mountain'; const s0 = s;

    // 중앙 돌길
    const path = new THREE.Mesh(new THREE.PlaneGeometry(COLS * CELL + 0.4, GAP * 2), new THREE.MeshStandardMaterial({ color: 0x55534e, roughness: 0.95 }));
    path.rotation.x = -Math.PI / 2; path.position.y = 0.005; path.receiveShadow = true; s.add(path);
    this.path = path;

    // 배치 칸
    this.cells = [];
    const cellGeo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94);
    for (const side of ['ally', 'enemy']) {
      for (let row = 0; row < ROWS_SIDE; row++) for (let col = 0; col < COLS; col++) {
        const p = cellToPos(side, col, row);
        const m = new THREE.Mesh(cellGeo, new THREE.MeshBasicMaterial({ color: side === 'ally' ? 0x2f78c4 : 0xb8402f, transparent: true, opacity: 0.38, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.012, p.z);
        m.userData = { side, col, row };
        s.add(m); this.cells.push(m);
      }
    }
    { const s = M;
    // 주변 바위·나무 (외곽 장식)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b3c3a, roughness: 1, flatShading: true });
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d2a1c, roughness: 1, flatShading: true });
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 70; i++) {
      const ang = Math.random() * Math.PI * 2, rad = rnd(10, 24);
      const x = Math.cos(ang) * rad * 0.9, z = Math.sin(ang) * rad;
      if (Math.abs(x) < 7.5 && Math.abs(z) < 9.5) continue;
      if (Math.random() < 0.55) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.8, 1.6), rnd(3, 6), 6), treeMat);
        t.position.set(x, 1.5, z); t.castShadow = true; s.add(t);
      } else {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.5, 1.4)), rockMat);
        r.position.set(x, 0.3, z); r.rotation.set(Math.random(), Math.random(), 0); r.castShadow = true; s.add(r);
      }
    }
    // 균열 (적 진영 뒤쪽의 붉은 빛)
    // 바닥에 갈라진 균열 (붉은 발광 띠)
    const riftMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(rnd(2, 4.5), rnd(0.08, 0.2)), riftMat);
      r.rotation.x = -Math.PI / 2; r.rotation.z = rnd(-0.5, 0.5);
      r.position.set(rnd(-5, 5), 0.02, -(ROWS_SIDE * CELL + GAP) - rnd(1, 3)); s.add(r);
    }
    const pl = new THREE.PointLight(0xff4030, 30, 18); pl.position.set(0, 2.5, -9.5); s.add(pl);
    }

    // 선택 하이라이트
    this.hl = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.hl.rotation.x = -Math.PI / 2; this.hl.position.y = 0.03; this.hl.visible = false; s.add(this.hl);
  }

  // ───────── 전장 배경 테마 ─────────
  // mountain = 검은 산(1층 일반) / ruins = 숲속 폐허(1층 보스전 · 2층, 예시 이미지 2·3·6) / valtan = 발탄 보스룸(예시 이미지 4·5·7)
  setTheme(name) {
    if (!this.themes[name]) this.themes[name] = { ruins: () => this._buildRuins(), valtan: () => this._buildValtanRoom(), palace: () => this._buildPalace(), grass: () => this._buildGrass(), plaza: () => this._buildPlaza() }[name]();
    for (const [k, g] of Object.entries(this.themes)) g.visible = k === name;
    this.theme = name;
    const L = { mountain: [0x0d0f14, 26, 48, 0xcfd8ff, 0x3a2a20, 1.6, 0xfff1d6, 2.6, 0xff6a4a, 0.9],
      ruins: [0x0b1013, 20, 44, 0xb8cde0, 0x1a2420, 1.35, 0xe0ecff, 2.0, 0x4fc8c0, 0.8],
      valtan: [0x040608, 22, 46, 0xa8c8e0, 0x0c1418, 1.25, 0xd8e8ff, 1.9, 0x3fd8d0, 1.2],
      palace: [0x0a0c12, 24, 52, 0xc8d4ff, 0x2a1a18, 1.15, 0xffe2c0, 1.6, 0x8fb0ff, 0.9],
      grass: [0x0c120e, 20, 46, 0xc8e0c0, 0x1a2418, 1.35, 0xeef4ff, 2.0, 0x7fa0ff, 0.8],
      plaza: [0x050a18, 18, 44, 0xa8c0ff, 0x101830, 1.3, 0xe0ecff, 1.8, 0x4f8fff, 1.2] }[name];
    this.scene.background.set(L[0]); this.scene.fog.color.set(L[0]); this.scene.fog.near = L[1]; this.scene.fog.far = L[2];
    this.hemi.color.set(L[3]); this.hemi.groundColor.set(L[4]); this.hemi.intensity = L[5];
    this.keyLight.color.set(L[6]); this.keyLight.intensity = L[7]; this.rimLight.color.set(L[8]); this.rimLight.intensity = L[9];
    if (name === 'valtan') this._resetWalls();
  }
  static _canvas(n, fn) { const c = document.createElement('canvas'); c.width = c.height = n; fn(c.getContext('2d'), n); return c; }
  _buildRuins() {
    const G = new THREE.Group(), rnd = (a, b) => a + Math.random() * (b - a);
    // 바닥: 어두운 판석 + 이끼 + 흙 (예시 이미지 2·3)
    const cv = View._canvas(1024, (g, n) => {
      g.fillStyle = '#1b1f21'; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 4000; i++) { const c = 22 + Math.random() * 22; g.fillStyle = `rgba(${c},${c + 3},${c + 4},${Math.random() * 0.5})`; g.beginPath(); g.arc(Math.random() * n, Math.random() * n, Math.random() * 7 + 1, 0, 7); g.fill(); }
      // 판석
      for (let y = 0; y < n; y += 96) for (let x = -(y / 96 % 2) * 64; x < n; x += 128) {
        if (Math.random() < 0.25) continue;
        const w = 112 + Math.random() * 20, h = 84 + Math.random() * 10, c = 36 + Math.random() * 18;
        g.fillStyle = `rgb(${c},${c + 4},${c + 7})`; g.beginPath(); g.moveTo(x + 6 + Math.random() * 6, y + 5); g.lineTo(x + w - Math.random() * 8, y + 4 + Math.random() * 6); g.lineTo(x + w - 4, y + h - Math.random() * 8); g.lineTo(x + 4 + Math.random() * 8, y + h - 3); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.beginPath(); const sx = x + Math.random() * w, sy = y + Math.random() * h; g.moveTo(sx, sy); for (let k = 0; k < 4; k++) g.lineTo(sx + rnd(-40, 40), sy + rnd(-30, 30)); g.stroke();
      }
      // 이끼·풀 얼룩
      for (let i = 0; i < 160; i++) { const x = Math.random() * n, y = Math.random() * n, r = rnd(10, 46); const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, `rgba(${38 + Math.random() * 16},${52 + Math.random() * 22},${34},0.32)`); gr.addColorStop(1, 'rgba(30,50,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    });
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 5); tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; G.add(ground);
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a5052, roughness: 0.95, flatShading: true });
    const stoneD = new THREE.MeshStandardMaterial({ color: 0x33393b, roughness: 1, flatShading: true });
    const moss = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 1, flatShading: true });
    const bark = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1, flatShading: true });
    const out = (x, z) => Math.abs(x) > 7.6 || Math.abs(z) > 9.6;
    // 무너진 돌담 (예시 이미지 6의 폐허 벽)
    for (let i = 0; i < 18; i++) {
      const back = i < 7, side = i % 2 ? 1 : -1, z = back ? rnd(-17, -10.5) : rnd(-9, 9), x = back ? rnd(-10, 10) : side * rnd(7.4, 10);
      const wall = new THREE.Group(), n = 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) { const h = rnd(0.6, 3.2), b = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.9, 1.3), h, rnd(0.6, 0.9)), Math.random() < 0.7 ? stone : stoneD); b.position.set(0, h / 2, k * 1.05); b.rotation.set(rnd(-0.06, 0.06), rnd(-0.08, 0.08), rnd(-0.06, 0.06)); b.castShadow = b.receiveShadow = true; wall.add(b);
        if (Math.random() < 0.4) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.85), moss); m.position.set(0, h + 0.05, k * 1.05); wall.add(m); } }
      wall.position.set(x, 0, z); wall.rotation.y = rnd(-0.4, 0.4) + (Math.random() < 0.3 ? Math.PI / 2 : 0); G.add(wall);
    }
    // 부서진 기둥 · 잔해
    for (let i = 0; i < 30; i++) { let x, z; do { x = rnd(-11, 11); z = rnd(-18, 12); } while (!out(x, z));
      if (Math.random() < 0.4) { const h = rnd(1.2, 4.5), c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, h, 8), stone); c.position.set(x, h / 2, z); c.castShadow = true; G.add(c); const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), stoneD); cap.position.set(x, 0.15, z); G.add(cap); }
      else { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.3, 0.9)), Math.random() < 0.5 ? stone : stoneD); r.position.set(x, 0.2, z); r.rotation.set(Math.random(), Math.random(), 0); r.castShadow = true; G.add(r); } }
    // 비틀린 고목
    for (let i = 0; i < 12; i++) { let x, z; do { x = rnd(-14, 14); z = rnd(-22, 6); } while (!out(x, z) || (Math.abs(x) < 8 && z > -12));
      const t = new THREE.Group(), h = rnd(4, 7); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, h, 7), bark); tr.position.y = h / 2; tr.rotation.z = rnd(-0.15, 0.15); t.add(tr);
      for (let k = 0; k < 4; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, rnd(1.6, 3), 5), bark); const a = Math.random() * 6.28; br.position.set(Math.cos(a) * 0.5, h * rnd(0.55, 0.9), Math.sin(a) * 0.5); br.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); t.add(br); }
      t.position.set(x, 0, z); t.traverse(o => { if (o.isMesh) o.castShadow = true; }); G.add(t); }
    // 고사리 · 풀 (예시 이미지 2의 풀숲)
    const fern = new THREE.CanvasTexture(View._canvas(128, (g) => { g.strokeStyle = '#4f7a3a'; g.lineWidth = 3; for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.22; g.beginPath(); g.moveTo(64, 128); g.quadraticCurveTo(64 + Math.cos(a) * 40, 128 + Math.sin(a) * 70, 64 + Math.cos(a) * 60, 128 + Math.sin(a) * 120); g.stroke(); for (let j = 1; j < 8; j++) { const px = 64 + Math.cos(a) * j * 7.5, py = 128 + Math.sin(a) * j * 15; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 10, py - 4); g.moveTo(px, py); g.lineTo(px + 10, py - 4); g.stroke(); } } }));
    fern.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: fern, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: 0x9ab88a });
    for (let i = 0; i < 90; i++) { let x, z; do { x = rnd(-10, 10); z = rnd(-16, 12); } while (!(Math.abs(x) > 6.3 || z < -10));
      const sz = rnd(0.8, 1.8), f = new THREE.Group(); for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), fm); p.position.y = sz / 2 - 0.05; p.rotation.y = k * Math.PI / 3; f.add(p); } f.position.set(x, 0, z); G.add(f); }
    // 무너진 성채의 붉은 용암빛 · 갈라진 틈 · 핏자국 (예시 이미지 10·11)
    for (const [x, z] of [[-10, -12], [10, -6], [-11, 6], [9, 10], [0, -15]]) { const l = new THREE.PointLight(0xff5a28, 22, 15); l.position.set(x, 2.5, z); G.add(l); }
    const lava = new THREE.MeshBasicMaterial({ color: 0xff4a1a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 22; i++) { let x, z; do { x = rnd(-12, 12); z = rnd(-18, 12); } while (!out(x, z));
      const c = new THREE.Mesh(new THREE.PlaneGeometry(rnd(1.5, 4), rnd(0.08, 0.22)), lava); c.rotation.x = -Math.PI / 2; c.rotation.z = rnd(0, Math.PI); c.position.set(x, 0.03, z); G.add(c); }
    const blood = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ color: 0x4a0808, transparent: true, opacity: 0.7, depthWrite: false }));
    blood.rotation.x = -Math.PI / 2; blood.scale.set(1.6, 1, 1); blood.position.set(-9, 0.025, -6); G.add(blood);
    this.scene.add(G); return G;
  }
  _buildValtanRoom() {
    const G = new THREE.Group(), rnd = (a, b) => a + Math.random() * (b - a), R0 = 10.3;
    // 원형 보스룸 바닥: 동심원 판석 + 청록빛으로 갈라진 틈 + 중앙 문양 (예시 이미지 4·5)
    const N = 2048, C = N / 2, sc = N / (R0 * 2);
    const draw = (glow) => View._canvas(N, (g) => {
      g.fillStyle = glow ? '#000' : '#1a2026'; g.fillRect(0, 0, N, N);
      const rings = [0, 2.2, 3.2, 4.4, 6.0, 7.6, 9.0, R0];
      for (let i = 1; i < rings.length; i++) {
        const r0 = rings[i - 1] * sc, r1 = rings[i] * sc, segs = Math.max(6, Math.round(rings[i] * 3.2));
        for (let k = 0; k < segs; k++) {
          const a0 = k / segs * Math.PI * 2 + i * 0.3, a1 = (k + 1) / segs * Math.PI * 2 + i * 0.3, c = 34 + Math.random() * 20;
          g.beginPath(); g.arc(C, C, r1 - 3, a0 + 0.01, a1 - 0.01); g.arc(C, C, r0 + 3, a1 - 0.01, a0 + 0.01, true); g.closePath();
          if (glow) { if (Math.random() < 0.45) { g.strokeStyle = `rgba(70,240,230,${0.35 + Math.random() * 0.4})`; g.lineWidth = 2 + Math.random() * 2.5; g.stroke(); } }
          else { g.fillStyle = `rgb(${c - 10},${c - 4},${c + 2})`; g.fill(); g.strokeStyle = '#05070a'; g.lineWidth = 7; g.stroke(); }
        }
      }
      // 갈라진 금 (발광)
      g.lineCap = 'round';
      if (!glow) for (let i = 0; i < 9000; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * R0 * sc, c = 30 + Math.random() * 30; g.fillStyle = `rgba(${c},${c + 4},${c + 8},${Math.random() * 0.35})`; g.beginPath(); g.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, Math.random() * 6 + 1, 0, 7); g.fill(); }
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = rnd(2.5, R0 - 0.3) * sc; let x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
        g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-55, 55); y += rnd(-55, 55); g.lineTo(x, y); }
        g.strokeStyle = glow ? 'rgba(80,255,240,0.9)' : 'rgba(6,14,16,0.95)'; g.lineWidth = glow ? rnd(2, 4) : 5; g.stroke(); }
      // 중앙 문양 (매듭 고리)
      for (const rr of [1.1, 1.9, 2.15]) { g.beginPath(); g.arc(C, C, rr * sc, 0, 7); g.strokeStyle = glow ? 'rgba(60,200,200,0.5)' : '#0b0e11'; g.lineWidth = glow ? 4 : 10; g.stroke(); }
      if (!glow) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28; g.beginPath(); g.arc(C + Math.cos(a) * 1.5 * sc, C + Math.sin(a) * 1.5 * sc, 0.32 * sc, 0, 7); g.strokeStyle = 'rgba(12,15,18,0.8)'; g.lineWidth = 5; g.stroke(); }
    });
    const map = new THREE.CanvasTexture(draw(false)); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const em = new THREE.CanvasTexture(draw(true)); em.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R0, 96), new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0x3ff0e0, emissiveIntensity: 0.7, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true; G.add(floor);
    // 바깥: 어둠 (낭떠러지)
    const voidM = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x020304 })); voidM.rotation.x = -Math.PI / 2; voidM.position.y = -0.6; G.add(voidM);
    const rimM = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 - 0.4, 3, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 1, side: THREE.DoubleSide })); rimM.position.y = -1.5; G.add(rimM);
    // 붉은 원 (예시 이미지 4)
    const red = new THREE.Mesh(new THREE.RingGeometry(9.55, 9.75, 128), new THREE.MeshBasicMaterial({ color: 0xc8282a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    red.rotation.x = -Math.PI / 2; red.position.y = 0.03; G.add(red);
    // 4방향 쐐기 장식 (예시 이미지 5)
    const dark = new THREE.MeshStandardMaterial({ color: 0x22282e, roughness: 0.8, flatShading: true });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, w = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), dark); w.rotation.x = Math.PI / 2; w.rotation.z = -a + Math.PI / 2; w.scale.set(1, 1, 0.25); w.position.set(Math.cos(a) * 8.3, 0.12, Math.sin(a) * 8.3); G.add(w); }
    // 외벽: 보스룸을 둘러싼 돌벽 (첫 휠윈드 때 전부 무너진다)
    const wallM = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.95, flatShading: true }), wallD = new THREE.MeshStandardMaterial({ color: 0x272d33, roughness: 1, flatShading: true });
    this.vWalls = [];
    const NW = 28;
    for (let i = 0; i < NW; i++) {
      const a = i / NW * Math.PI * 2, r = R0 + 0.55, h = Math.sin(a) > 0.3 ? rnd(1.3, 2.0) : rnd(2.6, 4.0), seg = new THREE.Group(); // 화면 아래쪽(카메라 쪽) 벽은 낮게
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.25, h, 0.9), i % 3 ? wallM : wallD); b.position.y = h / 2; b.castShadow = b.receiveShadow = true; seg.add(b);
      for (let k = 0; k < 2; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.5, 0.9), rnd(0.3, 0.6), 0.95), wallD); c.position.set(rnd(-0.8, 0.8), h + 0.1, 0); seg.add(c); }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.1, h * 0.8), new THREE.MeshBasicMaterial({ color: 0x40f0e0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.set(rnd(-0.6, 0.6), h * 0.45, 0.46); seg.add(glow);
      seg.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); seg.rotation.order = 'YXZ'; seg.rotation.y = -a + Math.PI / 2; G.add(seg);
      this.vWalls.push({ g: seg, a, r, h });
    }
    for (const [x, z] of [[0, 0], [-7, -6], [7, -6], [-7, 6], [7, 6]]) { const l = new THREE.PointLight(0x3fe8e0, x === 0 ? 10 : 14, 12); l.position.set(x, 2.2, z); G.add(l); }
    this.scene.add(G); return G;
  }
  // 궁궐 (예시 이미지 5·6·7): 어두운 대리석 + 붉은 융단 + 촛대 + 계단 위 금빛 날개 옥좌 + 고딕 창
  _buildPalace() {
    const G = new THREE.Group(), rnd = (a, b) => a + Math.random() * (b - a);
    const marble = new THREE.CanvasTexture(View._canvas(1024, (g, n) => {
      g.fillStyle = '#161a1e'; g.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 256) for (let x = 0; x < n; x += 256) { const c = 20 + Math.random() * 10; g.fillStyle = `rgb(${c},${c + 4},${c + 8})`; g.fillRect(x + 2, y + 2, 252, 252); }
      g.lineCap = 'round';
      for (let i = 0; i < 60; i++) { let x = Math.random() * n, y = Math.random() * n; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += rnd(-40, 40); y += rnd(-25, 45); g.lineTo(x, y); } g.strokeStyle = `rgba(200,210,220,${rnd(0.08, 0.3)})`; g.lineWidth = rnd(0.6, 2.2); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; for (let k = 0; k <= n; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, n); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(n, k); g.stroke(); }
    }));
    marble.wrapS = marble.wrapT = THREE.RepeatWrapping; marble.repeat.set(7, 7); marble.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: marble, roughness: 0.25, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; G.add(floor);
    // 붉은 융단 (금빛 마름모 무늬 · 베이지 테두리)
    const carpet = new THREE.CanvasTexture(View._canvas(256, (g, n) => {
      g.fillStyle = '#5a1420'; g.fillRect(0, 0, n, n);
      g.fillStyle = '#d8c8a0'; g.fillRect(0, 0, 18, n); g.fillRect(n - 18, 0, 18, n); g.fillStyle = '#7a2430'; g.fillRect(6, 0, 6, n); g.fillRect(n - 12, 0, 6, n);
      for (let y = 0; y < n; y += 32) for (let x = 32; x < n - 24; x += 32) { g.save(); g.translate(x + 2, y + 16); g.rotate(Math.PI / 4); g.strokeStyle = '#c89a48'; g.lineWidth = 2; g.strokeRect(-8, -8, 16, 16); g.fillStyle = '#8a2a36'; g.fillRect(-4, -4, 8, 8); g.restore(); }
    }));
    carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(1, 9); carpet.colorSpace = THREE.SRGBColorSpace;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 34), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95, color: 0xa08888 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, -3); rug.receiveShadow = true; G.add(rug);
    // 양옆 대리석 단 (베이지 테두리)
    const trim = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ map: marble, roughness: 0.3, color: 0xb0b8c0 });
    for (const sx of [-1, 1]) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 34), dark); plat.position.set(sx * 10.6, 0.17, -3); plat.receiveShadow = true; G.add(plat);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 34), trim); edge.position.set(sx * 7.6, 0.2, -3); G.add(edge);
    }
    // 촛대 (양옆 줄 · 촛불 빛)
    const gold = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.8, roughness: 0.35 }), flame = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    for (const sx of [-1, 1]) for (let z = -15; z <= 10; z += 5) {
      const c = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.4, 8), gold); pole.position.y = 1.2; c.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), gold); arm.position.y = 2.3; c.add(arm);
      for (const dx of [-0.42, 0, 0.42]) { const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xf0e6d0 })); cd.position.set(dx, 2.44, 0); c.add(cd); const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), flame); f.position.set(dx, 2.6, 0); f.scale.y = 1.8; c.add(f); }
      c.position.set(sx * 7.9, 0.35, z); c.traverse(o => { if (o.isMesh) o.castShadow = true; }); G.add(c);
      if ((z + 15) % 10 === 0) { const l = new THREE.PointLight(0xffb060, 9, 9); l.position.set(sx * 7.9, 2.9, z); G.add(l); }
    }
    // 계단 · 옥좌 · 금빛 날개
    const step = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7 });
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(14 - i * 1.2, 0.3, 1.1), step); st.position.set(0, 0.15 + i * 0.3, -13.2 - i * 1.0); st.receiveShadow = true; G.add(st); }
    const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.6), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 })); rug2.rotation.x = -Math.PI / 2 + 0.29; rug2.position.set(0, 0.7, -14.6); G.add(rug2);
    const throne = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), gold); seat.position.y = 0.5; throne.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 0.3), gold); back.position.set(0, 1.9, -0.5); throne.add(back);
    for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) { const fe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.6 - k * 0.18, 0.06), gold); fe.position.set(sx * (0.6 + k * 0.26), 2.4 + k * 0.08, -0.6); fe.rotation.z = -sx * (0.25 + k * 0.17); throne.add(fe); }
    throne.position.set(0, 1.25, -17.4); throne.traverse(o => { if (o.isMesh) o.castShadow = true; }); G.add(throne);
    const tl = new THREE.PointLight(0xffd890, 18, 10); tl.position.set(0, 4, -15.5); G.add(tl);
    // 뒷벽 · 고딕 창 · 커튼 · 기둥
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 1), new THREE.MeshStandardMaterial({ color: 0x2c2e34, roughness: 0.95 })); wall.position.set(0, 7, -19.5); G.add(wall);
    const winM = new THREE.MeshBasicMaterial({ color: 0x6f8fc0, transparent: true, opacity: 0.85 });
    for (const x of [-8, -5.5, 5.5, 8]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.2), winM); w.position.set(x, 6, -18.95); G.add(w); const arch = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16, 0, Math.PI), winM); arch.position.set(x, 8.1, -18.95); G.add(arch); }
    const curtain = new THREE.MeshStandardMaterial({ color: 0x5a1218, roughness: 1 });
    for (const x of [-11, -3, 3, 11]) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 0.3), curtain); c.position.set(x, 5.5, -18.8); G.add(c); }
    const pil = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.8 });
    for (const sx of [-1, 1]) for (let z = -16; z <= 12; z += 7) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 9, 12), pil); p.position.set(sx * 13.5, 4.5, z); p.castShadow = true; G.add(p); }
    // 빛줄기 (높은 창에서 들어오는 빛)
    const ray = new THREE.MeshBasicMaterial({ color: 0x9fb8e0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const x of [-6, 6]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 18), ray); r.position.set(x, 5, -10); r.rotation.set(-0.9, 0, x > 0 ? -0.3 : 0.3); G.add(r); }
    this.scene.add(G); return G;
  }
  // 2층 필드 (예시 이미지 8·9): 짙은 풀밭 + 푸르스름한 흙 + 고사리 · 덩굴 뿌리 · 뼈
  _buildGrass() {
    const G = new THREE.Group(), rnd = (a, b) => a + Math.random() * (b - a);
    const cv = View._canvas(1024, (g, n) => {
      g.fillStyle = '#1f2c1a'; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 60; i++) { const x = Math.random() * n, y = Math.random() * n, r = rnd(40, 140), gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, Math.random() < 0.45 ? 'rgba(44,48,70,0.75)' : 'rgba(52,72,36,0.7)'); gr.addColorStop(1, 'rgba(30,40,28,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      for (let i = 0; i < 26000; i++) { const x = Math.random() * n, y = Math.random() * n, c = Math.random(); g.strokeStyle = c < 0.5 ? `rgba(${60 + Math.random() * 40},${90 + Math.random() * 50},${40},0.5)` : `rgba(${30},${50 + Math.random() * 30},${26},0.6)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - rnd(3, 8)); g.stroke(); }
    });
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 4); tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; G.add(ground);
    const out = (x, z) => Math.abs(x) > 6.6 || Math.abs(z) > 9.8;
    const fern = new THREE.CanvasTexture(View._canvas(128, (g) => { g.strokeStyle = '#5f8a3e'; g.lineWidth = 3; for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.22; g.beginPath(); g.moveTo(64, 128); g.quadraticCurveTo(64 + Math.cos(a) * 40, 128 + Math.sin(a) * 70, 64 + Math.cos(a) * 60, 128 + Math.sin(a) * 120); g.stroke(); for (let j = 1; j < 8; j++) { const px = 64 + Math.cos(a) * j * 7.5, py = 128 + Math.sin(a) * j * 15; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 10, py - 4); g.moveTo(px, py); g.lineTo(px + 10, py - 4); g.stroke(); } } }));
    fern.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: fern, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: 0xb0d090 });
    for (let i = 0; i < 120; i++) { let x, z; do { x = rnd(-11, 11); z = rnd(-17, 12); } while (!out(x, z));
      const sz = rnd(0.9, 2.2), f = new THREE.Group(); for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), fm); p.position.y = sz / 2 - 0.05; p.rotation.y = k * Math.PI / 3; f.add(p); } f.position.set(x, 0, z); G.add(f); }
    // 굵은 뿌리 · 쓰러진 나무 · 바위 · 뼈
    const bark = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1, flatShading: true }), rock = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 1, flatShading: true }), bone = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 });
    for (let i = 0; i < 14; i++) { let x, z; do { x = rnd(-13, 13); z = rnd(-18, 10); } while (!out(x, z)); const r = new THREE.Mesh(new THREE.CylinderGeometry(rnd(0.15, 0.35), rnd(0.3, 0.6), rnd(4, 9), 7), bark); r.position.set(x, 0.3, z); r.rotation.set(Math.PI / 2 - 0.12, rnd(0, 6.28), 0); r.castShadow = true; G.add(r); }
    for (let i = 0; i < 18; i++) { let x, z; do { x = rnd(-12, 12); z = rnd(-18, 12); } while (!out(x, z)); const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.3, 1.1)), rock); r.position.set(x, 0.2, z); r.rotation.set(Math.random(), Math.random(), 0); r.castShadow = true; G.add(r); }
    for (let i = 0; i < 16; i++) { const x = rnd(-6, 6), z = rnd(-9, 9); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, rnd(0.3, 0.6), 5), bone); b.position.set(x, 0.04, z); b.rotation.set(Math.PI / 2, 0, rnd(0, 6.28)); G.add(b); }
    for (const [x, z, c] of [[-10, -10, 0x6f8fff], [10, -4, 0x9fd08f], [-9, 8, 0x6f8fff]]) { const l = new THREE.PointLight(c, 12, 14); l.position.set(x, 3, z); G.add(l); }
    this.scene.add(G); return G;
  }
  // 낙원 입장 전후 광장 (예시 이미지 12): 푸른 마법진 바닥 + 가운데 수정구 받침대 + 금빛 고리 + 난간
  _buildPlaza() {
    const G = new THREE.Group(), R0 = 11;
    const N = 2048, C = N / 2, sc = N / (R0 * 2);
    const draw = (glow) => View._canvas(N, (g) => {
      g.fillStyle = glow ? '#000' : '#0a1430'; g.fillRect(0, 0, N, N);
      if (!glow) { for (let i = 0; i < 4000; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * R0 * sc; g.fillStyle = `rgba(${40 + Math.random() * 40},${70 + Math.random() * 50},${140 + Math.random() * 60},${Math.random() * 0.35})`; g.beginPath(); g.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, Math.random() * 3 + 0.5, 0, 7); g.fill(); } }
      const st = glow ? 'rgba(150,200,255,0.9)' : 'rgba(150,180,230,0.55)';
      g.strokeStyle = st; g.lineWidth = glow ? 4 : 3;
      for (const r of [1.6, 2.2, 3.6, 4.0, 6.4, 6.9, 9.4, 10.2, 10.8]) { g.beginPath(); g.arc(C, C, r * sc, 0, 7); g.stroke(); }
      g.lineWidth = glow ? 2.5 : 2;
      for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; g.beginPath(); g.moveTo(C + Math.cos(a) * 2.2 * sc, C + Math.sin(a) * 2.2 * sc); g.lineTo(C + Math.cos(a) * 10.2 * sc, C + Math.sin(a) * 10.2 * sc); g.stroke(); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28 + 0.2; g.beginPath(); g.arc(C + Math.cos(a) * 5.2 * sc, C + Math.sin(a) * 5.2 * sc, 1.25 * sc, 0, 7); g.stroke(); }
      for (let k = 0; k < 3; k++) { g.beginPath(); for (let j = 0; j <= 6; j++) { const a = j / 6 * 6.28 + k * 0.35; const x = C + Math.cos(a) * 8.1 * sc, y = C + Math.sin(a) * 8.1 * sc; j ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      if (!glow) for (let k = 0; k < 72; k++) { const a = k / 72 * 6.28; g.fillStyle = 'rgba(190,210,255,0.6)'; g.font = `${0.35 * sc}px serif`; g.save(); g.translate(C + Math.cos(a) * 9.8 * sc, C + Math.sin(a) * 9.8 * sc); g.rotate(a + Math.PI / 2); g.fillText('ᚱᚢᚾᛖᛋ'[k % 5], 0, 0); g.restore(); }
    });
    const map = new THREE.CanvasTexture(draw(false)); map.colorSpace = THREE.SRGBColorSpace; const em = new THREE.CanvasTexture(draw(true)); em.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R0, 96), new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0x5fa8ff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.003; floor.receiveShadow = true; G.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 1 })); outer.rotation.x = -Math.PI / 2; G.add(outer);
    // 수정구 받침대 · 금빛 고리
    const stone = new THREE.MeshStandardMaterial({ color: 0x2a3448, roughness: 0.6, metalness: 0.3 }), gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 0.6, 8), stone); base.position.y = 0.3; G.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.4, 8), stone); col.position.y = 1.3; G.add(col);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 24), new THREE.MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x3f7fff, emissiveIntensity: 0.8, transparent: true, opacity: 0.65, roughness: 0.05 }));
    orb.position.y = 2.9; G.add(orb);
    const rings = [];
    for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.3 + k * 0.25, 0.04, 8, 64), gold); t.position.y = 2.9; t.rotation.set(Math.random() * 3, Math.random() * 3, 0); G.add(t); rings.push(t); }
    const ol = new THREE.PointLight(0x7fb0ff, 30, 14); ol.position.set(0, 3, 0); G.add(ol);
    // 난간 · 나무 · 기둥
    const rail = new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.8 });
    for (let k = 0; k < 40; k++) { const a = k / 40 * 6.28; if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) * 0 === 0 && Math.sin(a) > 0) continue; const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.35), rail); p.position.set(Math.cos(a) * (R0 + 0.4), 0.45, Math.sin(a) * (R0 + 0.4)); p.rotation.y = -a + Math.PI / 2; G.add(p); }
    const leaf = new THREE.MeshStandardMaterial({ color: 0x1e3a2a, roughness: 1, flatShading: true }), bark = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 });
    for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28 + 0.1, r = R0 + 3 + Math.random() * 3; const t = new THREE.Group(); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3, 7), bark); tr.position.y = 1.5; t.add(tr); const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), leaf); cr.position.y = 3.6; t.add(cr); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); G.add(t); }
    this.plazaAnim = (t) => { orb.material.emissiveIntensity = 0.7 + 0.2 * Math.sin(t * 2); rings.forEach((r, i) => { r.rotation.x += 0.004 * (i + 1); r.rotation.y += 0.006 * (i + 1); }); };
    this.scene.add(G); return G;
  }
  _resetWalls() { for (const w of this.vWalls || []) { w.g.visible = true; w.g.position.set(Math.cos(w.a) * w.r, 0, Math.sin(w.a) * w.r); w.g.rotation.set(0, -w.a + Math.PI / 2, 0); } this.wallsFallen = false; }
  // 발탄 첫 휠윈드: 보스룸 바깥 외벽이 전부 바깥쪽으로 무너져 내린다
  _collapseWalls() {
    if (this.theme !== 'valtan' || this.wallsFallen) return; this.wallsFallen = true;
    this.shakeT = Math.max(this.shakeT || 0, 0.9);
    const W = this.vWalls.map(w => ({ ...w, delay: Math.random() * 0.8, spin: (Math.random() - 0.5) * 0.6 }));
    for (const w of W) this.anims.push({ t: 0, update: (t, dt) => {
      const k = t - w.delay; if (k < 0) return false;
      if (k < dt * 1.5) this.vfx.spawn('vt_dust', w.g.position.clone(), 0, 1.6);
      const f = Math.min(1, k / 0.9); w.g.rotation.x = f * f * 1.45; w.g.rotation.z = w.spin * f;
      const out = 0.8 * f; w.g.position.set(Math.cos(w.a) * (w.r + out), -Math.max(0, k - 0.7) * 4, Math.sin(w.a) * (w.r + out));
      if (k > 1.9) { w.g.visible = false; return true; } } });
  }

  resize() {
    const w = this.host.clientWidth || 400, h = this.host.clientHeight || 700;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // 보드 전체(가로 ~12m, 세로 ~16m)가 화면에 들어오도록 거리 계산
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const needW = 12.4, needD = 17;
    const dW = needW / 2 / Math.tan(hfov / 2), dD = needD / 2 / Math.tan(vfov / 2) * 0.85;
    const d = Math.max(dW, dD);
    const el = THREE.MathUtils.degToRad(58);
    this.camera.position.set(0, Math.sin(el) * d, Math.cos(el) * d + 0.8);
    this.camera.lookAt(0, 0, 0.8);
    this.camera.updateProjectionMatrix();
    this._applyShift();
    if (this.lobby) { this.lobby.cam.aspect = w / h; this.lobby.cam.updateProjectionMatrix(); this.lobby.fcam.aspect = w / h; this.lobby.fcam.updateProjectionMatrix(); }
  }
  // 대기 단계 장비 창이 열리면 화면을 위로 밀어 아군 진영이 창 위에 보이게 한다 (픽셀 단위 목표값)
  setShift(px) { this.shiftT = px; if (!this.active) { this.shift = px; this._applyShift(); } }
  _applyShift() {
    const w = this.host.clientWidth || 400, h = this.host.clientHeight || 700, s = this.shift || 0;
    if (s < 0.5) { if (this.camera.view) this.camera.clearViewOffset(); }
    else this.camera.setViewOffset(w, h, 0, s, w, h);
  }

  // ───────── 유닛 ─────────
  _tintClone(root, tint) {
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (/Icosphere/i.test(o.name)) { o.visible = false; return; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = mats.map(m => { const c = m.clone(); c.userData.baseColor = c.color.clone(); if (tint != null) c.color.multiply(new THREE.Color(tint)); if (!c.emissiveMap) c.emissive = new THREE.Color(0x000000); else c.emissiveIntensity = 2.2; return c; });
      o.material = Array.isArray(o.material) ? nm : nm[0];
    });
  }

  addUnit(u) {
    const grp = new THREE.Group();
    let obj, clips, scaleTo;
    if (u.dh) {
      obj = skClone(this.models.DH_base.scene);
      clips = this.clips.DH; scaleTo = 2.0;
      // 무기 부착
      const wps = { pistol: [], shotgun: [], rifle: [] };
      obj.traverse(o => { if (o.isMesh && /wp_gdh_hr_00h/.test(o.name)) wps.pistol.push(o); });
      for (const k of ['shotgun', 'rifle']) {
        const W = this.weapons[k]; let bone = null;
        obj.traverse(o => { if (o.name === W.bone) bone = o; });
        const m = W.mesh.clone(); m.position.copy(W.mesh.position); m.quaternion.copy(W.mesh.quaternion); m.scale.copy(W.mesh.scale);
        m.visible = false; bone.add(m); wps[k].push(m);
      }
      grp.userData.weapons = wps;
    } else if (u.kind === 'sr') {
      obj = skClone(this.models.SR_base.scene); clips = this.clips.SR; scaleTo = 1.95;
    } else if (u.kind === 'shana') {
      obj = skClone(this.models.Shana.scene); clips = this.clips.Shana; scaleTo = 1.8;
    } else if (u.kind === 'bk') {
      obj = skClone(this.models.BK_base.scene); clips = this.clips.BK; scaleTo = 2.0;
    } else if (u.kind === 'bd') {
      obj = skClone(this.models.BD_base.scene); clips = this.clips.BD; scaleTo = 1.85;
    } else if (u.kind === 'lahart') {
      obj = skClone(this.models.Lahart.scene); clips = this.clips.Lahart; scaleTo = 2.2;
    } else if (u.kind === 'azena') {
      // 아제나 · 이난나: 두 모델을 함께 두고 형태가 바뀔 때 전환
      obj = skClone(this.models.Azena.scene); clips = this.clips.Azena; scaleTo = 2.0;
      const ob2 = skClone(this.models.Inanna.scene); this._tintClone(ob2, null);
      const b2 = new THREE.Box3().setFromObject(ob2); ob2.scale.setScalar(2.0 / (b2.max.y - Math.max(0, b2.min.y))); ob2.visible = false; grp.add(ob2);
      grp.userData.forms = { inanna: { obj: ob2, mixer: new THREE.AnimationMixer(ob2), clips: this.clips.Inanna } };
    } else if (u.kind === 'federico') {
      obj = skClone(this.models.Federico.scene); clips = this.clips.Federico; scaleTo = 2.0;
    } else if (u.kind === 'aman') {
      obj = skClone(this.models.Aman.scene); clips = this.clips.Aman; scaleTo = 1.85;
    } else if (u.kind === 'neria') {
      obj = skClone(this.models.Neria.scene); clips = this.clips.Neria; scaleTo = 1.75;
    } else if (u.kind === 'silian') {
      obj = skClone(this.models.Silian.scene); clips = this.clips.Silian; scaleTo = 1.95;
    } else if (u.kind === 'hidaka') {
      obj = skClone(this.models.Hidaka.scene); clips = this.clips.Hidaka; scaleTo = 2.1;
    } else {
      const mk = this.models[u.model] ? u.model : 'Beast_02'; // 쓰지 않는 모델은 불러오지 않는다
      obj = skClone(this.models[mk].scene);
      clips = this.clips[mk]; scaleTo = u.h * 1.1;
    }
    this._tintClone(obj, u.tint);
    const box = new THREE.Box3().setFromObject(obj);
    const h = box.max.y - Math.max(0, box.min.y);
    obj.scale.setScalar(scaleTo / h);
    grp.add(obj);
    // 발밑 원
    const ring = new THREE.Mesh(new THREE.CircleGeometry(u.rad * 1.1, 32), new THREE.MeshBasicMaterial({ color: u.side === 'ally' ? 0x48a6ff : u.side === 'shop' ? 0xf3d27a : u.boss ? 0xff2a2a : 0xd85a3a, transparent: true, opacity: 0.45, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; grp.add(ring);
    grp.position.set(u.x, 0, u.z);
    grp.rotation.y = u.face;
    this.scene.add(grp);

    const mixer = new THREE.AnimationMixer(obj);
    const vis = { u, grp, obj, mixer, clips, cur: null, curName: '', lockT: 0, dead: false, deadT: 0, flash: 0, height: scaleTo, stance: 'pistol' };
    if (grp.userData.forms) { vis.forms = { azena: { obj, mixer, clips }, ...grp.userData.forms }; vis.form = 'azena'; }
    // HP바
    const el = document.createElement('div');
    el.className = 'hpw' + (u.side === 'ally' ? ' ally' : '') + (u.boss ? ' boss' : '') + (u.side === 'shop' ? ' shop' : '');
    el.innerHTML = `<div class="hpn">${u.boss || u.side === 'shop' ? u.name : ''}</div><div class="hpb"><i class="hpf"></i><i class="hps"></i></div>` + (u.side === 'ally' && !u.noMana ? '<div class="mpb"><i></i></div>' : '') + (u.dh ? '<div class="stc"></div>' : '') + (u.ident ? '<div class="sub"><i></i></div>' : '') + (u.side === 'ally' ? '<div class="eqi"></div>' : '');
    this.overlay.appendChild(el);
    vis.el = el; vis.hpf = el.querySelector('.hpf'); vis.hps = el.querySelector('.hps'); vis.mpf = el.querySelector('.mpb i'); vis.stc = el.querySelector('.stc'); vis.subf = el.querySelector('.sub i'); vis.eqi = el.querySelector('.eqi');
    this.units.set(u.id, vis);
    if (u.dh) this._setStance(vis, u.stance || 'pistol');
    this._play(vis, this._idleName(vis), { loop: true });
    if (!u.alive) { this._play(vis, 'dead_1_loop', { loop: true }); vis.dead = true; }
    return vis;
  }

  // 아제나 ↔ 이난나 모델 전환
  _setForm(v, form) {
    const F = v.forms[form]; if (!F || v.form === form) return;
    const old = v.forms[v.form]; old.obj.visible = false; old.mixer.stopAllAction();
    F.obj.visible = true; v.obj = F.obj; v.mixer = F.mixer; v.clips = F.clips; v.cur = null; v.curName = ''; v.form = form;
    this.vfx.spawn(form === 'inanna' ? 'heal_fx' : 'az_impact', v.grp.position.clone(), 0, form === 'inanna' ? 1.6 : 0.6);
    this._ring(v.u.x, v.u.z, 1.8, form === 'inanna' ? '#ffd98a' : '#ff6a4a', 0.7);
    this._play(v, this._idleName(v), { loop: true });
  }
  _idleName(v) { return v.u.dh ? DH.idle[v.stance] : (v.u.def?.idle || 'idle_battle_1'); }
  _runName(v) { return v.u.dh ? DH.run[v.stance] : (v.u.def?.run || 'run_battle_1'); }

  _setStance(v, st) {
    v.stance = st;
    const w = v.grp.userData.weapons;
    for (const k of ['pistol', 'shotgun', 'rifle']) for (const m of w[k]) m.visible = k === st;
  }

  _play(v, name, { loop = false, dur = 0, fade = 0.12, keepLock = false, from = 0 } = {}) {
    const clip = v.clips?.[name] || v.clips?.['idle_battle_1'] || v.clips?.[v.u.def?.idle];
    if (!clip) { if (!keepLock) v.lockT = loop ? 0 : (dur > 0 ? dur : 0.6); return; } // 동작 없는 모델
    const a = v.mixer.clipAction(clip);
    if (v.cur === a && loop) return;
    // 같은 클립을 연속 재생할 때 자기 자신과 크로스페이드하면 가중치가 0으로 떨어져 모션이 끊긴다 → 페이드 없이 처음부터
    a.stopFading(); a.reset(); a.setEffectiveWeight(1);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.timeScale = dur > 0 ? clip.duration * (1 - from) / dur : 1;
    if (from > 0) a.time = clip.duration * from;
    if (v.cur && v.cur !== a) a.crossFadeFrom(v.cur, fade, false);
    a.play();
    v.cur = a; v.curName = name;
    if (!keepLock) v.lockT = loop ? 0 : (dur > 0 ? dur : clip.duration);
  }

  // 여러 구간을 이어서 재생 (예: 잔혹한 추적자 01 → 02)
  _playSeq(v, clips, total) {
    v.seq = clips.slice(1).map((c, i) => ({ ...c, at: clips.slice(0, i + 1).reduce((s, x) => s + x.dur, 0) }));
    v.seqT = 0;
    this._play(v, clips[0].clip, { dur: clips[0].dur, fade: 0.08 });
    v.lockT = total;
  }

  // 풀에서 이펙트 광원 하나 빌리기 (모두 쓰는 중이면 빛 없이 진행)
  fxLight(color, intensity, dist, x, y, z) {
    const l = this.lightPool.find(o => !o.userData.busy);
    if (!l) return { isDummy: true, intensity: 0, position: new THREE.Vector3(), color: new THREE.Color() };
    l.userData.busy = true; l.color.set(color); l.intensity = intensity; l.distance = dist; l.position.set(x, y, z); return l;
  }
  freeLight(l) { if (l && !l.isDummy) { l.intensity = 0; l.userData.busy = false; } }
  clear() {
    if (this.lobby?.mode === 'map') this.hideLobby();
    for (const l of this.lightPool) this.freeLight(l);
    for (const v of this.units.values()) { this._dropTornado(v); this.scene.remove(v.grp); v.el.remove(); }
    this.units.clear();
    for (const f of this.fx) this.scene.remove(f.m); this.fx = [];
    for (const p of this.projs) this.scene.remove(p.m); this.projs = [];
    for (const a of this.anims) a.remove?.(); this.anims = [];
    this.vfx.clear();
    this.overlay.querySelectorAll('.dmgt,.bn').forEach(e => e.remove());
  }

  // 전투 이벤트 → 연출
  handle(events, battle) {
    for (const e of events) {
      const v = this.units.get(e.id);
      switch (e.t) {
        case 'act':
          if (!v) break;
          if (e.kind === 'cancel') { v.seq = null; v.lockT = 0; break; }
          if (e.kind === 'stun') { v.seq = null; this._play(v, v.clips.dmg_idle_1 ? 'dmg_idle_1' : this._idleName(v), { dur: e.dur, fade: 0.05 }); break; }
          if (e.kind === 'stagger') this._play(v, v.clips.dmg_critical_start_1 ? 'dmg_critical_start_1' : 'idle_battle_1', { dur: e.dur });
          else if (e.clips) this._playSeq(v, e.clips, e.dur);
          else { v.seq = null; this._play(v, e.clip, { dur: e.dur, fade: 0.08 }); }
          break;
        case 'stance': if (v) { this._setStance(v, e.stance); if (!v.lockT) this._play(v, this._idleName(v), { loop: true }); this._ring(v.u.x, v.u.z, 1.0, e.stance === 'shotgun' ? '#ffb36b' : e.stance === 'rifle' ? '#c7ff8a' : '#9fd8ff', 0.4); } break;
        case 'dmg': if (v) { v.flash = 0.12; if (e.side !== 'ally') this._num(v, e.v, e.mag ? (e.crit ? '#8fd0ff' : '#4a9cff') : (e.crit ? '#ff7a5a' : '#ff3b30'), e.crit); } break; // 전투 숫자는 준 피해만: 마법 파랑 · 물리 빨강 (아군이 받은 피해는 표시하지 않음)
        case 'heal': if (v) this._num(v, '+' + e.v, '#7ee08a'); break;
        case 'text': if (v) this._num(v, e.msg, e.color || '#fff', false, true); break;
        case 'form': if (v && v.forms) this._setForm(v, e.form); break;
        case 'die': if (v && v.forms && v.form !== 'azena') this._setForm(v, 'azena'); if (v) { v.dead = true; v.deadT = 0; v.seq = null; v.sink = 0; this._play(v, 'dead_1', { fade: 0.1 }); v.lockT = 0; } break;
        case 'vanish': if (v) { v.dead = true; v.vanishT = 0.5; v.seq = null; v.el.style.display = 'none'; this._ring(e.x, e.z, 2.4, '#c99bff', 0.7); } break;
        case 'transform': if (v) {
          v.obj.traverse(o => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.userData.baseColor) { m.color.copy(m.userData.baseColor).multiply(new THREE.Color(e.tint)).multiplyScalar(1.6); if (m.emissiveMap) { m.emissiveMap = View.grayTex(m.emissiveMap); m.emissive.set(e.tint); m.emissiveIntensity = 2.6; } } });
          const k = e.h / v.height; v.obj.scale.multiplyScalar(k); v.height = e.h;
          v.el.querySelector('.hpn').textContent = e.name; v.el.classList.add('merged');
          this._ring(v.u.x, v.u.z, 3, '#c99bff', 0.9); this._disc(v.u.x, v.u.z, 2.2, '#b46cff', 0.7);
          this._play(v, v.clips.dmg_critical_start_1 ? 'dmg_critical_start_1' : 'idle_battle_1', { dur: 1.2 });
        } break;
        case 'revive': if (v) { v.dead = false; v.sink = 0; v.grp.visible = true; v.grp.position.y = 0; this._play(v, this._idleName(v), { loop: true }); this._ring(v.u.x, v.u.z, 2, '#ffd166', 0.8); } break;
        case 'spawn': { const u = battle.units.find(x => x.id === e.id); if (u) { this.addUnit(u); this._ring(u.x, u.z, 1.5, '#ff4040', 0.6); } break; }
        case 'tele': if (v) { v.grp.position.set(v.u.x, 0, v.u.z); this._ring(v.u.x, v.u.z, 1.4, '#7fe9ff', 0.5); } break;
        case 'proj': { const a = this.units.get(e.from), b = this.units.get(e.to); if (a && b) this._proj(a, b, e.color, e.big); break; }
        case 'fx': this._fx(e); break;
        case 'flash': if (v) { v.flashT = e.dur; this._ring(v.u.x, v.u.z, 1.6, '#e0c8ff', 0.6); } break;
        case 'vfx': this._vfx(e); break;
        case 'whirl': if (v) {
          const C = { red: [1, 0.2, 0.12], blue: [0.3, 0.6, 1], purple: [0.72, 0.38, 1] }[e.color || v.spinColor || 'red'];
          if (e.on) {
            v.spin = true; v.spinColor = e.color; v.spinC = C; v.spinAcc = 0; v.lockT = 0; v.seq = null;
            if (v.tornado) this._dropTornado(v);
            v.spinR = e.r || 1.8;
            v.tornado = this._tornado(v, C); v.tornadoK = 0; v.tornadoOut = false;
            v.spinRing = this.vfx.emitOne('whirl_ring', v.grp.position.clone(), { color: C.map(x => x * 0.35), follow: v.grp, persistent: true });
            if (v.spinRing) v.spinRing.size = v.spinR * 2.1; // 바닥 고리 = 판정 범위
          } else { v.spin = false; v.tornadoOut = true; this.vfx.kill(v.spinRing); v.spinRing = null; }
        } break;
        case 'spin': if (v) this._spin(v, e); break;
        case 'ghost': if (v) this._ghostify(v); break;
        case 'shield': if (v) this._ring(v.u.x, v.u.z, (v.u.rad || 0.5) * 1.6, '#9ad0ff', 0.5); break;
        case 'banner': this.banner(e.msg, e.color); break;
      }
    }
  }

  // 발광 맵을 흑백으로 바꿔 합체 후 보라색으로 다시 물들일 수 있게 한다
  static grayTex(t) {
    if (t.userData.gray) return t.userData.gray;
    const img = t.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const m = Math.max(a[i], a[i + 1], a[i + 2]); a[i] = a[i + 1] = a[i + 2] = m; }
    g.putImageData(d, 0, 0);
    const nt = new THREE.CanvasTexture(c); nt.flipY = t.flipY; nt.colorSpace = t.colorSpace; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
    t.userData.gray = nt; return nt;
  }

  // 슈헤리트 하늘의 검: 붉은 장판(테두리 발광) → 하늘에서 검 낙하 → 착탄 폭발, 검은 잠시 꽂혀 있다 사라짐
  static markTexture() {
    if (View._markTex) return View._markTex;
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    grd.addColorStop(0, 'rgba(150,10,10,0.35)'); grd.addColorStop(0.8, 'rgba(190,15,15,0.5)'); grd.addColorStop(0.93, 'rgba(255,40,40,0.95)'); grd.addColorStop(1, 'rgba(255,60,60,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,90,90,0.9)'; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r0 = 112, r1 = 112 - 6 - Math.random() * 10; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a + 0.05) * r1, 128 + Math.sin(a + 0.05) * r1); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (View._markTex = t);
  }
  static swordMesh() {
    const grp = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8c8b0, metalness: 0.8, roughness: 0.3, emissive: 0xff6a20, emissiveIntensity: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xb08030, metalness: 0.9, roughness: 0.35, emissive: 0x803000, emissiveIntensity: 0.4 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 0.05), steel); blade.position.y = 1.0;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.35, 4), steel); tip.rotation.x = Math.PI; tip.position.y = -0.17; tip.scale.z = 0.35;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.12), gold); guard.position.y = 2.05;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.45, 8), gold); grip.position.y = 2.32;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), gold); pom.position.y = 2.58;
    grp.add(blade, tip, guard, grip, pom);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }
  // 휠윈드 (발탄 · 윌리윌리 · 호박단 병사): 회전 + 바깥 회전 잔상 + 3×3 판정 사각형
  _spin(v, e) {
    const C = { red: [1, 0.25, 0.15], orange: [1, 0.6, 0.2], teal: [0.35, 0.95, 1] }[e.color] || [1, 0.4, 0.2];
    if (e.on) {
      v.spinOn = true; v.spinC = C; v.spinHalf = e.half || 2.4; v.seq = null;
      v.spinRot = !(e.clip && /loop/.test(e.clip)); // 회전하는 모션이 있으면 모션으로, 없으면 모델을 돌린다
      if (e.startClip && v.clips[e.startClip]) { this._play(v, e.startClip, { dur: 0.5, fade: 0.05 }); v.spinLoopAt = 0.5; v.spinClip = e.clip; this.anims.push({ t: 0, update: (t) => { if (!v.spinOn) return true; if (t >= 0.5) { this._play(v, v.spinClip, { loop: true, fade: 0.05 }); v.lockT = 99; return true; } } }); v.lockT = 99; }
      else if (e.clip && v.clips[e.clip]) { this._play(v, e.clip, { loop: true, fade: 0.08 }); v.lockT = 99; }
      else v.lockT = 99;
      if (v.spinSq) { this.scene.remove(v.spinSq); v.spinSq = null; }
      const H = v.spinHalf, sq = new THREE.Group();
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...C), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
      fill.rotation.x = -Math.PI / 2; const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-H, -H], [H, -H], [H, H], [-H, H]].map(([x, z]) => new THREE.Vector3(x, 0.01, z))), new THREE.LineBasicMaterial({ color: new THREE.Color(...C), transparent: true, opacity: 0.8 }));
      sq.add(fill, line); sq.position.set(v.grp.position.x, 0.04, v.grp.position.z); this.scene.add(sq); v.spinSq = sq;
    } else {
      v.spinOn = false; v.spinRot = false;
      if (v.spinSq) { const sq = v.spinSq; v.spinSq = null; this.scene.remove(sq); sq.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
      if (!v.dead) { if (e.endClip && v.clips[e.endClip]) this._play(v, e.endClip, { dur: 0.7, fade: 0.08 }); else { v.lockT = 0; this._play(v, this._idleName(v), { loop: true, fade: 0.15 }); } }
    }
  }
  // 유령 발탄: 청록빛 반투명 + 빛 입자
  _ghostify(v) {
    v.obj.traverse(o => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; m.color.set(0x7ff4ff); if (m.emissive) { m.emissive.set(0x1aa8c0); m.emissiveIntensity = 1.2; } } });
    v.ghostAura = true;
    const au = this.vfx.emitOne('ghost_aura', v.grp.position.clone().setY(1.8), { follow: v.grp, persistent: true }); if (au) au.size = 6;
    v.ghostAuraP = au;
    this.vfx.spawn('vt_ghost_on', v.grp.position.clone(), 0, 1.4); this._ring(v.u.x, v.u.z, 4, '#7ff0ff', 0.9); this.shakeT = Math.max(this.shakeT || 0, 0.3);
    v.el.querySelector('.hpn') && (v.el.querySelector('.hpn').textContent = '유령 발탄');
  }
  // 발탄 돌진 예고: 붉은 직사각형 (예시 이미지처럼 진로 전체)
  _chargeMark(e) {
    const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) + 1.2, col = e.ghost ? 0x6ff0ff : 0xff3a2a;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(e.w, L), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(dx, dz); m.rotation.x = -Math.PI / 2;
    m.position.set((e.x0 + e.x1) / 2, 0.035, (e.z0 + e.z1) / 2); m.renderOrder = 8; this.scene.add(m);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(e.w, L), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    edge.rotation.copy(m.rotation); edge.position.copy(m.position); edge.scale.y = 0.01; this.scene.add(edge);
    const D = e.dur;
    this.anims.push({ t: 0, remove: () => { this.scene.remove(m, edge); m.geometry.dispose(); m.material.dispose(); edge.geometry.dispose(); edge.material.dispose(); },
      update: (t) => { m.material.opacity = t < D ? 0.38 * Math.min(1, t / 0.15) : Math.max(0, 0.38 - (t - D) * 1.2);
        const k = Math.min(1, t / Math.max(0.1, D)); edge.scale.y = Math.max(0.01, k); edge.position.set(e.x0 + dx * k / 2, 0.04, e.z0 + dz * k / 2); edge.material.opacity = t < D ? 0.25 : Math.max(0, 0.25 - (t - D) * 1.5);
        return t > D + 0.5; } });
  }
  // 발탄 돌진: 붉은 잔광 띠와 불티
  _valtanDash(a, e) {
    const F = this.vfx, D = e.dur, dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz), col = e.ghost ? 0x6ff0ff : 0xff3020;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1), new THREE.MeshBasicMaterial({ map: View.beamTexture(), color: col, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    band.rotation.order = 'YXZ'; band.rotation.y = Math.atan2(dx, dz); band.rotation.x = -Math.PI / 2; band.renderOrder = 9; this.scene.add(band);
    let acc = 0; this.shakeT = Math.max(this.shakeT || 0, 0.2);
    this.anims.push({ t: 0, remove: () => { this.scene.remove(band); band.geometry.dispose(); band.material.dispose(); },
      update: (t, dt) => {
        const k = Math.min(1, t / D), len = Math.max(0.01, L * k);
        band.scale.y = len; band.position.set(e.x0 + dx * k / 2, 0.9, e.z0 + dz * k / 2);
        band.material.opacity = t < D ? 0.85 : Math.max(0, 0.85 - (t - D) * 1.6);
        if (t < D) { acc += dt * 90; while (acc >= 1) { acc -= 1; F.spawn(e.ghost ? 'vt_dash_spark_g' : 'vt_dash_spark', new THREE.Vector3(e.x0 + dx * k + (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 1.8, e.z0 + dz * k + (Math.random() - 0.5) * 1.2), Math.atan2(-dz, dx) + Math.PI, 1); } }
        return t > D + 0.6;
      } });
  }
  // 내리찍기 예고: 붉은 원이 점점 차오름
  _slamMark(e) {
    const col = e.ghost ? 0x6ff0ff : 0xff3a2a, R = e.r, T = e.impactIn;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
    const fillM = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
    for (const m of [disc, fillM, ring]) { m.rotation.x = -Math.PI / 2; m.position.set(e.x, 0.04, e.z); m.scale.setScalar(R); m.renderOrder = 8; this.scene.add(m); }
    this.anims.push({ t: 0, remove: () => { for (const m of [disc, fillM, ring]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } },
      update: (t) => { fillM.scale.setScalar(Math.max(0.01, R * Math.min(1, t / T))); if (t > T) { const a = 1 - (t - T) / 0.3; for (const m of [disc, fillM, ring]) m.material.opacity *= Math.max(0, a); } return t > T + 0.3; } });
  }
  // 아만 수호의 기도: 3×3칸 금빛 결계 + 위로 솟는 빛
  _amanWard(e, a) {
    const F = this.vfx, H = e.half;
    if (a) F.spawn('am_cast_big', a.grp.position.clone(), 0, 1);
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    fill.rotation.x = -Math.PI / 2;
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-H, -H], [H, -H], [H, H], [-H, H]].map(([x, z]) => new THREE.Vector3(x, 0.01, z))), new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0 }));
    const wm = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(H * 1.41, H * 1.41, 2.4, 4, 1, true), wm); walls.rotation.y = Math.PI / 4; walls.position.y = 1.2;
    g.add(fill, line, walls); g.position.set(e.x, 0.04, e.z); this.scene.add(g);
    F.spawn('am_ward_fx', new THREE.Vector3(e.x, 0.1, e.z), 0, H / 2.4);
    let acc = 0;
    this.anims.push({ t: 0, remove: () => { this.scene.remove(g); g.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); },
      update: (t, dt) => { const k = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.9) / 0.6); fill.material.opacity = 0.28 * k; line.material.opacity = 0.9 * k; wm.opacity = 0.22 * k * (1 - Math.min(1, t / 1.5));
        walls.scale.y = 0.3 + Math.min(1, t / 0.4) * 0.7;
        acc += dt * 30; while (acc >= 1 && t < 1) { acc -= 1; F.spawn('am_mote', new THREE.Vector3(e.x + (Math.random() - 0.5) * H * 2, 0.1, e.z + (Math.random() - 0.5) * H * 2), 0, 1); }
        return t > 1.5; } });
  }
  // 실리안 검의 해방: 금빛 빛기둥 + 충격파 + 깃털, 지속 중 발밑 마법진 2겹 · 몸 광채 · 떠오르는 빛 입자
  _silianBuff(a, dur) {
    const F = this.vfx, p = a.grp.position.clone();
    F.spawn('silian_burst', p, 0, 1); this.shakeT = Math.max(this.shakeT || 0, 0.25);
    this._ring(a.u.x, a.u.z, 2.6, '#ffe08a', 0.7);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 14, 20, 1, true), pm); pillar.position.set(p.x, 7, p.z); this.scene.add(pillar);
    const light = this.fxLight(0xffd98a, 30, 9, p.x, 2.5, p.z);
    const c1 = F.emitOne('silian_aura', p.clone(), { follow: a.grp, persistent: true }), c2 = F.emitOne('silian_aura2', p.clone(), { follow: a.grp, persistent: true });
    const body = F.emitOne('silian_body', p.clone().setY(1.2), { follow: a.grp, persistent: true });
    let acc = 0;
    this.anims.push({ t: 0, remove: () => { F.kill(c1); F.kill(c2); F.kill(body); this.scene.remove(pillar); this.freeLight(light); pillar.geometry.dispose(); pm.dispose(); },
      update: (t, dt) => {
        const pk = Math.max(0, 1 - t / 0.7); pm.opacity = 0.8 * pk; pillar.scale.set(1 + (1 - pk) * 0.6, 1, 1 + (1 - pk) * 0.6); pillar.visible = pk > 0;
        light.intensity = 30 * pk + 4 * (0.8 + 0.2 * Math.sin(t * 6)); light.position.set(a.grp.position.x, 2.5, a.grp.position.z);
        if (body) body.e.alpha = 0.4 * (0.8 + 0.2 * Math.sin(t * 7));
        acc += dt * 16; while (acc >= 1) { acc -= 1; F.spawn('silian_mote', a.grp.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4)), 0, 1); }
        return t >= dur || a.dead;
      } });
  }
  // 페데리코 신성한 광선: 공중에서 전방 끝까지 폭 5칸의 금빛 광선 (넓은 빛 판 + 세로 빛 판 + 중심 광선 + 바닥 광채 + 흐르는 입자)
  _holyBeam(a, e) {
    // 광선 방향 (dx, dz): 앞·뒤·좌·우 중 적이 가장 많은 쪽. 그룹의 로컬 +z = 광선 방향
    const F = this.vfx, D = e.dur, W = e.w, dx = e.dx ?? 0, dz = e.dz ?? (Math.sign(e.zEnd - e.z) || -1), L = (e.len ?? Math.abs(e.zEnd - e.z)) + 0.6;
    const tex = View.beamTexture(), tex2 = tex.clone(); tex2.needsUpdate = true;
    const mk = (geo, map, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, color: 0xffe2a0, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const off = L / 2; // 그룹 원점 = 광선 시작점, 자식은 광선 방향으로 L/2
    const slab = mk(new THREE.PlaneGeometry(W, L), tex, 0.75); slab.rotation.x = -Math.PI / 2; slab.position.set(0, 1.0, off);
    const wg = new THREE.PlaneGeometry(2.6, L); wg.rotateX(-Math.PI / 2); wg.rotateZ(Math.PI / 2);
    const wall = mk(wg, tex2, 0.6); wall.position.set(0, 1.6, off); // 세로로 선 빛 판 (광선 길이 방향)
    const core = mk(new THREE.CylinderGeometry(0.2, 0.42, L, 14, 1, true), tex2, 0.6); core.material.color.set(0xfff0c0); core.rotation.x = Math.PI / 2; core.position.set(0, 1.8, off);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ map: tex, color: 0xffc860, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0.04, off);
    const grp = new THREE.Group(); grp.add(ground, slab, wall, core); grp.position.set(e.x, 0, e.z); grp.rotation.y = Math.atan2(dx, dz); grp.scale.z = 0.01; this.scene.add(grp);
    const light = this.fxLight(0xffd98a, 0, 16, e.x + dx * L / 2, 2.5, e.z + dz * L / 2);
    const handP = () => a.grp.position.clone().add(new THREE.Vector3(dx * 0.5, 1.9, dz * 0.5));
    const back = new THREE.Vector3(-dx * 0.6, 0.3, -dz * 0.6);
    const charge = F.emitOne('fed_charge', handP(), { persistent: true }), halo = F.emitOne('fed_halo', handP().add(back), { persistent: true });
    let acc = 0;
    this.anims.push({ t: 0, remove: () => { this.scene.remove(grp); this.freeLight(light); grp.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); tex2.dispose(); F.kill(charge); F.kill(halo); },
      update: (t, dt) => {
        const grow = Math.min(1, t / 0.18), fade = t > D - 0.3 ? Math.max(0, (D - t) / 0.3) : 1;
        // 광선이 손 앞에서 맵 끝까지 뻗어 나간다 (그룹을 원점 기준으로 늘림)
        grp.scale.z = Math.max(0.01, grow);
        const pulse = 0.85 + 0.15 * Math.sin(t * 22);
        slab.material.opacity = 0.75 * fade * pulse; wall.material.opacity = 0.55 * fade * pulse; core.material.opacity = 0.6 * fade * pulse; ground.material.opacity = 0.35 * fade;
        tex.offset.y -= dt * 3.2; tex2.offset.y -= dt * 4.5;
        light.intensity = 22 * fade * grow;
        if (charge) { charge.obj.position.copy(handP()); charge.size = 2.4 * (0.9 + 0.2 * Math.sin(t * 30)); charge.e.alpha = 0.95 * fade; }
        if (halo) { halo.obj.position.copy(handP().add(back)); halo.e.alpha = 0.8 * fade; }
        acc += dt * 70 * fade; while (acc >= 1) { acc -= 1;
          const side = (Math.random() - 0.5) * W, along = Math.random() * L * 0.3;
          const p = new THREE.Vector3(e.x + dz * side + dx * along, 0.4 + Math.random() * 2.2, e.z - dx * side + dz * along), sp = 18 + Math.random() * 10;
          F.emitOne('fed_ray_mote', p, { vel: new THREE.Vector3(dx * sp + (Math.random() - 0.5) * 0.6, 0, dz * sp + (Math.random() - 0.5) * 0.6) }); }
        return t >= D;
      } });
  }
  static beamTexture() {
    if (View._beamTex) return View._beamTex;
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    const gx = g.createLinearGradient(0, 0, 128, 0); gx.addColorStop(0, 'rgba(255,200,90,0)'); gx.addColorStop(0.15, 'rgba(255,210,110,0.35)'); gx.addColorStop(0.5, 'rgba(255,245,210,1)'); gx.addColorStop(0.85, 'rgba(255,210,110,0.35)'); gx.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = gx; g.fillRect(0, 0, 128, 256);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) { const x = 10 + Math.random() * 108, y = Math.random() * 256, h = 30 + Math.random() * 90; const gl = g.createLinearGradient(0, y, 0, y + h); gl.addColorStop(0, 'rgba(255,255,240,0)'); gl.addColorStop(0.5, 'rgba(255,250,225,0.55)'); gl.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = gl; g.fillRect(x, y, 1.5 + Math.random() * 2.5, h); if (y + h > 256) g.fillRect(x, y - 256, 3, h); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, 3);
    return (View._beamTex = t);
  }
  // 아제나 고대의 창: 붉은 마법진 → 하늘에서 붉게 타오르는 창이 대각선으로 내리꽂혀 화염 폭발
  _lance(e) {
    const F = this.vfx, p = new THREE.Vector3(e.x, 0, e.z), T = e.delay || 0.5, FALL = 0.3;
    const mk = F.emitOne('az_mark', p, { persistent: true }); if (mk) mk.size = e.r * 2.2;
    const spear = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7a40, toneMapped: false });
    const hot = new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff2a08, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), mat); shaft.position.y = 3.3;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.7, 6), hot); head.rotation.x = Math.PI; head.position.y = 0.4;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), mat); guard.position.y = 1.3;
    const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 6.4, 10, 1, true), glow); aura.position.y = 2.6;
    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.5, 9, 10, 1, true), glow.clone()); streak.position.y = 9.5; streak.material.opacity = 0.5;
    spear.add(shaft, head, guard, aura, streak);
    // 대각선 낙하: 오른쪽 위 하늘에서 표적으로
    const start = p.clone().add(new THREE.Vector3(5 + Math.random() * 1.5, 13, -3 - Math.random() * 1.5)), d = p.clone().sub(start).normalize();
    spear.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d); spear.position.copy(start); spear.visible = false; this.scene.add(spear);
    const light = this.fxLight(0xff5a20, 0, 9, e.x, 1.2, e.z);
    let hit = false, tr = 0;
    this.anims.push({ t: 0, remove: () => { this.scene.remove(spear); this.freeLight(light); F.kill(mk); spear.traverse(o => o.geometry?.dispose()); mat.dispose(); hot.dispose(); glow.dispose(); streak.material.dispose(); },
      update: (t, dt) => {
        if (mk) mk.e.alpha = hit ? mk.e.alpha : 0.85 * Math.min(1, t / 0.15) * (0.8 + 0.2 * Math.sin(t * 16));
        if (t >= T - FALL && !hit) {
          spear.visible = true; const f = Math.min(1, (t - (T - FALL)) / FALL); spear.position.lerpVectors(start, p.clone().addScaledVector(d, 0.8), f * f);
          tr += dt * 60; while (tr >= 1) { tr -= 1; F.spawn('az_trail', spear.position.clone().addScaledVector(d, -1.2 - Math.random() * 3), 0, 1); }
        }
        if (!hit && t >= T) { hit = true; F.spawn('az_impact', p.clone().setY(0.2), 0, e.r / 2.2); this.shakeT = Math.max(this.shakeT || 0, 0.3); light.intensity = 40; }
        if (hit) { const a = t - T; light.intensity = Math.max(0, 40 - a * 60); streak.material.opacity = Math.max(0, 0.5 - a * 2); if (mk) mk.e.alpha = Math.max(0, 0.85 - a * 1.5); glow.opacity = Math.max(0, 0.6 - a * 0.5); mat.color.setRGB(1, 0.48 - Math.min(0.2, a * 0.2), 0.25); if (a > 1.0) { spear.position.addScaledVector(d, dt * 6); } return a > 1.5; }
      } });
  }
  // 이난나 세계수: 맵 중앙에서 자라나 5초간 빛나며 잎과 빛 입자를 뿌린다
  _worldTree(e) {
    const F = this.vfx, D = e.dur, tree = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0xc8a050, emissive: 0x7a5410, emissiveIntensity: 0.9, roughness: 0.6 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.6, 3.6, 10), bark); trunk.position.y = 1.8; tree.add(trunk);
    for (let i = 0; i < 5; i++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 1.6, 6), bark); const a = i / 5 * Math.PI * 2; br.position.set(Math.cos(a) * 0.5, 3.4, Math.sin(a) * 0.5); br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); tree.add(br); }
    const leafM = new THREE.MeshBasicMaterial({ color: 0xffc43a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const blobs = [];
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.5, 14, 10), leafM); const a = i / 7 * Math.PI * 2; b.position.set(Math.cos(a) * 1.0, 4.1 + Math.random() * 0.6, Math.sin(a) * 1.0); tree.add(b); blobs.push(b); }
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), leafM); core.position.y = 4.6; tree.add(core);
    tree.position.set(e.x, 0, e.z); tree.scale.setScalar(0.01); this.scene.add(tree);
    const ground = F.emitOne('in_ground', new THREE.Vector3(e.x, 0, e.z), { persistent: true });
    const light = this.fxLight(0xffd27a, 14, 12, e.x, 4, e.z);
    const halo = F.emitOne('in_glow', new THREE.Vector3(e.x, 4.4, e.z), { persistent: true });
    let la = 0, sa = 0, ba = 0;
    this.anims.push({ t: 0, remove: () => { this.scene.remove(tree); this.freeLight(light); F.kill(ground); F.kill(halo); tree.traverse(o => o.geometry?.dispose()); bark.dispose(); leafM.dispose(); },
      update: (t, dt) => {
        const grow = Math.min(1, t / 0.7), shrink = t > D - 0.5 ? Math.max(0, (D - t) / 0.5) : 1, k = grow * shrink;
        tree.scale.setScalar(Math.max(0.01, (0.4 + 0.6 * grow) * (shrink < 1 ? shrink : 1)) * 0.8);
        leafM.opacity = 0.28 * k * (0.85 + 0.15 * Math.sin(t * 4)); light.intensity = 14 * k; if (ground) ground.e.alpha = 0.7 * k; if (halo) halo.e.alpha = 0.45 * k * (0.85 + 0.15 * Math.sin(t * 3));
        ba += dt * 8; while (ba >= 1) { ba -= 1; F.spawn('in_bloom', new THREE.Vector3(e.x + (Math.random() - 0.5) * 9, 0.3 + Math.random() * 2.5, e.z + (Math.random() - 0.5) * 9), 0, 1); }
        blobs.forEach((b, i) => b.scale.setScalar(1 + 0.06 * Math.sin(t * 3 + i)));
        la += dt * 16; while (la >= 1) { la -= 1; F.spawn('in_leaf', new THREE.Vector3(e.x + (Math.random() - 0.5) * 7, 4.5 + Math.random(), e.z + (Math.random() - 0.5) * 7), 0, 1); }
        sa += dt * 14; while (sa >= 1) { sa -= 1; for (const v of this.units.values()) if (v.u.side === 'ally' && !v.dead && Math.random() < 0.25) F.spawn('in_spark', v.grp.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6)), 0, 1); }
        return t >= D;
      } });
  }
  // 절실한 구원 장판: 룬 고리 + 물방울 구체 + 내려오는 깃털, 0.5초마다 회복 반짝임, 끝나면 빛기둥
  _rescueZone(e) {
    const F = this.vfx, p = new THREE.Vector3(e.x, 0, e.z), R = e.r, D = e.dur;
    const ring = F.emitOne('bd_rescue_ring', p, { persistent: true }), glow = F.emitOne('bd_rescue_glow', p, { persistent: true });
    const orb = F.emitOne('bd_rescue_orb', p.clone().add(new THREE.Vector3(0, 1.4, 0)), { persistent: true });
    if (ring) ring.size = R * 2.1; if (glow) glow.size = R * 2.3; if (orb) orb.size = R * 1.5;
    F.spawn('bd_rescue_end', p, 0, R / 1.6);
    let fe = 0, tk = 0;
    this.anims.push({ t: 0, remove: () => { F.kill(ring); F.kill(glow); F.kill(orb); },
      update: (t, dt) => {
        const k = Math.min(1, t / 0.25), fade = t > D - 0.4 ? Math.max(0, (D - t) / 0.4) : 1;
        if (ring) { ring.size = R * 2.1 * (0.6 + 0.4 * k); ring.e.alpha = 0.95 * fade; }
        if (glow) glow.e.alpha = 0.45 * fade;
        if (orb) { orb.e.alpha = 0.55 * fade * (0.8 + 0.2 * Math.sin(t * 6)); orb.obj.position.y = 1.4 + Math.sin(t * 2.5) * 0.12; }
        fe += dt; while (fe > 0.12) { fe -= 0.12; const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * R * 1.6, 2.6 + Math.random(), (Math.random() - 0.5) * R * 1.6)); F.spawn('bd_feather', q, 0, 1); }
        tk += dt; if (tk >= 0.5) { tk -= 0.5; F.spawn('bd_rescue_tick', p.clone().add(new THREE.Vector3((Math.random() - 0.5) * R, 0.8, (Math.random() - 0.5) * R)), 0, 1); }
        if (t >= D) { F.spawn('bd_rescue_end', p, 0, R / 1.3); return true; }
      } });
  }

  _swordDrop(e) {
    const sp = this.speed || 1, R = e.r || 1.6, T = e.impactIn || 1.7, FALL = 0.36, H = 3.4, STAY = 1.5;
    const mark = new THREE.Mesh(FX.plane || new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: View.markTexture(), transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2; mark.position.set(e.x, 0.04, e.z); mark.scale.setScalar(0.01); mark.renderOrder = 9; this.scene.add(mark);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(e.x, 0.05, e.z); this.scene.add(ring);
    // 검: 참고 이미지(주황빛으로 달아오른 장검)를 바탕으로 그린 텍스처 판 + 가산 광채. 카메라 쪽으로 기울여 위에서도 잘 보이게
    const sword = new THREE.Group();
    const bmat = new THREE.MeshBasicMaterial({ map: View.swordTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(H * 0.32, H), bmat); blade.position.y = H / 2 - 0.35;
    const gmat = new THREE.MeshBasicMaterial({ map: View.swordTexture(true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const glowM = new THREE.Mesh(new THREE.PlaneGeometry(H * 0.62, H * 1.15), gmat); glowM.position.set(0, H / 2 - 0.35, -0.02);
    sword.add(glowM, blade);
    const camDir = new THREE.Vector3().subVectors(this.camera.position, new THREE.Vector3(e.x, 0, e.z)); camDir.y = 0;
    sword.rotation.order = 'YXZ'; sword.rotation.y = Math.atan2(camDir.x, camDir.z); sword.rotation.x = -0.42; sword.rotation.z = (Math.random() - 0.5) * 0.3;
    sword.visible = false; sword.position.set(e.x, 11, e.z); sword.renderOrder = 12; blade.renderOrder = 12; glowM.renderOrder = 11; this.scene.add(sword);
    let hit = false, trailAcc = 0, emberAcc = 0;
    this.anims.push({ t: 0, remove: () => { this.scene.remove(mark, ring, sword); mark.material.dispose(); ring.geometry.dispose(); bmat.dispose(); gmat.dispose(); blade.geometry.dispose(); glowM.geometry.dispose(); },
      update: (t, dt) => {
        // 장판: 커지면서 나타나고, 착탄 직전까지 맥동
        const k = Math.min(1, t / 0.2); mark.scale.setScalar(2 * R * k * (1 + Math.sin(t * 18) * 0.02));
        mark.material.opacity = t < T ? 0.85 : Math.max(0, 0.85 - (t - T) * 1.5);
        const rk = (t % 0.6) / 0.6; ring.scale.setScalar(R * (0.4 + 0.75 * rk)); ring.material.opacity = t < T ? 0.8 * (1 - rk) : 0;
        // 검 낙하 (가속) + 불꽃 꼬리
        if (t >= T - FALL && !hit) {
          sword.visible = true; const f = Math.min(1, (t - (T - FALL)) / FALL); sword.position.y = 11 * (1 - f * f);
          trailAcc += dt * 40; while (trailAcc >= 1) { trailAcc -= 1; this.vfx.spawn('shu_trail', new THREE.Vector3(e.x + (Math.random() - 0.5) * 0.3, sword.position.y + H * 0.4, e.z), 0, 1); }
        }
        if (!hit && t >= T) {
          hit = true; sword.position.y = -0.25;
          this.vfx.spawn('shu_impact', new THREE.Vector3(e.x, 0.2, e.z), 0, R / 1.6); this.shakeT = Math.max(this.shakeT || 0, 0.22);
        }
        if (hit) {
          const a = t - T;
          // 꽂힌 검: 처음엔 하얗게 달아올랐다가 주황빛으로 식고, 불티가 튄다
          const heat = Math.max(0, 1 - a / 0.5); bmat.color.setRGB(1 + heat * 0.8, 1 + heat * 0.5, 1 + heat * 0.3);
          gmat.opacity = Math.max(0, (a < STAY ? 0.9 : 0.9 - (a - STAY) * 2.2)) * (0.85 + 0.15 * Math.sin(t * 20));
          bmat.opacity = a < STAY ? 1 : Math.max(0, 1 - (a - STAY) * 2.5);
          if (a < STAY) { emberAcc += dt * 14; while (emberAcc >= 1) { emberAcc -= 1; this.vfx.spawn('shu_ember', new THREE.Vector3(e.x, 0.3 + Math.random() * 1.6, e.z), 0, 1); } }
          return a > STAY + 0.45;
        }
      } });
  }
  // 슈헤리트 검 텍스처: 주황빛으로 달아오른 장검 (glow=true면 광채만)
  static swordTexture(glow) {
    const key = glow ? '_swordGlow' : '_swordTex'; if (View[key]) return View[key];
    const W = 128, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d');
    if (glow) {
      g.filter = 'blur(14px)'; g.fillStyle = 'rgba(255,140,40,0.9)';
      g.beginPath(); g.moveTo(64, 470); g.lineTo(46, 140); g.lineTo(82, 140); g.closePath(); g.fill();
      g.fillRect(16, 110, 96, 26); g.beginPath(); g.arc(64, 70, 26, 0, Math.PI * 2); g.fill();
    } else {
      // 칼날 (아래가 끝) — 가장자리는 밝게, 가운데 홈은 진하게
      const bl = g.createLinearGradient(44, 0, 84, 0); bl.addColorStop(0, '#ffcf7a'); bl.addColorStop(0.35, '#ff9a3c'); bl.addColorStop(0.5, '#c8521a'); bl.addColorStop(0.65, '#ff9a3c'); bl.addColorStop(1, '#ffe2a8');
      g.fillStyle = bl; g.beginPath(); g.moveTo(64, 500); g.lineTo(47, 430); g.lineTo(47, 138); g.lineTo(81, 138); g.lineTo(81, 430); g.closePath(); g.fill();
      g.strokeStyle = '#fff1cf'; g.lineWidth = 2; g.beginPath(); g.moveTo(48, 140); g.lineTo(48, 430); g.lineTo(64, 498); g.lineTo(80, 430); g.lineTo(80, 140); g.stroke();
      g.strokeStyle = '#8a2a0a'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 150); g.lineTo(64, 420); g.stroke();
      // 가드 (날개처럼 휘어진 코등이)
      const gd = g.createLinearGradient(0, 112, 0, 138); gd.addColorStop(0, '#ffe39a'); gd.addColorStop(1, '#a8601c');
      g.fillStyle = gd; g.beginPath(); g.moveTo(10, 104); g.quadraticCurveTo(40, 132, 64, 126); g.quadraticCurveTo(88, 132, 118, 104); g.lineTo(112, 126); g.quadraticCurveTo(90, 142, 64, 142); g.quadraticCurveTo(38, 142, 16, 126); g.closePath(); g.fill();
      // 손잡이 + 폼멜
      g.fillStyle = '#6a2c10'; g.fillRect(57, 58, 14, 56);
      g.strokeStyle = '#c87a2a'; g.lineWidth = 2; for (let y = 62; y < 112; y += 8) { g.beginPath(); g.moveTo(57, y); g.lineTo(71, y + 5); g.stroke(); }
      const pm = g.createRadialGradient(62, 44, 2, 64, 46, 14); pm.addColorStop(0, '#fff3c4'); pm.addColorStop(1, '#b0661e');
      g.fillStyle = pm; g.beginPath(); g.arc(64, 46, 13, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; View[key] = t; return t;
  }

  // 회오리 줄무늬 텍스처 (검은 바탕 + 흰 사선, 가산 혼합용)
  static streakTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 256, w = 1 + Math.random() * 7, a = 0.15 + Math.random() * 0.75, len = 60 + Math.random() * 200, y = Math.random() * 256;
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = w; g.lineCap = 'round';
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + len * 0.55, y + oy - len * 0.35); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  _tornado(v, C) {
    const grp = new THREE.Group();
    const layers = [
      { rt: 1.7, rb: 0.7, h: 4.4, col: C.map(x => x * 0.6), spin: 7, scroll: [0.9, 0.5], rep: [3, 1.2] },
      { rt: 1.3, rb: 0.5, h: 4.1, col: C.map(x => x * 0.65), spin: 10, scroll: [1.4, 0.8], rep: [2, 1] },
      { rt: 0.8, rb: 0.35, h: 3.8, col: C.map(x => Math.min(1, x * 0.55 + 0.05)), spin: 14, scroll: [2.0, 1.2], rep: [2, 1] },
    ];
    for (const L of layers) {
      const geo = new THREE.CylinderGeometry(L.rt, L.rb, L.h, 40, 8, true);
      // 높이별 밝기(바닥 약하게, 중간 강하게, 꼭대기 사라짐) — 가산 혼합이라 어두울수록 투명
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const k = (pos.getY(i) + L.h / 2) / L.h; const a = Math.min(1, k / 0.18) * Math.pow(1 - k, 0.7); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const tex = this.tornadoTex.clone(); tex.needsUpdate = true; tex.repeat.set(...L.rep);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(...L.col), vertexColors: true, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = L.h / 2 - 0.1; m.renderOrder = 11; m.userData = L; grp.add(m);
    }
    grp.position.copy(v.grp.position); grp.scale.setScalar(0.01);
    this.scene.add(grp); return grp;
  }
  _tickTornado(v, dt) {
    const T = v.tornado;
    T.position.x = v.grp.position.x; T.position.z = v.grp.position.z;
    for (const m of T.children) { const L = m.userData; m.rotation.y -= L.spin * dt; m.material.map.offset.x += L.scroll[0] * dt * 0.1; m.material.map.offset.y -= L.scroll[1] * dt; }
    const k = v.tornadoOut ? (v.tornadoK -= dt / 0.35) : (v.tornadoK = Math.min(1, v.tornadoK + dt / 0.3));
    const s = Math.max(0.01, k), sh = Math.max(1, v.height / 3), wr = (v.spinR || 1.8) / 1.8 * 0.85; // 회오리 폭 = 판정 반지름에 맞춤
    T.scale.set(s * wr, (0.4 + 0.6 * s) * sh * 1.15, s * wr);
    v.obj.visible = !(k > 0.35); // 회오리가 충분히 커지면 보스 모델을 숨긴다
    if (v.tornadoOut && k <= 0) this._dropTornado(v);
  }
  _dropTornado(v) { const T = v.tornado; if (!T) return; this.scene.remove(T); for (const m of T.children) { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); } v.tornado = null; v.obj.visible = true; }

  _bone(v, name) {
    if (!v.bones) { v.bones = {}; v.obj.traverse(o => { if (o.isBone) v.bones[o.name] = o; }); }
    const b = v.bones[name];
    return b ? b.getWorldPosition(new THREE.Vector3()) : v.grp.position.clone().add(new THREE.Vector3(0, v.height * 0.6, 0));
  }
  _hitPos(v) { return v.grp.position.clone().add(new THREE.Vector3(0, Math.min(2.2, v.height * 0.5), 0)); }
  // 스킬 이펙트 (fx.js의 원본 텍스처 기반 파티클)
  _vfx(e) {
    const a = this.units.get(e.from), b = this.units.get(e.to);
    const F = this.vfx;
    switch (e.kind) {
      case 'dh_pistol': case 'dh_rifle': case 'dh_shotgun': {
        if (!a) break;
        const face = a.u.face, B = F.basis(face);
        const m = this._bone(a, 'b_weapon_rhand').addScaledVector(B.f, 0.35);
        F.spawn(e.kind, m, face, e.big ? 2.3 : 1.8); // 전투 카메라가 멀어서 원본 비율보다 크게
        if (!b) break;
        const hp = this._hitPos(b);
        if (e.kind === 'dh_shotgun') F.spawn('dh_shotgun_hit', hp, face, 1.6);
        else F.projectile({ from: m, to: hp, speed: e.kind === 'dh_rifle' ? 70 : 45, head: e.kind === 'dh_rifle' ? 'dh_tracer_rifle' : 'dh_tracer', hit: e.kind + '_hit', face });
        break;
      }
      case 'sr_energy': {
        if (!a) break;
        const face = a.u.face, B = F.basis(face);
        const m = this._bone(a, 'b_weapon_rhand').addScaledVector(B.f, 0.5).add(new THREE.Vector3(0, 0.3, 0));
        F.spawn('sr_energy_cast', m, face, 1.6);
        if (b) F.projectile({ from: m, to: this._hitPos(b), speed: 16, head: 'sr_energy_orb', trail: 'sr_energy_trail', trailRate: 45, hit: 'sr_energy_hit', arc: 0.4, face });
        break;
      }
      case 'sr_meteor_cast': {
        const p = new THREE.Vector3(e.x, 0, e.z);
        F.spawn('sr_meteor_circle', p, 0);
        if (a) F.spawn('sr_meteor_cast', a.grp.position.clone(), a.u.face);
        const travel = 0.55, from = new THREE.Vector3(e.x - 3, 13, e.z - 5), to = new THREE.Vector3(e.x, 0.6, e.z);
        F.projectile({ from, to, speed: from.distanceTo(to) / travel, head: 'sr_meteor_ball', trail: 'sr_meteor_trail', trailRate: 50, delay: Math.max(0, e.impactIn - travel) / (this.speed || 1) * (this.speed || 1) });
        break;
      }
      case 'sr_meteor_hit': F.spawn('sr_meteor_hit', new THREE.Vector3(e.x, 0.3, e.z), 0); this.shakeT = 0.35; break;
      case 'blade': {
        const p0 = new THREE.Vector3(e.x, 1.2, e.z), vel = new THREE.Vector3(e.dx, 0, e.dz).multiplyScalar(e.speed);
        const b = F.emitOne('blade', p0, { vel, life: e.max / e.speed });
        if (b) b.trail = true;
        break;
      }
      case 'bk_hit': if (b) F.spawn('bk_hit', this._hitPos(b), a ? a.u.face : 0, 1.3); break;
      case 'hidaka_hit': if (b) F.spawn(a && a.u.kind === 'silian' ? 'silian_hit' : 'hidaka_hit', this._hitPos(b), a ? a.u.face : 0, 1.4); break;
      case 'bk_wave': {
        if (!a) break;
        const face = Math.atan2(-e.dz, e.dx), base = a.grp.position.clone();
        F.spawn('bk_wave_cast', this._bone(a, 'b_weapon_r').addScaledVector(new THREE.Vector3(e.dx, 0, e.dz), 0.3), face, e.big ? 1.6 : 1.1);
        const n = e.big ? 6 : 4;
        for (let i = 1; i <= n; i++) {
          const d = e.len * i / n, p = base.clone().add(new THREE.Vector3(e.dx * d, 0.15, e.dz * d));
          setTimeout(() => F.spawn(e.big ? 'bk_wave_big' : 'bk_wave', p, face, e.big ? 1.3 : 1), i * 25 / (this.speed || 1));
        }
        if (e.big) this.shakeT = 0.2;
        break;
      }
      case 'bk_asura_on': if (a) { F.spawn('bk_asura_on', a.grp.position.clone(), a.u.face, 1.2); this._ring(a.u.x, a.u.z, 2.2, '#ff3b2f', 0.6); } break;
      case 'bk_punch': if (a) {
        const face = a.u.face, p = new THREE.Vector3(e.x, rndf(0.8, 1.5), e.z);
        F.spawn('bk_punch', p, face, 1.1); if (Math.random() < 0.5) F.spawn('bk_punch_alt', p, face, 1.2);
      } break;
      case 'bk_asura_end': {
        const face = a ? a.u.face : 0;
        F.spawn('bk_asura_end', new THREE.Vector3(e.x, 0.2, e.z), face, e.r / 2.8);
        for (let i = 0; i < 3; i++) F.spawn('bk_slash', new THREE.Vector3(e.x, 1.1 + (i - 1) * 0.35, e.z), face + (i - 1) * 0.4, 1.6);
        this.shakeT = 0.3; break;
      }
      case 'hidaka_spin': if (a) { a.hSpinT = e.dur; a.hSpinR = e.r; a.hRing = this.vfx.emitOne('whirl_ring', a.grp.position.clone(), { color: [0.4, 0.33, 0.22], follow: a.grp, persistent: true }); if (a.hRing) a.hRing.size = e.r * 2.1; } break;
      case 'heal': if (b) F.spawn('heal_fx', b.grp.position.clone(), 0, e.big ? 1.3 : 1); break;
      case 'fed_shot': {
        if (!a) break;
        const face = a.u.face, B = F.basis(face);
        const m = a.grp.position.clone().addScaledVector(B.f, 0.7).add(new THREE.Vector3(0, 1.35, 0));
        F.spawn('fed_muzzle', m, face, 1.2);
        if (b) F.projectile({ from: m, to: this._hitPos(b), speed: 30, head: 'fed_shot_head', hit: 'fed_shot_hit', face });
        break;
      }
      case 'vt_charge_mark': this._chargeMark(e); break;
      case 'vt_dash': this._valtanDash(a, e); break;
      case 'vt_rise': if (a) { a.airY = 16; a.fastY = true; F.spawn('vt_dust', a.grp.position.clone(), 0, 1.4); this.shakeT = Math.max(this.shakeT || 0, 0.15); } break;
      case 'vt_slam_mark': this._slamMark(e); break;
      case 'bk_dash': if (a) F.spawn('vt_dust', a.grp.position.clone(), 0, 0.6); break;
      case 'vt_dust': if (a) F.spawn('vt_dust', a.grp.position.clone(), 0, 1.3); break;
      case 'vt_slam': {
        if (a) { a.airY = 0; a.fastY = true; a.grp.position.set(e.x, 10, e.z);
          this._play(a, 'att_battle_2_01', { dur: 0.9, from: 0.62, fade: 0.02 }); a.lockT = 0.9; }
        F.spawn(e.ghost ? 'vt_slam_fx_g' : 'vt_slam_fx', new THREE.Vector3(e.x, 0.2, e.z), 0, e.r / 2.4); this.shakeT = Math.max(this.shakeT || 0, 0.45); this._ring(e.x, e.z, e.r, e.ghost ? '#7ff0ff' : '#ff5a3a', 0.8);
      } break;
      case 'vt_walls': this._collapseWalls(); break;
      case 'pk_summon': F.spawn('pk_summon', new THREE.Vector3(e.x, 0.1, e.z), 0, 1); break;
      case 'am_bolt': {
        if (!a) break; const face = a.u.face, B = F.basis(face);
        const m = a.grp.position.clone().addScaledVector(B.f, 0.6).add(new THREE.Vector3(0, 1.5, 0));
        F.spawn('am_cast', m, face, 1);
        if (b) F.projectile({ from: m, to: this._hitPos(b), speed: 22, head: 'am_bolt_head', trail: 'am_bolt_trail', trailRate: 50, hit: 'am_bolt_hit', face });
        break;
      }
      case 'am_ward': this._amanWard(e, a); break;
      case 'am_shield': if (b) F.spawn('am_shield_fx', b.grp.position.clone(), 0, 1); break;
      case 'fed_float': if (a) { a.floatT = e.dur; F.spawn('fed_float_on', a.grp.position.clone(), 0, 1); } break;
      case 'fed_beam': if (a) this._holyBeam(a, e); break;
      case 'fed_ray_hit': if (b) F.spawn('fed_ray_hit', this._hitPos(b), 0, 1); break;
      case 'fed_mark': {
        const mk = F.emitOne('fed_mark', new THREE.Vector3(e.x, 0, e.z), { persistent: true }); if (mk) mk.size = e.r * 2.1;
        this.anims.push({ t: 0, update: (t) => { if (mk) mk.e.alpha = 0.55 * Math.min(1, t / 0.2) * (t > e.dur - 0.2 ? Math.max(0, (e.dur - t) / 0.2) : 1); if (t >= e.dur) { F.kill(mk); return true; } } });
        break;
      }
      case 'fed_bolt': {
        // 하늘(왼쪽 위)에서 대각선으로 내리꽂히는 금빛 번개 창
        const to = new THREE.Vector3(e.x, 0.2, e.z), from = to.clone().add(new THREE.Vector3(-2.6, 9, -2.2));
        F.projectile({ from, to, speed: 70, head: 'fed_lance', trail: 'fed_lance_trail', trailRate: 90, hit: 'fed_bolt_hit' });
        this.shakeT = Math.max(this.shakeT || 0, 0.06);
        break;
      }
      case 'fed_blast': F.spawn('fed_blast', new THREE.Vector3(e.x, 0.2, e.z), 0, e.r / 2.4); this.shakeT = Math.max(this.shakeT || 0, 0.4); this._ring(e.x, e.z, e.r, '#ffb050', 0.8); break;
      case 'sr_shards': {
        const from = new THREE.Vector3(e.x, 0.5, e.z);
        for (const p of e.pts) { const to = new THREE.Vector3(p.x, 0.2, p.z); F.projectile({ from, to, speed: from.distanceTo(to) / Math.max(0.12, e.delay), head: 'sr_shard_head', trail: 'sr_shard_trail', trailRate: 40, hit: 'sr_shard_hit', arc: 1.8 }); }
        break;
      }
      case 'lh_dash': if (a) { F.spawn('lh_plant', a.grp.position.clone(), 0, 0.7); } break;
      case 'lh_guard': if (a) {
        F.spawn('lh_plant', a.grp.position.clone(), 0, 1.2); this.shakeT = Math.max(this.shakeT || 0, 0.12);
        const H = e.half, sq = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-H, -H], [H, -H], [H, H], [-H, H]].map(([x, z]) => new THREE.Vector3(x, 0.05, z))), new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.9 }));
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshBasicMaterial({ color: 0x3c8cff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
        fill.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(sq, fill); g.position.set(a.u.x, 0.03, a.u.z); this.scene.add(g);
        const au = F.emitOne('lh_aura', a.grp.position.clone(), { follow: a.grp, persistent: true });
        let acc = 0;
        this.anims.push({ t: 0, remove: () => { this.scene.remove(g); sq.geometry.dispose(); fill.geometry.dispose(); F.kill(au); },
          update: (t, dt) => {
            const k = Math.min(1, t / 0.25); fill.material.opacity = 0.12 * k * (0.8 + 0.2 * Math.sin(t * 5)); sq.material.opacity = 0.9 * k;
            acc += dt * 20; while (acc >= 1) { acc -= 1; const p = new THREE.Vector3(a.u.x + (Math.random() - 0.5) * H * 2, 0.2, a.u.z + (Math.random() - 0.5) * H * 2); const pt = F.emitOne('lh_absorb', p, { vel: new THREE.Vector3(a.u.x - p.x, 2.2, a.u.z - p.z).multiplyScalar(1.4) }); }
            return t >= e.dur || a.dead;
          } });
      } break;
      case 'lh_release': F.spawn('lh_release', new THREE.Vector3(e.x, 0.2, e.z), 0, e.half / 3.5); this.shakeT = Math.max(this.shakeT || 0, 0.35); this._ring(e.x, e.z, e.half * 1.2, '#ffd98a', 0.9); break;
      case 'az_lance': this._lance(e); break;
      case 'in_tree': this._worldTree(e); break;
      case 'bd_shock': {
        if (!a) break;
        const face = a.u.face, B = F.basis(face);
        const m = a.grp.position.clone().addScaledVector(B.f, 0.6).add(new THREE.Vector3(0, 1.3, 0));
        F.spawn('bd_cast', m, face, 1.3);
        if (b) F.projectile({ from: m, to: this._hitPos(b), speed: 14, head: 'bd_shock_orb', trail: 'bd_shock_trail', trailRate: 22, hit: 'bd_shock_hit', arc: 0.6, face });
        break;
      }
      case 'bd_protect': if (a) { F.spawn('bd_protect', a.grp.position.clone(), a.u.face, 1.2); this._ring(a.u.x, a.u.z, 2.4, '#8fd8ff', 0.7); } break;
      case 'bd_shield': if (b) {
        F.spawn('bd_shield', b.grp.position.clone(), 0, 1);
        if (b.bdAura) this.vfx.kill(b.bdAura);
        const au = b.bdAura = this.vfx.emitOne('bd_shield_aura', b.grp.position.clone(), { follow: b.grp, persistent: true });
        if (au) this.anims.push({ t: 0, update: () => { const u = b.u; if (!u.alive || !(u.bdShieldT > 0) || u.shield <= 1) { this.vfx.kill(au); if (b.bdAura === au) b.bdAura = null; return true; }  } });
      } break;
      case 'bd_rescue': this._rescueZone(e); break;
      case 'bd_valiant': if (a) { F.spawn('bd_valiant', a.grp.position.clone(), a.u.face, 1); this._ring(a.u.x, a.u.z, 4.5, '#c27bff', 0.8); } break;
      case 'bd_valiant_on': if (b) {
        if (b.valAura) this.vfx.kill(b.valAura);
        const au = b.valAura = this.vfx.emitOne('bd_valiant_aura', b.grp.position.clone(), { follow: b.grp, persistent: true });
        if (au) this.anims.push({ t: 0, update: () => { if (!b.u.alive || !(b.u.valT > 0)) { this.vfx.kill(au); if (b.valAura === au) b.valAura = null; return true; } } });
      } break;
      case 'silian_slash': if (a) { a.slashN = (a.slashN || 0) + 1; F.spawn('silian_slash', a.grp.position.clone(), a.u.face + (a.slashN % 2 ? 0.25 : -0.25), 1); this.shakeT = Math.max(this.shakeT || 0, 0.05); } break;
      case 'silian_buff': if (a) this._silianBuff(a, e.dur); break;
      case 'shu_mark': this._swordDrop(e); break;
      case 'shana_flash': if (a) F.spawn('shana_flash', a.grp.position.clone(), a.u.face); break;
      case 'shana_hit': if (b) F.spawn('shana_hit', this._hitPos(b), a ? a.u.face : 0, 1.4); break;
    }
  }

  banner(msg, color = '#fff') {
    const b = document.createElement('div'); b.className = 'bn'; b.textContent = msg; b.style.color = color;
    this.overlay.appendChild(b); setTimeout(() => b.remove(), 1900);
  }

  _num(v, val, color, big, text) {
    const d = document.createElement('div'); d.className = 'dmgt' + (big ? ' big' : '') + (text ? ' txt' : '');
    d.textContent = typeof val === 'number' ? val.toLocaleString() : val; d.style.color = color;
    const p = new THREE.Vector3(v.grp.position.x + (Math.random() - 0.5) * 0.6, v.height + 0.3, v.grp.position.z).project(this.camera);
    d.style.left = ((p.x + 1) / 2 * 100) + '%'; d.style.top = ((1 - p.y) / 2 * 100) + '%';
    this.overlay.appendChild(d); setTimeout(() => d.remove(), text ? 1300 : 900);
  }

  _ring(x, z, r, color, life = 0.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); this.scene.add(m);
    this.fx.push({ m, t: 0, life, kind: 'ring', r });
  }

  _fx(e) {
    if (e.kind === 'ring') this._ring(e.x, e.z, e.r, e.color, 0.55);
    else if (e.kind === 'nova') { this._ring(e.x, e.z, e.r, e.color, 0.9); this._disc(e.x, e.z, e.r, e.color, 0.6); }
    else if (e.kind === 'burst') this._disc(e.x, e.z, e.r, e.color, 0.35);
    else if (e.kind === 'cone') {
      const geo = new THREE.CircleGeometry(e.r, 24, -0.42, 0.84);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-e.dz, e.dx);
      m.position.set(e.x, 0.06, e.z); this.scene.add(m);
      this.fx.push({ m, t: 0, life: 0.22, kind: 'fade' });
      // 총구 섬광
      const v = this.units.get(e.id); if (v) this._flashAt(v, e.color);
    }
  }
  _disc(x, z, r, color, life) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); this.scene.add(m);
    this.fx.push({ m, t: 0, life, kind: 'fade' });
  }
  _flashAt(v, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const f = v.u.face;
    m.position.set(v.grp.position.x + Math.cos(f) * 0.7, 1.15, v.grp.position.z - Math.sin(f) * 0.7);
    this.scene.add(m); this.fx.push({ m, t: 0, life: 0.1, kind: 'pop' });
  }

  _proj(a, b, color, big) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.16 : 0.09, 8, 6), new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const from = new THREE.Vector3(a.grp.position.x, a.u.dh ? 1.15 : a.height * 0.6, a.grp.position.z);
    const to = new THREE.Vector3(b.grp.position.x, b.height * 0.55, b.grp.position.z);
    m.position.copy(from); this.scene.add(m);
    const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, from.clone()]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    this.scene.add(trail);
    this.projs.push({ m, trail, from, to, t: 0, life: big ? 0.16 : 0.12 });
    this._flashAt(a, color);
  }

  // 화면 좌표로 유닛 고르기: 발~머리 선분까지의 화면 거리로 판정 (키 큰 보스도 몸통을 눌러 선택 가능)
  pickUnit(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const toPx = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(this.camera); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; };
    let best = null, bd = 1e9;
    for (const v of this.units.values()) {
      if (!v.u.alive || !v.grp.visible) continue;
      const g = v.grp.position, a = toPx(g.x, 0, g.z), b = toPx(g.x, v.height, g.z);
      const e = toPx(g.x + (v.u.rad || 0.5), 0, g.z), rad = Math.max(18, Math.abs(e.x - a.x) * 1.2);
      const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / L));
      const d = Math.hypot(clientX - (a.x + dx * t), clientY - (a.y + dy * t)) - rad;
      if (d < bd) { bd = d; best = v.u; }
    }
    return bd <= 10 ? best : null;
  }

  // 유닛 머리 위 화면 좌표(%) — 우클릭 정보창 위치
  screenPos(v) {
    const p = new THREE.Vector3(v.grp.position.x, v.height + 0.35, v.grp.position.z).project(this.camera);
    return { x: (p.x + 1) / 2 * 100, y: (1 - p.y) / 2 * 100 };
  }

  // ───────── 배치 (드래그) ─────────
  pickCell(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.cells)[0];
    return hit ? hit.object.userData : null;
  }
  pickGround(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }
  // 배치용: 유닛 들어 올리기 / 끌기
  lift(id, on) { const v = this.units.get(id); if (!v) return; v.lifted = on; if (on) { v.dragX = v.u.x; v.dragZ = v.u.z; this._ring(v.u.x, v.u.z, 1.2, '#ffe08a', 0.4); } }
  dragTo(id, x, z) { const v = this.units.get(id); if (v) { v.dragX = x; v.dragZ = z; } }
  // 배치 단계에서만 진영 칸과 중앙 구분선을 보여준다
  showBoard(on) { for (const c of this.cells) c.visible = on; this.path.visible = on; }
  showEnemyCells(on) { for (const c of this.cells) if (c.userData.side === 'enemy') c.visible = on; } // 상점: 상인 쪽 칸은 숨김
  highlightCells(on) { for (const c of this.cells) if (c.userData.side === 'ally') c.material.opacity = on ? 0.6 : 0.38; }
  showHL(x, z, on) { this.hl.visible = on; if (on) this.hl.position.set(x, 0.03, z); }


  // ───────── 로비: 캐릭터 선택 화면 · 필드 ─────────
  _charModel(kind) {
    const M = { dh: ['DH_base', 'DH', 2.0], sr: ['SR_base', 'SR', 1.95], bk: ['BK_base', 'BK', 2.0], bd: ['BD_base', 'BD', 1.85] }[kind];
    const obj = skClone(this.models[M[0]].scene); this._tintClone(obj, null);
    const box = new THREE.Box3().setFromObject(obj), h = box.max.y - Math.max(0, box.min.y);
    obj.scale.setScalar(M[2] / h);
    const grp = new THREE.Group(); grp.add(obj);
    const c = { kind, grp, obj, clips: this.clips[M[1]], mixer: new THREE.AnimationMixer(obj), height: M[2], cur: null, curName: '' };
    this._lobbyPlay(c, 'idle');
    return c;
  }
  _lobbyPlay(c, what) {
    const name = what === 'run' ? (c.clips.run_normal_1 ? 'run_normal_1' : 'run_battle_1') : (c.clips.idle_normal_1 ? 'idle_normal_1' : 'idle_battle_1');
    if (c.curName === name) return;
    const a = c.mixer.clipAction(c.clips[name]); a.reset(); a.setLoop(THREE.LoopRepeat); a.play();
    if (c.cur) c.cur.crossFadeTo(a, 0.25, false);
    c.cur = a; c.curName = name;
  }
  _buildLobby(bgUrl) {
    const s = new THREE.Scene();
    s.background = null; // 배경 이미지는 캔버스 뒤 CSS로 (file:// 에서 이미지 텍스처를 쓰면 WebGL 보안 오류)
    this.lobbyBg = bgUrl;
    // 바닥: 원형 무늬 석판 (절차적)
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const g = cv.getContext('2d');
    const rg = g.createRadialGradient(512, 512, 40, 512, 512, 512); rg.addColorStop(0, '#5a6378'); rg.addColorStop(0.55, '#363d4e'); rg.addColorStop(0.9, 'rgba(21,25,37,0.85)'); rg.addColorStop(1, 'rgba(21,25,37,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(210,190,140,0.55)'; g.lineWidth = 6;
    for (const r of [120, 300, 470]) { g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 2; g.strokeStyle = 'rgba(210,190,140,0.35)';
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(512 + Math.cos(a) * 120, 512 + Math.sin(a) * 120); g.lineTo(512 + Math.cos(a) * 470, 512 + Math.sin(a) * 470); g.stroke(); }
    for (const r of [200, 385]) { g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 3, 3); }
    const ft = new THREE.CanvasTexture(cv); ft.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.25, transparent: true }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    s.add(new THREE.HemisphereLight(0xc8d4ff, 0x2a2430, 1.4));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(-4, 9, 7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); s.add(key);
    const rim = new THREE.DirectionalLight(0x7fa8ff, 1.6); rim.position.set(3, 5, -8); s.add(rim);
    const spot = new THREE.SpotLight(0xffe2a8, 60, 14, 0.42, 0.6, 1.2); spot.position.set(0, 7.5, 3.4); spot.target.position.set(0, 0, 1.3); s.add(spot, spot.target);
    // 선택된 캐릭터 발밑 빛
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 48), new THREE.MeshBasicMaterial({ color: 0xc89a3a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.02, 1.3); s.add(glow);
    const w = this.host.clientWidth || 400, h = this.host.clientHeight || 700;
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100); cam.position.set(0, 3.3, 9.6); cam.lookAt(0, 1.2, 0);
    const fcam = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    this.lobby = { scene: s, cam, fcam, glow, chars: [], mode: null, t: 0 };
  }
  // 캐릭터 선택: list = [{ key, kind }], 선택된 캐릭터가 앞 가운데, 나머지는 뒤에 반원으로 선다
  showLobby(list, sel, bgUrl) {
    if (!this.lobby) this._buildLobby(bgUrl);
    if (bgUrl) this.lobbyBg = bgUrl;
    this.hideLobby();
    const L = this.lobby; L.mode = 'select';
    Object.assign(this.host.style, { backgroundImage: `url('${this.lobbyBg}')`, backgroundSize: 'cover', backgroundPosition: 'center 30%' });
    L.chars = list.map(it => { const c = this._charModel(it.kind); c.key = it.key; L.scene.add(c.grp); return c; });
    this.setLobbySel(sel, true);
  }
  setLobbySel(sel, snap) {
    const L = this.lobby; L.sel = sel;
    const SLOTS = [[0, 1.4], [-1.3, -0.3], [0.05, -1.5], [1.3, -0.3], [-2.4, -1.4], [2.4, -1.4]];
    const order = [L.chars.find(c => c.key === sel), ...L.chars.filter(c => c.key !== sel)].filter(Boolean);
    order.forEach((c, i) => {
      const [x, z] = SLOTS[i] || [0, -3]; c.tx = x; c.tz = z; c.front = i === 0;
      c.tf = Math.atan2(-(L.cam.position.z - z), (i === 0 ? 0 : -x * 0.25) - x); // 카메라 쪽을 바라봄
      if (snap) { c.grp.position.set(x, 0, z); c.grp.rotation.y = c.tf; }
    });
  }
  lobbyPick(cx, cy) {
    const L = this.lobby; if (!L || L.mode !== 'select') return null;
    const r = this.renderer.domElement.getBoundingClientRect(); let best = null, bd = 1e9;
    for (const c of L.chars) {
      const f = c.grp.position.clone().project(L.cam), hd = c.grp.position.clone().add(new THREE.Vector3(0, c.height, 0)).project(L.cam);
      const fx = r.left + (f.x + 1) / 2 * r.width, fy = r.top + (1 - f.y) / 2 * r.height, hy = r.top + (1 - hd.y) / 2 * r.height;
      const half = (fy - hy) * 0.22;
      if (cx < fx - half || cx > fx + half || cy < hy || cy > fy) continue;
      const d = Math.abs(cx - fx) / half; if (d < bd) { bd = d; best = c.key; } // 겹치면 가로 중심에 가까운 캐릭터
    }
    return best;
  }
  // 필드: 전투 맵 바닥 위에 선택한 캐릭터 1명, 바닥을 누르면 그 지점으로 이동
  showField(kind, name) {
    if (!this.lobby) this._buildLobby('');
    this.hideLobby(); this.clear(); this.showBoard(false); this.setTheme('plaza');
    const L = this.lobby; L.mode = 'field';
    const c = this._charModel(kind); c.grp.position.set(0, 0, 3); c.grp.rotation.y = -Math.PI / 2; c.tx = 0; c.tz = 3; c.tf = -Math.PI / 2;
    this.scene.add(c.grp); L.chars = [c]; L.fchar = c;
    const tag = document.createElement('div'); tag.className = 'ftag'; tag.textContent = name; this.overlay.appendChild(tag); L.tag = tag;
    const mk = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0, depthWrite: false })); mk.rotation.x = -Math.PI / 2; mk.position.y = 0.03; this.scene.add(mk); L.mark = mk;
  }
  fieldMove(cx, cy) {
    const L = this.lobby; if (!L || L.mode !== 'field') return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), L.fcam);
    const p = new THREE.Vector3(); if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
    const c = L.fchar; c.tx = Math.max(-11, Math.min(11, p.x)); c.tz = Math.max(-12, Math.min(12, p.z));
    L.mark.position.x = c.tx; L.mark.position.z = c.tz; L.markT = 0.6;
  }
  // 지도: 현재 칸 위에 서 있는 3D 캐릭터. 캔버스를 지도 위로 올리고(투명) 픽셀 좌표 정사영 카메라로 그린다
  showMapChar(kind) {
    if (!this.lobby) this._buildLobby('');
    const L = this.lobby;
    if (L.mode === 'map' && L.mkind === kind && L.fchar) return;
    this.hideLobby();
    if (!L.mscene) {
      const s = new THREE.Scene(); s.background = null;
      s.add(new THREE.HemisphereLight(0xe8eeff, 0x40302a, 1.7));
      const k = new THREE.DirectionalLight(0xfff0d8, 2.4); k.position.set(-300, 600, 900); s.add(k);
      const rim = new THREE.DirectionalLight(0xffb070, 1.0); rim.position.set(400, 300, -600); s.add(rim);
      L.mscene = s; L.ocam = new THREE.OrthographicCamera(0, 100, 0, -100, -5000, 5000); L.ocam.position.z = 1000;
      L.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
      s.add(L.shadow);
    }
    L.mode = 'map'; L.mkind = kind;
    const c = this._charModel(kind);
    const tilt = new THREE.Group(); tilt.rotation.x = 0.45; tilt.add(c.grp); // 위에서 내려다보는 느낌
    c.root = tilt; c.grp.rotation.y = -Math.PI / 2; c.tf = -Math.PI / 2;
    L.mscene.add(tilt); L.chars = [c]; L.fchar = c;
    this.host.classList.add('ontop');
  }
  // x, y: 캔버스 기준 픽셀 (발 위치), size: 칸 크기(px)
  setMapCharPos(x, y, size) {
    const L = this.lobby; if (!L || L.mode !== 'map') return;
    const w = this.host.clientWidth || 400, h = this.host.clientHeight || 700, cam = L.ocam;
    cam.left = 0; cam.right = w; cam.top = 0; cam.bottom = -h; cam.updateProjectionMatrix();
    const c = L.fchar; c.px = x; c.py = y; c.tx = x; c.ty = y; L.msize = size;
    c.root.scale.setScalar(size * 1.35 / c.height);
    c.root.position.set(x, -y, 0); this._lobbyPlay(c, 'idle'); c.tf = -Math.PI / 2;
  }
  moveMapChar(x, y) {
    const L = this.lobby; if (!L || L.mode !== 'map') return Promise.resolve();
    const c = L.fchar, dx = x - c.px, dy = y - c.py;
    c.tx = x; c.ty = y;
    c.tf = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : Math.PI) : (dy > 0 ? -Math.PI / 2 : Math.PI / 2); // 오른쪽 · 왼쪽 · 아래(카메라 쪽) · 위(뒤돌아)
    return new Promise(res => { L.arrive = res; });
  }
  hideLobby() {
    const L = this.lobby; if (!L) return;
    if (L.mode === 'map') { for (const c of L.chars) { L.mscene.remove(c.root); c.mixer.stopAllAction(); } L.chars = []; L.fchar = null; L.mode = null; L.mkind = null; this.host.classList.remove('ontop'); if (L.arrive) { L.arrive(); L.arrive = null; } return; }
    for (const c of L.chars) { (L.mode === 'field' ? this.scene : L.scene).remove(c.grp); c.mixer.stopAllAction(); }
    L.chars = []; L.fchar = null;
    if (L.tag) { L.tag.remove(); L.tag = null; }
    if (L.mark) { this.scene.remove(L.mark); L.mark = null; }
    if (L.mode === 'field') this.showBoard(true);
    this.host.style.backgroundImage = '';
    L.mode = null;
  }
  _lobbyFrame(dt) {
    const L = this.lobby; L.t += dt;
    if (L.mode === 'map') {
      const c = L.fchar; c.mixer.update(dt);
      const dx = c.tx - c.px, dy = c.ty - c.py, d = Math.hypot(dx, dy), sp = (L.msize || 50) / 0.32 * dt;
      if (d > 0.5) { const k = Math.min(1, sp / d); c.px += dx * k; c.py += dy * k; this._lobbyPlay(c, 'run'); }
      else { if (L.arrive) { const f = L.arrive; L.arrive = null; c.tf = -Math.PI / 2; f(); } this._lobbyPlay(c, 'idle'); }
      c.root.position.set(c.px, -c.py, 0);
      let dr = c.tf - c.grp.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); c.grp.rotation.y += dr * Math.min(1, dt * 12);
      const S = L.msize || 50; L.shadow.position.set(c.px, -c.py + S * 0.02, -400); L.shadow.scale.set(S * 0.32, S * 0.12, 1);
      this.renderer.render(L.mscene, L.ocam); return;
    }
    for (const c of L.chars) {
      c.mixer.update(dt);
      const dx = c.tx - c.grp.position.x, dz = c.tz - c.grp.position.z, d = Math.hypot(dx, dz);
      if (L.mode === 'field') {
        const sp = 4.2 * dt;
        if (d > 0.05) { const k = Math.min(1, sp / d); c.grp.position.x += dx * k; c.grp.position.z += dz * k; c.tf = Math.atan2(-dz, dx); this._lobbyPlay(c, 'run'); }
        else this._lobbyPlay(c, 'idle');
      } else {
        if (d > 0.04) { const k = Math.min(1, dt * 6); c.grp.position.x += dx * k; c.grp.position.z += dz * k; }
        this._lobbyPlay(c, d > 0.25 ? 'run' : 'idle');
      }
      let dy = c.tf - c.grp.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.grp.rotation.y += dy * Math.min(1, dt * 10);
    }
    if (L.mode === 'select') {
      L.glow.material.opacity = 0.3 + 0.12 * Math.sin(L.t * 3);
      L.cam.position.x = Math.sin(L.t * 0.25) * 0.2; L.cam.lookAt(0, 1.2, 0);
      this.renderer.render(L.scene, L.cam); return;
    }
    // 필드: 캐릭터를 따라가는 위에서 내려다보는 카메라
    if (this.plazaAnim && this.theme === 'plaza') this.plazaAnim(L.t || 0);
    const c = L.fchar, p = c.grp.position;
    L.fcam.position.set(p.x, p.y + 7.2, p.z + 5.6); L.fcam.lookAt(p.x, 0.6, p.z);
    if (L.mark && L.markT > 0) { L.markT -= dt; L.mark.material.opacity = Math.max(0, L.markT / 0.6) * 0.9; L.mark.scale.setScalar(1 + (0.6 - L.markT) * 1.2); }
    const hp = new THREE.Vector3(p.x, c.height + 0.45, p.z).project(L.fcam);
    if (L.tag) { L.tag.style.left = ((hp.x + 1) / 2 * 100) + '%'; L.tag.style.top = ((1 - hp.y) / 2 * 100) + '%'; }
    this.vfx.update(dt);
    this.renderer.render(this.scene, L.fcam);
  }

  // ───────── 프레임 ─────────
  sync(battle) { this.battle = battle; }

  _frame() {
    const dt = Math.min(0.1, this.clock.getDelta()); // 전투 루프(main.js tick)와 같은 상한
    if (this.lobby?.mode) { this._lobbyFrame(dt); return; }
    if (!this.active) return;
    if (Math.abs((this.shiftT || 0) - (this.shift || 0)) > 0.5) { this.shift += ((this.shiftT || 0) - (this.shift || 0)) * Math.min(1, dt * 10); this._applyShift(); }
    else if (this.shift !== (this.shiftT || 0)) { this.shift = this.shiftT || 0; this._applyShift(); }
    const speed = this.speed || 1;
    for (const v of this.units.values()) {
      const u = v.u;
      v.mixer.update(dt * speed);
      if (v.seq && v.seq.length) {
        v.seqT += dt * speed;
        if (v.seqT >= v.seq[0].at) { const n = v.seq.shift(); this._play(v, n.clip, { dur: n.dur, fade: 0.06, keepLock: true }); }
      }
      // 위치·방향 보간 (배치 중 들어 올린 유닛은 포인터를 따라간다)
      const tx = v.lifted ? v.dragX : u.x, tz = v.lifted ? v.dragZ : u.z;
      v.grp.position.x += (tx - v.grp.position.x) * Math.min(1, dt * 14);
      v.grp.position.z += (tz - v.grp.position.z) * Math.min(1, dt * 14);
      if (v.floatT > 0) v.floatT -= dt * speed;
      if (!v.dead) {
        const fy = v.lifted ? 0.8 : v.floatT > 0 ? 1.4 + Math.sin(performance.now() / 300) * 0.08 : (v.airY || 0);
        const k = v.fastY ? 16 : (v.floatT > 0 || v.grp.position.y > 0.9 && !v.lifted ? 5 : 12);
        v.grp.position.y += (fy - v.grp.position.y) * Math.min(1, dt * speed * k);
        if (v.fastY && Math.abs(fy - v.grp.position.y) < 0.05) v.fastY = false;
        v.grp.visible = !(v.airY > 0 && v.grp.position.y > 9); // 하늘로 사라진 동안 숨김
        if (v.u.noAnim) { // 동작 없는 모델: 걸을 때 깡충, 공격할 때 앞으로 들썩
          const tt = performance.now() / 1000; v.obj.position.y = u.moving ? Math.abs(Math.sin(tt * 11)) * 0.18 : v.lockT > 0 ? Math.max(0, Math.sin(Math.min(1, 1 - v.lockT / 0.6) * Math.PI)) * 0.3 : 0;
          v.obj.rotation.x = v.lockT > 0 ? -Math.sin(Math.min(1, 1 - v.lockT / 0.6) * Math.PI) * 0.35 : 0;
        }
        if (v.u.fire && Math.random() < dt * 10) this.vfx.spawn('fire_ember', v.grp.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6)), 0, 1);
      }
      if (v.spinRot) v.grp.rotation.y += dt * speed * 15;
      else { let dy = u.face - v.grp.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); v.grp.rotation.y += dy * Math.min(1, dt * 12); }
      if (v.spinOn && !v.dead) {
        v.spinAcc2 = (v.spinAcc2 || 0) + dt * speed * 26;
        while (v.spinAcc2 >= 1) { v.spinAcc2 -= 1; const a = Math.random() * Math.PI * 2, r = v.spinHalf * rndf(0.6, 1.15);
          this.vfx.emitOne('whirl_streak', new THREE.Vector3(v.grp.position.x + Math.cos(a) * r, rndf(0.4, 1.6), v.grp.position.z + Math.sin(a) * r), { vel: new THREE.Vector3(-Math.sin(a), 0.1, Math.cos(a)).multiplyScalar(rndf(7, 11)), color: v.spinC }); }
        if (v.spinSq) v.spinSq.position.set(v.grp.position.x, 0.04, v.grp.position.z);
      }
      if (v.ghostAura && !v.dead) { v.ghostAcc = (v.ghostAcc || 0) + dt * 14; while (v.ghostAcc >= 1) { v.ghostAcc -= 1; this.vfx.spawn('ghost_mote', v.grp.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 3.5, (Math.random() - 0.5) * 2.4)), 0, 1); } }
      if (v.lockT > 0) { v.lockT -= dt * speed; if (v.lockT <= 0) v.seq = null; }
      if (v.dead) {
        v.deadT += dt * speed;
        // 사망 모션 후 가라앉으며 사라진다 (아군·적 공통). 합체로 사라지는 개체는 바로 페이드
        if (v.vanishT !== undefined) { v.vanishT -= dt * speed; v.grp.scale.setScalar(Math.max(0.01, v.vanishT / 0.5)); if (v.vanishT <= 0) v.grp.visible = false; }
        else if (v.deadT > 2.2) { v.sink = (v.sink || 0) + dt * 0.8; v.grp.position.y = -v.sink; if (v.deadT > 4) v.grp.visible = false; }
      } else if (v.lockT <= 0) {
        if (u.moving) this._play(v, this._runName(v), { loop: true, fade: 0.15 });
        else this._play(v, this._idleName(v), { loop: true, fade: 0.2 });
      }
      // 샤나 섬광: 지정 불가 동안 반투명
      if (v.flashT > 0 || v.flashOnT) {
        v.flashT -= dt * speed; const on = v.flashT > 0; v.flashOnT = on;
        v.obj.traverse(o => { if (o.isMesh) { o.material.transparent = on; o.material.opacity = on ? 0.35 : 1; } });
      }
      // 회오리 공격: 보스 모델을 감추고 거대한 회오리(겹친 원뿔 + 흐르는 줄무늬)로 덮는다
      if (v.tornado) this._tickTornado(v, dt * speed);
      if (v.spin && !v.dead) {
        v.spinAcc += dt * speed * 22;
        while (v.spinAcc >= 1) {
          v.spinAcc -= 1;
          const a = Math.random() * Math.PI * 2, r = rndf(0.6, 1.3) * (v.spinR || 1.8), y = rndf(0.2, 4.2);
          const pos = new THREE.Vector3(v.grp.position.x + Math.cos(a) * r, y, v.grp.position.z + Math.sin(a) * r);
          const tang = new THREE.Vector3(-Math.sin(a), 0.9, Math.cos(a)).multiplyScalar(rndf(6, 9));
          this.vfx.emitOne(Math.random() < 0.4 ? 'whirl_swirl' : 'whirl_streak', pos, { vel: tang, color: v.spinC });
        }
      }
      // 히다카 도끼 회전: 주변 회전 궤적
      if (v.hSpinT > 0) {
        v.hSpinT -= dt * speed; v.hAcc = v.dead ? 0 : (v.hAcc || 0) + dt * speed * 30; if (v.dead) v.hSpinT = 0;
        while (v.hAcc >= 1) {
          v.hAcc -= 1; const a = Math.random() * Math.PI * 2, r = v.hSpinR * rndf(0.6, 1.0);
          const pos = new THREE.Vector3(v.grp.position.x + Math.cos(a) * r, rndf(0.6, 1.3), v.grp.position.z + Math.sin(a) * r);
          this.vfx.emitOne('whirl_streak', pos, { vel: new THREE.Vector3(-Math.sin(a), 0.1, Math.cos(a)).multiplyScalar(rndf(7, 10)), color: [1, 0.85, 0.6] });
        }
        if (v.hSpinT <= 0) { this.vfx.kill(v.hRing); v.hRing = null; }
      }
      // 피격 번쩍임
      if (v.flash > 0 || v.flashOn) {
        v.flash -= dt;
        const k = Math.max(0, v.flash) / 0.12 * 0.22;
        v.flashOn = v.flash > 0;
        v.obj.traverse(o => { if (o.isMesh && o.material.emissive && !o.material.emissiveMap) o.material.emissive.setRGB(k, k * 0.5, k * 0.4); });
      }
      // HP바
      const p = new THREE.Vector3(v.grp.position.x, v.height + 0.35, v.grp.position.z).project(this.camera);
      v.el.style.left = ((p.x + 1) / 2 * 100) + '%'; v.el.style.top = ((1 - p.y) / 2 * 100) + '%';
      v.el.style.display = v.grp.visible && !v.dead ? '' : 'none'; // 죽으면 체력바 즉시 숨김
      v.hpf.style.width = Math.max(0, u.hp / u.maxHp * 100) + '%';
      v.hps.style.width = Math.min(100, (u.shield || 0) / u.maxHp * 100) + '%';
      if (u.dh && v.stc) { const C = DH.cycle[u.stance]; v.stc.textContent = u.canShotgun ? `${{ pistol: '핸드건', shotgun: '샷건', rifle: '라이플' }[u.stance]} ${u.stanceUses || 0}/${C.count}` : '핸드건'; v.stc.className = 'stc ' + u.stance; }
      if (v.subf) { v.subf.style.width = (u.idg || 0) + '%'; v.subf.parentNode.classList.toggle('full', (u.idg || 0) >= 100); }
      if (v.eqi) { const k = JSON.stringify(u.eqIcons || []); if (v.eqKey !== k) { v.eqKey = k; v.eqi.innerHTML = (u.eqIcons || []).map(e => `<img class="t${e.tier}" src="${EQUIP_IMG(e.kind, e.tier)}">`).join(''); } }
      if (v.mpf) v.mpf.style.width = Math.min(100, (u.mana || 0) / (u.maxMana || 100) * 100) + '%';
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt * speed;
      const k = f.t / f.life;
      if (f.kind === 'ring') { const s = f.r * (0.3 + 0.7 * k); f.m.scale.set(s, s, s); f.m.material.opacity = 0.9 * (1 - k); }
      else if (f.kind === 'fade') f.m.material.opacity = 0.5 * (1 - k);
      else if (f.kind === 'pop') { f.m.scale.setScalar(1 + k * 1.5); f.m.material.opacity = 1 - k; }
      if (k >= 1) { this.scene.remove(f.m); f.m.geometry.dispose(); this.fx.splice(i, 1); }
    }
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.t += dt * speed;
      const k = Math.min(1, p.t / p.life);
      p.m.position.lerpVectors(p.from, p.to, k);
      p.trail.geometry.setFromPoints([p.from.clone().lerp(p.to, Math.max(0, k - 0.35)), p.m.position.clone()]);
      if (k >= 1) { this.scene.remove(p.m); this.scene.remove(p.trail); this.projs.splice(i, 1); }
    }
    for (let i = this.anims.length - 1; i >= 0; i--) { const a = this.anims[i]; a.t += dt * speed; if (a.update(a.t, dt * speed)) { a.remove?.(); this.anims.splice(i, 1); } }
    this.vfx.update(dt * speed);
    // 운석 착탄 화면 흔들림
    if (this.shakeT > 0) {
      this.shakeT -= dt; const k = Math.max(0, this.shakeT) * 0.5;
      this.camera.position.x = (Math.random() - 0.5) * k; this.renderer.render(this.scene, this.camera); this.camera.position.x = 0; return;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
