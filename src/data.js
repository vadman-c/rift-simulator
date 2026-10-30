// 차원의 균열 시뮬레이터 — 데이터 테이블
// 수치는 전부 초안이며, 기획 검증용으로 자유롭게 바꿔도 된다.

export const IMG = {
  dhFull: 'img/T_ClsFull_DevilHunter.png',
  dhCard: 'img/T_Cls_DevilHunter.png',
  srCard: 'img/T_Cls_Sorceress.png',
  shanaCard: 'img/T_Npc_Shana.png',
  bkCard: 'img/T_Cls_Breaker.png',
  hidakaCard: 'img/T_Npc_Hidaka.png',
  selectBg: 'img/T_ClassSelectBG.png',
};

// 데빌헌터 (현재 시뮬레이터의 유일한 유닛)
// 아이템 레벨 해금: 1700 권총(잔혹한 추적자) + 퀵 샷 / 1730 트라이포드 / 1750 건 스탠스(샷건 연사·라이플) / 1770 각성기
export const DH = {
  name: '데빌헌터',
  base: { hp: 1800, atk: 125, crit: 0.15, critDmg: 2.0, speed: 3.4 }, // 원거리 딜러 · 희귀도 4 기준 (밸런싱 표 참고)
  // 권총: 잔혹한 추적자 기본 2구간(01 → 02)을 한 번의 기본 공격으로 끝까지 재생. 구간별 1발씩.
  pistol: { range: 6.5, segs: [ { clip: 'sk_brutalchaser_01', dur: 1.0, hits: [[0.27, 1.0]] }, { clip: 'sk_brutalchaser_02', dur: 1.233, hits: [[0.33, 1.15]] } ], mana: 12 },
  // 샷건 연사: 반동 피크(루트 이동 속도)로 추정한 4발 타이밍. 마지막 발이 가장 강하다.
  shotgun: { range: 2.6, clip: 'sk_tripleshot', dur: 3.2, hits: [[0.45, 0.9], [1.02, 0.9], [1.75, 0.9], [2.5, 1.7]], cone: 1.8, mana: 8 },
  // 라이플: 원샷원킬 custom_6_01. 반동 피크 0.42초에 1발.
  rifle: { range: 10, clip: 'sk_oneshotonekill_custom_6_01', dur: 1.1, hits: [[0.42, 2.0]], mana: 14 },
  // 스탠스 전환: 기본 공격 사용 횟수로 순환 (옵시디언 '로스트아크 클래스 스킬' 노트 기준). 데빌헌터는 마나 없음.
  cycle: { pistol: { next: 'shotgun', count: 5 }, shotgun: { next: 'rifle', count: 3 }, rifle: { next: 'pistol', count: 2 } },
  // 스탠스별 대기·이동 모션 (기본세트의 identity 클립)
  idle: { pistol: 'idle_battle_1', shotgun: 'idle_identity2', rifle: 'idle_identity3' },
  run:  { pistol: 'run_battle_1', shotgun: 'run_identity2', rifle: 'run_identity3' },
  skill: { name: '퀵 샷', clip: 'sk_quickshot', dur: 1.0, hitAt: 0.35, mult: 3.4 },
  awake: { name: '각성기 · 버스트', clip: 'sk_quickshot', dur: 1.6, hitAt: 0.7, mult: 7, radius: 4 },
};
export const DH_TIERS = [
  { ilvl: 1700, text: '핸드건 · 잔혹한 추적자 (핸드건 고정)' },
  { ilvl: 1730, text: '트라이포드 (레벨 3/5/7에서 각성기 강화)' },
  { ilvl: 1750, text: '아이덴티티 · 건 스탠스 순환 (핸드건 5 → 샷건 3 → 라이플 2)' },
  { ilvl: 1770, text: '각성기' },
];
export const TIERS = DH_TIERS; // 하위 호환
export function tierOf(ilvl) {
  let t = 0; for (let i = 0; i < DH_TIERS.length; i++) if (ilvl >= DH_TIERS[i].ilvl) t = i + 1; return t; // 0~4
}

// ───────── 소서리스 (선택 가능 클래스) ─────────
// 옵시디언 '로스트아크 클래스' 노트: 마나 50, 기본 공격(에너지 방출) 1회당 마나 5, 스킬 = 종말의 날.
// 기본 공격 판정은 초당 1회(노트 규칙). 모션은 원본 속도로 끝까지 재생하고, 그 사이에 1초 간격으로 판정이 들어간다.
// 체력·공격력·사거리·종말의 날 계수는 노트에 없어 임시값.
export const SR = {
  name: '소서리스', dmgType: 'mag', // 마법 공격력 사용 (atk = 마법 공격력)
  base: { hp: 1800, atk: 125, crit: 0.15, critDmg: 2.0, speed: 3.0 }, // 원거리 딜러 · 희귀도 4 기준
  mana: 50, manaPerHit: 5, rangeCells: 4,                               // 사거리 임시
  basic: { segs: [ { clip: 'sk_unleashedenergy_01', dur: 1.7, hits: [[0.6, 1], [1.6, 1]] }, { clip: 'sk_unleashedenergy_02', dur: 1.933, hits: [[0.8, 1], [1.8, 1]] } ] },
  skill: { name: '종말의 날', segs: [ { clip: 'sk_meteor_01', dur: 2.133 }, { clip: 'sk_meteor_02', dur: 1.1 } ], impact: 2.43, mult: 6.5, radiusCells: 1.5, // 3×3칸, 계수 임시
    perLevel1730: 0.05, // 1730: 균열 레벨당 종말의 날 피해 +5%
    shards: { at: 0.3, distCells: 2.0, radiusCells: 0.75, mult: 1.5, clock: [1, 5, 7, 11] } }, // 1750: 운석 파편 4개 (1·5·7·11시, 1.5×1.5칸)
  idle: 'idle_battle_1', run: 'run_battle_1',
};
export const SR_TIERS = [
  { ilvl: 1700, text: '에너지 방출 + 종말의 날' },
  { ilvl: 1730, text: '종말의 날 피해 +5% × 균열 레벨' },
  { ilvl: 1750, text: '종말의 날 후 운석 파편 4개 (1·5·7·11시 방향, 1.5×1.5칸 150%)' },
  { ilvl: 1770, text: '각성기 (미정)' },
];

