// 런 상태: 지도, 성장, 보상, 전투 구성
import {
  DH, SR, SHANA, BK, BARD, HIDAKA, SILIAN, NERIA, FEDERICO, LAHART, AZENA, INANNA, ESTHER_KEYS, NPC_APPEAR, SLOT_OF, EQ_SLOTS, UNITS, CLASS_KEYS, NPC_KEYS, tierFor, tierOf, LEVEL_TIER, ALTARS, ALTAR_KEYS, ALTAR_CAP, ALTAR_CAP_GRAIL, ENGRAVINGS, GRADES, GRADE_MUL, ULTIMATES, LEGACIES,
  MONSTERS, ALTAR_BOSSES, DEEP_BOSSES, FLOOR1_BOSS, FLOOR1_ELITE, FLOOR2_ELITE, FLOOR1_BOSS_SHU, FLOOR2_ELITE_SPIKE, VALTAN_BOSS, VALTAN_RED, AMAN, EQUIP, EQUIP_OPTS, EQUIP_OPT_KEYS, EQUIP_TIER_ODDS, EQUIP_SELL,
} from './data.js';
import { cellToPos, CELL, COLS, ROWS_SIDE } from './sim.js';
import { accStats, accName, accText, accSell, makeAcc } from './acc.js';
export { makeAcc };

export const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 현재 설계 범위: 1층만. 층을 늘릴 때 이 값을 올린다.
export const MAX_FLOOR = 3; // 1층·2층 (2층은 지도만 설계, 전투는 기존 몬스터를 층 배율로 사용)
// 일반 전투 구성 (층 안에서 몇 번째 일반 전투인지 기준)
export const STAGE_RULE = {
  earlyUntil: 2,                         // 1~2번째 일반 전투 = 초반
  early: { normal: [2, 3], elite: [0, 1], hpMul: 0.7, atkMul: 0.65 },   // 초반은 혼자 싸우는 경우가 많아 몬스터를 약하게
  late:  { normal: [4, 6], elite: [1, 2], hpMul: 1, atkMul: 1 },
};
export const RELIC_SLOTS = 5, ENGRAVE_SLOTS = 3, MAX_LEVEL = 20, EXP_PER_LEVEL = 100;

// main: 선택한 클래스 키, roster: { 클래스키: 아이템 레벨 }
export function newRun({ main = 'DevilHunter', roster = { DevilHunter: 1775 }, asc = 0, ilvl, meta = null, esther = false }) {
  if (ilvl && !roster[main]) roster = { ...roster, [main]: ilvl };
  const run = {
    main, roster, asc, esther, // esther: 에스더 무기 보유
    ilvl: roster[main], tier: tierFor(main, roster[main]),
    floor: 1, coins: 0, cleared: 0, floorBattles: 0,
    units: [newUnit(main, 1, { col: 3, row: 1 })],
    relics: [], engravings: [], ultimate: null, legacies: [],
    rerolls: 3, potions: 0, stones: 1, hones: 0, hones2: 0, bag: [], // hones = 1티어 강화 재료, hones2 = 2티어 강화 재료
    bossOrder: shuffle(ALTAR_KEYS).slice(0, 5),
    grailTaken: false, greedLegacy: 0, ultOffered: {},
    startTime: Date.now(), log: [], stats: { battles: 0, dealt: 0 },
  };
  Object.defineProperty(run, 'unit', { get() { return this.units[0]; }, enumerable: false }); // 주 캐릭터
  run.meta = meta; // 낙원의 유산 효과 (meta.js metaBonus)
  if (meta) { run.rerolls += meta.rerolls; run.coins += meta.startCoins; }
  run.map = genMap(run);
  return run;
}

export function newUnit(key, level, cell) { return { key, level, exp: 0, hpPct: 1, cell: { ...cell }, eq: { e0: null, e1: null, e2: null, earring: null, ring: null, necklace: null, bracelet: null } }; }
// 클래스 기능 단계: 원정대 아이템 레벨 단계와 균열 레벨 단계 중 높은 쪽
// 원정대에 1770 캐릭터가 있으면 처음부터 1770 기능 전부. 낮은 캐릭터도 균열 레벨로 열린다 (Lv1 = 1700 / Lv5 = 1730 / Lv10 = 1750 / Lv15 = 1770)
export function levelTier(level) { let t = 1; LEVEL_TIER.forEach((lv, i) => { if (level >= lv) t = i + 1; }); return t; }
export function unitTier(run, u) { return UNITS[u.key].cls ? Math.max(tierFor(u.key, run.roster[u.key] || 0), levelTier(u.level)) : 4; }
export function unitDef(key) { return { dh: DH, sr: SR, shana: SHANA, bk: BK, bd: BARD, hidaka: HIDAKA, silian: SILIAN, neria: NERIA, federico: FEDERICO, lahart: LAHART, azena: AZENA, aman: AMAN }[UNITS[key].kind]; }
export function isMag(key) { return unitDef(key).dmgType === 'mag' || UNITS[key]?.dmg === '마법'; } // 데이터 표기(UNITS.dmg)와 맞춘다

