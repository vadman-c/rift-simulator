// 낙원의 유산 (런 밖 메타 성장) — 옵시디언 '유물 시스템' 초안을 임의 수치로 구현
// 6종 유물 · 복원 0~18단계 · 복원석 · 9단계부터 공명. localStorage에 저장 (시즌 초기화 버튼 제공)
export const RELIC_KEYS = ['censer', 'horn', 'mask', 'cup', 'bell', 'mirror'];
// 유물은 계열(NPC)이 아니라 효과 종류로 나뉜다. 고유 효과: Ⅰ(3단계) → Ⅰ 강화(6단계) → Ⅱ(12단계) → Ⅲ(17단계)
export const RELIC_DEF = {
  censer: { name: '향로', icon: '🏺', color: '#8fd3a8', theme: '회복',
    u: ['전투 승리 후 회복 +5%p', '전투 승리 후 회복 +10%p (Ⅰ 증폭)', '아군 최대 체력 +5%', '상점 물품 가격 -10%'],
    res: { name: '정화의 향', desc: '아군 중 처음으로 체력 40% 미만이 되면 파티 전체 최대 체력 12% 회복 (전투당 1회)' } },
  horn: { name: '호각', icon: '📯', color: '#e9a95a', theme: '방어 · 돌격',
    u: ['첫 전투 시작 시 아군 보호막 (최대 체력 6%)', '모든 전투 시작 시 보호막 (Ⅰ 증폭)', '아군 받는 피해 -5%', '근접 아군(사거리 1칸) 최대 체력 +8%'],
    res: { name: '돌격 나팔', desc: '전투 시작 5초간 아군 이동 속도 +30%, 받는 피해 -15%' } },
  mask: { name: '가면', icon: '🎭', color: '#b59bff', theme: '치명 · 기습',
    u: ['선택지 리롤 +1', '선택지 리롤 +2 (Ⅰ 증폭)', '아군 치명타 확률 +5%', '아군 치명타 피해 +15%'],
    res: { name: '그림자 습격', desc: '전투 중 첫 처치 시, 처치한 아군의 피해 5초간 +40%' } },
  cup: { name: '술잔', icon: '🏆', color: '#ffd166', theme: '공격 · 재화',
    u: ['시작 주화 +20', '시작 주화 +40 (Ⅰ 증폭)', '아군 스킬 피해 +8%', '아군 공격력 +4%'],
    res: { name: '모래말림', desc: '12초마다 적이 가장 많은 곳에 3초간 모래 회오리, 초당 파티 평균 공격력의 30% 피해' } },
  bell: { name: '종', icon: '🔔', color: '#7fd0ff', theme: '보호막',
    u: ['아군이 얻는 보호막 +5%', '아군이 얻는 보호막 +10% (Ⅰ 증폭)', '보호막이 남아 있는 아군 받는 피해 -6%', '보호막이 남아 있는 아군 공격력 +6%'],
    res: { name: '수호의 종', desc: '20초마다 아군 전체에 최대 체력 6% 보호막' } },
  mirror: { name: '거울', icon: '🪞', color: '#c9c9ff', theme: '마나',
    u: ['기본 공격 마나 획득 +1', '기본 공격 마나 획득 +2 (Ⅰ 증폭)', '전투 시작 시 마나 +10', '최대 마나 -10%'],
    res: { name: '비추는 거울', desc: '적을 처치한 아군 마나 +1 (13단계 +2 · 17단계 +3). 한 번의 공격으로 얻는 양은 그 수치 ×3까지' } },
};
// 유물 단계는 NPC 등장(종류·확률)에 영향을 주지 않는다 (2026-10-30)
export const mirrorKill = (st) => st >= 17 ? 3 : st >= 13 ? 2 : st >= 9 ? 1 : 0;

// 등급: 균열 보상으로 얻는다. 더 높은 등급을 얻으면 등급업 (런이 끝나도 유지). 등급이 높을수록 그 유물의 단계 보너스(체력·공격력·받는 피해·치명) 배율 증가
// 등급 = 아이콘 배경색: 일반 회색 · 고급 초록 · 희귀 파랑 · 영웅 보라 · 전설 노랑 · 유물 빨강 · 고대 흰색
export const GRADES = ['일반', '고급', '희귀', '영웅', '전설', '유물', '고대'];
export const GRADE_COL = ['#9a9a9a', '#5fc46a', '#4f8fe8', '#a35fe8', '#f0c23a', '#e8453c', '#f2f2f2'];
export const GRADE_MUL = [1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2];
export const GRADE_STONES = [1, 2, 3, 5, 8, 12, 16]; // 같거나 낮은 등급을 얻으면 복원석으로 환산
// 유물 아이콘 이미지 (등급 배경 위에 올린다)
export const RELIC_IMG = (k) => `img/relic/${k}.png`;
// 층별 등급 확률 [일반, 고급, 희귀, 영웅, 전설, 유물, 고대]
export const GRADE_ODDS = { 1: [0.87, 0.11, 0.02], 2: [0.83, 0.14, 0.03], 3: [0.74, 0.19, 0.06, 0.01], 4: [0.66, 0.23, 0.09, 0.02] };
export function rollGrade(floor) { const o = GRADE_ODDS[Math.min(4, floor)] || GRADE_ODDS[1]; let r = Math.random(); for (let i = 0; i < o.length; i++) { if (r < o[i]) return i; r -= o[i]; } return 0; }
// 보상으로 낙원 유물 획득: 등급이 더 높으면 등급업, 아니면 복원석 환산
export function gainParadise(m, key, grade) {
  const cur = m.grades[key] || 0;
  if (grade > cur) { m.grades[key] = grade; saveMeta(m); return { up: true, from: cur, to: grade }; }
  const st = GRADE_STONES[grade]; m.stones += st; saveMeta(m); return { up: false, stones: st };
}

