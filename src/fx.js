// 스킬 이펙트 — 에셋 폴더의 원본 이펙트 텍스처와 파티클 정의값(색·크기·수명·속도)을 바탕으로 재구성
// 원작 Cascade 파티클/셰이더를 그대로 재생하는 것은 아니다. 텍스처는 원본, 동작은 추출 수치를 참고한 근사.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const pickR = (v) => Array.isArray(v) ? rnd(v[0], v[1]) : v;
const curve = (keys, t) => {
  if (!Array.isArray(keys)) return keys;
  if (keys.length === 1) return keys[0];
  const x = Math.min(0.9999, Math.max(0, t)) * (keys.length - 1), i = Math.floor(x), f = x - i;
  return keys[i] * (1 - f) + keys[i + 1] * f;
};

// ───────── 이펙트 정의 ─────────
// 좌표: vel/off = [앞, 위, 오른쪽] (m, m/s). size = m. color = 0~1 (밝기는 additive로 표현)
// align: cam(카메라 정면) | vel(속도 방향으로 늘어남) | ground(바닥에 눕힘)
const C = {
  dhBlue: [0.45, 0.7, 1.0], dhWhite: [0.9, 0.95, 1.0], orange: [1.0, 0.55, 0.15], fire: [1.0, 0.45, 0.1],
  arcane: [0.75, 0.45, 1.0], pink: [1.0, 0.45, 0.6], smoke: [0.55, 0.55, 0.58], purple: [0.7, 0.4, 1.0],
};
export const FXDEF = {
  // 데빌헌터 핸드건: par_d_handgun_muzzle_01 + par_h_gunfireb_01 (푸른 계열)
  dh_pistol: [
    { tex: 'fx_h_gunfire_02', sub: [4, 2], frame: 'random', count: 1, life: [0.05, 0.08], size: [0.45, 0.6], stretch: 1.6, align: 'vel', vel: [[2, 0, 0], [2, 0, 0]], color: C.dhBlue, alpha: [1, 0.6, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.07, size: [0.5, 0.6], color: C.dhWhite, alpha: [1, 0], add: true },
    { tex: 'fx_d_atypical_034_cl', count: 2, life: 0.1, size: [0.25, 0.3], stretch: 4, align: 'vel', vel: [[30, -0.5, -0.5], [35, 0.5, 0.5]], color: C.dhBlue, alpha: [1, 0.8, 0], add: true },
    { tex: 'fx_b_symbol_010', count: 1, life: 1.2, size: [0.06, 0.07], stretch: 2, vel: [[-0.3, 1.2, 0.8], [0.3, 1.8, 1.4]], gravity: 9, spin: [-10, 10], color: [1, 0.9, 0.6], alpha: [1, 1, 0], add: false },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 1, life: [1.2, 1.6], size: [0.35, 0.5], grow: 2.2, vel: [[0.2, 0.6, -0.1], [0.5, 1.0, 0.1]], color: C.smoke, alpha: [0, 0.35, 0.2, 0], add: true },
  ],
  dh_pistol_hit: [
    { tex: 'fx_b_ring_004', count: 1, life: [0.25, 0.35], size: [0.7, 0.9], grow: 2.6, color: C.dhBlue, alpha: [1, 0.6, 0], add: true },
    { tex: 'fx_a_fragment_002_cl', count: 4, life: [0.12, 0.2], size: [0.12, 0.18], stretch: 3, align: 'vel', vel: [[-4, 1, -4], [-1, 4, 4]], color: C.dhWhite, alpha: [1, 0], add: true },
  ],
  dh_tracer: { tex: 'fx_a_fragment_002_cl', count: 1, size: [0.3, 0.3], stretch: 8, align: 'vel', color: [0.6, 0.85, 1], alpha: 1, add: true },
  dh_tracer_rifle: { tex: 'fx_a_fragment_002_cl', count: 1, size: [0.4, 0.4], stretch: 10, align: 'vel', color: [0.8, 1, 0.65], alpha: 1, add: true },
  // 데빌헌터 샷건: par_d_shotgun_gunfire_11 (흰색→주황, 파편·불티·연기)
  dh_shotgun: [
    { tex: 'fx_h_gunfire_02', sub: [4, 2], frame: 'random', count: 2, life: [0.06, 0.09], size: [0.8, 1.0], stretch: 1.5, align: 'vel', vel: [[2, 0, 0], [2, 0, 0]], color: C.orange, alpha: [1, 0.5, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.09, size: [0.9, 1.1], color: [1, 0.8, 0.5], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_002_cl', count: 14, life: [0.12, 0.22], size: [0.1, 0.16], stretch: 4, align: 'vel', vel: [[13, -1.5, -5], [18, 2, 5]], color: [1, 0.75, 0.4], colorEnd: C.orange, alpha: [1, 0.9, 0], add: true },
    { tex: 'fx_b_fragment_004', sub: [4, 1], frame: 'random', count: 3, life: [0.1, 0.15], size: [0.2, 0.3], stretch: 3, align: 'vel', vel: [[6, -1, -3], [10, 1, 3]], color: [1, 0.7, 0.4], alpha: [1, 0], add: true },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 3, life: [0.9, 1.3], size: [0.45, 0.7], grow: 2.4, vel: [[0.4, 0.4, -0.4], [1.2, 0.9, 0.4]], color: [0.75, 0.7, 0.65], alpha: [0, 0.4, 0.15, 0], add: true },
    { tex: 'fx_b_symbol_010', count: 1, life: 1.2, size: [0.07, 0.08], stretch: 2, vel: [[-0.3, 1.4, 0.8], [0.3, 2.0, 1.5]], gravity: 9, spin: [-12, 12], color: [1, 0.85, 0.5], alpha: [1, 1, 0], add: false },
  ],
  dh_shotgun_hit: [
    { tex: 'fx_a_fragment_002_cl', count: 5, life: [0.12, 0.2], size: [0.1, 0.15], stretch: 3, align: 'vel', vel: [[-3, 1, -4], [-1, 4, 4]], color: C.orange, alpha: [1, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.12, size: [0.5, 0.7], color: C.orange, alpha: [0.9, 0], add: true },
  ],
  // 데빌헌터 라이플 (원본 이펙트 미제공 → 핸드건 머즐을 크게, 긴 탄도)
  dh_rifle: [
    { tex: 'fx_h_gunfire_02', sub: [4, 2], frame: 'random', count: 1, life: [0.08, 0.1], size: [0.7, 0.85], stretch: 2.2, align: 'vel', vel: [[2, 0, 0], [2, 0, 0]], color: [0.7, 1.0, 0.55], alpha: [1, 0.5, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.1, size: [0.9, 1.0], color: [0.85, 1, 0.75], alpha: [1, 0], add: true },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 2, life: [1.2, 1.6], size: [0.4, 0.6], grow: 2.4, vel: [[0.3, 0.5, -0.2], [0.8, 0.9, 0.2]], color: C.smoke, alpha: [0, 0.35, 0.15, 0], add: true },
  ],
  dh_rifle_hit: [
    { tex: 'fx_b_ring_004', count: 1, life: 0.35, size: [0.6, 0.7], grow: 3, color: [0.7, 1, 0.55], alpha: [1, 0.5, 0], add: true },
    { tex: 'fx_a_fragment_002_cl', count: 6, life: [0.15, 0.25], size: [0.12, 0.18], stretch: 3, align: 'vel', vel: [[-5, 1, -4], [-1, 5, 4]], color: [0.85, 1, 0.7], alpha: [1, 0], add: true },
  ],
  // 소서리스 에너지 방출: par_u_msr_energy_prj_cast / prj_01 / prj_end_03
  sr_energy_cast: [
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 6, life: [0.15, 0.3], size: [0.08, 0.14], stretch: 3, align: 'vel', vel: [[1, -1.5, -2.5], [4, 2.5, 2.5]], color: C.arcane, alpha: [1, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.25, size: [0.7, 0.8], color: [0.55, 0.45, 1], alpha: [0.9, 0], add: true },
  ],
  sr_energy_orb: [ // 투사체 머리
    { tex: 'fx_k_glow_01', count: 1, size: [2.0, 2.0], color: C.pink, alpha: 1, add: true },
    { tex: 'fx_e_glow_001', count: 1, size: [0.9, 0.9], color: [1, 0.85, 1], alpha: 1, add: true },
  ],
  sr_energy_trail: { tex: 'fx_a_atypical_009', count: 1, life: [0.2, 0.35], size: [0.45, 0.7], grow: 0.4, color: C.arcane, alpha: [0.8, 0], add: true },
  sr_energy_hit: [
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 10, life: [0.18, 0.32], size: [0.1, 0.18], stretch: 3, align: 'vel', vel: [[-5, -1, -5], [5, 5, 5]], color: [1, 0.55, 0.85], alpha: [1, 0], add: true },
    { tex: 'fx_d_atypical_032', count: 1, life: 0.3, size: [0.4, 0.5], grow: 3.5, color: C.purple, alpha: [1, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.2, size: [1.0, 1.2], color: [0.9, 0.6, 1], alpha: [1, 0], add: true },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 1, life: 0.8, size: [0.5, 0.7], grow: 2, vel: [[0, 0.5, 0], [0, 0.8, 0]], color: [0.6, 0.5, 0.8], alpha: [0, 0.4, 0], add: true },
  ],
  // 소서리스 종말의 날: par_x_msr_magiccircle_01 / cast_00 / fireballprj_05 / fireexpl_05 / firedecal_05 (주황 3.0/0.6/0.08)
  sr_meteor_circle: [
    { tex: 'fx_d_symbol_msr_01_cl', count: 1, life: 2.4, size: [4.8, 4.8], align: 'ground', spin: [0.6, 0.6], color: [1, 0.55, 0.2], alpha: [0, 0.9, 0.9, 0.9, 0], add: true, y: 0.04 },
    { tex: 'fx_b_ring_001', count: 1, life: 2.4, size: [5.0, 5.0], align: 'ground', color: [1, 0.4, 0.1], alpha: [0, 0.5, 0.6, 0.5, 0], add: true, y: 0.05 },
    { tex: 'fx_a_glow_003', count: 1, life: 2.4, size: [4.0, 4.0], align: 'ground', color: [1, 0.35, 0.08], alpha: [0, 0.35, 0.5, 0], add: true, y: 0.06 },
  ],
  sr_meteor_cast: [
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 14, life: [0.4, 0.8], size: [0.1, 0.2], stretch: 3, align: 'vel', vel: [[-1.5, 2, -1.5], [1.5, 6, 1.5]], color: C.orange, alpha: [0, 1, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 1.2, size: [1.4, 1.6], color: [1, 0.5, 0.15], alpha: [0, 0.8, 0], add: true, off: [0.3, 1.6, 0] },
  ],
  sr_meteor_ball: [ // 낙하 중 운석 머리
    { tex: 'fx_c_fire_011_cl', sub: [8, 8], anim: 'loop', fps: 30, count: 1, size: [2.2, 2.2], color: [1, 0.75, 0.5], alpha: 1, add: true },
    { tex: 'fx_a_glow_003', count: 1, size: [3.2, 3.2], color: [1, 0.45, 0.1], alpha: 0.9, add: true },
  ],
  sr_meteor_trail: { tex: 'fx_a_cloud_031', count: 1, life: [0.5, 0.8], size: [0.8, 1.2], grow: 1.8, color: [0.9, 0.45, 0.2], colorEnd: [0.25, 0.22, 0.2], alpha: [0.8, 0.4, 0], add: false },
  sr_meteor_hit: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.25, size: [9, 9], color: [1, 0.6, 0.25], alpha: [1, 0], add: true, off: [0, 0.8, 0] },
    { tex: 'fx_c_fire_011_cl', sub: [8, 8], anim: true, count: 9, life: [0.7, 1.1], size: [1.6, 2.4], grow: 1.6, vel: [[-4, 1, -4], [4, 4.5, 4]], drag: 3, color: [1, 0.8, 0.6], alpha: [1, 1, 0.8, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 26, life: [0.3, 0.7], size: [0.15, 0.3], stretch: 4, align: 'vel', vel: [[-11, 2, -11], [11, 10, 11]], gravity: 9, color: C.orange, alpha: [1, 1, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.6, size: [1.0, 1.0], grow: 6, align: 'ground', color: [1, 0.5, 0.15], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_a_cloud_031', count: 7, life: [1.4, 2.0], size: [1.6, 2.4], grow: 1.8, vel: [[-2, 0.8, -2], [2, 2.5, 2]], drag: 1.5, color: [0.32, 0.28, 0.26], alpha: [0, 0.75, 0.5, 0], add: false, spin: [-0.5, 0.5] },
    { tex: 'fx_a_fragment_004', sub: [4, 2], frame: 'random', count: 10, life: [0.7, 1.1], size: [0.2, 0.4], vel: [[-5, 4, -5], [5, 9, 5]], gravity: 18, spin: [-8, 8], color: [0.85, 0.75, 0.65], alpha: [1, 1, 0], add: false },
    { tex: 'fx_d_decal_016_1', count: 1, life: 3.0, size: [5.0, 5.0], align: 'ground', color: [1, 0.85, 0.7], alpha: [1, 1, 0.8, 0], add: false, y: 0.03 },
  ],
  // 회오리 공격 (루가루=붉은색, 루카스=푸른색, 포식자=보라색) — 예시 영상 회오리공격1/2 참고, 기존 텍스처로 구성
  whirl_swirl: { tex: 'fx_a_cloud_031', count: 1, life: [0.35, 0.55], size: [1.1, 1.5], grow: 1.6, color: [1, 0.2, 0.12], alpha: [0, 0.7, 0], add: true, spin: [-6, -3] },
  whirl_streak: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.2, 0.35], size: [0.25, 0.4], stretch: 4, align: 'vel', color: [1, 0.3, 0.2], alpha: [1, 0], add: true },
  whirl_ring: { tex: 'fx_d_atypical_032', count: 1, size: [3.8, 3.8], align: 'ground', spin: [-9, -9], color: [1, 0.2, 0.1], alpha: 0.75, add: true, y: 0.06 },
  blade: { tex: 'crescent', count: 1, size: [2.4, 2.4], spin: [-18, -18], color: [0.8, 0.35, 1], alpha: [1, 1, 0.7], add: true },
  blade_trail: { tex: 'fx_a_cloud_031', count: 1, life: [0.2, 0.3], size: [0.5, 0.7], grow: 1.4, color: [0.55, 0.25, 0.95], alpha: [0.4, 0], add: true },
  // 브레이커 (원본 이펙트는 구성 데이터만 있어 기존 텍스처로 근사: 징벌의 파도 = 금빛 충격파, 수라결 = 붉은 기운)
  bk_hit: [
    { tex: 'fx_b_ring_004', count: 1, life: 0.25, size: [0.6, 0.7], grow: 2.6, color: [1, 0.85, 0.55], alpha: [1, 0.5, 0], add: true },
    { tex: 'fx_a_fragment_002_cl', count: 5, life: [0.12, 0.2], size: [0.12, 0.18], stretch: 3, align: 'vel', vel: [[-4, 1, -4], [-1, 4, 4]], color: [1, 0.9, 0.7], alpha: [1, 0], add: true },
  ],
  bk_wave_cast: [
    { tex: 'fx_e_glow_001', count: 1, life: 0.18, size: [1.0, 1.2], color: [1, 0.85, 0.5], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 8, life: [0.15, 0.28], size: [0.1, 0.18], stretch: 3, align: 'vel', vel: [[4, -1.5, -2.5], [9, 2.5, 2.5]], color: [1, 0.8, 0.45], alpha: [1, 0], add: true },
  ],
  bk_wave: [
    { tex: 'fx_b_ring_001', count: 1, life: 0.35, size: [0.6, 0.6], grow: 3, align: 'ground', color: [1, 0.75, 0.35], alpha: [1, 0.5, 0], add: true, y: 0.08 },
    { tex: 'fx_d_atypical_032', count: 1, life: 0.25, size: [0.8, 1.0], grow: 2, color: [1, 0.8, 0.45], alpha: [0.9, 0], add: true, off: [0, 0.7, 0] },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 1, life: 0.6, size: [0.6, 0.8], grow: 1.8, vel: [[0, 0.6, 0], [0, 1, 0]], color: [0.6, 0.55, 0.45], alpha: [0, 0.4, 0], add: true },
  ],
  bk_wave_big: [
    { tex: 'fx_b_ring_001', count: 1, life: 0.5, size: [1.0, 1.0], grow: 3.5, align: 'ground', color: [1, 0.7, 0.3], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.22, size: [2.4, 2.4], color: [1, 0.8, 0.45], alpha: [1, 0], add: true, off: [0, 0.8, 0] },
    { tex: 'fx_a_fragment_004', sub: [4, 2], frame: 'random', count: 4, life: [0.5, 0.8], size: [0.15, 0.3], vel: [[-2, 3, -2], [2, 6, 2]], gravity: 16, spin: [-8, 8], color: [0.85, 0.75, 0.65], alpha: [1, 1, 0], add: false },
  ],
  bk_asura_on: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.35, size: [4, 4], color: [1, 0.2, 0.12], alpha: [1, 0], add: true, off: [0, 1.1, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 22, life: [0.3, 0.6], size: [0.14, 0.26], stretch: 4, align: 'vel', vel: [[-7, 0, -7], [7, 7, 7]], color: [1, 0.3, 0.18], alpha: [1, 0], add: true, off: [0, 1, 0] },
    { tex: 'fx_d_atypical_032', count: 1, life: 0.5, size: [1.2, 1.2], grow: 4, color: [1, 0.25, 0.15], alpha: [1, 0], add: true, off: [0, 1, 0] },
    { tex: 'fx_b_ring_001', count: 1, life: 0.6, size: [1.0, 1.0], grow: 4.5, align: 'ground', color: [1, 0.15, 0.1], alpha: [1, 0.7, 0], add: true, y: 0.1 },
    { tex: 'fx_a_cloud_031', count: 6, life: [0.5, 0.8], size: [1.0, 1.6], grow: 1.8, vel: [[-3, 0.5, -3], [3, 2, 3]], drag: 2, color: [0.6, 0.08, 0.05], alpha: [0, 0.6, 0], add: true, off: [0, 0.8, 0], spin: [-1, 1] },
  ],
  bk_punch_alt: [ // 연타 중 섞이는 보라·금빛 타격 (영상의 연타 구간)
    { tex: 'fx_d_atypical_032', count: 1, life: 0.2, size: [0.6, 0.8], grow: 2.4, color: [0.65, 0.35, 1], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 4, life: [0.12, 0.22], size: [0.1, 0.18], stretch: 3, align: 'vel', vel: [[2, -2, -3], [6, 3, 3]], color: [1, 0.8, 0.4], alpha: [1, 0], add: true },
  ],
  bk_slash: { tex: 'fx_a_fragment_002_cl', count: 1, life: 0.3, size: [1.2, 1.2], stretch: 6, align: 'vel', vel: [[0.5, 0.3, 0], [0.5, 0.3, 0]], color: [1, 0.2, 0.12], alpha: [1, 0.8, 0], add: true },
  bk_punch: [
    { tex: 'fx_h_gunfire_02', sub: [4, 2], frame: 'random', count: 1, life: [0.06, 0.1], size: [0.7, 0.9], stretch: 1.4, align: 'vel', vel: [[2, 0, 0], [2, 0, 0]], color: [1, 0.35, 0.2], alpha: [1, 0.5, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.1, size: [0.8, 1.0], color: [1, 0.4, 0.25], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_002_cl', count: 3, life: [0.1, 0.18], size: [0.1, 0.16], stretch: 3, align: 'vel', vel: [[3, -2, -3], [7, 3, 3]], color: [1, 0.55, 0.4], alpha: [1, 0], add: true },
  ],
  bk_asura_end: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.3, size: [6, 6], color: [1, 0.3, 0.15], alpha: [1, 0], add: true, off: [0, 0.8, 0] },
    { tex: 'fx_b_ring_001', count: 1, life: 0.55, size: [1.2, 1.2], grow: 5, align: 'ground', color: [1, 0.3, 0.15], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 26, life: [0.3, 0.7], size: [0.15, 0.3], stretch: 4, align: 'vel', vel: [[-10, 2, -10], [10, 9, 10]], gravity: 9, color: [1, 0.4, 0.2], alpha: [1, 1, 0], add: true },
    { tex: 'fx_a_cloud_031', count: 5, life: [1.0, 1.5], size: [1.4, 2.0], grow: 1.8, vel: [[-2, 0.6, -2], [2, 2, 2]], drag: 1.5, color: [0.3, 0.24, 0.22], alpha: [0, 0.6, 0.4, 0], add: false, spin: [-0.5, 0.5] },
  ],
  // 뮨 히다카 (원본 파티클 구성만 있어 근사)
  hidaka_hit: [
    { tex: 'fx_a_fragment_002_cl', count: 6, life: [0.12, 0.22], size: [0.14, 0.2], stretch: 3, align: 'vel', vel: [[-4, 1, -4], [-1, 5, 4]], color: [1, 0.85, 0.6], alpha: [1, 0], add: true },
    { tex: 'fx_d_atypical_032', count: 1, life: 0.25, size: [0.6, 0.7], grow: 3, color: [1, 0.75, 0.45], alpha: [1, 0], add: true },
  ],
  // 회복 (네리아)
  heal_fx: [
    { tex: 'fx_e_glow_001', count: 1, life: 0.5, size: [1.2, 1.4], color: [0.45, 1, 0.55], alpha: [0.9, 0], add: true, off: [0, 1.0, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 8, life: [0.5, 0.9], size: [0.08, 0.14], vel: [[-0.6, 1.2, -0.6], [0.6, 2.6, 0.6]], color: [0.6, 1, 0.6], alpha: [0, 1, 0], add: true, off: [0, 0.4, 0] },
    { tex: 'fx_b_ring_001', count: 1, life: 0.5, size: [0.6, 0.6], grow: 2.2, align: 'ground', color: [0.4, 1, 0.5], alpha: [0.9, 0], add: true, y: 0.06 },
  ],
  // 바드 (원본 텍스처: 음표 fx_f_note_001, 깃털 fx_f_feather_001, 룬 고리 fx_e_ring_029, 마법진 fx_i_magiccircle_003, 악보 fx_k_musicscore_02)
  bd_cast: [
    { tex: 'fx_f_note_001', sub: [4, 3], frame: 'random', count: 5, life: [0.4, 0.7], size: [0.22, 0.34], vel: [[-1, 0.8, -1.2], [1.5, 2.4, 1.2]], color: [0.8, 0.6, 1], alpha: [1, 1, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: 0.3, size: [0.9, 1.1], color: [0.7, 0.45, 1], alpha: [0.9, 0], add: true },
  ],
  bd_shock_orb: [
    { tex: 'fx_e_glow_001', count: 1, size: [0.7, 0.7], color: [0.65, 0.45, 1], alpha: 1, add: true },
    { tex: 'fx_f_note_001', sub: [4, 3], frame: 'random', count: 1, size: [0.45, 0.45], color: [1, 0.9, 1], alpha: 1, add: true },
  ],
  bd_shock_trail: { tex: 'fx_f_note_001', sub: [4, 3], frame: 'random', count: 1, life: [0.3, 0.5], size: [0.16, 0.26], vel: [[-0.4, 0.3, -0.4], [0.4, 1.2, 0.4]], color: [0.75, 0.55, 1], alpha: [0.9, 0], add: true },
  bd_shock_hit: [
    { tex: 'fx_f_ring_001', count: 1, life: 0.35, size: [0.6, 0.7], grow: 2.6, color: [0.75, 0.55, 1], alpha: [1, 0], add: true },
    { tex: 'fx_f_star_001', count: 2, life: [0.2, 0.3], size: [0.7, 1.0], color: [0.85, 0.7, 1], alpha: [1, 0], add: true },
    { tex: 'fx_f_note_001', sub: [4, 3], frame: 'random', count: 4, life: [0.4, 0.6], size: [0.16, 0.26], vel: [[-1.6, 0.6, -1.6], [1.6, 2.2, 1.6]], color: [0.8, 0.6, 1], alpha: [1, 0], add: true },
  ],
  bd_protect: [
    { tex: 'fx_i_magiccircle_003', count: 1, life: 1.4, size: [3.2, 3.2], grow: 1.15, align: 'ground', spin: [0.8, 0.8], color: [0.55, 0.85, 1], alpha: [0, 0.95, 0.8, 0], add: true, y: 0.05 },
    { tex: 'fx_k_musicscore_02', count: 2, life: [1.0, 1.3], size: [1.6, 2.0], vel: [[-0.2, 0.6, -0.2], [0.2, 1.0, 0.2]], color: [0.6, 0.85, 1], alpha: [0, 0.8, 0], add: true, off: [0, 1.2, 0] },
    { tex: 'fx_f_note_001', sub: [4, 3], frame: 'random', count: 10, life: [0.8, 1.3], size: [0.2, 0.34], vel: [[-1.5, 1.0, -1.5], [1.5, 2.6, 1.5]], color: [0.65, 0.9, 1], alpha: [0, 1, 0], add: true, off: [0, 0.8, 0] },
  ],
  bd_shield: [
    { tex: 'fx_f_ring_001', count: 1, life: 0.6, size: [1.6, 1.8], grow: 1.3, color: [0.55, 0.85, 1], alpha: [0.9, 0], add: true, off: [0, 1.0, 0] },
    { tex: 'fx_e_ring_029', count: 1, life: 0.7, size: [1.4, 1.4], grow: 1.4, align: 'ground', color: [0.5, 0.9, 1], alpha: [1, 0], add: true, y: 0.06 },
  ],
  bd_shield_aura: { tex: 'fx_f_ring_001', count: 1, size: [1.7, 1.7], color: [0.35, 0.65, 1], alpha: 0.35, add: true, off: [0, 1.0, 0] },
  // 절실한 구원: 하늘색 룬 장판 + 물방울 구체 + 내려오는 깃털, 종료 시 빛기둥
  bd_rescue_ring: { tex: 'fx_e_ring_029', count: 1, size: [3, 3], align: 'ground', spin: [0.6, 0.6], color: [0.45, 1, 0.95], alpha: 0.95, add: true, y: 0.05 },
  bd_rescue_glow: { tex: 'fx_a_glow_003', count: 1, size: [3, 3], align: 'ground', color: [0.2, 0.75, 0.8], alpha: 0.45, add: true, y: 0.04 },
  bd_rescue_orb: { tex: 'fx_e_ring_040', count: 1, size: [2.2, 2.2], spin: [1.2, 1.2], color: [0.55, 0.95, 1], alpha: 0.55, add: true },
  bd_feather: { tex: 'fx_f_feather_001', sub: [2, 2], frame: 'random', count: 1, life: [1.2, 1.8], size: [0.3, 0.5], vel: [[-0.4, -1.2, -0.4], [0.4, -0.6, 0.4]], spin: [-2, 2], color: [0.75, 1, 1], alpha: [0, 1, 0], add: true },
  bd_rescue_tick: [
    { tex: 'fx_f_star_001', count: 1, life: 0.35, size: [0.9, 1.2], color: [0.6, 1, 0.95], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 4, life: [0.5, 0.8], size: [0.08, 0.14], vel: [[-0.5, 1.4, -0.5], [0.5, 2.6, 0.5]], color: [0.6, 1, 0.9], alpha: [0, 1, 0], add: true },
  ],
  bd_rescue_end: [
    { tex: 'fx_i_shockwave_01_ycl', count: 1, life: 0.6, size: [2.4, 2.4], stretch: 2.2, color: [0.6, 1, 0.9], alpha: [1, 0], add: true, off: [0, 1.6, 0] },
    { tex: 'fx_e_glow_001', count: 1, life: 0.45, size: [2.4, 2.8], color: [0.6, 1, 1], alpha: [1, 0], add: true, off: [0, 0.6, 0] },
  ],
  // 용맹의 세레나데: 보라색 공간 + 주황·파랑 줄기 (참고 이미지)
  bd_valiant: [
    { tex: 'fx_a_glow_003', count: 1, life: 1.8, size: [9, 9], align: 'ground', color: [0.55, 0.25, 0.9], alpha: [0, 0.7, 0.5, 0], add: true, y: 0.04 },
    { tex: 'fx_e_glow_001', count: 1, life: 1.2, size: [3.5, 4], color: [0.75, 0.4, 1], alpha: [0, 1, 0], add: true, off: [0, 1.5, 0] },
    { tex: 'fx_f_aura_004', count: 6, life: [1.0, 1.6], size: [1.6, 2.6], vel: [[-3, 0.2, -3], [3, 1.4, 3]], spin: [-2, 2], color: [1, 0.55, 0.3], alpha: [0, 0.9, 0], add: true, off: [0, 1.2, 0] },
    { tex: 'fx_f_aura_004', count: 6, life: [1.0, 1.6], size: [1.6, 2.6], vel: [[-3, 0.2, -3], [3, 1.4, 3]], spin: [-2, 2], color: [0.4, 0.5, 1], alpha: [0, 0.9, 0], add: true, off: [0, 1.2, 0] },
    { tex: 'fx_f_note_001', sub: [4, 3], frame: 'random', count: 14, life: [1.0, 1.6], size: [0.25, 0.4], vel: [[-2, 1, -2], [2, 3, 2]], color: [1, 0.7, 0.95], alpha: [0, 1, 0], add: true, off: [0, 0.8, 0] },
  ],
  bd_valiant_aura: { tex: 'fx_e_ring_029', count: 1, size: [1.5, 1.5], align: 'ground', spin: [2, 2], color: [1, 0.45, 0.85], alpha: 0.75, add: true, y: 0.07 },
  // 페데리코: 기본 사격(금빛 탄) · 천둥 포격(대각선으로 내리꽂히는 금빛 번개 창 + 흰 번개 충격 + 큰 폭발)
  fed_muzzle: [
    { tex: 'fx_e_glow_001', count: 1, life: 0.18, size: [0.7, 0.9], color: [1, 0.8, 0.4], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 5, life: [0.15, 0.3], size: [0.08, 0.14], stretch: 3, align: 'vel', vel: [[1, -1, -2], [5, 2, 2]], color: [1, 0.85, 0.5], alpha: [1, 0], add: true },
  ],
  fed_shot_head: [
    { tex: 'fx_a_fragment_002_cl', count: 1, size: [0.35, 0.35], stretch: 6, align: 'vel', color: [1, 0.85, 0.45], alpha: 1, add: true },
    { tex: 'fx_e_glow_001', count: 1, size: [0.45, 0.45], color: [1, 0.7, 0.3], alpha: 0.9, add: true },
  ],
  fed_shot_hit: [
    { tex: 'fx_f_star_001', count: 1, life: 0.22, size: [0.9, 1.1], color: [1, 0.9, 0.6], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 6, life: [0.2, 0.35], size: [0.08, 0.14], stretch: 3, align: 'vel', vel: [[-3, 0, -3], [3, 4, 3]], color: [1, 0.8, 0.45], alpha: [1, 0], add: true },
  ],
  fed_lance: [
    { tex: 'fx_a_fragment_002_cl', count: 1, size: [1.1, 1.1], stretch: 10, align: 'vel', color: [1, 0.62, 0.18], alpha: 1, add: true },
    { tex: 'fx_a_fragment_002_cl', count: 1, size: [0.55, 0.55], stretch: 14, align: 'vel', color: [1, 0.95, 0.75], alpha: 1, add: true },
  ],
  fed_lance_trail: { tex: 'fx_e_glow_001', count: 1, life: [0.12, 0.2], size: [0.5, 0.7], color: [1, 0.6, 0.2], alpha: [0.7, 0], add: true },
  fed_bolt_hit: [
    { tex: 'fx_f_star_001', count: 1, life: 0.3, size: [2.2, 2.6], color: [1, 1, 1], alpha: [1, 0], add: true, off: [0, 0.4, 0] },
    { tex: 'fx_b_fragment_004', sub: [4, 1], frame: 'random', count: 4, life: [0.12, 0.25], size: [0.7, 1.1], stretch: 2.2, align: 'vel', vel: [[-4, 2, -4], [4, 7, 4]], color: [0.85, 0.9, 1], alpha: [1, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.35, size: [0.6, 0.6], grow: 3.5, align: 'ground', color: [1, 0.95, 0.85], alpha: [1, 0], add: true, y: 0.06 },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 8, life: [0.25, 0.5], size: [0.1, 0.18], stretch: 3, align: 'vel', vel: [[-5, 1, -5], [5, 6, 5]], gravity: 9, color: [1, 0.75, 0.35], alpha: [1, 0], add: true },
  ],
  fed_mark: { tex: 'fx_b_ring_001', count: 1, size: [3, 3], align: 'ground', spin: [1.5, 1.5], color: [1, 0.75, 0.3], alpha: 0.5, add: true, y: 0.05 },
  fed_blast: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.45, size: [6, 6], grow: 1.3, color: [1, 0.55, 0.2], alpha: [1, 0], add: true, off: [0, 1.0, 0] },
    { tex: 'fx_e_glow_001', count: 2, life: [0.5, 0.8], size: [3.5, 4.5], grow: 1.6, color: [1, 0.4, 0.1], alpha: [0.9, 0], add: true, off: [0, 0.8, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 26, life: [0.4, 0.9], size: [0.14, 0.26], stretch: 4, align: 'vel', vel: [[-9, 3, -9], [9, 11, 9]], gravity: 12, color: [1, 0.65, 0.25], alpha: [1, 1, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.6, size: [1.2, 1.2], grow: 5.5, align: 'ground', color: [1, 0.5, 0.15], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_d_decal_016_1', count: 1, life: 2.4, size: [4.5, 4.5], align: 'ground', color: [1, 0.85, 0.7], alpha: [1, 1, 0.8, 0], add: false, y: 0.03 },
    { tex: 'fx_b_fragment_004', sub: [4, 1], frame: 'random', count: 6, life: [0.15, 0.3], size: [1.0, 1.5], stretch: 2.5, align: 'vel', vel: [[-6, 3, -6], [6, 9, 6]], color: [0.9, 0.9, 1], alpha: [1, 0], add: true },
  ],
  // 소서리스 1750 운석 파편
  sr_shard_head: [
    { tex: 'fx_e_glow_001', count: 1, size: [0.8, 0.8], color: [1, 0.55, 0.2], alpha: 1, add: true },
    { tex: 'fx_c_fire_011_cl', sub: [8, 8], frame: 'random', count: 1, size: [0.7, 0.7], color: [1, 0.75, 0.5], alpha: 1, add: true },
  ],
  sr_shard_trail: { tex: 'fx_e_glow_001', count: 1, life: [0.2, 0.35], size: [0.35, 0.55], grow: 0.5, color: [1, 0.45, 0.15], alpha: [0.8, 0], add: true },
  sr_shard_hit: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.22, size: [3, 3], color: [1, 0.6, 0.25], alpha: [1, 0], add: true, off: [0, 0.4, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 10, life: [0.25, 0.5], size: [0.1, 0.2], stretch: 3, align: 'vel', vel: [[-5, 1, -5], [5, 6, 5]], gravity: 10, color: [1, 0.55, 0.2], alpha: [1, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.4, size: [0.5, 0.5], grow: 3.5, align: 'ground', color: [1, 0.5, 0.15], alpha: [1, 0], add: true, y: 0.07 },
    { tex: 'fx_d_decal_016_1', count: 1, life: 1.8, size: [2.2, 2.2], align: 'ground', color: [1, 0.85, 0.7], alpha: [1, 1, 0], add: false, y: 0.03 },
  ],
  // 라하르트
  lh_aura: { tex: 'fx_f_ring_001', count: 1, size: [2.4, 2.4], color: [0.45, 0.75, 1], alpha: 0.5, add: true, off: [0, 1.2, 0] },
  lh_plant: [
    { tex: 'fx_b_ring_001', count: 1, life: 0.5, size: [1, 1], grow: 4, align: 'ground', color: [0.55, 0.8, 1], alpha: [1, 0], add: true, y: 0.06 },
    { tex: 'fx_e_glow_001', count: 1, life: 0.4, size: [2.4, 2.8], color: [0.6, 0.85, 1], alpha: [1, 0], add: true, off: [0, 0.8, 0] },
  ],
  lh_absorb: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.4, 0.6], size: [0.1, 0.16], color: [0.6, 0.85, 1], alpha: [1, 0], add: true },
  lh_release: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.4, size: [10, 10], color: [1, 0.85, 0.5], alpha: [1, 0], add: true, off: [0, 1.0, 0] },
    { tex: 'fx_b_ring_001', count: 1, life: 0.7, size: [2, 2], grow: 6, align: 'ground', color: [1, 0.85, 0.45], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 30, life: [0.4, 0.8], size: [0.14, 0.26], stretch: 4, align: 'vel', vel: [[-10, 2, -10], [10, 9, 10]], gravity: 8, color: [1, 0.85, 0.5], alpha: [1, 0], add: true },
  ],
  // 아제나 고대의 창 / 이난나 세계수
  // 아제나 고대의 창: 붉게 타오르는 창이 대각선으로 내리꽂히고 화염 폭발
  az_mark: { tex: 'fx_e_ring_029', count: 1, size: [3, 3], align: 'ground', spin: [1.2, 1.2], color: [1, 0.32, 0.15], alpha: 0.85, add: true, y: 0.05 },
  az_trail: [
    { tex: 'fx_c_fire_011_cl', sub: [8, 8], anim: true, count: 1, life: [0.35, 0.55], size: [0.9, 1.4], grow: 1.6, vel: [[-0.3, 0.6, -0.3], [0.3, 1.4, 0.3]], color: [1, 0.45, 0.15], alpha: [1, 0.7, 0], add: true },
    { tex: 'fx_e_glow_001', count: 1, life: [0.15, 0.25], size: [0.8, 1.1], color: [1, 0.25, 0.08], alpha: [0.9, 0], add: true },
  ],
  az_impact: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.35, size: [7, 7], color: [1, 0.5, 0.2], alpha: [1, 0], add: true, off: [0, 0.8, 0] },
    { tex: 'fx_c_fire_011_cl', sub: [8, 8], anim: true, count: 9, life: [0.55, 0.9], size: [1.6, 2.8], grow: 1.5, vel: [[-3, 1, -3], [3, 4.5, 3]], color: [1, 0.55, 0.22], alpha: [1, 0.8, 0], add: true, off: [0, 0.5, 0] },
    { tex: 'fx_e_glow_001', count: 2, life: [0.4, 0.7], size: [3.5, 4.5], grow: 1.5, color: [1, 0.3, 0.08], alpha: [0.9, 0], add: true, off: [0, 0.8, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 24, life: [0.4, 0.8], size: [0.14, 0.24], stretch: 4, align: 'vel', vel: [[-9, 2, -9], [9, 10, 9]], gravity: 11, color: [1, 0.6, 0.25], alpha: [1, 1, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.55, size: [1, 1], grow: 5.5, align: 'ground', color: [1, 0.4, 0.12], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 4, life: [1.0, 1.5], size: [1.4, 2.0], grow: 1.8, vel: [[-1, 0.8, -1], [1, 1.6, 1]], color: [0.35, 0.22, 0.18], alpha: [0, 0.6, 0.3, 0], add: false },
    { tex: 'fx_d_decal_016_1', count: 1, life: 2.2, size: [3.4, 3.4], align: 'ground', color: [1, 0.75, 0.6], alpha: [1, 1, 0.8, 0], add: false, y: 0.03 },
  ],
  // 이난나 세계수: 금빛 (노란빛 덩굴 · 꽃잎 · 빛)
  in_leaf: { tex: 'fx_f_feather_001', sub: [2, 2], frame: 'random', count: 1, life: [1.8, 2.8], size: [0.3, 0.5], vel: [[-0.6, -1.0, -0.6], [0.6, -0.4, 0.6]], spin: [-2, 2], color: [1, 0.84, 0.35], alpha: [0, 1, 0], add: true },
  in_spark: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.8, 1.3], size: [0.1, 0.2], vel: [[-0.4, 1.4, -0.4], [0.4, 2.8, 0.4]], color: [1, 0.9, 0.45], alpha: [0, 1, 0], add: true },
  in_ground: { tex: 'fx_i_magiccircle_003', count: 1, size: [5, 5], align: 'ground', spin: [0.4, 0.4], color: [1, 0.8, 0.3], alpha: 0.7, add: true, y: 0.05 },
  in_glow: { tex: 'fx_e_glow_001', count: 1, size: [7, 7], color: [1, 0.78, 0.3], alpha: 0.5, add: true },
  in_bloom: { tex: 'fx_f_star_001', count: 1, life: [0.6, 1.0], size: [0.35, 0.6], spin: [-1, 1], color: [1, 0.92, 0.55], alpha: [0, 1, 0], add: true },
  // 실리안
  // 실리안 (에스더): 금빛·흰빛 성검
  silian_slash: [
    { tex: 'crescent', count: 1, life: 0.32, size: [4.6, 4.6], spin: [13, 13], color: [1, 0.78, 0.35], alpha: [1, 0.8, 0], add: true, off: [1.5, 1.0, 0] },
    { tex: 'crescent', count: 1, life: 0.24, size: [3.6, 3.6], spin: [16, 16], color: [1, 1, 0.92], alpha: [1, 0.6, 0], add: true, off: [1.4, 1.05, 0] },
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.22, size: [3.8, 3.8], color: [1, 0.85, 0.5], alpha: [0.9, 0], add: true, off: [1.7, 0.9, 0] },
    { tex: 'fx_a_fragment_002_cl', count: 12, life: [0.18, 0.32], size: [0.25, 0.42], stretch: 6, align: 'vel', vel: [[10, -0.5, -5], [19, 2, 5]], color: [1, 0.92, 0.6], alpha: [1, 0.8, 0], add: true, off: [0.6, 1.0, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 14, life: [0.3, 0.6], size: [0.1, 0.18], stretch: 3, align: 'vel', vel: [[4, 0.5, -5], [10, 5, 5]], gravity: 8, color: [1, 0.85, 0.45], alpha: [1, 0], add: true, off: [1.2, 1.0, 0] },
    { tex: 'fx_b_ring_001', count: 1, life: 0.35, size: [0.8, 0.8], grow: 4, align: 'ground', color: [1, 0.85, 0.5], alpha: [1, 0], add: true, off: [1.8, 0, 0], y: 0.07 },
  ],
  silian_hit: [
    { tex: 'fx_f_star_001', count: 1, life: 0.25, size: [1.4, 1.7], color: [1, 0.92, 0.6], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 8, life: [0.2, 0.4], size: [0.1, 0.16], stretch: 3, align: 'vel', vel: [[-4, 0, -4], [4, 5, 4]], color: [1, 0.85, 0.45], alpha: [1, 0], add: true },
  ],
  silian_burst: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.55, size: [8, 8], color: [1, 0.85, 0.45], alpha: [1, 0], add: true, off: [0, 1.4, 0] },
    { tex: 'fx_f_star_001', count: 1, life: 0.45, size: [5, 5], color: [1, 0.97, 0.85], alpha: [1, 0], add: true, off: [0, 1.8, 0] },
    { tex: 'fx_a_fragment_002_cl', count: 22, life: [0.5, 0.9], size: [0.3, 0.5], stretch: 9, align: 'vel', vel: [[-1.6, 11, -1.6], [1.6, 20, 1.6]], color: [1, 0.93, 0.65], alpha: [1, 0.8, 0], add: true },
    { tex: 'fx_i_shockwave_01_ycl', count: 1, life: 0.6, size: [1.2, 1.2], grow: 6, align: 'ground', color: [1, 0.8, 0.4], alpha: [1, 0], add: true, y: 0.08 },
    { tex: 'fx_b_ring_001', count: 1, life: 0.5, size: [1, 1], grow: 4.5, align: 'ground', color: [1, 0.92, 0.65], alpha: [1, 0], add: true, y: 0.09 },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 32, life: [0.5, 1.0], size: [0.12, 0.22], stretch: 3, align: 'vel', vel: [[-8, 3, -8], [8, 10, 8]], gravity: 6, color: [1, 0.85, 0.45], alpha: [1, 1, 0], add: true },
    { tex: 'fx_f_feather_001', sub: [2, 2], frame: 'random', count: 12, life: [1.2, 2.0], size: [0.3, 0.5], vel: [[-2.2, 1, -2.2], [2.2, 3.5, 2.2]], spin: [-3, 3], color: [1, 0.95, 0.75], alpha: [0, 1, 0], add: true, off: [0, 1.5, 0] },
  ],
  silian_aura: { tex: 'fx_i_magiccircle_003', count: 1, size: [3.4, 3.4], align: 'ground', spin: [1.4, 1.4], color: [1, 0.82, 0.4], alpha: 0.85, add: true, y: 0.07 },
  silian_aura2: { tex: 'fx_e_ring_040', count: 1, size: [2.6, 2.6], align: 'ground', spin: [-3, -3], color: [1, 0.95, 0.7], alpha: 0.75, add: true, y: 0.08 },
  silian_body: { tex: 'fx_e_glow_001', count: 1, size: [2.8, 2.8], color: [1, 0.8, 0.4], alpha: 0.4, add: true },
  silian_mote: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.6, 1.0], size: [0.08, 0.15], vel: [[-0.3, 1.6, -0.3], [0.3, 3.2, 0.3]], color: [1, 0.88, 0.5], alpha: [0, 1, 0], add: true },
  // 발탄
  vt_dust: [
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 6, life: [0.9, 1.4], size: [1.4, 2.2], grow: 1.8, vel: [[-2.5, 0.3, -2.5], [2.5, 1.4, 2.5]], color: [0.45, 0.43, 0.4], alpha: [0, 0.65, 0.3, 0], add: false, off: [0, 0.4, 0] },
    { tex: 'fx_a_fragment_004', sub: [4, 2], frame: 'random', count: 8, life: [0.5, 0.9], size: [0.12, 0.24], vel: [[-4, 3, -4], [4, 7, 4]], gravity: 14, spin: [-8, 8], color: [0.4, 0.4, 0.42], alpha: [1, 1, 0], add: false },
  ],
  vt_slam_fx: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.35, size: [7, 7], color: [1, 0.35, 0.2], alpha: [1, 0], add: true, off: [0, 0.6, 0] },
    { tex: 'fx_i_shockwave_01_ycl', count: 1, life: 0.6, size: [1.5, 1.5], grow: 5, align: 'ground', color: [1, 0.4, 0.25], alpha: [1, 0], add: true, y: 0.08 },
    { tex: 'fx_b_fragment_004', sub: [4, 1], frame: 'random', count: 10, life: [0.25, 0.45], size: [0.9, 1.5], stretch: 2.4, align: 'vel', vel: [[-7, 4, -7], [7, 11, 7]], color: [0.8, 0.75, 0.7], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_004', sub: [4, 2], frame: 'random', count: 16, life: [0.6, 1.1], size: [0.15, 0.32], vel: [[-6, 4, -6], [6, 10, 6]], gravity: 16, spin: [-9, 9], color: [0.45, 0.45, 0.47], alpha: [1, 1, 0], add: false },
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 8, life: [1.0, 1.6], size: [1.8, 2.8], grow: 1.7, vel: [[-3.5, 0.3, -3.5], [3.5, 1.5, 3.5]], color: [0.4, 0.38, 0.36], alpha: [0, 0.7, 0.3, 0], add: false, off: [0, 0.5, 0] },
    { tex: 'fx_d_decal_016_1', count: 1, life: 3, size: [5, 5], align: 'ground', color: [1, 0.9, 0.85], alpha: [1, 1, 0.8, 0], add: false, y: 0.03 },
  ],
  vt_slam_fx_g: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.35, size: [7, 7], color: [0.35, 1, 1], alpha: [1, 0], add: true, off: [0, 0.6, 0] },
    { tex: 'fx_i_shockwave_01_ycl', count: 1, life: 0.6, size: [1.5, 1.5], grow: 5, align: 'ground', color: [0.4, 1, 1], alpha: [1, 0], add: true, y: 0.08 },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 26, life: [0.4, 0.8], size: [0.12, 0.24], stretch: 4, align: 'vel', vel: [[-8, 3, -8], [8, 10, 8]], gravity: 10, color: [0.5, 1, 1], alpha: [1, 1, 0], add: true },
  ],
  vt_dash_spark: { tex: 'fx_a_fragment_002_cl', count: 1, life: [0.25, 0.45], size: [0.25, 0.45], stretch: 6, align: 'vel', vel: [[6, -0.3, -0.6], [12, 0.6, 0.6]], color: [1, 0.3, 0.2], alpha: [1, 0.7, 0], add: true },
  vt_dash_spark_g: { tex: 'fx_a_fragment_002_cl', count: 1, life: [0.25, 0.45], size: [0.25, 0.45], stretch: 6, align: 'vel', vel: [[6, -0.3, -0.6], [12, 0.6, 0.6]], color: [0.35, 1, 1], alpha: [1, 0.7, 0], add: true },
  vt_ghost_on: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.6, size: [9, 9], color: [0.3, 0.95, 1], alpha: [1, 0], add: true, off: [0, 2, 0] },
    { tex: 'fx_a_fragment_002_cl', count: 24, life: [0.6, 1.0], size: [0.3, 0.5], stretch: 8, align: 'vel', vel: [[-2, 10, -2], [2, 18, 2]], color: [0.5, 1, 1], alpha: [1, 0.8, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.7, size: [1, 1], grow: 6, align: 'ground', color: [0.4, 1, 1], alpha: [1, 0], add: true, y: 0.08 },
  ],
  ghost_aura: { tex: 'fx_e_glow_001', count: 1, size: [6, 6], color: [0.25, 0.85, 0.95], alpha: 0.4, add: true },
  ghost_mote: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.7, 1.2], size: [0.1, 0.2], vel: [[-0.4, 1.0, -0.4], [0.4, 2.4, 0.4]], color: [0.45, 1, 1], alpha: [0, 1, 0], add: true },
  // 호박단 병사 소환 · 화염마수 불티
  pk_summon: [
    { tex: 'fx_c_cloud_013_cl', sub: [8, 4], anim: true, count: 6, life: [0.6, 1.0], size: [1.0, 1.6], grow: 1.6, vel: [[-1.2, 0.5, -1.2], [1.2, 1.6, 1.2]], color: [0.95, 0.5, 0.15], alpha: [0, 0.8, 0.3, 0], add: true, off: [0, 0.5, 0] },
    { tex: 'fx_b_ring_001', count: 1, life: 0.45, size: [0.6, 0.6], grow: 3.5, align: 'ground', color: [1, 0.55, 0.2], alpha: [1, 0], add: true, y: 0.07 },
  ],
  fire_ember: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.5, 0.9], size: [0.08, 0.14], vel: [[-0.3, 1.0, -0.3], [0.3, 2.2, 0.3]], color: [1, 0.5, 0.15], alpha: [0, 1, 0], add: true },
  // 아만
  am_cast: { tex: 'fx_e_glow_001', count: 1, life: 0.25, size: [0.9, 1.1], color: [0.8, 0.9, 1], alpha: [1, 0], add: true },
  am_cast_big: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.5, size: [4, 4], color: [0.85, 0.92, 1], alpha: [1, 0], add: true, off: [0, 1.8, 0] },
    { tex: 'fx_a_fragment_002_cl', count: 10, life: [0.5, 0.8], size: [0.25, 0.4], stretch: 7, align: 'vel', vel: [[-0.8, 8, -0.8], [0.8, 14, 0.8]], color: [0.9, 0.95, 1], alpha: [1, 0.8, 0], add: true },
  ],
  am_bolt_head: [
    { tex: 'fx_e_glow_001', count: 1, size: [0.7, 0.7], color: [0.75, 0.88, 1], alpha: 1, add: true },
    { tex: 'fx_f_star_001', count: 1, size: [0.5, 0.5], color: [1, 1, 1], alpha: 0.9, add: true },
  ],
  am_bolt_trail: { tex: 'fx_e_glow_001', count: 1, life: [0.15, 0.25], size: [0.35, 0.5], color: [0.6, 0.8, 1], alpha: [0.7, 0], add: true },
  am_bolt_hit: [
    { tex: 'fx_f_star_001', count: 1, life: 0.25, size: [1.2, 1.4], color: [0.85, 0.93, 1], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 6, life: [0.2, 0.4], size: [0.08, 0.14], stretch: 3, align: 'vel', vel: [[-3, 0, -3], [3, 4, 3]], color: [0.75, 0.88, 1], alpha: [1, 0], add: true },
  ],
  am_shield_fx: [
    { tex: 'fx_f_ring_001', count: 1, life: 0.6, size: [1.6, 1.6], grow: 1.4, color: [1, 0.9, 0.6], alpha: [1, 0], add: true, off: [0, 1.1, 0] },
    { tex: 'fx_e_glow_001', count: 1, life: 0.5, size: [2, 2.4], color: [1, 0.88, 0.55], alpha: [0.8, 0], add: true, off: [0, 1.0, 0] },
  ],
  am_ward_fx: [
    { tex: 'fx_i_magiccircle_003', count: 1, life: 1.4, size: [5, 5], align: 'ground', spin: [1, 1], color: [1, 0.88, 0.55], alpha: [0, 1, 1, 0], add: true, y: 0.06 },
    { tex: 'fx_b_ring_001', count: 1, life: 0.5, size: [1, 1], grow: 4, align: 'ground', color: [1, 0.95, 0.75], alpha: [1, 0], add: true, y: 0.07 },
  ],
  am_mote: { tex: 'fx_a_fragment_002_cl', count: 1, life: [0.5, 0.8], size: [0.15, 0.25], stretch: 5, align: 'vel', vel: [[0, 3, 0], [0, 6, 0]], color: [1, 0.92, 0.65], alpha: [1, 0.7, 0], add: true },
  // 페데리코 신성한 광선
  fed_float_on: [
    { tex: 'fx_b_ring_001', count: 1, life: 0.5, size: [0.8, 0.8], grow: 4, align: 'ground', color: [1, 0.9, 0.6], alpha: [1, 0], add: true, y: 0.07 },
    { tex: 'fx_f_feather_001', sub: [2, 2], frame: 'random', count: 10, life: [1.0, 1.8], size: [0.25, 0.42], vel: [[-1.6, 0.5, -1.6], [1.6, 2.5, 1.6]], spin: [-3, 3], color: [1, 0.95, 0.78], alpha: [0, 1, 0], add: true, off: [0, 0.6, 0] },
    { tex: 'fx_e_glow_001', count: 1, life: 0.5, size: [2.4, 2.8], color: [1, 0.85, 0.5], alpha: [0.9, 0], add: true, off: [0, 1.0, 0] },
  ],
  fed_halo: { tex: 'fx_e_ring_040', count: 1, size: [2.2, 2.2], spin: [2, 2], color: [1, 0.88, 0.5], alpha: 0.8, add: true },
  fed_charge: { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, size: [2.4, 2.4], color: [1, 0.9, 0.6], alpha: 0.9, add: true },
  fed_ray_mote: { tex: 'fx_a_fragment_002_cl', count: 1, life: [0.35, 0.55], size: [0.25, 0.45], stretch: 7, align: 'vel', color: [1, 0.93, 0.65], alpha: [1, 0.8, 0], add: true },
  fed_ray_hit: [
    { tex: 'fx_f_star_001', count: 1, life: 0.25, size: [1.2, 1.5], color: [1, 0.95, 0.7], alpha: [1, 0], add: true },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 5, life: [0.2, 0.35], size: [0.08, 0.14], stretch: 3, align: 'vel', vel: [[-3, 0, -3], [3, 4, 3]], color: [1, 0.85, 0.45], alpha: [1, 0], add: true },
  ],
  // 슈헤리트 하늘의 검 착탄
  shu_impact: [
    { tex: 'fx_c_glow_008', sub: [1, 2], frame: 0, count: 1, life: 0.25, size: [4, 4], color: [1, 0.55, 0.25], alpha: [1, 0], add: true, off: [0, 0.6, 0] },
    { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 16, life: [0.3, 0.6], size: [0.12, 0.24], stretch: 4, align: 'vel', vel: [[-7, 2, -7], [7, 8, 7]], gravity: 12, color: [1, 0.6, 0.25], alpha: [1, 1, 0], add: true },
    { tex: 'fx_b_ring_001', count: 1, life: 0.45, size: [0.8, 0.8], grow: 4, align: 'ground', color: [1, 0.4, 0.15], alpha: [1, 0.6, 0], add: true, y: 0.08 },
    { tex: 'fx_e_glow_001', count: 1, life: 0.5, size: [2.4, 2.6], color: [1, 0.35, 0.1], alpha: [0.8, 0], add: true, off: [0, 0.3, 0] },
  ],
  shu_trail: { tex: 'fx_e_glow_001', count: 1, life: [0.25, 0.4], size: [0.6, 0.9], grow: 0.4, vel: [[-0.3, 0.5, -0.3], [0.3, 1.5, 0.3]], color: [1, 0.5, 0.15], alpha: [0.9, 0], add: true },
  shu_ember: { tex: 'fx_a_fragment_007', sub: [4, 2], frame: 'random', count: 1, life: [0.4, 0.8], size: [0.08, 0.14], stretch: 3, align: 'vel', vel: [[-1.8, 1.5, -1.8], [1.8, 4.5, 1.8]], gravity: 5, color: [1, 0.65, 0.25], alpha: [1, 1, 0], add: true },
  // 샤나 (이펙트 원본 미제공 → 영상의 보라색 번개 느낌을 기존 텍스처로 임시 구성)
  shana_flash: [
    { tex: 'fx_b_fragment_004', sub: [4, 1], frame: 'random', count: 6, life: [0.15, 0.3], size: [0.4, 0.7], stretch: 2.5, align: 'vel', vel: [[-3, 1, -3], [3, 5, 3]], color: [0.8, 0.5, 1], alpha: [1, 0], add: true, off: [0, 1, 0] },
    { tex: 'fx_e_glow_001', count: 1, life: 0.6, size: [2, 2.4], color: [0.75, 0.45, 1], alpha: [1, 0], add: true, off: [0, 1, 0] },
  ],
  shana_hit: [
    { tex: 'fx_b_fragment_004', sub: [4, 1], frame: 'random', count: 3, life: [0.12, 0.2], size: [0.6, 0.9], stretch: 2, align: 'vel', vel: [[-1, 4, -1], [1, 8, 1]], color: [0.85, 0.55, 1], alpha: [1, 0], add: true },
    { tex: 'fx_d_atypical_032', count: 1, life: 0.25, size: [0.5, 0.6], grow: 3, color: [0.75, 0.45, 1], alpha: [1, 0], add: true, off: [0, 1, 0] },
  ],
};

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.tex = {}; this.parts = []; this.projs = []; this.ready = false;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }
  async load() {
    const L = new THREE.TextureLoader();
    for (const [k, uri] of Object.entries(window.__FXTEX || {})) {
      const t = await L.loadAsync(uri); t.colorSpace = THREE.SRGBColorSpace; this.tex[k] = t;
    }
    this.tex.crescent = FX.crescentTexture();
    this.ready = true;
  }
  // 포식자 칼날: 초승달 모양 (원본 칼날 이펙트가 없어 절차적으로 생성)
  static crescentTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 20, 64, 64, 60); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.75, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 60, Math.PI * 0.1, Math.PI * 1.3); g.arc(80, 54, 40, Math.PI * 1.3, Math.PI * 0.1, true); g.closePath(); g.fill();
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 56, Math.PI * 0.2, Math.PI * 1.2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // 정의 하나를 지정한 속도·수명·색으로 1개 생성 (회오리 소용돌이, 칼날 등)
  emitOne(name, pos, { vel, life, color, follow, persistent } = {}) {
    if (!this.ready) return null;
    const e = { ...(Array.isArray(FXDEF[name]) ? FXDEF[name][0] : FXDEF[name]) };
    if (color) e.color = color;
    if (life !== undefined) e.life = life;
    const p = this._particle(e, pos, this.basis(0), 1, !!persistent);
    if (!p) return null;
    if (vel) p.vel.copy(vel);
    if (follow) p.follow = follow;
    if (persistent) this.parts.push(p);
    return p;
  }
  kill(p) { if (p) p.age = p.life = 0.0001; }
  basis(face) { const f = new THREE.Vector3(Math.cos(face), 0, -Math.sin(face)); const u = new THREE.Vector3(0, 1, 0); const r = new THREE.Vector3().crossVectors(f, u); return { f, u, r }; }
  _local(v, B) { return new THREE.Vector3().addScaledVector(B.f, v[0]).addScaledVector(B.u, v[1]).addScaledVector(B.r, v[2]); }

  spawn(name, pos, face = 0, scale = 1) {
    if (!this.ready) return;
    const def = FXDEF[name]; if (!def) return;
    const B = this.basis(face);
    for (const e of (Array.isArray(def) ? def : [def])) for (let i = 0; i < (e.count || 1); i++) this._particle(e, pos, B, scale);
  }

  _particle(e, pos, B, scale = 1, persistent = false) {
    const base = this.tex[e.tex]; if (!base) return null;
    let tex = base;
    const [sh, sv] = e.sub || [1, 1];
    if (sh * sv > 1) { tex = base.clone(); tex.needsUpdate = true; tex.repeat.set(1 / sh, 1 / sv); }
    const blending = e.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    let obj, mat;
    const col = new THREE.Color(...(e.color || [1, 1, 1]));
    if (e.align === 'ground') {
      mat = new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, blending, depthWrite: false, side: THREE.DoubleSide });
      obj = new THREE.Mesh(FX.plane || (FX.plane = new THREE.PlaneGeometry(1, 1)), mat);
      obj.rotation.x = -Math.PI / 2;
    } else {
      mat = new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, blending, depthWrite: false });
      obj = new THREE.Sprite(mat);
    }
    obj.renderOrder = 10;
    const off = e.off ? this._local(e.off, B) : new THREE.Vector3();
    obj.position.copy(pos).add(off); if (e.y !== undefined) obj.position.y = e.y;
    const v = e.vel ? this._local([rnd(e.vel[0][0], e.vel[1][0]), rnd(e.vel[0][1], e.vel[1][1]), rnd(e.vel[0][2], e.vel[1][2])], B) : new THREE.Vector3();
    const p = {
      obj, mat, tex, e, age: 0, life: persistent ? Infinity : pickR(e.life || 0.5), vel: v.multiplyScalar(scale),
      size: pickR(e.size || 0.5) * scale, rot: Math.random() * Math.PI * 2, spin: e.spin ? pickR(e.spin) : 0,
      frames: sh * sv, frame: e.frame === 'random' ? Math.floor(Math.random() * sh * sv) : (e.frame || 0), sh, sv,
      col0: col.clone(), col1: e.colorEnd ? new THREE.Color(...e.colorEnd) : null,
    };
    if (e.align === 'ground') obj.rotation.z = p.rot;
    this._apply(p, 0);
    this.scene.add(obj);
    if (!persistent) this.parts.push(p);
    return p;
  }

  _apply(p, t) {
    const e = p.e;
    const a = curve(e.alpha ?? [1, 0], t);
    p.mat.opacity = Math.max(0, Math.min(1, a));
    if (p.col1) p.mat.color.copy(p.col0).lerp(p.col1, t);
    const s = p.size * (1 + ((e.grow || 1) - 1) * t);
    if (p.frames > 1) {
      let f = p.frame;
      if (e.anim === true) f = Math.min(p.frames - 1, Math.floor(t * p.frames));
      else if (e.anim === 'loop') f = Math.floor(p.age * (e.fps || 24)) % p.frames;
      const fx = f % p.sh, fy = Math.floor(f / p.sh);
      p.tex.offset.set(fx / p.sh, 1 - (fy + 1) / p.sv);
    }
    if (e.align === 'ground') { p.obj.scale.set(s, s, 1); p.obj.rotation.z = p.rot + p.spin * p.age; return; }
    if (e.align === 'vel' && p.vel.lengthSq() > 1e-4) {
      // 화면상 속도 방향으로 회전 + 늘이기
      const a0 = this._v.copy(p.obj.position).project(this.camera), a1 = this._w.copy(p.obj.position).add(p.vel).project(this.camera);
      p.mat.rotation = Math.atan2(a1.y - a0.y, (a1.x - a0.x) * this.camera.aspect) - Math.PI / 2;
      p.obj.scale.set(s, s * (e.stretch || 1), 1);
    } else {
      p.mat.rotation = p.rot + p.spin * p.age;
      p.obj.scale.set(s, s * (e.stretch || 1), 1);
    }
  }

  // 투사체: 머리(head 정의)가 from→to로 날아가며 trail을 뿌리고, 도착하면 onHit 이펙트
  projectile({ from, to, speed = 18, head, trail, trailRate = 40, hit, arc = 0, face = 0, delay = 0 }) {
    if (!this.ready) return;
    const heads = (Array.isArray(FXDEF[head]) ? FXDEF[head] : [FXDEF[head]]).map(e => this._particle(e, from, this.basis(face), 1, true)).filter(Boolean);
    const dist = from.distanceTo(to);
    const dir = new THREE.Vector3().subVectors(to, from).normalize().multiplyScalar(speed);
    for (const h of heads) { h.vel.copy(dir); if (delay > 0) h.obj.visible = false; }
    this.projs.push({ from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.08, dist / speed), heads, trail, trailRate, acc: 0, hit, arc, face, delay });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { this.scene.remove(p.obj); p.mat.dispose(); if (p.tex !== this.tex[p.e.tex]) p.tex.dispose(); this.parts.splice(i, 1); continue; }
      if (p.follow) { p.obj.position.x = p.follow.position.x; p.obj.position.z = p.follow.position.z; }
      if (p.e.gravity) p.vel.y -= p.e.gravity * dt;
      if (p.e.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.e.drag * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      this._apply(p, t);
      if (p.trail && Math.random() < dt * 35) this._particle(FXDEF.blade_trail, p.obj.position, this.basis(0));
    }
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const q = this.projs[i];
      if (q.delay > 0) { q.delay -= dt; for (const h of q.heads) h.obj.visible = false; continue; }
      q.t += dt; const k = Math.min(1, q.t / q.dur);
      const pos = new THREE.Vector3().lerpVectors(q.from, q.to, k); pos.y += Math.sin(k * Math.PI) * q.arc;
      for (const h of q.heads) { h.obj.visible = true; h.age += dt; h.obj.position.copy(pos); this._apply(h, 0); }
      if (k < 1 && q.arc) { /* 포물선 방향 보정 */ }
      if (q.trail) { q.acc += dt * q.trailRate; while (q.acc >= 1) { q.acc -= 1; this._particle(FXDEF[q.trail], pos, this.basis(q.face)); } }
      if (k >= 1) {
        for (const h of q.heads) { this.scene.remove(h.obj); h.mat.dispose(); if (h.tex !== this.tex[h.e.tex]) h.tex.dispose(); }
        if (q.hit) this.spawn(q.hit, q.to, q.face);
        this.projs.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.parts) this.scene.remove(p.obj);
    for (const q of this.projs) for (const h of q.heads) this.scene.remove(h.obj);
    this.parts = []; this.projs = [];
  }
}