// 동료 후보: 원정대에서 아이템 레벨 1700 이상인 다른 클래스 + NPC (이미 파티에 있으면 제외)
export function recruitPool(run, opts = {}) {
  const have = new Set(run.units.map(u => u.key));
  const cls = CLASS_KEYS.filter(k => k !== run.main && (run.roster[k] || 0) >= 1700);
  // NPC: 희귀도별 등장 확률로 후보 판정 (낙원 유물과 무관). opts.all이면 전부
  const npcs = NPC_KEYS.filter(k => opts.all || Math.random() < npcChance(run, k));
  return [...cls, ...npcs].filter(k => !have.has(k));
}
// 영입 방 후보 n명: NPC는 희귀도별 확률로 판정해 먼저 넣고(넘치면 무작위 n명), 남은 자리는 원정대의 다른 클래스(1700 이상)로 채운다
export function recruitCandidates(run, n = 3) {
  const have = new Set(run.units.map(u => u.key));
  let npcs = shuffle(NPC_KEYS.filter(k => !have.has(k) && Math.random() < npcChance(run, k)));
  const cls = shuffle(CLASS_KEYS.filter(k => k !== run.main && !have.has(k) && (run.roster[k] || 0) >= 1700));
  // 에스더 무기 보유: 첫 동료를 얻기 전에는 에스더 동료(실리안 · 아제나/이난나) 1명이 반드시 후보에 나온다
  if (run.esther && run.units.length === 1) {
    const es = ESTHER_KEYS.filter(k => !have.has(k));
    if (es.length) {
      const first = npcs.find(k => es.includes(k)) || pick(es);
      npcs = [first, ...npcs.filter(k => k !== first)];
    }
  }
  const head = npcs.slice(0, n);
  return shuffle([...head, ...cls].slice(0, n));
}
export function npcChance(run, k) {
  const r = unitDef(k).rarity || 2, base = NPC_APPEAR[r] ?? 0.5;
  const ok = false; // 낙원 유물 단계는 NPC 등장에 영향 없음 (2026-10-30)
  return Math.min(0.95, base * (ok ? 1.5 : 1));
}
export function npcLocked() { return []; }
export const MAX_PARTY = COLS * ROWS_SIDE; // 인원 제한 없음 (배치 칸 수만큼). 대신 경험치를 파티 전체가 나눠 갖는다
export function addUnit(run, key) {
  const used = new Set(run.units.map(u => u.cell.col + ',' + u.cell.row));
  const order = [[2, 1], [4, 1], [3, 2], [1, 1], [5, 1], [2, 2], [4, 2], [3, 0], [2, 0], [4, 0], [1, 2], [5, 2], [1, 0], [5, 0], [0, 1], [6, 1], [0, 2], [6, 2], [0, 0], [6, 0], [3, 3], [2, 3], [4, 3], [1, 3], [5, 3], [0, 3], [6, 3]];
  const [col, row] = order.find(([c, r]) => !used.has(c + ',' + r)) || [3, 3];
  const lv = Math.max(1, run.unit.level - 1) + (UNITS[key].npc ? run.meta?.joinLv || 0 : 0);
  run.units.push(newUnit(key, lv, { col, row }));
}

// ───────── 스탯 ─────────
export function maxHpOf(run, u = run.unit) { return computeStats(run, u).maxHp; }

export function computeStats(run, u = run.unit) {
  const B = unitDef(u.key).base; // 2026-10-31 3차: 제단·균열 각인·균열 유물 제거
  const lvMul = 1 + 0.08 * (u.level - 1);
  const s = {
    maxHp: B.hp * lvMul, atk: B.atk * lvMul,
    crit: B.crit, critDmg: B.critDmg,
    dmgMul: 1, takenMul: 1, atkSpd: 0, moveSpd: 0, skillDmg: 0, awakeDmg: 0, bossDmg: 0, manaGain: 0,
    pistolDmg: 0, shotgunDmg: 0, rifleDmg: 0, healMul: 1, shieldStart: 0, coin: 0, discount: 0,
  };
  let hpPct = 0, dmgPct = 0;
  // 낙원의 유산: 파티 전체 보너스 (효과별 유물)
  const MA = run.meta?.all;
  if (MA && u.key) {
    hpPct += MA.hp + (unitDef(u.key).rangeCells === 1 ? MA.meleeHp : 0); s.atk *= 1 + MA.atk / 100;
    s.takenMul *= 1 - MA.taken; s.crit += MA.crit; s.critDmg += MA.critDmg; s.skillDmg += MA.skill;
  }

  // 장비 (유닛 단위)
  let eqAtk = 0; s.manaPlus = 0; s.rangePlus = 0; s.skillShield = 0;
  for (const it of Object.values(u.eq || {})) {
    if (!it || it.acc) continue;
    const E = EQUIP[it.kind], v = E.base[it.tier], mag = isMag(u.key);
    if (E.stat === 'hp') hpPct += v;
    else if ((E.stat === 'matk') === mag) eqAtk += v / 100; // 물리 무기는 물리 유닛, 마법 무기는 마법 유닛에게만 주옵션 적용
    switch (it.opt) {
      case 'mana': if (UNITS[u.key].kind === 'dh') eqAtk += 0.06; else s.manaPlus += EQUIP_OPTS.mana.v; break; // 데빌헌터는 마나가 없어 공격력 +6%로 대체
      case 'atk': eqAtk += EQUIP_OPTS.atk.v; break;
      case 'reduce': s.takenMul *= 1 - EQUIP_OPTS.reduce.v; break;
      case 'hp': hpPct += EQUIP_OPTS.hp.v; break;
      case 'range': s.rangePlus = 1; break; // 최대 +1칸
      case 'crit': s.crit += EQUIP_OPTS.crit.v; break;
      case 'critDmg': s.critDmg += EQUIP_OPTS.critDmg.v; break;
      case 'shield': s.skillShield = Math.max(s.skillShield, EQUIP_OPTS.shield.v); break;
    }
  }
  // 장신구 (귀걸이·반지·목걸이·팔찌)
  const A = accStats(u.eq), magU = isMag(u.key);
  s.crit += A.crit / 100; s.critDmg += A.critDmg / 100; s.atkSpd += A.atkSpd / 100; s.moveSpd += A.moveSpd / 100;
  s.healMul *= 1 + A.healRecv / 100; s.takenMul *= 1 - A.taken / 100; hpPct += A.hp; s.manaGain += A.manaGain / 100;
  dmgPct += A.dmg + (magU ? A.magDmg : A.physDmg);
  s.castSpd = A.castSpd / 100; s.shieldRecv = A.shieldRecv / 100; s.manaRegen = A.manaRegen; s.lifesteal = A.lifesteal / 100; s.manaPlus += A.manaHit;
  // 클래스 해금 효과 (2026-10-31 3차)
  if (run.units?.some(x => UNITS[x.key].kind === 'dh')) s.crit += 0.10;                         // 데빌헌터 1700: 파티 전체 치명타 확률 +10%
  const ck = UNITS[u.key].kind, ct = UNITS[u.key].cls ? unitTier(run, u) : 0;
  if (ck === 'dh' && ct >= 3) { s.critDmg += 0.25; s.atkSpd += 0.10; s.castSpd += 0.10; }       // 데빌헌터 1750: 치명타 피해 +25% · 공격·스킬 속도 +10%
  if (run.units?.some(x => ['sr', 'bk'].includes(UNITS[x.key].kind))) dmgPct += 6;            // 소서리스·브레이커 1700: 파티 전체 피해량 +6% (둘 다 있어도 1번만)
  s.atk *= 1 + eqAtk;
  s.maxHp = Math.round(s.maxHp * (1 + hpPct / 100));
  s.dmgMul *= 1 + dmgPct / 100;
  s.crit = Math.min(1, s.crit);
  // 트라이포드: 1730 해금 시 레벨 3/5/7마다 스킬 +15%
  s.tripod = 0; // 데빌헌터 트라이포드는 2026-10-31 3차에 삭제
  s.skillMul = 1 + 0.15 * s.tripod;
  if (UNITS[u.key].kind === 'sr' && unitTier(run, u) >= 2) s.skillMul += SR.skill.perLevel1730 * u.level; // 소서리스 1730: 균열 레벨당 종말의 날 +5%
  return s;
}