// 18단계 공통 뼈대 (단계별 설명)
export function stageText(key, st) {
  const D = RELIC_DEF[key];
  const T = {
    1: '아군 체력 +1%', 2: '아군 체력 +1%', 3: '고유 효과 Ⅰ · ' + D.u[0], 4: '아군 공격력 +1%', 5: '아군 공격력 +1%',
    6: '고유 효과 Ⅰ 강화 · ' + D.u[1], 7: '아군 체력 +1%', 8: '아군 공격력 +1%', 9: `공명 활성 · ${D.res.name}`, 10: '아군 받는 피해 -1%',
    11: '아군 체력 +1%', 12: '고유 효과 Ⅱ · ' + D.u[2], 13: '아군 공격력 +1%', 14: '동료 영입 후보 +1명', 15: '아군 치명타 확률 +1%',
    16: '아군 체력·공격력 +1%', 17: '고유 효과 Ⅲ · ' + D.u[3], 18: 'NPC 합류 레벨 +1',
  };
  return T[st];
}
// 복원 확률 (현재 단계 → 다음 단계)과 복원석 소모
export function restoreOdds(st) { return st < 5 ? 1 : st < 9 ? 0.6 : st < 12 ? 0.45 : st < 15 ? 0.3 : 0.2; }
export function restoreCost(st) { return st < 9 ? 1 : st < 14 ? 2 : 3; }

const KEY = 'rift_meta';
// 2026-10-31 3차: 처음 들어가면 모든 유물 0단계 · 일반 등급 · 복원석 0 (예전 저장값은 ver가 달라 초기화)
export const META_VER = 2;
export const DEFAULT_META = () => ({ ver: META_VER, relics: { censer: 0, horn: 0, mask: 0, cup: 0, bell: 0, mirror: 0 }, grades: { censer: 0, horn: 0, mask: 0, cup: 0, bell: 0, mirror: 0 }, stones: 0, season: 1 });
export function loadMeta() {
  try { const m = JSON.parse(localStorage.getItem(KEY) || 'null'); if (m && m.relics && m.ver === META_VER) return { ...DEFAULT_META(), ...m, relics: { ...DEFAULT_META().relics, ...m.relics }, grades: { ...DEFAULT_META().grades, ...(m.grades || {}) } }; } catch {}
  return DEFAULT_META();
}
export function saveMeta(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} }
export function tryRestore(m, key) {
  const st = m.relics[key]; if (st >= 18) return { ok: false, msg: '최대 단계입니다' };
  const cost = restoreCost(st); if (m.stones < cost) return { ok: false, msg: '복원석이 부족합니다' };
  m.stones -= cost;
  if (Math.random() < restoreOdds(st)) { m.relics[key] = st + 1; saveMeta(m); return { ok: true, up: true, st: st + 1 }; }
  saveMeta(m); return { ok: true, up: false, st };
}
export function paradisePower(m) { return RELIC_KEYS.reduce((s, k) => s + m.relics[k] * 12680, 0); } // 표시용 낙원력

// 런에 적용되는 효과 묶음 (모두 파티 전체 · 단계 보너스는 유물마다 합산, 영입 후보·합류 레벨은 중복 없음)
export function metaBonus(m) {
  const b = { res: new Set(), healAfter: 0, shopDiscount: 0, firstShield: 0, allShield: 0, rerolls: 0, startCoins: 0, shieldMul: 1, shieldTaken: 0, shieldAtk: 0,
    recruitPlus: 0, joinLv: 0, manaPlus: 0, startMana: 0, maxManaCut: 0, mirrorKill: 0,
    all: { hp: 0, atk: 0, taken: 0, crit: 0, critDmg: 0, skill: 0, meleeHp: 0 } };
  const A = b.all;
  for (const k of RELIC_KEYS) {
    const s = m.relics[k] || 0;
    const gm = GRADE_MUL[(m.grades || {})[k] || 0]; // 등급 배율
    A.hp += gm * [1, 2, 7, 11, 16].filter(x => s >= x).length; A.atk += gm * [4, 5, 8, 13, 16].filter(x => s >= x).length;
    if (s >= 10) A.taken += 0.01 * gm; if (s >= 15) A.crit += 0.01 * gm;
    const u1 = s >= 6 ? 2 : s >= 3 ? 1 : 0, u2 = s >= 12, u3 = s >= 17;
    if (k === 'censer') { b.healAfter = [0, 0.05, 0.10][u1]; if (u2) A.hp += 5; if (u3) b.shopDiscount = 0.1; }
    if (k === 'horn') { if (u1 === 1) b.firstShield = 0.06; if (u1 === 2) b.allShield = 0.06; if (u2) A.taken += 0.05; if (u3) A.meleeHp += 8; }
    if (k === 'mask') { b.rerolls = u1; if (u2) A.crit += 0.05; if (u3) A.critDmg += 0.15; }
    if (k === 'cup') { b.startCoins = [0, 20, 40][u1]; if (u2) A.skill += 0.08; if (u3) A.atk += 4; }
    if (k === 'bell') { b.shieldMul = 1 + [0, 0.05, 0.1][u1]; if (u2) b.shieldTaken = 0.06; if (u3) b.shieldAtk = 0.06; }
    if (k === 'mirror') { b.manaPlus = u1; if (u2) b.startMana = 10; if (u3) b.maxManaCut = 0.1; b.mirrorKill = mirrorKill(s); }
    if (s >= 14) b.recruitPlus = 1;
    if (s >= 18) b.joinLv = 1;
    if (s >= 9) b.res.add(k);
  }
  return b;
}
