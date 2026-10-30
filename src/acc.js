// 장신구 (2026-10-31): 귀걸이 · 반지 · 목걸이 · 팔찌 각 1칸. 등급 희귀 < 유물 < 고대 (1~2층은 희귀만)
// 아이콘 = 에셋 'UI/아이템/3티어_장신구'. 효과는 이름의 핵심 단어(공간·구도자·시간·신념·의지·파멸자)로 정한다
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export const ACC_GRADES = ['희귀', '유물', '고대'];
export const ACC_GRADE_BG = ['rg2', 'rg5', 'rg6']; // 아이콘 배경 (희귀 파랑 · 유물 빨강 · 고대 흰색)
export const ACC_GRADE_COL = ['#5aa0ff', '#ff7a3c', '#e9e2cf'];
export const ACC_SLOTS = { earring: '귀걸이', ring: '반지', necklace: '목걸이', bracelet: '팔찌' };
export const ACC_SLOT_KEYS = ['earring', 'ring', 'necklace', 'bracelet'];
export const ACC_KEYWORD = { space: '공간', seeker: '구도자', time: '시간', faith: '신념', will: '의지', ruin: '파멸자' };

// 등급 · 부위별 이름 (앞말) — 에셋에 있는 것만
const PRE = {
  1: { space: '타락한 ', seeker: '찬란한 ', time: '타락한 ', faith: '타오르는 ', will: '타오르는 ', ruin: '찬란한 ' },
  2: { time: '타락한 ', faith: '솟구치는 ', will: '솟구치는 ' },
};
export const ACC_AVAIL = {
  0: { earring: ['space', 'seeker', 'time', 'faith', 'will', 'ruin'], ring: ['space', 'seeker', 'time', 'faith', 'will', 'ruin'], necklace: ['seeker', 'time', 'will'] },
  1: { earring: ['space', 'seeker', 'time', 'faith', 'will', 'ruin'], ring: ['space', 'seeker', 'time', 'faith', 'will', 'ruin'], necklace: ['seeker', 'time', 'will'], bracelet: ['hero'] },
  2: { earring: ['time', 'faith', 'will'], ring: ['time', 'faith', 'will'], necklace: ['time', 'will'], bracelet: ['hero'] },
};

// 효과 [희귀, 유물, 고대]
export const ACC_EFF = {
  earring: {
    space: { stat: 'crit', v: [3, 5, 7], fmt: '치명타 확률 +{v}%' },
    seeker: { stat: 'magDmg', v: [6, 9, 12], fmt: '마법 피해 +{v}%' },
    time: { stat: 'atkSpd', v: [5, 8, 11], fmt: '공격 속도 +{v}%' },
    faith: { stat: 'healRecv', v: [10, 15, 20], fmt: '받는 회복 효과 +{v}%' },
    will: { stat: 'taken', v: [4, 6, 8], fmt: '받는 피해 -{v}%' },
    ruin: { stat: 'physDmg', v: [6, 9, 12], fmt: '물리 피해 +{v}%' },
  },
  ring: {
    space: { stat: 'critDmg', v: [10, 15, 20], fmt: '치명타 피해량 +{v}%' },
    seeker: { stat: 'manaGain', v: [10, 15, 20], fmt: '마나 획득량 +{v}%' },
    time: { stat: 'castSpd', v: [8, 12, 16], fmt: '스킬 시전 속도 +{v}%' },
    faith: { stat: 'shieldRecv', v: [10, 15, 20], fmt: '보호막 효과 +{v}%' },
    will: { stat: 'hp', v: [6, 9, 12], fmt: '최대 체력 +{v}%' },
    ruin: { stat: 'atkSpd', v: [5, 8, 11], fmt: '공격 속도 +{v}%' },
  },
  necklace: {
    seeker: { stat: 'manaRegen', v: [1, 1.5, 2], fmt: '초당 마나 자연 회복 +{v}' },
    time: { stat: 'allSpd', v: [4, 6, 8], fmt: '모든 속도(스킬·공격·이동) +{v}%' },
    will: { stat: 'dmg', v: [5, 8, 11], fmt: '주는 피해 +{v}%' },
  },
};
// 팔찌 옵션: 등급(유물 1 / 고대 2)별 [하, 중, 상]
export const BRACELET_OPTS = {
  lifesteal: { name: '생명력 흡수', fmt: '생명력 흡수 {v}%', v: { 1: [1, 2, 3], 2: [2, 3.5, 5] } },
  atkSpd: { name: '공격 속도', fmt: '공격 속도 +{v}%', v: { 1: [2, 4, 6], 2: [4, 6, 8] } },
  moveSpd: { name: '이동 속도', fmt: '이동 속도 +{v}%', v: { 1: [3, 6, 9], 2: [6, 9, 12] } },
  hp: { name: '최대 체력', fmt: '최대 체력 +{v}%', v: { 1: [3, 5, 7], 2: [5, 7.5, 10] } },
  manaRegen: { name: '자연 마나 회복', fmt: '초당 마나 자연 회복 +{v}', v: { 1: [0.5, 1, 1.5], 2: [1, 1.5, 2] } },
  manaHit: { name: '타격 시 마나 획득', fmt: '타격 시 마나 +{v}', v: { 1: [1, 2, 3], 2: [2, 3, 4] } },
  physDmg: { name: '물리 피해', fmt: '물리 피해 +{v}%', v: { 1: [3, 5, 7], 2: [5, 7.5, 10] } },
  magDmg: { name: '마법 피해', fmt: '마법 피해 +{v}%', v: { 1: [3, 5, 7], 2: [5, 7.5, 10] } },
  taken: { name: '받는 피해 감소', fmt: '받는 피해 -{v}%', v: { 1: [2, 3, 4], 2: [3, 4.5, 6] } },
};
export const OPT_TIER = ['하', '중', '상'];
export const OPT_TIER_COL = ['#9aa3b5', '#7ee08a', '#ffd166'];