export function makeAlly(run, u = run.unit, id = 1) {
  const s = computeStats(run, u), kind = UNITS[u.key].kind, D = unitDef(u.key), tier = unitTier(run, u);
  const p = cellToPos('ally', u.cell.col, u.cell.row);
  const c = {
    id, side: 'ally', key: u.key, name: D.name, kind, model: kind, level: u.level,
    hp: Math.max(1, Math.round(s.maxHp * u.hpPct)), maxHp: s.maxHp, atk: s.atk,
    crit: s.crit, critDmg: s.critDmg, dmgMul: s.dmgMul, takenMul: s.takenMul, atkSpd: s.atkSpd, moveSpd: s.moveSpd,
    skillDmg: s.skillDmg, awakeDmg: s.awakeDmg, bossDmg: s.bossDmg, manaGain: s.manaGain, skillMul: s.skillMul,
    pistolDmg: s.pistolDmg, shotgunDmg: s.shotgunDmg, rifleDmg: s.rifleDmg, healMul: s.healMul,
    castSpd: s.castSpd, shieldRecv: s.shieldRecv, manaRegen: s.manaRegen, lifesteal: s.lifesteal,
    shield: s.maxHp * s.shieldStart, speed: D.base.speed, rad: 0.45, mana: 0, int: 1, x: p.x, z: p.z,
  };
  if (kind === 'dh') Object.assign(c, { dh: true, noMana: true, canShotgun: tier >= 2, awake: false, maxMana: 100, ranged: true, range: DH.pistol.range });
  else Object.assign(c, { def: D, maxMana: D.mana, manaPerHit: D.manaPerHit, ranged: D.rangeCells > 1, range: D.rangeCells * CELL - (D.rangeCells <= 1 ? 1.0 : 0), skill: 'seq', mag: isMag(u.key), healer: !!D.healer });
  if (kind === 'bk') Object.assign(c, { ident: true, idg: 0, wave: tier >= 2, asuraPlus: tier >= 3 }); // 수라결 게이지(항상) · 1730 징벌의 파도(마나) · 1750 수라결 +2초
  if (kind === 'sr') c.shards = tier >= 3; // 1750 운석 파편
  if (kind === 'azena') c.form = 'azena';
  if (kind === 'bd') Object.assign(c, { rescue: tier >= 2, valiant: tier >= 3, rescueN: 0 }); // 1730 절실한 구원 / 1750 용맹의 세레나데
  if (c.manaPerHit) c.manaPerHit += s.manaPlus + (run.meta?.manaPlus || 0); // 장비 옵션 + 거울 고유 효과 Ⅰ (고정 수치)
  if (!c.noMana && run.meta) { c.maxMana = Math.max(10, Math.round(c.maxMana * (1 - run.meta.maxManaCut))); c.mana = Math.min(c.maxMana - 1, run.meta.startMana); } // 거울 Ⅲ 최대 마나 감소 · Ⅱ 전투 시작 마나
  c.rangeBonus = s.rangePlus * CELL; c.skillShield = s.skillShield;
  c.eqIcons = EQ_SLOTS.map(k => u.eq?.[k]).filter(Boolean).map(it => ({ kind: it.kind, tier: it.tier, opt: !!it.opt })); // 필드 영웅 머리 위 장비 표시
  return c;
}
export function makeAllies(run) { return run.units.map((u, i) => makeAlly(run, u, i + 1)); }

// ───────── 적 구성 ─────────
let eid = 100;
function scale(run) { const f = run.floor - 1; return { hp: Math.pow(1.17, f), atk: Math.pow(1.11, f) }; }