// ───────── 동료 NPC: 샤나 (옵시디언 '동료 NPC 종류' 노트) ─────────
// 희귀도 3 암살자: 체력 1700, 공격력 102, 마법 공격력 100, 마나 50, 기본 공격 사거리 1칸 (밸런싱 표 = 암살자 템플릿 2000/120 × 0.85)
// 기본 공격 = 영상 51~54초 모션(att_battle_4: 도약·내려찍기 → 자세 유지 → 돌진 → 복귀), 판정은 초당 1회
// 스킬 = 영상 43~46초 모션(att_battle_1). 1초간 지정 불가 섬광 → 적 4명에게 공격력 550% → 가장 멀리 있는 적 뒤로 순간이동
export const SHANA = {
  name: '샤나', npc: true, rarity: 3, dmgType: 'mag',
  base: { hp: 1700, atk: 102, matk: 100, crit: 0.15, critDmg: 2.0, speed: 3.6 }, // 암살자 · 희귀도 3 (밸런싱 표)
  mana: 50, manaPerHit: 5, rangeCells: 1,
  basic: { segs: [
    { clip: 'att_battle_4_01', dur: 1.8, hits: [[0.45, 1], [1.45, 1]] },
    { clip: 'att_battle_4_02', dur: 0.5, hits: [] },
    { clip: 'att_battle_4_04', dur: 0.5, hits: [[0.25, 1]] },
    { clip: 'att_battle_4_03', dur: 1.0, hits: [[0.65, 1]] } ] },
  skill: { name: '섬광', segs: [ { clip: 'att_battle_1_01', dur: 1.0 }, { clip: 'att_battle_1_02', dur: 0.9 }, { clip: 'att_battle_1_03', dur: 1.2 } ],
    flashAt: 1.0, flashDur: 1.0, hitAt: 1.45, targets: 4, mult: 5.5, teleportAt: 1.9, castRangeCells: 4 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};

// ───────── 브레이커 (선택 가능 클래스) ─────────
// 옵시디언 '로스트아크 클래스': 마나 50, 스킬 = 수라결 6초 시전. 근접 딜러(희귀도 4 기준)
// 기본 공격 = att_battle_1_01(1.1초, 1타) / 스킬 = 수라결(시작 → 연타 8회 → 마무리, 약 6.2초)
// 1750 아이덴티티 = 징벌의 파도: 기본 공격 적중·수라결 사용으로 게이지 충전 → 100%면 다음 행동이 징벌의 파도(전방 직선 5타)
export const BK = {
  name: '브레이커',
  base: { hp: 2600, atk: 100, crit: 0.15, critDmg: 2.0, speed: 3.6 }, // 근접 딜러 · 희귀도 4 기준
  mana: 30, manaPerHit: 5, rangeCells: 1, // 마나 = 징벌의 파도(1730), 수라결은 별도 수라결 게이지(100)
  basic: { segs: [ { clip: 'att_battle_1_01', dur: 1.1, hits: [[0.45, 1]] } ] },
  skill: { name: '수라결', extraLoops1750: 4, start: { clip: 'att_battle_2_04_start', dur: 0.567 }, loop: { clip: 'att_battle_2_04_loop', dur: 0.533 }, loops: 8,
    end: { clip: 'att_battle_2_04_end', dur: 1.333 }, tickEvery: 0.267, tickMult: 0.55, radiusCells: 1.4, endAt: 0.45, endMult: 3.5, endRadiusCells: 1.8 },
  wave: { name: '징벌의 파도', segs: [
      { clip: 'sk_waveofpunishment_01', dur: 0.967 }, { clip: 'sk_waveofpunishment_02', dur: 0.267 }, { clip: 'sk_waveofpunishment_03', dur: 0.2 },
      { clip: 'sk_waveofpunishment_04', dur: 0.233 }, { clip: 'sk_waveofpunishment_05', dur: 1.2 } ],
    hits: [[0.6, 0.6], [1.05, 0.6], [1.3, 0.6], [1.5, 0.6], [2.0, 1.5]], lengthCells: 2.5, width: 1.3 },
  identity: { name: '수라결 게이지', gaugePerHit: 10, onSkill: 30 }, // 기본 공격 적중 +10, 징벌의 파도 사용 +30, 100이면 수라결 (수라결 모션 종료 시 전부 소모)
  idle: 'idle_battle_1', run: 'run_battle_1',
};
export const BK_TIERS = [
  { ilvl: 1700, text: '기본 공격 + 수라결 (수라결 게이지 100: 기본 공격 +10 · 징벌의 파도 +30)' },
  { ilvl: 1730, text: '징벌의 파도 (마나 30 가득 차면 전방 5타)' },
  { ilvl: 1750, text: '수라결 지속 시간 +2초' },
  { ilvl: 1770, text: '각성기 (미정)' },
];

// ───────── 바드 (선택 가능 클래스 · 서포터 · 마법 공격력) ─────────
// 기본 공격 = 사운드 쇼크(피해), 스킬 = 수호의 연주(파티 전체 보호막)
// 1730: 스킬 사용 시마다 체력이 가장 낮은 아군 위치에 절실한 구원 장판 (4초간 장판 안 아군 회복)
// 1770: 절실한 구원 3회째마다 용맹의 세레나데 (아군 전체 공격력 증가). 수치는 임시값
export const BARD = {
  name: '바드', dmgType: 'mag',
  base: { hp: 1900, atk: 100, crit: 0.1, critDmg: 1.8, speed: 3.1 }, // 서포터 · 희귀도 4 기준
  mana: 40, manaPerHit: 8, rangeCells: 4,
  basic: { name: '사운드 쇼크', segs: [ { clip: 'sk_soundshock', dur: 1.46, hits: [[0.5, 1.3]] } ] },
  skill: { name: '수호의 연주', segs: [ { clip: 'sk_protectionperform', dur: 1.67 } ], shieldAt: 0.8, shieldMult: 3.0, shieldDur: 6 },
  rescue: { name: '절실한 구원', clip: 'sk_rescueserenade', dur: 1.04, castAt: 0.45, radiusCells: 1.3, zoneDur: 4, tick: 0.5, healMult: 0.3 },
  valiant: { name: '용맹의 세레나데', clip: 'sk_valiantserenade', dur: 1.67, castAt: 0.8, every: 3, buff: 0.2, buffDur: 6 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};
export const BD_TIERS = [
  { ilvl: 1700, text: '사운드 쇼크 + 수호의 연주 (아군 전체 보호막)' },
  { ilvl: 1730, text: '절실한 구원 — 스킬 사용 시마다 체력이 가장 낮은 아군 위치에 4초 회복 장판' },
  { ilvl: 1750, text: '용맹의 세레나데 — 절실한 구원 3회째마다 아군 전체 공격력 +20% (6초)' },
  { ilvl: 1770, text: '(미정)' },
];

// ───────── 동료 NPC: 페데리코 (옵시디언 '동료 NPC 종류': 희귀도 4 · 체력 1800 · 공격력 125 · 마나 60 · 사거리 4) ─────────
// 기본 공격: att_battle_1_01 모션 그대로. 스킬 '천둥 포격'(예시 영상: 하늘에서 금빛 번개 창이 대각선으로 연달아 내리꽂히고 마지막에 큰 폭발 · 보호막 파괴)
export const FEDERICO = {
  name: '페데리코', npc: true, rarity: 4,
  base: { hp: 1800, atk: 125, crit: 0.12, critDmg: 1.8, speed: 3.2 },
  mana: 60, manaPerHit: 5, rangeCells: 4,
  basic: { segs: [ { clip: 'att_battle_1_01', dur: 2.0, hits: [[0.8, 1.0], [1.6, 1.0]] } ] },
  // 신성한 광선: 공중에 떠올라 자기 칸 기준 폭 5칸(좌우 2칸 + 자기 칸)으로 전방 끝까지 3초간 광선. 0.25초마다 35% (총 12회)
  skill: { name: '신성한 광선', segs: [ { clip: 'att_battle_8_01', dur: 1.0 }, { clip: 'att_battle_8_02', dur: 3.3 } ],
    floatDur: 4.3, beamFrom: 0.95, beamDur: 3.0, tick: 0.25, tickMult: 0.35, widthCells: 5 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};

// ───────── 동료 NPC: 라하르트 (희귀도 4 · 탱커) ─────────
// 스킬: 아군이 가장 많이 들어오는 곳으로 이동해 창을 찍고 5초간 기를 모은다(7×7). 그동안 범위 안 아군이 받는 피해를 대신 받고, 받는 피해 -80%.
// 5초 뒤 범위 안 적에게 그동안 대신 받은 피해의 50%
export const LAHART = {
  name: '라하르트', npc: true, rarity: 4, tank: true,
  base: { hp: 3600, atk: 70, crit: 0.05, critDmg: 1.5, speed: 3.4 },
  mana: 40, manaPerHit: 5, rangeCells: 1,
  basic: { segs: [ { clip: 'att_battle_1_01', dur: 1.0, hits: [[0.45, 1]] } ] },
  skill: { name: '수호의 창', segs: [ { clip: 'att_battle_12_01', dur: 1.167 }, { clip: 'att_battle_12_02', dur: 2.5 }, { clip: 'att_battle_12_02', dur: 2.5 }, { clip: 'att_battle_6_03_end', dur: 1.292 } ],
    plantAt: 0.6, guardDur: 5, areaCells: 7, reduce: 0.8, returnRate: 0.5, releaseAt: 6.6 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};
// ───────── 동료 NPC: 아제나 · 이난나 (희귀도 5 · 에스더) — 스킬을 쓸 때마다 형태가 바뀐다 ─────────
export const AZENA = {
  name: '아제나', npc: true, rarity: 5, esther: true, form: 'azena',
  base: { hp: 2160, atk: 150, crit: 0.15, critDmg: 2.0, speed: 3.3 },
  mana: 40, manaPerHit: 5, rangeCells: 4,
  basic: { segs: [ { clip: 'att_battle_2_01', dur: 1.04, hits: [[0.55, 1]] } ] },
  skill: { name: '고대의 창', segs: [ { clip: 'sk_lanceofancient', dur: 4.0 } ], spears: 3, firstAt: 1.6, every: 0.45, radiusCells: 1.5, mult: 2.5, transformAt: 3.6 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};
export const INANNA = {
  name: '이난나', npc: true, rarity: 5, esther: true, form: 'inanna',
  base: AZENA.base, mana: 40, manaPerHit: 5, rangeCells: 4,
  basic: { segs: [ { clip: 'att_battle_1_01', dur: 1.17, hits: [[0.6, 1.1]] } ] },
  skill: { name: '세계수의 축복', segs: [ { clip: 'sk_esthereffect_2', dur: 4.0 } ], treeAt: 1.2, treeDur: 5, tick: 0.5, healPerSec: 0.8, transformAt: 3.8 },
  idle: 'idle_normal_1', run: 'run_battle_1',
};

// ───────── 동료 NPC: 뮨 히다카 (옵시디언 '동료 NPC 종류' 노트) ─────────
// 희귀도 3 근접 딜러: 체력 2210, 공격력 85, 마나 30, 사거리 1칸 (밸런싱 표 = 근접 템플릿 2600/100 × 0.85)
// 스킬: 도끼를 4초 동안 빙글빙글 돌리며 주위에 피해 (att_battle_7_01 → 7_02 반복 → 7_03)
export const HIDAKA = {
  name: '뮨 히다카', npc: true, rarity: 3,
  base: { hp: 2210, atk: 85, matk: 100, crit: 0.15, critDmg: 2.0, speed: 3.2 }, // 근접 딜러 · 희귀도 3 (밸런싱 표)
  mana: 30, manaPerHit: 5, rangeCells: 1,
  basic: { segs: [ { clip: 'att_battle_3_01', dur: 1.067, hits: [[0.5, 1]] } ] },
  skill: { name: '도끼 회전', segs: [ { clip: 'att_battle_7_01', dur: 1.467 }, ...Array(5).fill({ clip: 'att_battle_7_02', dur: 0.533 }), { clip: 'att_battle_7_03', dur: 2.0 } ],
    spinFrom: 0.9, spinDur: 4.0, tickEvery: 0.5, tickMult: 1.1, radiusCells: 1.4 },  // 4초간 0.5초마다 주변 110%
  idle: 'idle_battle_1', run: 'run_battle_1',
};

// ───────── 동료 NPC: 실리안 (옵시디언 '동료 NPC 종류') ─────────
// 희귀도 5 근접 딜러: 체력 3120, 공격력 120, 마나 20, 사거리 1칸
// 스킬: 8초 동안 기본 공격이 전방 3x2 베기(공격력 160%)로 바뀐다. 스킬 지속 중 마나 획득 없음
// 모션: 기본 att_battle_1_01 / 스킬 시전 att_battle_4_02 / 강화 베기 att_battle_2_01(2연타)
export const SILIAN = {
  name: '실리안', npc: true, rarity: 5,
  base: { hp: 3120, atk: 120, matk: 100, crit: 0.15, critDmg: 2.0, speed: 3.6 },
  mana: 20, manaPerHit: 5, rangeCells: 1,
  basic: { segs: [ { clip: 'att_battle_1_01', dur: 1.533, hits: [[0.6, 1]] } ] },
  skill: { name: '검의 해방', segs: [ { clip: 'att_battle_4_02', dur: 1.333 } ], buffAt: 0.5, buffDur: 8 },
  buff: { segs: [ { clip: 'att_battle_2_01', dur: 2.067, hits: [[0.6, 1.6], [1.3, 1.6]] } ], widthCells: 3, depthCells: 2 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};

// ───────── 동료 NPC: 네리아 (루테란 성) · 힐러 ─────────
// 희귀도 3 힐러: 체력 1450, 마법 공격력 85, 마나 50, 사거리 4칸 (밸런싱 표 = 힐러 템플릿 1700 × 0.85)
// 기본 공격: 아군 중 체력 비율이 가장 낮은 1명을 마법 공격력 130%만큼 회복 / 스킬: 아군 전체를 마법 공격력 250%만큼 회복
// 전투 모션이 없어 sc_affirmation_loop_1(기본) / sc_cheer_loop_1(스킬)로 대체
export const NERIA = {
  name: '네리아', npc: true, rarity: 3, dmgType: 'mag', healer: true,
  base: { hp: 1450, atk: 85, crit: 0, critDmg: 1.5, speed: 3.0 },
  mana: 50, manaPerHit: 5, rangeCells: 4,
  basic: { segs: [ { clip: 'sc_affirmation_loop_1', dur: 2.667, hits: [[0.6, 1.6], [1.9, 1.6]] } ] }, // 레온하트 네리아 모델 (모션 2.667초 · 회복 2회)
  skill: { name: '치유의 연주', segs: [ { clip: 'sc_cheer_loop_1', dur: 2.667 } ], healAt: 1.2, mult: 2.5 },
  idle: 'idle_normal_1', run: 'run_battle_1',
};

// ───────── 동료 NPC: 사제 아만 (희귀도 4 · 힐러/버퍼) ─────────
// 힐러 템플릿(체력 1700 · 마법 공격력 100) × 희귀도 4 배율 1.0. 마나 60, 기본 공격 사거리 3칸
// 기본: 성스러운 빛 (마법 110%) / 스킬: 수호의 기도 — 아만 주변(사거리 3칸 안)에서 아군이 가장 많이 모인 3×3칸 아군에게 보호막 (마법 공격력 400%, 6초)
export const AMAN = {
  name: '아만', npc: true, rarity: 4, dmgType: 'mag', buffer: true,
  base: { hp: 1700, atk: 100, crit: 0.08, critDmg: 1.6, speed: 3.1 },
  mana: 60, manaPerHit: 6, rangeCells: 3,
  basic: { name: '성스러운 빛', segs: [ { clip: 'att_battle_1_01', dur: 1.33, hits: [[0.55, 1.1]] } ] },
  skill: { name: '수호의 기도', segs: [ { clip: 'att_battle_3_01', dur: 2.17 } ], shieldAt: 1.1, shieldMult: 4.0, shieldDur: 6, areaCells: 3, searchCells: 3 },
  idle: 'idle_battle_1', run: 'run_battle_1',
};

// ───────── 인게임 장비 (옵시디언 '장비 시스템') ─────────
// 무기·방어구 2칸. 티어 1~3, 3티어부터 추가 옵션 1줄. 같은 티어 2개 합성 → 다음 티어 (같은 종류면 같은 종류, 섞으면 무작위)
export const EQUIP = {
  weapon: { slot: '무기', stat: 'atk', statName: '공격력', base: [0, 5, 9, 13], names: ['', '사냥꾼의 장검', '핏빛 대검', '검은 산의 발톱'] },
  armor:  { slot: '방어구', stat: 'hp', statName: '최대 체력', base: [0, 6, 11, 16], names: ['', '은빛 흉갑', '흑철 중갑', '고대 갑주'] },
  mweapon: { slot: '무기', stat: 'matk', statName: '마법 공격력', base: [0, 5, 9, 13], names: ['', '가시덩굴 마법봉', '붉은 혈석 지팡이', '심연의 마도 지팡이'] }, // 마법 공격 유닛 전용
};
export const SLOT_OF = { weapon: 'eq', mweapon: 'eq', armor: 'eq' }; // 2026-10-31 3차: 장비는 종류와 관계없이 유닛당 3칸 (e0~e2)
export const EQ_SLOTS = ['e0', 'e1', 'e2'];
export const EQUIP_IMG = (kind, tier) => `img/eq/eq_${kind}${tier}.png`;
export const EQUIP_SELL = [0, 20, 45, 80]; // 판매가 = 상점 구매가(40·90·160)의 50%
export const EQUIP_TIER_ODDS = { 1: [0.85, 0.13, 0.02], 3: [0.6, 0.32, 0.08], 6: [0.4, 0.42, 0.18], 9: [0.25, 0.45, 0.30] }; // 층 상한별 1/2/3티어 확률 (티어가 높을수록 낮게)
export const EQUIP_OPTS = {
  mana:    { name: '기본 공격 시 마나 +2', v: 2 },
  atk:     { name: '추가 공격력 +10%', v: 0.10 },
  reduce:  { name: '받는 피해 -8%', v: 0.08 },
  hp:      { name: '최대 체력 +12%', v: 12 },
  range:   { name: '공격 사정거리 +1칸', v: 1 },
  crit:    { name: '치명타 확률 +10%', v: 0.10 },
  critDmg: { name: '치명타 피해량 +30%', v: 0.30 },
  shield:  { name: '스킬 사용 시 보호막 (최대 체력 12%, 4초)', v: 0.12 },
};
export const EQUIP_OPT_KEYS = Object.keys(EQUIP_OPTS);

// 유닛 정의 묶음. 클래스는 원정대 아이템 레벨이 1700 이상일 때 선택·동료 후보가 된다.
export const UNITS = {
  DevilHunter: { kind: 'dh', name: '데빌헌터', cls: true, img: 'img/T_Cls_DevilHunter.png', full: 'img/T_ClsFull_DevilHunter.png', dmg: '물리', role: '원거리 딜러 · 건 스탠스', tiers: DH_TIERS },
  Sorceress:   { kind: 'sr', name: '소서리스', cls: true, img: 'img/T_Cls_Sorceress.png', full: 'img/T_Cls_Sorceress.png', dmg: '마법', role: '원거리 딜러', tiers: SR_TIERS },
  Bard:        { kind: 'bd', name: '바드', cls: true, img: 'img/T_Cls_Bard.png', full: 'img/T_ClsFull_Bard.png', dmg: '마법', role: '서포터', tiers: BD_TIERS },
  Breaker:     { kind: 'bk', name: '브레이커', cls: true, img: 'img/T_Cls_Breaker.png', full: 'img/T_ClsFull_Breaker.png', dmg: '물리', role: '근접 딜러 · 수라결', tiers: BK_TIERS },
  Shana:       { kind: 'shana', name: '샤나', npc: true, img: 'img/T_Npc_Shana.png', dmg: '마법', role: '암살자' },
  Hidaka:      { kind: 'hidaka', name: '뮨 히다카', npc: true, img: 'img/T_Npc_Hidaka.png', dmg: '물리', role: '근접 딜러' },
  Silian:      { kind: 'silian', name: '실리안', npc: true, esther: true, img: 'img/T_Npc_Silian.png', dmg: '물리', role: '근접 딜러' },
  Lahart:      { kind: 'lahart', name: '라하르트', npc: true, img: 'img/T_Npc_Lahart.png', dmg: '물리', role: '탱커' },
  Azena:       { kind: 'azena', name: '아제나·이난나', npc: true, esther: true, img: 'img/T_Npc_AzenaInanna.png', dmg: '마법', role: '원거리 딜러·힐러' },
  Federico:    { kind: 'federico', name: '페데리코', npc: true, img: 'img/T_Npc_Federico.png', dmg: '물리', role: '원거리 딜러' },
  Aman:        { kind: 'aman', name: '아만', npc: true, img: 'img/T_Npc_Aman.png', dmg: '마법', role: '힐러/버퍼' },
  Neria:       { kind: 'neria', name: '네리아', npc: true, img: 'img/T_Npc_Neria.png', dmg: '마법', role: '힐러' },
};
export const CLASS_KEYS = ['DevilHunter', 'Sorceress', 'Breaker', 'Bard'];
export const NPC_KEYS = ['Shana', 'Hidaka', 'Silian', 'Neria', 'Federico', 'Lahart', 'Azena', 'Aman'];
export const ESTHER_KEYS = ['Silian', 'Azena']; // 에스더 동료 (에스더 무기 보유 시 첫 동료 후보에 반드시 1명)
// 동료 영입 후보 등장 확률 (희귀도별, 영입 방마다 NPC 하나씩 판정). 낙원 유물 단계와 무관
export const NPC_APPEAR = { 2: 0.9, 3: 0.75, 4: 0.4, 5: 0.12 };
// 클래스 기능 해금: 원정대 아이템 레벨 단계와 균열 레벨 단계 중 높은 쪽. 균열 레벨 기준 = 1700 / 1730 / 1750 / 1770
export const LEVEL_TIER = [1, 5, 10, 15];
export function tierFor(key, ilvl) {
  const T = UNITS[key].tiers; if (!T) return 4;
  let t = 0; for (let i = 0; i < T.length; i++) if (ilvl >= T[i].ilvl) t = i + 1; return t;
}

// 권능의 제단 7종. per: 레벨당 효과
export const ALTARS = {
  crit:   { name: '치명', color: '#f2c14e', desc: '레벨당 치명타 적중 +1%, 치명타 피해 +2%' },
  spec:   { name: '특화', color: '#c77dff', desc: '레벨당 스킬·각성기 피해 +2.5%' },
  swift:  { name: '신속', color: '#5ce1e6', desc: '레벨당 공격 속도 +1.5%, 이동 속도 +1%' },
  guard:  { name: '수호', color: '#7ee08a', desc: '레벨당 최대 체력 +2.5%' },
  mana:   { name: '마력', color: '#6fb3ff', desc: '레벨당 마나 획득 +3%' },
  greed:  { name: '탐욕', color: '#ffd166', desc: '레벨당 균열 주화 획득 +4%, 상점 할인 1.5%' },
  chaos:  { name: '혼돈', color: '#ff5d73', desc: '레벨당 피해 +2.5%, 받는 피해 +1%' },
};
export const ALTAR_KEYS = Object.keys(ALTARS);
export const ALTAR_CAP = 15, ALTAR_CAP_GRAIL = 25;

// 균열 각인. 등급은 제단 레벨을 따른다. v: 희귀 등급 기준 효과량
export const GRADES = ['일반', '희귀', '영웅', '전설', '유물'];
export const GRADE_COLORS = ['#c9c9c9', '#5aa0ff', '#b46cff', '#ffae3b', '#ff6a3d'];
export const GRADE_MUL = [0.6, 1, 1.5, 2.2, 3];
export const ENGRAVINGS = [
  { id: 'eg_atk',    altar: null,    name: '공격 강화',     stat: 'dmg',      v: 6,  fmt: '피해 +{v}%' },
  { id: 'eg_hp',     altar: null,    name: '체력 강화',     stat: 'hp',       v: 8,  fmt: '최대 체력 +{v}%' },
  { id: 'eg_blunt',  altar: 'crit',  name: '예리한 둔기',   stat: 'critDmg',  v: 18, fmt: '치명타 피해 +{v}%' },
  { id: 'eg_adren',  altar: 'crit',  name: '아드레날린',    stat: 'critRate', v: 6,  fmt: '치명타 적중 +{v}%' },
  { id: 'eg_dagger', altar: 'crit',  name: '정밀 단도',     stat: 'critRate', v: 8,  fmt: '치명타 적중 +{v}%' },
  { id: 'eg_awake',  altar: 'spec',  name: '각성',          stat: 'awakeDmg', v: 25, fmt: '각성기 피해 +{v}%' },
  { id: 'eg_stance', altar: 'spec',  name: '피스톨 마스터', stat: 'pistolDmg', v: 12, fmt: '권총 스탠스 피해 +{v}%' },
  { id: 'eg_shotgun', altar: 'crit', name: '샷건 마스터',   stat: 'shotgunDmg', v: 12, fmt: '샷건 스탠스 피해 +{v}%' },
  { id: 'eg_rifle',  altar: 'crit',  name: '라이플 마스터', stat: 'rifleDmg', v: 12, fmt: '라이플 스탠스 피해 +{v}%' },
  { id: 'eg_charge', altar: 'spec',  name: '슈퍼 차지',     stat: 'skillDmg', v: 12, fmt: '스킬 피해 +{v}%' },
  { id: 'eg_vanguard', altar: 'swift', name: '돌격대장',    stat: 'moveDmg',  v: 8,  fmt: '이동 속도·피해 +{v}%' },
  { id: 'eg_absorb', altar: 'swift', name: '정기 흡수',     stat: 'atkSpd',   v: 8,  fmt: '공격 속도 +{v}%' },
  { id: 'eg_armor',  altar: 'guard', name: '중갑 착용',     stat: 'reduce',   v: 6,  fmt: '받는 피해 -{v}%' },
  { id: 'eg_indom',  altar: 'guard', name: '불굴',          stat: 'hp',       v: 12, fmt: '최대 체력 +{v}%' },
  { id: 'eg_barri',  altar: 'guard', name: '바리케이드',    stat: 'shieldStart', v: 8, fmt: '전투 시작 보호막 {v}%' },
  { id: 'eg_flow',   altar: 'mana',  name: '마나의 흐름',   stat: 'manaGain', v: 15, fmt: '마나 획득 +{v}%' },
  { id: 'eg_effi',   altar: 'mana',  name: '마나 효율 증가', stat: 'skillDmg', v: 10, fmt: '스킬 피해 +{v}%' },
  { id: 'eg_gold',   altar: 'greed', name: '황금 손',       stat: 'coin',     v: 12, fmt: '균열 주화 +{v}%' },
  { id: 'eg_grudge', altar: 'chaos', name: '원한',          stat: 'bossDmg',  v: 15, fmt: '보스 피해 +{v}%, 받는 피해 +5%' },
  { id: 'eg_doll',   altar: 'chaos', name: '저주받은 인형', stat: 'dmg',      v: 10, fmt: '피해 +{v}%, 받는 회복 -20%' },
];
// 궁극 각인 (제단 Lv20, 팀에 1개)
export const ULTIMATES = {
  crit:  { name: '급소 해부',      desc: '치명타 시 공격력 30% 추가 타격' },
  spec:  { name: '각성의 연쇄',    desc: '각성기를 전투당 2회 사용' },
  swift: { name: '찰나',           desc: '스킬 시전 직후 3초간 공격 속도 2배' },
  guard: { name: '금강불괴',       desc: '클리어한 층마다 최대 체력·피해 +4%' },
  mana:  { name: '공명 시전',      desc: '스킬이 한 번 더 시전된다 (60% 위력)' },
  greed: { name: '세상을 먹는 자', desc: '보유 주화 50개당 피해 +1% (최대 +30%)' },
  chaos: { name: '광기',           desc: '체력이 낮을수록 피해 증가 (최대 +60%)' },
};

// 에스더의 유산
export const LEGACIES = {
  kadan:    { name: '카단',     desc: '일반 공격이 2회 타격' },
  bahuntur: { name: '바훈투르', desc: '전투당 1회, 처음 쓰러진 유닛 부활 (체력 50%)' },
  shandi:   { name: '샨디',     desc: '스킬 사용 후 35% 확률로 마나 즉시 충전' },
  silian:   { name: '실리안',   desc: '30초마다 적 전체에 광역 강타' },
  ninav:    { name: '니나브',   desc: '피격 시 보호막, 보호막 유지 중 피해 +15%' },
  wei:      { name: '웨이',     desc: '보스에게 주는 피해 +30%' },
  azena:    { name: '아제나',   desc: '6초마다 적 하나에 낙인, 낙인 대상 받는 피해 +40%' },
};

// 몬스터. model: GLB 이름, h: 목표 키(m), tint: 색 보정
export const MONSTERS = {
  beast1: { name: '검은 산 마수',     model: 'Beast_01', h: 1.9, hp: 650, atk: 28, int: 1.1, range: 'melee', speed: 3.0, skill: 'nuke' },
  beast2: { name: '검은 산 포식자',   model: 'Beast_02', h: 2.1, hp: 850, atk: 31, int: 1.4, range: 'melee', speed: 2.4, skill: 'aoe' },
  beast3: { name: '검은 산 거수',     model: 'Beast_03', h: 2.4, hp: 1450, atk: 43, int: 1.8, range: 'melee', speed: 2.0, skill: 'aoe' }, // 사용 안 함 (타나토스 모델)
  // 공성전 병력: 시작 지점에서 먼 전투일수록 많이 등장
  archer:    { name: '공성전 궁수',     model: 'Archer', h: 1.9, hp: 950, atk: 36, int: 1.4, range: 'ranged', rangeM: 5.5, speed: 2.8, skill: 'nuke', atkClip: 'att_battle_1_01', skillClip: 'att_battle_2_01' },
  shieldman: { name: '공성전 검방 병사', model: 'Shieldman', h: 2.0, hp: 1000, atk: 32, int: 1.5, range: 'melee', speed: 2.6, skill: 'aoe', taken: 0.85, atkClip: 'att_battle_1_01', skillClip: 'att_battle_3_01' },
  // 정예: 늑대 모델은 1층 보스(루가루·루카스) 전용이라 일반 몬스터 모델을 키워서 쓴다. 수치는 기존 정예와 동일
  eliteA: { name: '공성전 백부장',   model: 'Shieldman', h: 2.7, tint: null, hp: 2600, atk: 52, int: 1.5, range: 'melee', speed: 2.6, skill: 'aoe', elite: true, taken: 0.85, atkClip: 'att_battle_1_01', skillClip: 'att_battle_4_01' },
  eliteB: { name: '검은 산 사냥꾼',   model: 'Beast_02', h: 2.8, tint: 0x8090d0, hp: 2900, atk: 49, int: 1.3, range: 'melee', speed: 3.0, skill: 'dash', elite: true },
  // 1층 추가 (2026-10-31): 일반 = 무갑옷형 악마개 · 날개 마수 / 엘리트 = 흰갈기 마수
  bareDog:   { name: '악마개',           model: 'BareDog', h: 1.25, hp: 720, atk: 30, int: 1.0, range: 'melee', speed: 3.8, skill: 'nuke', noAnim: true }, // 동작 없는 모델 → 이동·공격은 절차 모션
  wingBeast: { name: '날개 마수',         model: 'WingBeast', h: 1.8, hp: 900, atk: 34, int: 1.25, range: 'melee', speed: 3.4, skill: 'dash' },
  whiteMane: { name: '흰갈기 마수',       model: 'WhiteMane', h: 2.9, hp: 2600, atk: 48, int: 1.6, range: 'melee', speed: 2.8, skill: 'aoe', elite: true, skillClip: 'att_battle_4_01' },
  // 2층 (2026-10-31): 일반 = 갑옷 악마개 · 갑옷형 화염마수 · 검은 마수 · 날개 마수 / 엘리트 = 갈기꼬리 · 굵은팔 갈기
  armorDog:  { name: '갑옷 악마개',       model: 'ArmorDog', h: 1.35, hp: 1000, atk: 37, int: 1.1, range: 'melee', speed: 3.6, skill: 'nuke' },
  fireDog:   { name: '갑옷형 화염마수',   model: 'ArmorDog', h: 1.65, tint: 0xff9a70, hp: 1100, atk: 40, int: 1.3, range: 'melee', speed: 3.2, skill: 'aoe', skillClip: 'att_battle_3_01', fire: true },
  blackBeast:{ name: '검은 마수',         model: 'BlackBeast', h: 1.7, hp: 820, atk: 32, int: 1.2, range: 'melee', speed: 3.3, skill: 'nuke' },
  maneTail:  { name: '갈기꼬리',          model: 'ManeTail', h: 2.9, hp: 3100, atk: 55, int: 1.7, range: 'melee', speed: 2.8, skill: 'aoe', elite: true, skillClip: 'att_battle_3_01' },
  thickArm:  { name: '굵은팔 갈기',       model: 'ThickArm', h: 3.0, hp: 2900, atk: 52, int: 1.8, range: 'melee', speed: 2.6, skill: 'nuke', elite: true, skillClip: 'att_battle_4_01' }, // 동작은 흰갈기 마수와 같은 골격이라 그대로 사용
  // 1층 정예 윌리윌리가 5초마다 부르는 호박단 병사
  pumpkin:   { name: '호박단 병사',       model: 'Pumpkin', h: 1.5, hp: 480, atk: 24, int: 1.2, range: 'melee', speed: 3.2, skill: null },
};

// 1층 보스: 통솔자 루가루 + 파괴자 루카스. 체력을 공유하고, 30% 미만이 되면 합체해 '검은 산의 포식자'(보라색)로 변한다.
export const FLOOR1_BOSS = {
  twins: [
    { name: '통솔자 루가루', model: 'Wolf_Red', tint: null, h: 3.0, pattern: 'twin', desc: '파괴자 루카스와 체력을 공유한다' },
    { name: '파괴자 루카스', model: 'Wolf_Blue', tint: null, h: 3.0, pattern: 'twin', desc: '통솔자 루가루와 체력을 공유한다' },
  ],
  merge: { at: 0.3, name: '검은 산의 포식자', tint: 0xb46cff, h: 3.7, atkMul: 1.25, desc: '두 늑대가 합체한 모습' },
};

// 1층 정예 보스: 슈헤리트 (정예 방). 일반 몬스터 2마리를 거느린다
// 1층 정예: 윌리윌리 — 5초마다 호박단 병사 소환, 휠윈드(5초, 가장 가까운 적 추적) 때 호박단 병사도 함께 휠윈드
export const FLOOR1_ELITE = {
  name: '윌리윌리', model: 'Willy', h: 2.5, pattern: 'willy', desc: '5초마다 호박단 병사를 부르고, 휠윈드로 병사들과 함께 회전하며 쫓아온다',
  hp: 7600, atk: 58, int: 1.6,
  summon: { every: 5, max: 6, first: 2 },
  whirl: { first: 7, cd: 11, dur: 5, speed: 2.6, half: 1.5, tickEvery: 0.5, tickMult: 0.5, soldierMult: 0.25, startClip: 'att_battle_4_01_start', loopClip: 'att_battle_4_01_loop', endClip: 'att_battle_4_01_end' },
};
// 2층 정예: 슈헤리트 (1층에서 이동, 2026-10-31)
export const FLOOR2_ELITE = {
  name: '슈헤리트', model: 'Shuheri', h: 2.3, pattern: 'shuheri', desc: '하늘에서 검을 떨어뜨리고 후열을 노려 돌진한다 · 체력 50%에서 어둠의 주문',
  hp: 8500, atk: 68, int: 1.75,
  dash:  { first: 6, cd: 9, clip: 'att_battle_3_01', dur: 3.0, hits: [[1.1, 1.6], [1.9, 1.6]], radius: 1.8 },   // 돌진 연속 베기: 가장 먼 적에게 순간 접근, 주변 2타
  spell: { at: 0.5, clip: 'evt2_dark_spell_1', dur: 1.5, hitAt: 1.0, mult: 1.3 },                          // 어둠의 주문: 체력 50% 이하 1회, 적 전체
  swords: { first: 10, cd: 12, clip: 'att_battle_5_03', dur: 2.75, count: 6, castAt: 0.5, delay: 1.7, radius: 1.6, mult: 2.0 },  // 하늘의 검: 전장 무작위 6곳(아군 1명 이상 보장)에 붉은 장판 → 1.7초 뒤 검 낙하
};

// 1층 보스: 슈헤리트 (궁궐 · 검방패 2 · 궁수 2를 거느린다). 패턴은 정예 때와 같고 체력·공격력만 보스급
export const FLOOR1_BOSS_SHU = { ...FLOOR2_ELITE, hp: 24000, atk: 70, desc: '하늘에서 검을 떨어뜨리고 후열을 노려 돌진한다 · 체력 50%에서 어둠의 주문 · 검방패 2 · 궁수 2' };
// 2층 정예: 갈기 가시팔 (MN_RLAZ_00) — 내려찍기(붉은 원 예고) / 휘두르기(주변)
export const FLOOR2_ELITE_SPIKE = {
  name: '갈기 가시팔', model: 'SpikeArm', h: 3.1, pattern: 'spike', desc: '붉은 원으로 예고한 곳을 내려찍고, 가까이 붙은 적을 가시팔로 휩쓴다',
  hp: 9800, atk: 60, int: 1.8,
  slam: { first: 5, cd: 9, clip: 'att_battle_2_01', dur: 3.0, markAt: 0.4, hitAt: 1.9, radiusCells: 1.6, mult: 2.2 },
  sweep: { first: 9, cd: 9, clip: 'att_battle_3_01', dur: 2.4, hitAt: 1.2, radiusCells: 1.5, mult: 1.6 },
};
// 2층 보스: 마수군단장 발탄 — 휠윈드만 사용 (궁궐)
// 3층 보스: 부활한 발탄 — 돌진 2회 · 휠윈드 · 사라졌다 내리찍기 · 유령 발탄 (2026-10-31 3층으로 이동)
export const VALTAN_BOSS = {
  name: '부활한 발탄', model: 'ValtanRev', h: 4.2, pattern: 'valtan', desc: '돌진 2회 · 휠윈드 · 사라졌다 내리찍기 · 쓰러지면 유령 발탄으로 10초',
  basic: { clip: 'att_battle_1_01' },
  order: ['charge', 'whirl', 'jump'], first: 5, gap: 6,                 // 5초 뒤부터 돌진 → 휠윈드 → 내리찍기 순서로, 패턴 사이 6초
  charge: { clip: 'att_battle_3_01', windup: 0.9, dashDur: 0.55, recover: 0.6, past: 2, width: 1.3, mult: 2.2, knock: 1, stun: 0.8, times: 2 },
  whirl: { dur: 4.5, speed: 2.4, half: 1.5, tickEvery: 0.5, tickMult: 0.55 },                // 3×3칸, 가장 가까운 적 추적
  jump: { clip: 'att_battle_2_01', dur: 3.2, riseAt: 0.7, markAt: 0.9, landAt: 2.3, radiusCells: 1.6, mult: 2.8 },
  ghost: { dur: 10, atkSpd: 2, dmg: 2 },
};
export const VALTAN_RED = { ...VALTAN_BOSS, name: '마수군단장 발탄', model: 'ValtanRed', desc: '휠윈드로 회전하며 가장 가까운 적을 쫓는다', order: ['whirl'], first: 4, gap: 5, ghost: null };

// 회오리 공격 (예시 영상 회오리공격1/2 참고). 수치는 임시.
export const WHIRL = {
  // first: 전투 시작 후 첫 시전 시각(6초 이내), cd: 회오리가 끝난 뒤 다음 시전까지 5초. 루가루·루카스는 같은 시각에 함께 시전
  // radius: 판정 반지름(m). 2026-10-30 한 칸(1.6m)씩 확대 (1.8 → 3.4, 2.0 → 3.6)
  twin:   { first: 5, cd: 5, dur: 4.0, speed: 3.6, radius: 3.4, tickEvery: 0.5, tickMult: 0.45 },   // 루가루·루카스: 가장 가까운 적 추적
  merged: { cd: 5, dur: 4.4, speed: 3.2, radius: 3.6, tickEvery: 0.5, tickMult: 0.4 },              // 검은 산의 포식자: 합체 직후 즉시 시전, 추적 + 칼날
  blade:  { times: [0.8, 2.0, 3.2], speed: 8, range: 9, mult: 0.9 },                      // 4방향 × 3회
};

// 제단 보스 7종 (2~5층에 무작위 순서로 등장)
export const ALTAR_BOSSES = {
  crit:  { name: '치명의 집행자', model: 'Wolf_Red',  tint: 0xffd060, h: 3.3, pattern: 'critStack', desc: '치명타가 터질 때마다 다음 공격이 강해진다' },
  spec:  { name: '각성한 광신도', model: 'Beast_02',  tint: 0xc77dff, h: 3.2, pattern: 'gauge',     desc: '게이지가 차면 광역 각성기' },
  swift: { name: '질풍의 추적자', model: 'Wolf_Blue', tint: 0x7fe9ff, h: 3.3, pattern: 'blink',     desc: '후열로 순간이동해 원거리 유닛을 노린다' },
  guard: { name: '성채의 수호자', model: 'Beast_03',  tint: 0x9fe08a, h: 3.6, pattern: 'fortress',  desc: '피해 일부를 반사, 보호막을 못 깨면 강타' },
  mana:  { name: '거울의 마도사', model: 'Beast_01',  tint: 0x6fb3ff, h: 3.2, pattern: 'mirror',    desc: '가장 많은 피해를 준 아군의 스킬을 따라 한다' },
  greed: { name: '금화의 군주',   model: 'Beast_02',  tint: 0xffd166, h: 3.2, pattern: 'thief',     desc: '전투 중 주화를 훔친다. 처치하면 되찾고 추가 보상' },
  chaos: { name: '피의 광대',     model: 'Beast_01',  tint: 0xff4d5e, h: 3.2, pattern: 'clown',     desc: '체력이 낮을수록 강해지고, 1 남으면 5초 무적' },
};
export const DEEP_BOSSES = {
  6: [{ name: '유산 수집가', model: 'Beast_03', tint: 0xffe08a, h: 3.8, pattern: 'collector', desc: '처치 시 에스더의 유산 1개' }],
  7: [{ name: '군단장 잔상 · 발탄', model: 'Valtan', tint: null, h: 4.2, pattern: 'stagger', desc: '무력화 수치를 채우지 못하면 전멸기' }],
  8: [
    { name: '쌍둥이 · 루가루', model: 'Wolf_Red', tint: null, h: 3.0, pattern: 'trio', desc: '셋이 서로 버프한다' },
    { name: '쌍둥이 · 루카스', model: 'Wolf_Blue', tint: null, h: 3.0, pattern: 'trio', desc: '셋이 서로 버프한다' },
    { name: '심연의 거수', model: 'Beast_03', tint: 0xb0a0ff, h: 3.2, pattern: 'trio', desc: '셋이 서로 버프한다' },
  ],
  9: [{ name: '균열의 주인', model: 'Valtan', tint: 0xff6060, h: 4.8, pattern: 'master', desc: '7제단의 힘을 모두 쓴다' }],
};

export const FLOOR_ZONE = (f) => ({ 1: '외곽 · 검은 산', 2: '마수군단의 숲', 3: '부활한 마수의 심장' }[f] || '심층 · 균열의 핵');

// 심화 단계 효과 (구현된 항목만 효과가 있다)
export const ASCENSION = [
  '', '일반 몬스터 생명력 +10%', '층마다 정예 방 +1', '상인 가격 +15%', '보스 공격력 +15% (패턴 추가 대체)',
  '전투 승리 후 회복량 30% → 15%', '지도 시야 1칸으로 제한', '유물 보상 선택지 3개 → 2개', '몬스터 피해 +15%',
  '층 보스 생명력 +20%', '4~5층 보스 공격력 +20%', '상인 등장 감소 (상점 품목 -1)', '회복약 최대 소지 2개',
  '9층 보스 생명력 +30% (3페이즈 대체)', '저주 유물 1개를 지니고 시작', '모든 보스 광폭화까지 시간 단축 (60초 → 40초)',
];

export const ROOM_INFO = {
  start:  { name: '시작', color: '#3a3f4b' },
  battle: { name: '전투', color: '#b33a2e' },
  rift:   { name: '균열의 틈', color: '#7b2fbf' },
  elite:  { name: '정예', color: '#d0632a' },
  recruit:{ name: '동료 영입', color: '#2e7d4f' },
  shop:   { name: '상점', color: '#b8892b' },
  event:  { name: '이벤트', color: '#2c6aa0' },
  altar:  { name: '제단', color: '#a8325e' },
  boss:   { name: '보스', color: '#e0261b' },
  ambush: { name: '매복', color: '#8a2a2a' },
};