let seq = 1;
// 등급 (2026-10-31 3차): 1~3층 일반 드랍은 희귀만, 3층 보스 '부활한 발탄'은 유물 1개. 고대는 아직 드랍하지 않음
export function rollAccGrade(floor) { return 0; }
export const BRACELET_CHANCE = 0.15; // 유물 이상 장신구 중 팔찌 확률
export function makeAcc(floor, o = {}) {
  const grade = o.grade ?? rollAccGrade(floor);
  let slot = o.slot;
  if (!slot) {
    // 팔찌는 유물·고대에만 있고 확률을 크게 낮춘다 (유물·고대 장신구 중 8%)
    if (grade >= 1 && Math.random() < BRACELET_CHANCE) slot = 'bracelet';
    else slot = pick(['earring', 'earring', 'ring', 'ring', 'necklace']);
  }
  const key = o.key || pick(ACC_AVAIL[grade][slot]);
  const it = { id: 'a' + seq++, acc: true, slot, grade, key };
  if (slot === 'bracelet') {
    const n = grade === 1 ? rint(1, 2) : rint(1, 3), keys = Object.keys(BRACELET_OPTS).sort(() => Math.random() - 0.5).slice(0, n);
    it.opts = keys.map(k => ({ k, t: rint(0, 2) }));
  }
  return it;
}
export function accId(it) { return `${it.grade}_${it.slot}_${it.key}`; }
export function accImg(it) { return `img/acc/${it.grade}_${it.slot}_${it.key}.png`; }
export function accName(it) {
  if (it.slot === 'bracelet') return it.grade === 2 ? '찬란한 영웅의 팔찌' : '고귀한 영웅의 팔찌';
  return `${it.grade ? PRE[it.grade][it.key] : ''}${ACC_KEYWORD[it.key]}의 ${ACC_SLOTS[it.slot]}`;
}
const fmt = (f, v) => f.replace('{v}', +v.toFixed(1));
export function accLines(it) {
  if (it.slot === 'bracelet') return it.opts.map(o => ({ text: fmt(BRACELET_OPTS[o.k].fmt, BRACELET_OPTS[o.k].v[it.grade][o.t]), tier: o.t }));
  const E = ACC_EFF[it.slot][it.key]; return [{ text: fmt(E.fmt, E.v[it.grade]) }];
}
export function accText(it) { return accLines(it).map(l => l.text + (l.tier != null ? ` (${OPT_TIER[l.tier]})` : '')).join(' · '); }
// 가격: 판매가 = 구매가(기준가)의 50%
export function accPrice(it) { return [80, 180, 360][it.grade] + (it.slot === 'bracelet' ? 120 : 0); }
export function accSell(it) { return Math.round(accPrice(it) * 0.5); }
// 장착한 장신구 효과 합계 (computeStats에서 사용)
export function accStats(eq) {
  const s = { crit: 0, critDmg: 0, atkSpd: 0, moveSpd: 0, castSpd: 0, magDmg: 0, physDmg: 0, dmg: 0, hp: 0, taken: 0, healRecv: 0, shieldRecv: 0, manaGain: 0, manaRegen: 0, manaHit: 0, lifesteal: 0 };
  for (const k of ACC_SLOT_KEYS) {
    const it = eq?.[k]; if (!it) continue;
    if (it.slot === 'bracelet') { for (const o of it.opts) s[o.k] += BRACELET_OPTS[o.k].v[it.grade][o.t]; continue; }
    const E = ACC_EFF[it.slot][it.key], v = E.v[it.grade];
    if (E.stat === 'allSpd') { s.atkSpd += v; s.moveSpd += v; s.castSpd += v; } else s[E.stat] += v;
  }
  return s;
}
// 도감용 전체 목록 (지금 드랍되는 희귀·유물만)
export const ACC_LIVE_GRADES = [0, 1];
export function allAccs() {
  const out = [];
  for (const g of ACC_LIVE_GRADES) for (const sl of ACC_SLOT_KEYS) for (const k of ACC_AVAIL[g][sl] || []) out.push({ acc: true, grade: g, slot: sl, key: k, opts: sl === 'bracelet' ? [] : undefined });
  return out;
}