export function makeMonster(run, key, opt = {}) {
  const m = MONSTERS[key], sc = scale(run);
  let hp = m.hp * sc.hp * (opt.hpMul || 1), atk = m.atk * sc.atk * (opt.atkMul || 1);
  if (run.asc >= 1 && !m.elite) hp *= 1.1;
  if (run.asc >= 8) atk *= 1.15;
  return {
    id: eid++, side: 'enemy', name: m.name, model: m.model, h: m.h * (opt.hMul || 1), tint: opt.tint ?? m.tint ?? null,
    hp: Math.round(hp), maxHp: Math.round(hp), atk, crit: 0.08, critDmg: 1.6, int: m.int, range: m.rangeM || 0.4,
    speed: m.speed, rad: m.elite ? 0.9 : m.h > 2.2 ? 0.8 : 0.6, maxMana: 100, mana: rint(0, 40),
    skill: m.skill, elite: !!m.elite, add: !!opt.add, takenMul: m.taken || 1, dmgMul: 1, ranged: m.range === 'ranged',
    atkClip: m.atkClip || 'att_battle_1_01', skillClip: m.skillClip || 'att_battle_2_01', bigClip: m.model.startsWith('Wolf') ? 'att_battle_2_01' : 'att_battle_3_01',
    noAnim: !!m.noAnim, fire: !!m.fire, mkey: key,
  };
}

export function makeBoss(run, def) {
  const sc = scale(run);
  let hp = 36000 * sc.hp, atk = 45 * sc.atk;
  if (run.floor >= 7) { hp *= 1.1; }
  if (run.asc >= 9) hp *= 1.2;
  if (run.asc >= 4) atk *= 1.15;
  if (run.asc >= 10 && (run.floor === 4 || run.floor === 5)) atk *= 1.2;
  if (run.asc >= 13 && run.floor === 9) hp *= 1.3;
  if (run.asc >= 8) atk *= 1.15;
  if (def.pattern === 'trio') { hp *= 0.45; atk *= 0.6; }
  if (def.pattern === 'twin') { hp *= 1.1; atk *= 0.6; } // 공유 체력 풀, 몸이 둘이라 개체별 공격력은 낮춤
  if (def.pattern === 'valtan') { hp *= 1.0; atk *= 0.85; }
  return {
    id: eid++, side: 'enemy', name: def.name, model: def.model, h: def.h, tint: def.tint,
    hp: Math.round(hp), maxHp: Math.round(hp), atk, crit: def.pattern === 'critStack' ? 0.3 : 0.1, critDmg: 1.6,
    int: def.pattern === 'valtan' ? 2.2 : 1.5, range: 0.6, speed: 2.8, rad: /^Valtan/.test(def.model) ? 1.4 : 1.2, maxMana: 100, mana: 0,
    skill: def.pattern === 'valtan' ? null : 'aoe', boss: true, pattern: def.pattern, desc: def.desc, takenMul: 1, dmgMul: 1, vdef: def.pattern === 'valtan' ? def : null,
    atkClip: 'att_battle_1_01', skillClip: 'att_battle_2_01', bigClip: def.model.startsWith('Wolf') ? 'att_battle_2_01' : 'att_battle_3_01',
  };
}

export function makeEliteBoss(run, def) {
  const sc = scale(run), n = run.units.length;
  let hp = def.hp * sc.hp * (n <= 1 ? 0.4 : n === 2 ? 0.85 : 1), atk = def.atk * sc.atk * (n <= 1 ? 0.85 : 1);
  if (run.asc >= 8) atk *= 1.15;
  return {
    id: eid++, side: 'enemy', name: def.name, model: def.model, h: def.h, tint: null,
    hp: Math.round(hp), maxHp: Math.round(hp), atk, crit: 0.1, critDmg: 1.6, int: def.int, range: 0.6, speed: 3.0, rad: 0.8,
    maxMana: 100, mana: 0, skill: 'aoe', boss: true, eliteBoss: true, elite: true, pattern: def.pattern, edef: def, desc: def.desc, takenMul: 1, dmgMul: 1,
    atkClip: 'att_battle_1_01', skillClip: 'att_battle_2_01', bigClip: 'att_battle_5_03',
  };
}

export function bossDefs(run) {
  if (run.floor === 1) return [FLOOR1_BOSS_SHU];
  if (run.floor === 2) return [VALTAN_RED];
  return [VALTAN_BOSS];
}

function placeEnemies(list) {
  const cells = shuffle([...Array(28).keys()]);
  list.forEach((e, i) => {
    let c = cells[i];
    let col = c % 7, row = Math.floor(c / 7);
    if (e.boss) { col = e._col ?? 3; row = 2; }
    if (e._cell) { col = e._cell.col; row = e._cell.row; }
    const p = cellToPos('enemy', col, row);
    e.x = p.x + (Math.random() - 0.5) * 0.3; e.z = p.z;
  });
  return list;
}

export function enemiesFor(run, room, opts = {}) {
  const f = run.floor;
  // 층별 몬스터 (나열 순서 = 약한 순) — 2026-10-31
  // 1층: 호박단 병사 · 마수01 · 마수02 / 병사 스테이지: 검방패 병사 · 궁수 · 엘리트 흰갈기 마수
  // 2층: 무갑옷형 악마개 · 검은 마수 · 날개 마수 · 엘리트 굵은팔 갈기
  // 3층: 검은 마수 · 날개 마수 · 갑옷 악마개 · 갑옷형 화염마수 · 엘리트 갈기꼬리
  // 1층은 시작 지점에서 먼 전투일수록 병사 스테이지 비중 증가 (병사 스테이지는 병사만, 엘리트 자리도 병사)
  const d = opts.dist ?? 2, siege = d <= 2 ? 0 : d <= 4 ? 0.35 : 0.65;
  const beasts = { 1: ['pumpkin', 'pumpkin', 'beast1', 'beast1', 'beast2'], 2: ['bareDog', 'bareDog', 'blackBeast', 'wingBeast'], 3: ['blackBeast', 'wingBeast', 'armorDog', 'armorDog', 'fireDog'] }[Math.min(3, f)];
  const soldiers = ['shieldman', 'shieldman', 'archer'];
  const isSiege = f >= 2 ? false : (opts.siege ?? (Math.random() < siege));
  const eliteMon = { 1: 'whiteMane', 2: 'thickArm', 3: 'maneTail' }[Math.min(3, f)];
  const pool = { length: 1, pickOne: () => pick(isSiege ? soldiers : beasts) }, eliteKey = () => isSiege ? pick(soldiers) : eliteMon;
  const solo = run.units.length <= 1, o = solo ? { hpMul: 0.4, atkMul: 0.5 } : {}; // 혼자면 호위병 약화
  const done = (list) => { const st = list.stage; const out = placeEnemies(list); out.stage = st; out.faction = isSiege ? 'siege' : 'beast'; return out; };
  let list = [];
  if (room === 'battle' || room === 'rift' || room === 'ambush') {
    // 층 안에서의 일반 전투 순서로 초반/후반 구성을 정한다. ambush = 이벤트 실패 전투 (엘리트가 많다)
    const R = room === 'ambush' ? STAGE_RULE.late : (run.floorBattles || 1) <= STAGE_RULE.earlyUntil ? STAGE_RULE.early : STAGE_RULE.late;
    const nN = room === 'ambush' ? rint(2, 3) : rint(...R.normal) + (room === 'rift' ? 1 : 0), nE = room === 'ambush' ? 2 + (run.units.length >= 3 ? 1 : 0) : rint(...R.elite);
    const m = room === 'rift' ? 1.3 : 1, hm = m * R.hpMul, am = m * R.atkMul;
    for (let i = 0; i < nN; i++) list.push(makeMonster(run, pool.pickOne(), { hpMul: hm, atkMul: am }));
    for (let i = 0; i < nE; i++) { const k = eliteKey(); list.push(makeMonster(run, k, isSiege ? { hpMul: hm * 1.3, atkMul: am * 1.15 } : { hpMul: hm, atkMul: am })); }
    list.stage = room === 'ambush' ? '매복' : R === STAGE_RULE.early ? '초반' : '후반';
  } else if (room === 'elite') {
    // 1층: 윌리윌리 + 호박단 병사 2 (이후 5초마다 소환) / 2층: 갈기 가시팔 + 검은 마수 2 / 3층: 통솔자 루가루 + 파괴자 루카스 (체력 공유, 쫄 = 날개 마수)
    if (f <= 1) {
      const b = makeEliteBoss(run, FLOOR1_ELITE); b._cell = { col: 3, row: 1 }; b.speed = 2.6; list.push(b);
      for (const col of [2, 4]) { const s = makeMonster(run, 'pumpkin', { ...o, add: true }); s._cell = { col, row: 0 }; list.push(s); }
      return done(list);
    }
    if (f === 2) {
      const b = makeEliteBoss(run, FLOOR2_ELITE_SPIKE); b._cell = { col: 3, row: 1 }; b.rad = 1.1; list.push(b);
      for (const col of [2, 4]) { const s = makeMonster(run, 'blackBeast', o); s._cell = { col, row: 0 }; list.push(s); }
      return done(list);
    }
    const defs = FLOOR1_BOSS.twins;
    const bs = defs.map((dd, i) => { const b = makeBoss(run, dd); b._col = [2, 4][i]; b.eliteRoom = true; list.push(b); return b; });
    const hp0 = Math.round(bs[0].maxHp * 0.75); // 정예 방이라 보스 때보다 체력 ×0.75
    const shared = { hp: hp0, maxHp: hp0, merged: false, merge: { ...FLOOR1_BOSS.merge, atk: bs[0].atk / 0.6 * FLOOR1_BOSS.merge.atkMul } };
    for (const b of bs) { b.shared = shared; b.hp = shared.hp; b.maxHp = shared.maxHp; }
    return done(list);
  } else if (room === 'boss') {
    // 1층: 슈헤리트 + 앞줄 검방패 2 · 뒷줄 궁수 2 (좌우 대칭) / 2층: 마수군단장 발탄 / 3층: 부활한 발탄
    if (f <= 1) {
      const b = makeEliteBoss(run, FLOOR1_BOSS_SHU); b._cell = { col: 3, row: 1 }; b.eliteBoss = false; list.push(b);
      for (const col of [2, 4]) { const s = makeMonster(run, 'shieldman', o); s._cell = { col, row: 0 }; list.push(s); }
      for (const col of [2, 4]) { const a = makeMonster(run, 'archer', o); a._cell = { col, row: 2 }; list.push(a); }
      return done(list);
    }
    const defs = bossDefs(run);
    defs.forEach((dd, i) => { const b = makeBoss(run, dd); b._col = defs.length > 1 ? [2, 4][i] : 3; list.push(b); });
  }
  return done(list);
}

export function battleCfg(run, room) {
  return {
    legacies: new Set(run.legacies), ult: new Set(run.ultimate ? [run.ultimate] : []),
    enrageT: run.asc >= 15 ? 40 : 60, boss: room === 'boss', coins: { v: run.coins },
    summonPumpkin: room === 'elite' && run.floor === 1 ? () => makeMonster(run, 'pumpkin', { add: true, ...(run.units.length <= 1 ? { hpMul: 0.5, atkMul: 0.6 } : {}) }) : null,
    summonAdd: room === 'elite' && run.floor === 3 ? () => makeMonster(run, 'wingBeast', { hpMul: 0.4, atkMul: 0.6, add: true }) : null, // 루가루·루카스 쫄 = 날개 마수
    res: run.meta ? run.meta.res : new Set(), shieldMul: run.meta ? run.meta.shieldMul : 1, shieldTaken: run.meta?.shieldTaken || 0, shieldAtk: run.meta?.shieldAtk || 0, mirrorKill: run.meta?.mirrorKill || 0,
    startShield: run.meta ? (run.meta.allShield || (run.stats.battles === 0 ? run.meta.firstShield : 0)) : 0,
  };
}

// ───────── 상점 (떠돌이 상인 · 아나벨) ─────────
// 가격 순서: 회복 물약 < 1티어 장비 < 1티어 강화 재료 < 2티어 장비 < 2티어 강화 재료 < 3티어 장비
export const SHOP_PRICE = { potion: 20, equip: [0, 40, 90, 160], hone: [0, 60, 120] };
// 층별 상점 장비 티어 확률 [1티어, 2티어, 3티어]
export const SHOP_TIER = { 2: [0.8, 0.2, 0], 3: [0.6, 0.35, 0.05], 4: [0.45, 0.45, 0.1], 5: [0.3, 0.5, 0.2] };
export const SHOP_HONE_TIERS = (f) => f >= 4 ? [1, 2] : [1]; // 아직 2층까지는 1티어 강화 재료만
export function shopEquipTier(run) { const o = SHOP_TIER[Math.min(5, run.floor)] || SHOP_TIER[2]; const r = Math.random(); return r < o[0] ? 1 : r < o[0] + o[1] ? 2 : 3; }
// 아나벨 영입 비용: 클래스 100, NPC는 희귀도별
export function recruitPrice(run, key) { return price(run, UNITS[key].cls ? 100 : ({ 2: 50, 3: 80, 4: 120, 5: 170 }[unitDef(key).rarity] || 80)); }

// ───────── 지도 ─────────
export const MAP_N = 7;
// 지도 규칙
// - 길 위의 일반 칸은 인접 칸이 최대 2개(앞·뒤). 3~4개는 갈림길·교차로 칸에서만 생긴다.
// - 길의 끝(막다른 칸)에는 항상 보스 / 정예 / 상점 / 동료 영입 중 하나가 놓인다.
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export function mapEnds(run) {
  const f = run.floor;
  const ends = f === 1 ? ['boss', 'elite'] : ['boss', 'elite', 'shop']; // 1층에는 상점 없음, 2층부터 상점 1개 (짝수층은 반드시)
  if (f === 1) { ends.push('recruit'); if (Math.random() < 0.5) ends.push('recruit'); } else ends.push('recruit'); // 1층 동료 영입 1~2개
  if (run.asc >= 2) ends.push('elite');
  return ends;
}
export function genMap(run) {
  const f = run.floor, N = MAP_N;
  const ends = mapEnds(run);
  const inner = ['battle', 'battle', 'battle', 'battle', 'battle', 'event']; // 이벤트는 층마다 1개 (2026-10-31 3차: 너무 자주 나와 줄임)
  if (Math.random() < 0.6) inner.push('rift');
  const key = (r, c) => r * N + c;
  const inb = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  // 층별 타일 수: 1층 11개 고정, 2층 최소 14개, 그 외는 구성에 맞춰
  const TILE = { 1: [11, 11], 2: [14, 16], 3: [14, 14] }[f];
  if (TILE) {
    const need = TILE[0] - 1 - ends.length;
    while (inner.length > need) { const i = inner.indexOf('battle'); inner.splice(i >= 0 ? i : inner.length - 1, 1); }
  }
  for (let attempt = 0; attempt < 20000; attempt++) {
    // 시작점은 중앙 5×5 안에서 무작위
    const start = { r: rint(1, N - 2), c: rint(1, N - 2) };
    const target = TILE ? rint(TILE[0], TILE[1]) : 1 + ends.length + inner.length + rint(0, 2);
    const cells = new Map([[key(start.r, start.c), { ...start }]]);
    const deg = new Map([[key(start.r, start.c), 0]]);
    let guard = 0;
    while (cells.size < target && guard++ < 400) {
      const all = [...cells.values()];
      const tips = all.filter(x => deg.get(key(x.r, x.c)) <= 1);
      const mids = all.filter(x => { const d = deg.get(key(x.r, x.c)); return d === 2 || d === 3; });
      const base = (Math.random() < 0.8 || !mids.length) ? pick(tips.length ? tips : all) : pick(mids);
      // 위쪽으로 자라는 쪽을 더 자주 고른다
      const dirs = shuffle(DIRS);
      for (const [dr, dc] of dirs) {
        const r = base.r + dr, c = base.c + dc;
        if (!inb(r, c) || cells.has(key(r, c))) continue;
        // 새 칸은 부모 외의 다른 칸과 닿으면 안 된다 (의도치 않은 연결·고리 방지)
        let touch = false;
        for (const [a, b] of DIRS) { const rr = r + a, cc = c + b; if ((rr !== base.r || cc !== base.c) && cells.has(key(rr, cc))) touch = true; }
        if (touch) continue;
        cells.set(key(r, c), { r, c }); deg.set(key(r, c), 1); deg.set(key(base.r, base.c), deg.get(key(base.r, base.c)) + 1);
        break;
      }
    }
    if (cells.size !== target) continue;
    const leaves = [...cells.values()].filter(x => !(x.r === start.r && x.c === start.c) && deg.get(key(x.r, x.c)) === 1);
    if (leaves.length !== ends.length) continue;
    if (deg.get(key(start.r, start.c)) < 2) continue; // 시작 칸은 막다른 길이 아니게 (끝은 항상 이벤트)
    // 시작점 기준 거리 → 가장 먼 끝 = 보스
    const dist = new Map([[key(start.r, start.c), 0]]); const q = [start];
    while (q.length) { const p = q.shift(); for (const [a, b] of DIRS) { const k = key(p.r + a, p.c + b); if (cells.has(k) && !dist.has(k)) { dist.set(k, dist.get(key(p.r, p.c)) + 1); q.push(cells.get(k)); } } }
    leaves.sort((x, y) => dist.get(key(y.r, y.c)) - dist.get(key(x.r, x.c)));
    if (dist.get(key(leaves[0].r, leaves[0].c)) < 5) continue; // 보스가 너무 가깝지 않게
    // 1층: 시작 지점에서 길 거리 2칸 안에 동료 영입 칸(막다른 길) 1개 반드시
    const nearLeaf = f === 1 ? leaves.slice(1).find(x => dist.get(key(x.r, x.c)) <= 2) : null;
    if (f === 1 && !nearLeaf) continue;
    // 한쪽으로 쏠림 방지: 타일 무게중심이 지도 중앙 근처, 가로·세로로 고르게 퍼질 것
    const all = [...cells.values()], ctr = (N - 1) / 2;
    const mr = all.reduce((a, x) => a + x.r, 0) / all.length, mc = all.reduce((a, x) => a + x.c, 0) / all.length;
    const rs = all.map(x => x.r), cs = all.map(x => x.c);
    if (Math.hypot(mr - ctr, mc - ctr) > 0.6) continue;
    if (Math.max(...rs) - Math.min(...rs) < 4 || Math.max(...cs) - Math.min(...cs) < 4) continue;
    const grid = Array.from({ length: N }, () => Array(N).fill(null));
    const restEnds = shuffle(ends.filter((t, i) => i !== ends.indexOf('boss') && !(nearLeaf && i === ends.indexOf('recruit'))));
    const restInner = shuffle(inner);
    for (const [k, c] of cells) {
      let type;
      const d = deg.get(k);
      if (c.r === start.r && c.c === start.c) type = 'start';
      else if (c === leaves[0]) type = 'boss';
      else if (c === nearLeaf) type = 'recruit';
      else if (d === 1) type = restEnds.pop();
      else type = restInner.pop() || 'battle'; // 남는 칸은 전투
      grid[c.r][c.c] = { type, visited: type === 'start', r: c.r, c: c.c, junction: d >= 3, d: dist.get(k) };
    }
    return { grid, pos: { ...start } };
  }
  throw new Error('지도 생성 실패');
}

export function canMove(map, r, c) {
  if (r < 0 || c < 0 || r >= MAP_N || c >= MAP_N || !map.grid[r][c]) return false;
  return Math.abs(r - map.pos.r) + Math.abs(c - map.pos.c) === 1;
}
// 시야: 현재 위치에서 길을 따라 2칸(심화 6 이상 1칸). 한 번 밝혀진 칸은 계속 보인다.
export function pathDist(map, from) {
  const d = new Map([[from.r * MAP_N + from.c, 0]]); const q = [from];
  while (q.length) {
    const p = q.shift(), k0 = p.r * MAP_N + p.c;
    for (const [a, b] of DIRS) {
      const r = p.r + a, c = p.c + b;
      if (r < 0 || c < 0 || r >= MAP_N || c >= MAP_N || !map.grid[r][c]) continue;
      const k = r * MAP_N + c; if (d.has(k)) continue;
      d.set(k, d.get(k0) + 1); q.push({ r, c });
    }
  }
  return d;
}
export function updateReveal(run) {
  const map = run.map, vis = run.asc >= 6 ? 1 : 2;
  for (const [k, d] of pathDist(map, map.pos)) if (d <= vis) map.grid[Math.floor(k / MAP_N)][k % MAP_N].seen = true;
}
export function isRevealed(run, r, c) {
  const cell = run.map.grid[r][c];
  return !!cell && (cell.seen || cell.visited);
}
// 아직 밝혀지지 않았지만 밝혀진 칸과 이어져 있는 칸 → '?'로 표시
export function isFrontier(run, r, c) {
  const g = run.map.grid, cell = g[r][c];
  if (!cell || isRevealed(run, r, c)) return false;
  return DIRS.some(([a, b]) => g[r + a]?.[c + b] && isRevealed(run, r + a, c + b));
}

// ───────── 보상 ─────────
// 경험치는 파티 전체가 나눠 갖는다: 1인당 = 획득량 ÷ 파티 인원 (인원이 많을수록 각자 레벨이 늦게 오름). 반환값 = 주 캐릭터 레벨 업 횟수
export function expShare(run, v) { return v / Math.max(1, run.units.length); }
export function gainExp(run, v) {
  let mainUps = 0;
  const share = expShare(run, v);
  run.units.forEach((u, i) => {
    let ups = 0;
    if (u.level >= MAX_LEVEL) return;
    const t0 = unitTier(run, u);
    u.exp += share;
    while (u.exp >= EXP_PER_LEVEL && u.level < MAX_LEVEL) { u.exp -= EXP_PER_LEVEL; u.level++; ups++; }
    // 레벨업으로 클래스 기능 단계가 열리면 알림 목록에 추가
    const t1 = unitTier(run, u);
    if (UNITS[u.key].cls && t1 > t0) for (let t = t0 + 1; t <= t1; t++) (run.unlockMsgs = run.unlockMsgs || []).push(`${UNITS[u.key].name} Lv.${u.level} · ${UNITS[u.key].tiers[t - 1].ilvl} 해금 — ${UNITS[u.key].tiers[t - 1].text}`);
    if (i === 0) mainUps = ups;
  });
  return mainUps;
}

export function healPct(run, pctOfMax) { for (const u of run.units) u.hpPct = Math.min(1, u.hpPct + pctOfMax); }
export function healLost(run, frac) { for (const u of run.units) u.hpPct = Math.min(1, u.hpPct + (1 - u.hpPct) * frac); }
export function hurtAll(run, pct) { for (const u of run.units) u.hpPct = Math.max(0.05, u.hpPct - pct); }

export function coinGain(run, base) { const s = computeStats(run, run.unit); return Math.round(base * (1 + s.coin)); }

export function price(run, base) {
  const s = computeStats(run);
  let p = base * (1 - Math.min(0.5, s.discount)) * (1 - (run.meta?.shopDiscount || 0)); // 향로 고유 효과 Ⅲ
  if (run.asc >= 3) p *= 1.15;
  return Math.round(p);
}

// 점수 환산 (옵시디언 '점수환산방식', 2026-10-31): 영웅 성장도 + 장비·장신구·유물 등급 + 보유 재화
export const SCORE = { level: 100, equip: [0, 50, 150, 400], acc: [100, 300, 800], relic: [20, 50, 100, 200, 400, 700, 1000], coin: 1 };
export function score(run) {
  const items = [...run.bag, ...run.units.flatMap(u => Object.values(u.eq || {}))].filter(Boolean);
  const parts = [
    ['영웅 성장도', `레벨 합 ${run.units.reduce((a, u) => a + u.level, 0)} × ${SCORE.level}`, run.units.reduce((a, u) => a + u.level * SCORE.level, 0)],
    ['장비 등급', `${items.filter(i => !i.acc).length}개`, items.filter(i => !i.acc).reduce((a, i) => a + SCORE.equip[i.tier], 0)],
    ['장신구 등급', `${items.filter(i => i.acc).length}개`, items.filter(i => i.acc).reduce((a, i) => a + SCORE.acc[i.grade], 0)],
    ['유물 등급', `이번 런 낙원 유물 ${(run.paraGot || []).length}개`, (run.paraGot || []).reduce((a, r) => a + SCORE.relic[r.grade], 0)],
    ['보유 재화', `${run.coins}`, Math.max(0, run.coins) * SCORE.coin],
  ];
  return { total: parts.reduce((a, p) => a + p[2], 0), parts };
}

// ───────── 장비 ─────────
let itemSeq = 1;
export const BAG_SLOTS = 10;
export function rollTier(run) {
  const k = Object.keys(EQUIP_TIER_ODDS).map(Number).find(f => run.floor <= f) || 9;
  const o = EQUIP_TIER_ODDS[k], r = Math.random();
  return r < o[0] ? 1 : r < o[0] + o[1] ? 2 : 3;
}
export function makeEquip(run, { tier, kind, minTier } = {}) {
  tier = tier || Math.max(minTier || 1, rollTier(run));
  const it = { id: itemSeq++, kind: kind || pick(['weapon', 'weapon', 'mweapon', 'armor', 'armor']), tier };
  if (tier >= 3) it.opt = pick(EQUIP_OPT_KEYS);
  return it;
}
export function equipName(it) { return it.acc ? accName(it) : EQUIP[it.kind].names[it.tier]; }
export function equipText(it) {
  if (it.acc) return accText(it);
  const E = EQUIP[it.kind];
  return `${E.statName} +${E.base[it.tier]}%` + (it.opt ? ` · ${EQUIP_OPTS[it.opt].name}` : '');
}
export function sellPrice(it) { return it.acc ? accSell(it) : EQUIP_SELL[it.tier]; }
// 같은 티어 2개 → 다음 티어. 같은 종류면 그 종류, 섞으면 무작위. 3티어는 최고 티어라 합성 불가
export function canMerge(a, b) { return a && b && a !== b && !a.acc && !b.acc && a.tier === b.tier && a.tier < 3; }
export function mergeEquip(a, b) {
  const kind = a.kind === b.kind ? a.kind : pick([a.kind, b.kind]); // 같은 종류면 같은 종류, 섞으면 둘 중 무작위
  return makeEquip(null, { tier: a.tier + 1, kind });
}
// 연마 도구: 장비 티어 +1 (3티어가 되면 추가 옵션 생성)
// 강화 재료는 티어별: 1티어 재료 = 1티어 장비 → 2티어, 2티어 재료 = 2티어 장비 → 3티어
export function honeEquip(it, ht = it.tier) { if (it.acc || it.tier >= 3 || it.tier !== ht) return false; it.tier++; if (it.tier >= 3 && !it.opt) it.opt = pick(EQUIP_OPT_KEYS); return true; }
// 가방에 넣기. 가득 차면 판매가만큼 주화로 바꾼다
// 가방 칸: 장비 1개 = 1칸, 소모품(회복 물약·연마 도구)은 3개씩 한 칸에 쌓인다
export const STACK = 3;
export function bagUsed(run, extra = {}) { return run.bag.length + ['potions', 'hones', 'hones2'].reduce((a, k) => a + Math.ceil(((run[k] || 0) + (extra[k] || 0)) / STACK), 0); }
export function bagFree(run, extra) { return bagUsed(run, extra) <= BAG_SLOTS; }
export function addToBag(run, it) {
  if (bagUsed(run) + 1 > BAG_SLOTS) { run.coins += sellPrice(it); return false; }
  run.bag.push(it); return true;
}
export function addConsumable(run, k, n = 1) { // k: 'potions' | 'hones' | 'hones2'
  run[k] = run[k] || 0;
  let got = 0; for (let i = 0; i < n; i++) { if (!bagFree(run, { [k]: 1 })) break; run[k]++; got++; }
  return got;
}
export function slotOf(it) { return SLOT_OF[it.kind]; }
